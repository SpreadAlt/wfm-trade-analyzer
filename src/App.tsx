import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchCatalog, fetchHourly, fetchItem, fetchMetrics, fetchScanner } from './api'
import { getExtraText } from './extraText'
import { HistoryChart } from './HistoryChart'
import { CATEGORY_IDS, ForecastIndicator, formatDimensions, ItemIcon } from './MarketVisuals'
import type { CategoryId } from './MarketVisuals'
import { localeNames, translations } from './i18n'
import type { Locale, Theme, TranslationKey } from './i18n'
import { paginationText } from './paginationText'
import { uiText } from './uiText'
import type { UiText } from './uiText'
import type {
  AnalysisPeriod, CatalogItem, HourlyRange, HourlyResponse, HourlySeries, ItemDetail, ItemSeries,
  MetricSeries, MetricsItem, PeriodAnalytics, Platform, ScannerItem, ScannerMode, ScannerSignal,
  ScannerSort, SortDirection, TimeRange
} from './types'

type T = (key: TranslationKey) => string
type OpenPanel = 'categories' | 'ranges' | null
type PageSize = 25 | 50 | 100 | 200
type RankFilter = 'base' | 'all'
type DisplayMarketRow = {
  rowId: string
  item: ScannerItem
  marketKey: string
  selectedModRank: number | null
  canonical: boolean
  hourly: HourlySeries | null
  hourlyFetchedAt: string | null
}

const PLATFORM_NAMES: Record<Platform, string> = { pc: 'PC', ps4: 'PlayStation', xbox: 'Xbox', switch: 'Nintendo Switch' }
const PAGE_SIZES: PageSize[] = [25, 50, 100, 200]
const TIME_RANGES: TimeRange[] = ['1h', '4h', '12h', '24h', '7d', '30d', '90d', '180d']
const DEFAULT_RANGES: TimeRange[] = ['24h', '7d', '30d']
const HOURLY_RANGES = new Set<TimeRange>(['1h', '4h', '12h', '24h'])

const fmtNumber = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits).replace(/\.0$/, '')
const fmtPercent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
const fmtPlainPercent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`
const fmtPlat = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${fmtNumber(value)}p`
const fmtPlatDelta = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${fmtNumber(value)}p`
const valueClass = (value: number | null | undefined) => value == null || value === 0 ? 'neutral' : value > 0 ? 'positive' : 'negative'
const intlLocale = (locale: Locale) => locale === 'zh-hans' ? 'zh-Hans' : locale === 'zh-hant' ? 'zh-Hant' : locale
const periodRange = (period: AnalysisPeriod): TimeRange => `${period}d` as TimeRange
const hourlyKey = (platform: Platform, crossplay: boolean, id: string) => `${platform}:${crossplay ? 'crossplay' : 'platform'}:${id}`
const supportsHourly = (platform: Platform, crossplay: boolean) => platform === 'switch' || crossplay
const findHourlySeries = (hourly: HourlyResponse | null | undefined, marketKey: string): HourlySeries | null => hourly?.series.find(value => value.marketKey === marketKey) || null
const analysisPeriodForRanges = (ranges: TimeRange[]): AnalysisPeriod => {
  if (ranges.includes('180d')) return 180
  if (ranges.includes('90d')) return 90
  if (ranges.includes('30d')) return 30
  return 7
}

const platinumChange = (currentPrice: number | null | undefined, percent: number | null | undefined, referencePrice?: number | null) => {
  if (currentPrice == null || !Number.isFinite(currentPrice) || percent == null || !Number.isFinite(percent)) return null
  if (referencePrice != null && Number.isFinite(referencePrice)) return currentPrice - referencePrice
  const ratio = 1 + percent / 100
  if (Math.abs(ratio) < 0.000001) return null
  return currentPrice - currentPrice / ratio
}

const consensusDirection = (values: Array<number | null | undefined>): 'up' | 'down' | 'flat' => {
  const meaningful = values.filter((value): value is number => value != null && Number.isFinite(value) && Math.abs(value) >= 2)
  const rising = meaningful.filter(value => value > 0).length
  const falling = meaningful.filter(value => value < 0).length
  if (rising > falling) return 'up'
  if (falling > rising) return 'down'
  if (meaningful.length) return meaningful[0] > 0 ? 'up' : 'down'
  return 'flat'
}

const formatDate = (value: string | null | undefined, locale: Locale) => {
  if (!value) return '—'
  const hasTime = value.includes('T')
  const date = new Date(hasTime ? value : `${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(intlLocale(locale), hasTime
    ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }
    : { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date)
}

const decisionKey = (decision: string): TranslationKey => {
  if (decision === 'BUY_STRONG') return 'decisionBuyStrong'
  if (decision === 'SELL_STRONG') return 'decisionSellStrong'
  if (decision === 'BUY_PRICE_MAY_FALL') return 'decisionBuyFalling'
  if (decision === 'BUY_WATCH') return 'decisionBuyWatch'
  if (decision === 'SELL_PRICE_MAY_RISE') return 'decisionSellRising'
  if (decision === 'SELL_WATCH') return 'decisionSellWatch'
  return 'decisionLow'
}

const emptySignal = (): ScannerSignal => ({
  score: null, decision: 'LOW_PRIORITY', eligible: false, target: null, potential: null, potentialPct: null,
  regimeGapPct: null, falling: false, rising: false, regimeShift: false, liquidEnough: false,
  enoughCoverage: false, meaningful: false,
  breakdown: { potential: 0, channelPosition: 0, coverage: 0, liquidity: 0, stability: 0 }, flags: []
})

const rangeLabel = (range: TimeRange, x: ReturnType<typeof getExtraText>) => x[`range${range}` as keyof typeof x]

const categoryLabel = (category: string, locale: Locale, u: UiText, primeLabel: string) => {
  const labels: Record<string, string> = {
    prime: primeLabel,
    mod: locale === 'ru' ? 'Моды' : 'Mods',
    relic: u.relics,
    weapon: u.weapons,
    cosmetic: u.cosmetics,
    arcane: u.arcanes,
    resource: u.resources,
    archwing: u.archwing,
    companion: u.companions,
    necramech: u.necramechs,
    equipment: u.equipment,
    collectible: u.collectibles,
    ayatan: u.ayatan,
    utility: u.utility,
    misc: u.misc,
    syndicate: u.syndicate
  }
  return labels[category] || category
}

const loadPlatform = (): Platform => {
  const value = new URLSearchParams(location.search).get('platform') || localStorage.getItem('frameanalytics-platform')
  return value === 'ps4' || value === 'xbox' || value === 'switch' ? value : 'pc'
}
const loadCrossplay = () => {
  const url = new URLSearchParams(location.search).get('crossplay')
  if (url === 'true' || url === 'false') return url === 'true'
  const saved = localStorage.getItem('frameanalytics-crossplay')
  return saved === null ? true : saved === 'true'
}
const loadPageSize = (): PageSize => {
  const value = Number(localStorage.getItem('frameanalytics-page-size'))
  return PAGE_SIZES.includes(value as PageSize) ? value as PageSize : 25
}
const loadCategories = (): CategoryId[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem('frameanalytics-categories-v3') || 'null')
    if (!Array.isArray(parsed)) return [...CATEGORY_IDS]
    const valid = parsed.filter((value): value is CategoryId => CATEGORY_IDS.includes(value))
    return valid.length || parsed.length === 0 ? valid : [...CATEGORY_IDS]
  } catch { return [...CATEGORY_IDS] }
}
const loadRanges = (): TimeRange[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem('frameanalytics-ranges') || 'null')
    if (!Array.isArray(parsed)) return DEFAULT_RANGES
    const valid = parsed.filter((value): value is TimeRange => TIME_RANGES.includes(value))
    return valid.length ? valid : DEFAULT_RANGES
  } catch { return DEFAULT_RANGES }
}
const loadRankFilter = (): RankFilter => localStorage.getItem('frameanalytics-rank-filter') === 'all' ? 'all' : 'base'

type RouteState = { kind: 'scanner' | 'item'; slug: string | null; id: string | null; variant: string | null; rank: number | null }
const readRoute = (): RouteState => {
  const match = location.pathname.match(/^\/items?\/([^/]+)\/?$/)
  const params = new URLSearchParams(location.search)
  const rankValue = Number(params.get('rank'))
  const rank = params.has('rank') && Number.isInteger(rankValue) && rankValue >= 0 ? rankValue : null
  return match
    ? { kind: 'item', slug: decodeURIComponent(match[1]), id: params.get('id'), variant: params.get('variant'), rank }
    : { kind: 'scanner', slug: null, id: null, variant: null, rank: null }
}

const FooterBar = ({ locale, setLocale, theme, setTheme, t }: { locale: Locale; setLocale: (value: Locale) => void; theme: Theme; setTheme: (value: Theme) => void; t: T }) => <footer className="footer-bar">
  <div className="footer-brand"><img src="/assets/frameanalytics-logo.png" alt="FrameAnalytics"/></div>
  <div className="footer-control"><span>{t('language')}</span><select value={locale} onChange={event => setLocale(event.target.value as Locale)}>{Object.entries(localeNames).map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select></div>
  <div className="footer-control"><span>{t('theme')}</span><select value={theme} onChange={event => setTheme(event.target.value as Theme)}><option value="system">{t('themeSystem')}</option><option value="light">{t('themeLight')}</option><option value="dark">{t('themeDark')}</option></select></div>
  <a className="footer-market-link" href="https://warframe.market/" target="_blank" rel="noreferrer">{t('sourceMarket')}</a>
  <div className="footer-version">{t('version')} 0.7.2</div>
  <div className="footer-disclaimer">{t('disclaimer')}</div>
</footer>

const Detail = ({ detail, metrics, hourly, summary, catalogItem, variantKey, selectedRank, platform, crossplay, period, visibleRanges, mode, locale, loading, hourlyLoading, error, onBack, onRetry, onVariant, onRank, t }: {
  detail: ItemDetail | null
  metrics: MetricsItem | null
  hourly: HourlyResponse | null
  summary: ScannerItem | null
  catalogItem?: CatalogItem
  variantKey: string | null
  selectedRank: number | null
  platform: Platform
  crossplay: boolean
  period: AnalysisPeriod
  visibleRanges: TimeRange[]
  mode: ScannerMode
  locale: Locale
  loading: boolean
  hourlyLoading: boolean
  error: string | null
  onBack: () => void
  onRetry: () => void
  onVariant: (variant: string | null) => void
  onRank: (rank: number | null) => void
  t: T
}) => {
  const u = uiText[locale]
  const x = getExtraText(locale)
  const [chartRange, setChartRange] = useState<TimeRange>(periodRange(period))
  const storedSeries: ItemSeries | null = detail ? (variantKey ? detail.variants[variantKey] || null : detail) : null
  const canonicalRank = storedSeries?.selectedModRank ?? null
  const canonicalSelected = selectedRank == null || selectedRank === canonicalRank
  const series = canonicalSelected ? storedSeries : null
  const metricSeries: MetricSeries | null = canonicalSelected && metrics ? (variantKey ? metrics.variants[variantKey] || null : metrics) : null
  const marketKey = variantKey || (selectedRank != null ? `mod_rank=${selectedRank}` : canonicalRank != null ? `mod_rank=${canonicalRank}` : 'scalar')
  const hourlySeries = findHourlySeries(hourly, marketKey)
  const rankOptions = [...new Set((hourly?.series || []).map(value => value.dimensions?.mod_rank).filter((value): value is number => typeof value === 'number'))].sort((a, b) => a - b)
  const analytics = metricSeries?.periods[String(period) as '7' | '30' | '90' | '180'] || null
  const signal = canonicalSelected ? summary?.[mode] || emptySignal() : emptySignal()
  const name = catalogItem?.name || detail?.name || summary?.name || ''
  const variantLabel = formatDimensions(storedSeries?.dimensions || summary?.dimensions, locale)
  const currentPrice = hourlySeries?.currentPrice ?? series?.currentPrice ?? summary?.currentPrice ?? null
  const rangeValue = (range: TimeRange) => {
    if (HOURLY_RANGES.has(range)) return hourlySeries?.changes[range as HourlyRange]?.percent ?? (range === '24h' ? series?.change24h ?? summary?.change24h ?? null : null)
    if (range === '7d') return series?.change7d ?? summary?.change7d ?? null
    return metricSeries?.periods[range.replace('d', '') as '30' | '90' | '180']?.changePeriod ?? null
  }
  const rangePlatinum = (range: TimeRange) => {
    if (HOURLY_RANGES.has(range)) {
      const direct = hourlySeries?.changes[range as HourlyRange]?.platinum
      if (direct != null) return direct
    }
    const value = rangeValue(range)
    if (range === '7d' || range === '30d' || range === '90d' || range === '180d') {
      const periodMetrics = metricSeries?.periods[range.replace('d', '') as '7' | '30' | '90' | '180']
      return platinumChange(currentPrice, value, periodMetrics?.referencePrice)
    }
    return platinumChange(currentPrice, value)
  }

  const hourlyChart = HOURLY_RANGES.has(chartRange) && hourlySeries
  const chartHistory = hourlyChart
    ? hourlySeries.history.map(point => ({ date: point.timestamp, min: point.min, median: point.median, max: point.max, sales: point.volume }))
    : series?.history || []
  const chartLatest = hourlyChart ? hourlySeries.latestAt || hourly?.fetchedAt || '' : series?.updatedDate || ''

  useEffect(() => { setChartRange(periodRange(period)) }, [period])

  return <main className="app-shell detail-shell">
    <button className="back-button" onClick={onBack}>{t('back')}</button>
    {loading ? <section className="panel state-panel"><div className="spinner"/><strong>{u.loading}</strong></section> : error || !detail ? <section className="panel state-panel error-state"><strong>{u.loadError}</strong><button className="retry-button" onClick={onRetry}>{u.retry}</button></section> : <>
      <section className="detail-header detail-header-v3">
        <div className="detail-identity"><ItemIcon item={catalogItem} name={name} large/><div><div className="eyebrow">{categoryLabel(detail.category, locale, u, x.prime)} · {PLATFORM_NAMES[platform]} · {crossplay ? x.crossplayOn : x.crossplayOff}</div><h1>{name}</h1><div className="identity-tags">{variantLabel ? <span>{x.variant}: {variantLabel}</span> : null}{selectedRank != null || canonicalRank != null ? <span>{x.rank}: {selectedRank ?? canonicalRank}</span> : null}{!series?.hasHistory && !hourlySeries ? <span className="no-history-tag">{x.noHistory}</span> : null}{hourlySeries ? <span className="live-tag">{x.hourlyLive}</span> : null}{!canonicalSelected ? <span>{x.hourlyOnlyRank}</span> : null}</div><div className="price-big">{fmtPlat(currentPrice)}</div></div></div>
        <div className="detail-actions">{Object.keys(detail.variants || {}).length ? <label className="variant-select"><span>{x.variant}</span><select value={variantKey || ''} onChange={event => onVariant(event.target.value || null)}><option value="">{x.chooseVariant}</option>{Object.entries(detail.variants).map(([key, value]) => <option key={key} value={key}>{formatDimensions(value.dimensions, locale) || key}</option>)}</select></label> : null}{rankOptions.length ? <label className="variant-select"><span>{x.rank}</span><select value={selectedRank ?? canonicalRank ?? ''} onChange={event => onRank(event.target.value === '' ? null : Number(event.target.value))}>{rankOptions.map(rank => <option value={rank} key={rank}>{x.rank} {rank}{rank === canonicalRank ? ` · ${x.canonical}` : ''}</option>)}</select></label> : null}<div className="updated-card"><span>{t('updated')}</span><strong>{formatDate(hourly?.fetchedAt || series?.updatedDate, locale)}</strong>{hourlySeries ? <small>{x.everyMinutes.replace('{minutes}', String(hourly?.cadenceMinutes || 0))}</small> : null}</div></div>
      </section>
      <section className="range-card-grid">{visibleRanges.map(range => <div className={`range-card ${HOURLY_RANGES.has(range) ? hourlySeries ? 'range-live' : 'range-unavailable' : ''}`} key={range} title={HOURLY_RANGES.has(range) && !hourlySeries ? x.hourlyUnavailable : undefined}><span>{rangeLabel(range, x)}</span><strong className={valueClass(rangeValue(range))}>{fmtPercent(rangeValue(range))}</strong><small className={valueClass(rangePlatinum(range))}>{fmtPlatDelta(rangePlatinum(range))}</small>{HOURLY_RANGES.has(range) ? <i>{hourlyLoading ? '···' : hourlySeries ? '●' : '○'}</i> : null}</div>)}</section>
      <section className="signal-grid signal-grid-v3">
        <div className={`signal-card potential-card ${mode === 'sell' ? 'sell' : ''}`}><span>{mode === 'buy' ? t('buyPotential') : t('sellPotential')}</span><strong>{analytics?.[mode].potential != null && analytics[mode].potential! > 0 ? `+${fmtPlat(analytics[mode].potential)}` : '—'}{analytics?.[mode].potentialPct != null && analytics[mode].potentialPct! > 0 ? <small> {fmtPlainPercent(analytics[mode].potentialPct)}</small> : null}</strong></div>
        <div className="signal-card score-card"><span>{t('score')}</span><strong>{signal.score == null ? '—' : fmtNumber(signal.score)}<small>{signal.score == null ? '' : '/100'}</small></strong></div>
        <div className="signal-card forecast-card"><span>{x.forecast}</span><ForecastIndicator signal={signal} fallbackChange={series?.change7d ?? null} direction={consensusDirection(visibleRanges.map(rangeValue))} title={t(decisionKey(signal.decision))} trendUp={x.trendUp} trendDown={x.trendDown} trendFlat={x.trendFlat} large/><small>{x.forecastHint}</small></div>
      </section>
      {analytics ? <section className="analysis-grid"><div className="analysis-card"><span>{u.baseline}</span><strong>{fmtPlat(analytics.baseline)}</strong></div><div className="analysis-card"><span>{u.q25}</span><strong>{fmtPlat(analytics.q25)}</strong></div><div className="analysis-card"><span>{u.q75}</span><strong>{fmtPlat(analytics.q75)}</strong></div><div className="analysis-card"><span>{u.volatility}</span><strong>{fmtPlainPercent(analytics.volatility)}</strong></div></section> : null}
      <section className="panel chart-panel">
        <div className="panel-title-row"><div><div className="eyebrow">{t('closedSales')} · {u.analysisWindow}: {rangeLabel(chartRange, x)}</div><h2>{u.priceHistory}</h2></div><div className="time-tabs time-tabs-all">{TIME_RANGES.map(range => { const unavailable = HOURLY_RANGES.has(range) && range !== '24h' && !hourlySeries; return <button key={range} disabled={unavailable} title={unavailable ? x.hourlyUnavailable : undefined} className={chartRange === range ? 'time-tab active' : 'time-tab'} onClick={() => !unavailable && setChartRange(range)}>{rangeLabel(range, x)}</button> })}</div></div>
        <HistoryChart history={chartHistory} latestDate={chartLatest} range={chartRange} locale={locale} labels={{ empty: u.noData, chart: u.priceHistory, min: t('min'), median: t('median'), max: t('max'), sales: t('sales') }}/>
      </section>
    </>}
  </main>
}

export default function App() {
  const [mode, setMode] = useState<ScannerMode>('buy')
  const [queryInput, setQueryInput] = useState('')
  const [query, setQuery] = useState('')
  const [minPrice, setMinPrice] = useState(0)
  const [minPotential, setMinPotential] = useState(0)
  const [platform, setPlatform] = useState<Platform>(loadPlatform)
  const [crossplay, setCrossplay] = useState(() => platform === 'switch' ? false : loadCrossplay())
  const [categories, setCategories] = useState<CategoryId[]>(loadCategories)
  const [visibleRanges, setVisibleRanges] = useState<TimeRange[]>(loadRanges)
  const [rankFilter, setRankFilter] = useState<RankFilter>(loadRankFilter)
  const [period, setPeriod] = useState<AnalysisPeriod>(() => analysisPeriodForRanges(loadRanges()))
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null)
  const [sort, setSort] = useState<ScannerSort>('potential')
  const [direction, setDirection] = useState<SortDirection>('desc')
  const [pageSize, setPageSize] = useState<PageSize>(loadPageSize)
  const [page, setPage] = useState(1)
  const [scannerData, setScannerData] = useState<Awaited<ReturnType<typeof fetchScanner>> | null>(null)
  const [scannerLoading, setScannerLoading] = useState(true)
  const [scannerError, setScannerError] = useState<string | null>(null)
  const [scannerReload, setScannerReload] = useState(0)
  const [catalog, setCatalog] = useState<Map<string, CatalogItem>>(new Map())
  const [rangeMetrics, setRangeMetrics] = useState<Record<string, MetricsItem>>({})
  const [rangesLoading, setRangesLoading] = useState(false)
  const [rangesError, setRangesError] = useState(false)
  const [hourlyRows, setHourlyRows] = useState<Record<string, HourlyResponse | null>>({})
  const [hourlyLoading, setHourlyLoading] = useState(false)
  const [hourlyPartial, setHourlyPartial] = useState(false)
  const [hourlyRefresh, setHourlyRefresh] = useState(0)
  const [route, setRoute] = useState<RouteState>(readRoute)
  const [detail, setDetail] = useState<ItemDetail | null>(null)
  const [detailMetrics, setDetailMetrics] = useState<MetricsItem | null>(null)
  const [detailHourly, setDetailHourly] = useState<HourlyResponse | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailReload, setDetailReload] = useState(0)
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem('frameanalytics-locale')
    if (saved && saved in localeNames) return saved as Locale
    const browser = navigator.language.toLowerCase()
    if (browser.startsWith('zh-tw') || browser.startsWith('zh-hk')) return 'zh-hant'
    if (browser.startsWith('zh')) return 'zh-hans'
    const base = browser.split('-')[0]
    return base in localeNames ? base as Locale : 'en'
  })
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('frameanalytics-theme')
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
  })
  const popoverRef = useRef<HTMLElement | null>(null)
  const hourlyCheckedAt = useRef<Record<string, number>>({})

  const t: T = key => translations[locale][key]
  const u = uiText[locale]
  const x = getExtraText(locale)
  const p = paginationText[locale]
  const catalogItem = (id: string) => catalog.get(id)
  const itemName = (item: { id: string; name: string }) => catalogItem(item.id)?.name || item.name

  useEffect(() => { const timer = setTimeout(() => setQuery(queryInput.trim()), 300); return () => clearTimeout(timer) }, [queryInput])
  useEffect(() => { const timer = setInterval(() => setHourlyRefresh(value => value + 1), 5 * 60 * 1000); return () => clearInterval(timer) }, [])
  useEffect(() => {
    const listener = () => {
      setRoute(readRoute())
      const params = new URLSearchParams(location.search)
      const nextPlatform = params.get('platform')
      const nextCrossplay = params.get('crossplay')
      const validPlatform = nextPlatform === 'pc' || nextPlatform === 'ps4' || nextPlatform === 'xbox' || nextPlatform === 'switch' ? nextPlatform : platform
      setPlatform(validPlatform)
      if (nextCrossplay === 'true' || nextCrossplay === 'false') setCrossplay(validPlatform === 'switch' ? false : nextCrossplay === 'true')
    }
    addEventListener('popstate', listener)
    return () => removeEventListener('popstate', listener)
  }, [])
  useEffect(() => { const close = (event: PointerEvent) => { if (openPanel && popoverRef.current && !popoverRef.current.contains(event.target as Node)) setOpenPanel(null) }; addEventListener('pointerdown', close); return () => removeEventListener('pointerdown', close) }, [openPanel])

  useEffect(() => { localStorage.setItem('frameanalytics-locale', locale); document.documentElement.lang = locale }, [locale])
  useEffect(() => {
    localStorage.setItem('frameanalytics-theme', theme)
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => { document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme }
    apply(); media.addEventListener('change', apply); return () => media.removeEventListener('change', apply)
  }, [theme])
  useEffect(() => { localStorage.setItem('frameanalytics-platform', platform) }, [platform])
  useEffect(() => { localStorage.setItem('frameanalytics-crossplay', String(crossplay)) }, [crossplay])
  useEffect(() => { if (platform === 'switch' && crossplay) setCrossplay(false) }, [platform, crossplay])
  useEffect(() => { localStorage.setItem('frameanalytics-page-size', String(pageSize)) }, [pageSize])
  useEffect(() => { localStorage.setItem('frameanalytics-categories-v3', JSON.stringify(categories)) }, [categories])
  useEffect(() => { localStorage.setItem('frameanalytics-ranges', JSON.stringify(visibleRanges)) }, [visibleRanges])
  useEffect(() => {
    const visibleDailyRanges = visibleRanges.filter(range => !HOURLY_RANGES.has(range))
    if (visibleDailyRanges.length && !visibleRanges.includes(periodRange(period))) {
      setPeriod(analysisPeriodForRanges(visibleRanges))
    }
  }, [visibleRanges, period])
  useEffect(() => { localStorage.setItem('frameanalytics-rank-filter', rankFilter) }, [rankFilter])
  useEffect(() => { if (rankFilter === 'base' && sort !== 'name') { setSort('name'); setDirection('asc') } }, [rankFilter, sort])

  useEffect(() => {
    const controller = new AbortController()
    fetchCatalog(locale, controller.signal).then(response => setCatalog(new Map(response.items.map(item => [item.id, item])))).catch(() => setCatalog(new Map()))
    return () => controller.abort()
  }, [locale])

  useEffect(() => {
    setPage(1)
  }, [query, minPrice, minPotential, mode, platform, crossplay, period, categories, rankFilter, sort, direction, pageSize])

  useEffect(() => {
    const controller = new AbortController()
    setScannerLoading(true); setScannerError(null)
    fetchScanner({
      platform, period, mode, crossplay, search: query,
      categories: categories.length === CATEGORY_IDS.length ? undefined : categories,
      minPrice, minPotential, offset: (page - 1) * pageSize, limit: pageSize, sort, direction
    }, controller.signal).then(data => { setScannerData(data); setScannerLoading(false) }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setScannerError(error instanceof Error ? error.message : String(error)); setScannerLoading(false)
    })
    return () => controller.abort()
  }, [platform, period, mode, crossplay, query, categories, minPrice, minPotential, page, pageSize, sort, direction, scannerReload])

  const selectedSummary = useMemo(() => {
    if (route.kind !== 'item' || !scannerData) return null
    return scannerData.items.find(item => item.id === route.id && (route.variant ? item.variantKey === route.variant : true)) || null
  }, [route, scannerData])

  useEffect(() => {
    if (route.kind !== 'item' || !route.id) { setDetail(null); setDetailMetrics(null); setDetailHourly(null); setDetailError(null); return }
    const controller = new AbortController()
    setDetailLoading(true); setDetailError(null)
    Promise.all([
      fetchItem(platform, route.id, controller.signal),
      fetchMetrics(platform, route.id, controller.signal),
      supportsHourly(platform, crossplay) ? fetchHourly(platform, crossplay, route.id, controller.signal).catch(() => null) : Promise.resolve(null)
    ])
      .then(([itemResponse, metricsResponse, hourlyResponse]) => { setDetail(itemResponse.item); setDetailMetrics(metricsResponse.item); setDetailHourly(hourlyResponse); setDetailLoading(false) })
      .catch(error => { if (error instanceof DOMException && error.name === 'AbortError') return; setDetailError(error instanceof Error ? error.message : String(error)); setDetailLoading(false) })
    return () => controller.abort()
  }, [route.kind, route.id, platform, crossplay, detailReload])

  useEffect(() => {
    if (!scannerData?.items.length || !supportsHourly(platform, crossplay)) { setHourlyLoading(false); setHourlyPartial(false); return }
    const ids = [...new Set(scannerData.items.map(item => item.id))]
    const now = Date.now()
    const missing = ids.filter(id => {
      const key = hourlyKey(platform, crossplay, id)
      const cached = hourlyRows[key]
      const checkedAt = hourlyCheckedAt.current[key] || 0
      const refreshMinutes = cached?.cadenceMinutes || 15
      return !Object.prototype.hasOwnProperty.call(hourlyRows, key) || now - checkedAt >= refreshMinutes * 60 * 1000
    })
    if (!missing.length) {
      setHourlyLoading(false)
      setHourlyPartial(ids.some(id => hourlyRows[hourlyKey(platform, crossplay, id)] === null))
      return
    }
    const controller = new AbortController()
    setHourlyLoading(true); setHourlyPartial(false)
    Promise.allSettled(missing.map(id => fetchHourly(platform, crossplay, id, controller.signal))).then(results => {
      if (controller.signal.aborted) return
      const additions: Record<string, HourlyResponse | null> = {}
      results.forEach((result, index) => {
        const key = hourlyKey(platform, crossplay, missing[index])
        additions[key] = result.status === 'fulfilled' ? result.value : null
        hourlyCheckedAt.current[key] = Date.now()
      })
      setHourlyRows(current => ({ ...current, ...additions }))
      setHourlyPartial(results.some(result => result.status === 'rejected'))
      setHourlyLoading(false)
    })
    return () => controller.abort()
  }, [scannerData, platform, crossplay, hourlyRefresh])

  useEffect(() => {
    const needsSupplement = visibleRanges.some(range => ['30d', '90d', '180d'].includes(range) && range !== periodRange(period))
    if (!needsSupplement || !scannerData?.items.length) { setRangesLoading(false); return }
    const ids = [...new Set(scannerData.items.map(item => item.id))]
    const missing = ids.filter(id => !rangeMetrics[`${platform}:${id}`])
    if (!missing.length) { setRangesLoading(false); return }
    const controller = new AbortController()
    setRangesLoading(true); setRangesError(false)
    Promise.allSettled(missing.map(id => fetchMetrics(platform, id, controller.signal))).then(results => {
      if (controller.signal.aborted) return
      const additions: Record<string, MetricsItem> = {}
      results.forEach((result, index) => { if (result.status === 'fulfilled') additions[`${platform}:${missing[index]}`] = result.value.item })
      setRangeMetrics(current => ({ ...current, ...additions }))
      setRangesError(results.some(result => result.status === 'rejected')); setRangesLoading(false)
    })
    return () => controller.abort()
  }, [visibleRanges, period, scannerData, platform, rangeMetrics])

  const pageCount = Math.max(1, Math.ceil((scannerData?.filteredItems || 0) / pageSize))
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])
  const showingStart = scannerData?.filteredItems ? scannerData.offset + 1 : 0
  const showingEnd = scannerData?.filteredItems ? scannerData.offset + scannerData.returned : 0

  const getMetricSeries = (item: ScannerItem): MetricSeries | null => {
    const metrics = rangeMetrics[`${platform}:${item.id}`]
    return metrics ? (item.variantKey ? metrics.variants[item.variantKey] || null : metrics) : null
  }
  const displayRows = useMemo<DisplayMarketRow[]>(() => (scannerData?.items || []).flatMap((item): DisplayMarketRow[] => {
    const hourly = hourlyRows[hourlyKey(platform, crossplay, item.id)]
    if (item.selectedModRank == null) {
      return [{ rowId: item.rowId, item, marketKey: item.marketKey, selectedModRank: null, canonical: true, hourly: findHourlySeries(hourly, item.marketKey), hourlyFetchedAt: hourly?.fetchedAt || null }]
    }
    if (rankFilter === 'base') {
      const marketKey = 'mod_rank=0'
      return [{ rowId: `${item.id}::${marketKey}`, item, marketKey, selectedModRank: 0, canonical: item.selectedModRank === 0, hourly: findHourlySeries(hourly, marketKey), hourlyFetchedAt: hourly?.fetchedAt || null }]
    }
    const ranks = [...new Set((hourly?.series || []).map(value => value.dimensions?.mod_rank).filter((value): value is number => typeof value === 'number'))]
    if (!ranks.includes(item.selectedModRank)) ranks.push(item.selectedModRank)
    return ranks.sort((a, b) => a - b).map(rank => {
      const marketKey = `mod_rank=${rank}`
      return { rowId: `${item.id}::${marketKey}`, item, marketKey, selectedModRank: rank, canonical: rank === item.selectedModRank, hourly: findHourlySeries(hourly, marketKey), hourlyFetchedAt: hourly?.fetchedAt || null }
    })
  }), [scannerData, hourlyRows, platform, crossplay, rankFilter])
  const rowCurrentPrice = (row: DisplayMarketRow) => row.hourly?.currentPrice ?? (row.canonical ? row.item.currentPrice : null)
  const rowRangeValue = (row: DisplayMarketRow, range: TimeRange) => {
    const item = row.item
    if (HOURLY_RANGES.has(range)) return row.hourly?.changes[range as HourlyRange]?.percent ?? (range === '24h' && row.canonical ? item.change24h : null)
    if (!row.canonical) return null
    if (range === '7d') return item.change7d
    if (range === periodRange(item.period)) return item.changePeriod
    return getMetricSeries(item)?.periods[range.replace('d', '') as '30' | '90' | '180']?.changePeriod ?? null
  }
  const rowRangePlatinum = (row: DisplayMarketRow, range: TimeRange) => {
    const item = row.item
    if (HOURLY_RANGES.has(range)) {
      const direct = row.hourly?.changes[range as HourlyRange]?.platinum
      if (direct != null) return direct
    }
    const percent = rowRangeValue(row, range)
    const metricPeriod = range === '7d' || range === '30d' || range === '90d' || range === '180d'
      ? row.canonical ? getMetricSeries(item)?.periods[range.replace('d', '') as '7' | '30' | '90' | '180'] : null
      : null
    return platinumChange(rowCurrentPrice(row), percent, metricPeriod?.referencePrice)
  }
  const rowTrendDirection = (row: DisplayMarketRow) => consensusDirection(visibleRanges.map(range => rowRangeValue(row, range)))

  const changeSort = (next: ScannerSort, range?: TimeRange) => {
    if (range && !HOURLY_RANGES.has(range)) setPeriod(Number(range.replace('d', '')) as AnalysisPeriod)
    if (sort === next) setDirection(value => value === 'asc' ? 'desc' : 'asc')
    else { setSort(next); setDirection(next === 'name' ? 'asc' : 'desc') }
  }
  const indicator = (key: ScannerSort) => sort === key ? (direction === 'asc' ? '↑' : '↓') : ''
  const rangeSort = (range: TimeRange): ScannerSort | null => rankFilter === 'base' || HOURLY_RANGES.has(range) ? null : range === '7d' ? 'change7d' : 'changePeriod'
  const toggleCategory = (id: CategoryId) => setCategories(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  const toggleRange = (range: TimeRange) => setVisibleRanges(current => current.includes(range) ? current.filter(value => value !== range) : TIME_RANGES.filter(value => current.includes(value) || value === range))
  const statusText = scannerLoading ? u.loading : scannerError ? u.loadError : scannerData ? `${u.dataDate}: ${formatDate(scannerData.latestDate, locale)}` : u.loadError

  const itemHref = (row: DisplayMarketRow) => {
    const item = row.item
    const params = new URLSearchParams({ platform, period: String(period), crossplay: String(crossplay), id: item.id })
    if (item.variantKey) params.set('variant', item.variantKey)
    if (row.selectedModRank != null) params.set('rank', String(row.selectedModRank))
    return `/items/${encodeURIComponent(item.slug)}?${params}`
  }
  const openItem = (row: DisplayMarketRow) => { history.pushState({ frameanalyticsFromScanner: true }, '', itemHref(row)); setRoute(readRoute()); setOpenPanel(null); scrollTo({ top: 0 }) }
  const closeItem = () => { if (history.state?.frameanalyticsFromScanner) history.back(); else { history.replaceState(null, '', '/'); setRoute(readRoute()) }; scrollTo({ top: 0 }) }
  const changeVariant = (variant: string | null) => {
    if (route.kind !== 'item' || !route.slug || !route.id) return
    const params = new URLSearchParams({ platform, period: String(period), crossplay: String(crossplay), id: route.id })
    if (variant) params.set('variant', variant)
    if (route.rank != null) params.set('rank', String(route.rank))
    history.replaceState(history.state, '', `/items/${encodeURIComponent(route.slug)}?${params}`)
    setRoute(readRoute())
  }
  const changeRank = (rank: number | null) => {
    if (route.kind !== 'item' || !route.slug || !route.id) return
    const params = new URLSearchParams({ platform, period: String(period), crossplay: String(crossplay), id: route.id })
    if (route.variant) params.set('variant', route.variant)
    if (rank != null) params.set('rank', String(rank))
    history.replaceState(history.state, '', `/items/${encodeURIComponent(route.slug)}?${params}`)
    setRoute(readRoute())
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    params.set('platform', platform); params.set('period', String(period)); params.set('crossplay', String(crossplay))
    if (route.id) params.set('id', route.id)
    if (route.variant) params.set('variant', route.variant)
    if (route.rank != null) params.set('rank', String(route.rank))
    const path = route.kind === 'item' && route.slug ? `/items/${encodeURIComponent(route.slug)}` : '/'
    history.replaceState(history.state, '', `${path}?${params}`)
  }, [platform, period, crossplay, route.kind, route.slug, route.id, route.variant, route.rank])

  return <>
    <div className="background-layer"/><div className="background-shade"/>
    {route.kind === 'item' ? <Detail detail={detail} metrics={detailMetrics} hourly={detailHourly} summary={selectedSummary} catalogItem={route.id ? catalogItem(route.id) : undefined} variantKey={route.variant} selectedRank={route.rank} platform={platform} crossplay={crossplay} period={period} visibleRanges={visibleRanges} mode={mode} locale={locale} loading={detailLoading} hourlyLoading={hourlyLoading} error={detailError} onBack={closeItem} onRetry={() => setDetailReload(value => value + 1)} onVariant={changeVariant} onRank={changeRank} t={t}/> : <main className="app-shell">
      <header className="topbar"><div><div className="brand-plate"><img src="/assets/frameanalytics-logo.png" alt="FrameAnalytics"/></div><p className="subtitle">{t('subtitle')}</p></div><div className={`status-pill ${scannerLoading ? 'loading' : scannerError ? 'error' : ''}`}><span className="status-dot"/>{statusText}</div></header>
      <section className="mode-tabs"><button className={mode === 'buy' ? 'mode-tab active buy' : 'mode-tab'} onClick={() => setMode('buy')}>{t('buy')}</button><button className={mode === 'sell' ? 'mode-tab active sell' : 'mode-tab'} onClick={() => setMode('sell')}>{t('sell')}</button></section>
      <section className="panel market-settings">
        <div className="settings-heading"><span>{x.marketSettings}</span><small>{x.platformData}</small></div>
        <label><span>{u.platform}</span><select value={platform} onChange={event => { const next = event.target.value as Platform; setPlatform(next); if (next === 'switch') setCrossplay(false) }}>{Object.entries(PLATFORM_NAMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <div className="crossplay-setting"><span>{u.crossplay}</span><button type="button" disabled={platform === 'switch'} className={`switch-control ${crossplay ? 'on' : ''}`} role="switch" aria-checked={crossplay} onClick={() => platform !== 'switch' && setCrossplay(value => !value)}><i/><b>{platform === 'switch' ? x.crossplayUnavailable : crossplay ? x.crossplayOn : x.crossplayOff}</b></button></div>
      </section>
      <section className="panel filters filters-v3" ref={popoverRef}>
        <label className="search-field"><span>{t('name')}</span><input value={queryInput} onChange={event => setQueryInput(event.target.value)} placeholder={t('searchPlaceholder')}/></label>
        <label><span>{t('minPrice')}</span><div className="input-suffix"><input type="number" min="0" value={minPrice} onChange={event => setMinPrice(Math.max(0, Number(event.target.value)))}/><b>p</b></div></label>
        <label><span>{t('potentialFrom')}</span><div className="input-suffix"><input type="number" min="0" value={minPotential} onChange={event => setMinPotential(Math.max(0, Number(event.target.value)))}/><b>p</b></div></label>
        <label><span>{x.rankFilter}</span><select value={rankFilter} onChange={event => setRankFilter(event.target.value as RankFilter)}><option value="base">{x.rankBase}</option><option value="all">{x.rankAll}</option></select></label>
        <div className="filter-field category-filter"><span>{u.categories}</span><button className="control-button" onClick={() => setOpenPanel(value => value === 'categories' ? null : 'categories')}>{u.categories}<b>{categories.length}/{CATEGORY_IDS.length}</b><i>⌄</i></button>{openPanel === 'categories' ? <div className="category-panel"><div className="category-actions"><button onClick={() => setCategories([...CATEGORY_IDS])}>{u.selectAll}</button><button onClick={() => setCategories([])}>{u.clear}</button></div><div className="category-list">{CATEGORY_IDS.map(id => <label className="category-option" key={id}><input type="checkbox" checked={categories.includes(id)} onChange={() => toggleCategory(id)}/><span>{categoryLabel(id, locale, u, x.prime)}</span></label>)}</div></div> : null}</div>
        <div className="filter-field ranges-filter"><span>{x.shownRanges}</span><button className="control-button" onClick={() => setOpenPanel(value => value === 'ranges' ? null : 'ranges')}>{x.chooseRanges}<b>{visibleRanges.length}/{TIME_RANGES.length}</b><i>⌄</i></button>{openPanel === 'ranges' ? <div className="category-panel ranges-panel"><div className="category-actions"><button onClick={() => setVisibleRanges([...TIME_RANGES])}>{x.allRanges}</button><button onClick={() => setVisibleRanges(DEFAULT_RANGES)}>{u.defaults}</button></div><div className="range-options">{TIME_RANGES.map(range => <label className="range-option" key={range}><input type="checkbox" checked={visibleRanges.includes(range)} onChange={() => toggleRange(range)}/><span>{rangeLabel(range, x)}</span>{HOURLY_RANGES.has(range) ? <i className="live-range-mark" title={x.hourlyLive}>●</i> : <b>daily</b>}</label>)}</div><p>{x.hourlyNote}</p></div> : null}</div>
      </section>
      <section className="results-row results-toolbar"><div className="results-count"><span>{t('found')}</span><strong>{scannerData?.filteredItems ?? 0}</strong>{scannerData ? <em>{scannerData.catalogTotal ?? 3837} {x.catalogSummary} · {scannerData.marketSeries ?? scannerData.totalItems} {x.seriesSummary}</em> : null}</div><div className="range-load-state">{hourlyLoading ? x.loadingHourly : hourlyPartial ? x.hourlyPartial : rangesLoading ? x.loadingRanges : rangesError ? x.rangesError : ''}</div><div className="page-size-control"><span>{p.perPage}</span><select value={pageSize} onChange={event => setPageSize(Number(event.target.value) as PageSize)}>{PAGE_SIZES.map(value => <option key={value} value={value}>{value}</option>)}</select></div><div className="page-indicator">{p.page} <strong>{page}</strong> {p.of} <strong>{pageCount}</strong></div></section>
      <section className="panel table-panel"><div className="table-scroll"><table className="market-table"><thead><tr>
        <th><button className="sort-button" onClick={() => changeSort('name')}><span>{t('item')}</span><span className="sort-indicator">{indicator('name')}</span></button></th>
        <th><button className="sort-button" disabled={rankFilter === 'base'} title={rankFilter === 'base' ? x.hourlyOnlyRank : undefined} onClick={() => changeSort('currentPrice')}><span>{t('current')}</span><span className="sort-indicator">{indicator('currentPrice')}</span></button></th>
        {visibleRanges.map(range => { const key = rangeSort(range); return <th key={range} className={HOURLY_RANGES.has(range) ? 'hourly-column' : ''}><button className="sort-button" disabled={!key} title={HOURLY_RANGES.has(range) ? x.hourlyLive : undefined} onClick={() => key && changeSort(key, range)}><span>{rangeLabel(range, x)}</span><span className="sort-indicator">{key && (range === periodRange(period) || range === '24h' || range === '7d') ? indicator(key) : ''}</span></button></th> })}
        <th><button className="sort-button" disabled={rankFilter === 'base'} onClick={() => changeSort('sales24h')}><span>{t('sales24h')}</span><span className="sort-indicator">{indicator('sales24h')}</span></button></th>
        <th><button className="sort-button" disabled={rankFilter === 'base'} onClick={() => changeSort('potential')}><span>{t('potential')}</span><span className="sort-indicator">{indicator('potential')}</span></button></th>
        <th><button className="sort-button" disabled={rankFilter === 'base'} onClick={() => changeSort('score')}><span>{t('score')}</span><span className="sort-indicator">{indicator('score')}</span></button></th>
        <th title={x.forecastHint}><button className="sort-button" disabled={rankFilter === 'base'} onClick={() => changeSort('decision')}><span>{x.forecast}</span><span className="sort-indicator">{indicator('decision')}</span></button></th>
        <th><button className="sort-button" disabled={rankFilter === 'base'} onClick={() => changeSort('updatedDate')}><span>{t('updated')}</span><span className="sort-indicator">{indicator('updatedDate')}</span></button></th>
      </tr></thead><tbody>
        {scannerLoading ? <tr><td colSpan={7 + visibleRanges.length} className="state-cell"><div className="spinner"/><strong>{u.loading}</strong></td></tr> : scannerError ? <tr><td colSpan={7 + visibleRanges.length} className="state-cell error-state"><strong>{u.loadError}</strong><button className="retry-button" onClick={() => setScannerReload(value => value + 1)}>{u.retry}</button></td></tr> : !displayRows.length ? <tr><td colSpan={7 + visibleRanges.length} className="state-cell"><strong>{u.noData}</strong></td></tr> : displayRows.map(row => {
          const item = row.item
          const signal = row.canonical ? item[mode] : emptySignal()
          const href = itemHref(row)
          const variant = formatDimensions(item.dimensions, locale)
          return <tr key={row.rowId} className={!row.canonical ? 'hourly-only-row' : !item.hasHistory ? 'no-history-row' : ''}>
            <td><a className="item-link item-link-v3" href={href} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); openItem(row) }}><ItemIcon item={catalogItem(item.id)} name={itemName(item)}/><span><span className="item-name">{itemName(item)}</span><span className="item-category">{categoryLabel(item.category, locale, u, x.prime)}{variant ? ` · ${variant}` : ''}{row.selectedModRank != null ? ` · ${x.rank} ${row.selectedModRank}` : ''}{!row.canonical ? ` · ${x.hourlyOnlyRank}` : !item.hasHistory ? ` · ${x.noHistory}` : ''}</span></span></a></td>
            <td className="price-cell">{fmtPlat(rowCurrentPrice(row))}</td>
            {visibleRanges.map(range => { const live = row.hourly; return <td key={range} className={`${valueClass(rowRangeValue(row, range))} ${HOURLY_RANGES.has(range) ? live ? 'hourly-column hourly-live' : 'hourly-column hourly-missing' : ''}`} title={HOURLY_RANGES.has(range) ? live ? `${x.hourlyLive} · ${formatDate(row.hourlyFetchedAt, locale)}` : x.hourlyUnavailable : !row.canonical ? x.hourlyOnlyRank : undefined}><span className="change-cell-values"><strong>{fmtPercent(rowRangeValue(row, range))}</strong><small>{fmtPlatDelta(rowRangePlatinum(row, range))}</small></span></td> })}
            <td>{row.canonical ? item.sales24h ?? '—' : '—'}</td><td><span className={signal.potential != null && signal.potential > 0 ? 'potential-badge' : 'potential-badge muted'}>{signal.potential != null && signal.potential > 0 ? <><strong>+{fmtPlat(signal.potential)}</strong>{signal.potentialPct != null ? <small>{fmtPlainPercent(signal.potentialPct)}</small> : null}</> : '—'}</span></td><td><span className={`score-badge ${signal.score != null && signal.score >= 80 ? 'high' : signal.score != null && signal.score >= 60 ? 'mid' : 'low'}`}>{signal.score == null ? '—' : fmtNumber(signal.score)}</span></td><td><ForecastIndicator signal={signal} fallbackChange={row.canonical ? item.change7d : null} direction={rowTrendDirection(row)} title={t(decisionKey(signal.decision))} trendUp={x.trendUp} trendDown={x.trendDown} trendFlat={x.trendFlat}/></td><td className="updated-cell">{formatDate(row.hourlyFetchedAt || (row.canonical ? item.updatedDate : null), locale)}</td>
          </tr>
        })}
      </tbody></table></div></section>
      {!scannerLoading && !scannerError && (scannerData?.filteredItems || 0) > 0 ? <nav className="pagination-bar" aria-label="Pagination"><div className="pagination-range">{p.showing} <strong>{showingStart}–{showingEnd}</strong> {p.of} <strong>{scannerData?.filteredItems}</strong></div><div className="pagination-buttons"><button disabled={page <= 1} onClick={() => setPage(1)}>« {p.first}</button><button disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>‹ {p.previous}</button><span>{p.page} <strong>{page}</strong> {p.of} <strong>{pageCount}</strong></span><button disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>{p.next} ›</button><button disabled={page >= pageCount} onClick={() => setPage(pageCount)}>{p.last} »</button></div></nav> : null}
    </main>}
    <FooterBar locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} t={t}/>
  </>
}
