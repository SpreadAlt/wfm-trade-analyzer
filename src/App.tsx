import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchCatalog, fetchItem, fetchMetrics, fetchScanner } from './api'
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
  AnalysisPeriod, CatalogItem, ItemDetail, ItemSeries, MetricSeries, MetricsItem, PeriodAnalytics,
  Platform, ScannerItem, ScannerMode, ScannerSignal, ScannerSort, SortDirection, TimeRange
} from './types'

type T = (key: TranslationKey) => string
type OpenPanel = 'categories' | 'ranges' | null
type PageSize = 25 | 50 | 100 | 200

const PLATFORM_NAMES: Record<Platform, string> = { pc: 'PC', ps4: 'PlayStation', xbox: 'Xbox', switch: 'Nintendo Switch' }
const PAGE_SIZES: PageSize[] = [25, 50, 100, 200]
const PERIODS: AnalysisPeriod[] = [7, 30, 90, 180]
const TIME_RANGES: TimeRange[] = ['1h', '4h', '12h', '24h', '7d', '30d', '90d', '180d']
const DEFAULT_RANGES: TimeRange[] = ['24h', '7d', '30d']
const HOURLY_RANGES = new Set<TimeRange>(['1h', '4h', '12h'])

const fmtNumber = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits).replace(/\.0$/, '')
const fmtPercent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
const fmtPlainPercent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`
const fmtPlat = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${fmtNumber(value)}p`
const fmtPlatDelta = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${fmtNumber(value)}p`
const valueClass = (value: number | null | undefined) => value == null || value === 0 ? 'neutral' : value > 0 ? 'positive' : 'negative'
const intlLocale = (locale: Locale) => locale === 'zh-hans' ? 'zh-Hans' : locale === 'zh-hant' ? 'zh-Hant' : locale
const periodRange = (period: AnalysisPeriod): TimeRange => `${period}d` as TimeRange
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
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(intlLocale(locale), { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date)
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

type RouteState = { kind: 'scanner' | 'item'; slug: string | null; id: string | null; variant: string | null }
const readRoute = (): RouteState => {
  const match = location.pathname.match(/^\/items?\/([^/]+)\/?$/)
  const params = new URLSearchParams(location.search)
  return match
    ? { kind: 'item', slug: decodeURIComponent(match[1]), id: params.get('id'), variant: params.get('variant') }
    : { kind: 'scanner', slug: null, id: null, variant: null }
}

const FooterBar = ({ locale, setLocale, theme, setTheme, t }: { locale: Locale; setLocale: (value: Locale) => void; theme: Theme; setTheme: (value: Theme) => void; t: T }) => <footer className="footer-bar">
  <div className="footer-brand"><img src="/assets/frameanalytics-logo.png" alt="FrameAnalytics"/></div>
  <div className="footer-control"><span>{t('language')}</span><select value={locale} onChange={event => setLocale(event.target.value as Locale)}>{Object.entries(localeNames).map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select></div>
  <div className="footer-control"><span>{t('theme')}</span><select value={theme} onChange={event => setTheme(event.target.value as Theme)}><option value="system">{t('themeSystem')}</option><option value="light">{t('themeLight')}</option><option value="dark">{t('themeDark')}</option></select></div>
  <a className="footer-market-link" href="https://warframe.market/" target="_blank" rel="noreferrer">{t('sourceMarket')}</a>
  <div className="footer-version">{t('version')} 0.6.1</div>
  <div className="footer-disclaimer">{t('disclaimer')}</div>
</footer>

const Detail = ({ detail, metrics, summary, catalogItem, variantKey, platform, crossplay, period, visibleRanges, mode, locale, loading, error, onBack, onRetry, onVariant, t }: {
  detail: ItemDetail | null
  metrics: MetricsItem | null
  summary: ScannerItem | null
  catalogItem?: CatalogItem
  variantKey: string | null
  platform: Platform
  crossplay: boolean
  period: AnalysisPeriod
  visibleRanges: TimeRange[]
  mode: ScannerMode
  locale: Locale
  loading: boolean
  error: string | null
  onBack: () => void
  onRetry: () => void
  onVariant: (variant: string | null) => void
  t: T
}) => {
  const u = uiText[locale]
  const x = getExtraText(locale)
  const [chartRange, setChartRange] = useState<AnalysisPeriod>(period)
  const series: ItemSeries | null = detail ? (variantKey ? detail.variants[variantKey] || null : detail) : null
  const metricSeries: MetricSeries | null = metrics ? (variantKey ? metrics.variants[variantKey] || null : metrics) : null
  const analytics = metricSeries?.periods[String(period) as '7' | '30' | '90' | '180'] || null
  const signal = summary?.[mode] || emptySignal()
  const name = catalogItem?.name || detail?.name || summary?.name || ''
  const variantLabel = formatDimensions(series?.dimensions || summary?.dimensions, locale)
  const currentPrice = series?.currentPrice ?? summary?.currentPrice ?? null
  const rangeValue = (range: TimeRange) => {
    if (range === '1h') return series?.change1h ?? summary?.change1h ?? null
    if (range === '4h' || range === '12h') return null
    if (range === '24h') return series?.change24h ?? summary?.change24h ?? null
    if (range === '7d') return series?.change7d ?? summary?.change7d ?? null
    return metricSeries?.periods[range.replace('d', '') as '30' | '90' | '180']?.changePeriod ?? null
  }
  const rangePlatinum = (range: TimeRange) => {
    const value = rangeValue(range)
    if (range === '7d' || range === '30d' || range === '90d' || range === '180d') {
      const periodMetrics = metricSeries?.periods[range.replace('d', '') as '7' | '30' | '90' | '180']
      return platinumChange(currentPrice, value, periodMetrics?.referencePrice)
    }
    return platinumChange(currentPrice, value)
  }

  useEffect(() => { setChartRange(period) }, [period])

  return <main className="app-shell detail-shell">
    <button className="back-button" onClick={onBack}>{t('back')}</button>
    {loading ? <section className="panel state-panel"><div className="spinner"/><strong>{u.loading}</strong></section> : error || !detail ? <section className="panel state-panel error-state"><strong>{u.loadError}</strong><button className="retry-button" onClick={onRetry}>{u.retry}</button></section> : <>
      <section className="detail-header detail-header-v3">
        <div className="detail-identity"><ItemIcon item={catalogItem} name={name} large/><div><div className="eyebrow">{categoryLabel(detail.category, locale, u, x.prime)} · {PLATFORM_NAMES[platform]} · {crossplay ? x.crossplayOn : x.crossplayOff}</div><h1>{name}</h1><div className="identity-tags">{variantLabel ? <span>{x.variant}: {variantLabel}</span> : null}{detail.selectedModRank != null ? <span>{x.rank}: {detail.selectedModRank}</span> : null}{!series?.hasHistory ? <span className="no-history-tag">{x.noHistory}</span> : null}</div><div className="price-big">{fmtPlat(currentPrice)}</div></div></div>
        <div className="detail-actions">{Object.keys(detail.variants || {}).length ? <label className="variant-select"><span>{x.variant}</span><select value={variantKey || ''} onChange={event => onVariant(event.target.value || null)}><option value="">{x.chooseVariant}</option>{Object.entries(detail.variants).map(([key, value]) => <option key={key} value={key}>{formatDimensions(value.dimensions, locale) || key}</option>)}</select></label> : null}<div className="updated-card"><span>{t('updated')}</span><strong>{formatDate(series?.updatedDate, locale)}</strong></div></div>
      </section>
      <section className="range-card-grid">{TIME_RANGES.map(range => <div className={`range-card ${HOURLY_RANGES.has(range) ? 'range-pending' : ''}`} key={range} title={HOURLY_RANGES.has(range) ? x.hourlyPending : undefined}><span>{rangeLabel(range, x)}</span><strong className={valueClass(rangeValue(range))}>{fmtPercent(rangeValue(range))}</strong><small className={valueClass(rangePlatinum(range))}>{fmtPlatDelta(rangePlatinum(range))}</small>{HOURLY_RANGES.has(range) ? <i>⌛</i> : null}</div>)}</section>
      <section className="signal-grid signal-grid-v3">
        <div className={`signal-card potential-card ${mode === 'sell' ? 'sell' : ''}`}><span>{mode === 'buy' ? t('buyPotential') : t('sellPotential')}</span><strong>{analytics?.[mode].potential != null && analytics[mode].potential! > 0 ? `+${fmtPlat(analytics[mode].potential)}` : '—'}{analytics?.[mode].potentialPct != null && analytics[mode].potentialPct! > 0 ? <small> {fmtPlainPercent(analytics[mode].potentialPct)}</small> : null}</strong></div>
        <div className="signal-card score-card"><span>{t('score')}</span><strong>{signal.score == null ? '—' : fmtNumber(signal.score)}<small>{signal.score == null ? '' : '/100'}</small></strong></div>
        <div className="signal-card forecast-card"><span>{x.forecast}</span><ForecastIndicator signal={signal} fallbackChange={series?.change7d ?? null} direction={consensusDirection(visibleRanges.map(rangeValue))} title={t(decisionKey(signal.decision))} trendUp={x.trendUp} trendDown={x.trendDown} trendFlat={x.trendFlat} large/><small>{x.forecastHint}</small></div>
      </section>
      {analytics ? <section className="analysis-grid"><div className="analysis-card"><span>{u.baseline}</span><strong>{fmtPlat(analytics.baseline)}</strong></div><div className="analysis-card"><span>{u.q25}</span><strong>{fmtPlat(analytics.q25)}</strong></div><div className="analysis-card"><span>{u.q75}</span><strong>{fmtPlat(analytics.q75)}</strong></div><div className="analysis-card"><span>{u.volatility}</span><strong>{fmtPlainPercent(analytics.volatility)}</strong></div></section> : null}
      <section className="panel chart-panel">
        <div className="panel-title-row"><div><div className="eyebrow">{t('closedSales')} · {u.analysisWindow}: {rangeLabel(periodRange(chartRange), x)}</div><h2>{u.priceHistory}</h2></div><div className="time-tabs time-tabs-all">{TIME_RANGES.map(range => { const daily = ['7d', '30d', '90d', '180d'].includes(range); const value = Number(range.replace('d', '')) as AnalysisPeriod; return <button key={range} disabled={!daily} title={!daily ? x.hourlyPending : undefined} className={daily && chartRange === value ? 'time-tab active' : 'time-tab'} onClick={() => daily && setChartRange(value)}>{rangeLabel(range, x)}</button> })}</div></div>
        <HistoryChart history={series?.history || []} latestDate={series?.updatedDate || ''} range={chartRange} locale={locale} labels={{ empty: u.noData, chart: u.priceHistory, min: t('min'), median: t('median'), max: t('max'), sales: t('sales') }}/>
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
  const period = analysisPeriodForRanges(visibleRanges)
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
  const [route, setRoute] = useState<RouteState>(readRoute)
  const [detail, setDetail] = useState<ItemDetail | null>(null)
  const [detailMetrics, setDetailMetrics] = useState<MetricsItem | null>(null)
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

  const t: T = key => translations[locale][key]
  const u = uiText[locale]
  const x = getExtraText(locale)
  const p = paginationText[locale]
  const catalogItem = (id: string) => catalog.get(id)
  const itemName = (item: { id: string; name: string }) => catalogItem(item.id)?.name || item.name

  useEffect(() => { const timer = setTimeout(() => setQuery(queryInput.trim()), 300); return () => clearTimeout(timer) }, [queryInput])
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
    const controller = new AbortController()
    fetchCatalog(locale, controller.signal).then(response => setCatalog(new Map(response.items.map(item => [item.id, item])))).catch(() => setCatalog(new Map()))
    return () => controller.abort()
  }, [locale])

  useEffect(() => {
    setPage(1)
  }, [query, minPrice, minPotential, mode, platform, crossplay, period, categories, sort, direction, pageSize])

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
    if (route.kind !== 'item' || !route.id) { setDetail(null); setDetailMetrics(null); setDetailError(null); return }
    const controller = new AbortController()
    setDetailLoading(true); setDetailError(null)
    Promise.all([fetchItem(platform, route.id, controller.signal), fetchMetrics(platform, route.id, controller.signal)])
      .then(([itemResponse, metricsResponse]) => { setDetail(itemResponse.item); setDetailMetrics(metricsResponse.item); setDetailLoading(false) })
      .catch(error => { if (error instanceof DOMException && error.name === 'AbortError') return; setDetailError(error instanceof Error ? error.message : String(error)); setDetailLoading(false) })
    return () => controller.abort()
  }, [route.kind, route.id, platform, detailReload])

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
  const rowRangeValue = (item: ScannerItem, range: TimeRange) => {
    if (range === '1h') return item.change1h
    if (range === '4h' || range === '12h') return null
    if (range === '24h') return item.change24h
    if (range === '7d') return item.change7d
    if (range === periodRange(item.period)) return item.changePeriod
    return getMetricSeries(item)?.periods[range.replace('d', '') as '30' | '90' | '180']?.changePeriod ?? null
  }
  const rowRangePlatinum = (item: ScannerItem, range: TimeRange) => {
    const percent = rowRangeValue(item, range)
    const metricPeriod = range === '7d' || range === '30d' || range === '90d' || range === '180d'
      ? getMetricSeries(item)?.periods[range.replace('d', '') as '7' | '30' | '90' | '180']
      : null
    return platinumChange(item.currentPrice, percent, metricPeriod?.referencePrice)
  }
  const rowTrendDirection = (item: ScannerItem) => consensusDirection(visibleRanges.map(range => rowRangeValue(item, range)))

  const changeSort = (next: ScannerSort, range?: TimeRange) => {
    if (sort === next) setDirection(value => value === 'asc' ? 'desc' : 'asc')
    else { setSort(next); setDirection(next === 'name' ? 'asc' : 'desc') }
  }
  const indicator = (key: ScannerSort) => sort === key ? (direction === 'asc' ? '↑' : '↓') : ''
  const rangeSort = (range: TimeRange): ScannerSort | null => range === '24h' ? 'change24h' : range === '7d' ? 'change7d' : range === periodRange(period) ? 'changePeriod' : null
  const toggleCategory = (id: CategoryId) => setCategories(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  const toggleRange = (range: TimeRange) => setVisibleRanges(current => current.includes(range) ? current.filter(value => value !== range) : TIME_RANGES.filter(value => current.includes(value) || value === range))
  const statusText = scannerLoading ? u.loading : scannerError ? u.loadError : scannerData ? `${u.dataDate}: ${formatDate(scannerData.latestDate, locale)}` : u.loadError

  const itemHref = (item: ScannerItem) => {
    const params = new URLSearchParams({ platform, period: String(period), crossplay: String(crossplay), id: item.id })
    if (item.variantKey) params.set('variant', item.variantKey)
    return `/items/${encodeURIComponent(item.slug)}?${params}`
  }
  const openItem = (item: ScannerItem) => { history.pushState({ frameanalyticsFromScanner: true }, '', itemHref(item)); setRoute(readRoute()); setOpenPanel(null); scrollTo({ top: 0 }) }
  const closeItem = () => { if (history.state?.frameanalyticsFromScanner) history.back(); else { history.replaceState(null, '', '/'); setRoute(readRoute()) }; scrollTo({ top: 0 }) }
  const changeVariant = (variant: string | null) => {
    if (route.kind !== 'item' || !route.slug || !route.id) return
    const params = new URLSearchParams({ platform, period: String(period), crossplay: String(crossplay), id: route.id })
    if (variant) params.set('variant', variant)
    history.replaceState(history.state, '', `/items/${encodeURIComponent(route.slug)}?${params}`)
    setRoute(readRoute())
  }

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    params.set('platform', platform); params.set('period', String(period)); params.set('crossplay', String(crossplay))
    if (route.id) params.set('id', route.id)
    if (route.variant) params.set('variant', route.variant)
    const path = route.kind === 'item' && route.slug ? `/items/${encodeURIComponent(route.slug)}` : '/'
    history.replaceState(history.state, '', `${path}?${params}`)
  }, [platform, period, crossplay, route.kind, route.slug, route.id, route.variant])

  return <>
    <div className="background-layer"/><div className="background-shade"/>
    {route.kind === 'item' ? <Detail detail={detail} metrics={detailMetrics} summary={selectedSummary} catalogItem={route.id ? catalogItem(route.id) : undefined} variantKey={route.variant} platform={platform} crossplay={crossplay} period={period} visibleRanges={visibleRanges} mode={mode} locale={locale} loading={detailLoading} error={detailError} onBack={closeItem} onRetry={() => setDetailReload(value => value + 1)} onVariant={changeVariant} t={t}/> : <main className="app-shell">
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
        <div className="filter-field category-filter"><span>{u.categories}</span><button className="control-button" onClick={() => setOpenPanel(value => value === 'categories' ? null : 'categories')}>{u.categories}<b>{categories.length}/{CATEGORY_IDS.length}</b><i>⌄</i></button>{openPanel === 'categories' ? <div className="category-panel"><div className="category-actions"><button onClick={() => setCategories([...CATEGORY_IDS])}>{u.selectAll}</button><button onClick={() => setCategories([])}>{u.clear}</button></div><div className="category-list">{CATEGORY_IDS.map(id => <label className="category-option" key={id}><input type="checkbox" checked={categories.includes(id)} onChange={() => toggleCategory(id)}/><span>{categoryLabel(id, locale, u, x.prime)}</span></label>)}</div></div> : null}</div>
        <div className="filter-field ranges-filter"><span>{x.shownRanges}</span><button className="control-button" onClick={() => setOpenPanel(value => value === 'ranges' ? null : 'ranges')}>{x.chooseRanges}<b>{visibleRanges.length}/{TIME_RANGES.length}</b><i>⌄</i></button>{openPanel === 'ranges' ? <div className="category-panel ranges-panel"><div className="category-actions"><button onClick={() => setVisibleRanges([...TIME_RANGES])}>{x.allRanges}</button><button onClick={() => setVisibleRanges(DEFAULT_RANGES)}>{u.defaults}</button></div><div className="range-options">{TIME_RANGES.map(range => <label className="range-option" key={range}><input type="checkbox" checked={visibleRanges.includes(range)} onChange={() => toggleRange(range)}/><span>{rangeLabel(range, x)}</span>{HOURLY_RANGES.has(range) ? <i title={x.hourlyPending}>⌛</i> : <b>daily</b>}</label>)}</div><p>{x.hourlyNote}</p></div> : null}</div>
      </section>
      <section className="results-row results-toolbar"><div className="results-count"><span>{t('found')}</span><strong>{scannerData?.filteredItems ?? 0}</strong>{scannerData ? <em>{scannerData.catalogTotal ?? 3837} {x.catalogSummary} · {scannerData.marketSeries ?? scannerData.totalItems} {x.seriesSummary}</em> : null}</div><div className="range-load-state">{rangesLoading ? x.loadingRanges : rangesError ? x.rangesError : ''}</div><div className="page-size-control"><span>{p.perPage}</span><select value={pageSize} onChange={event => setPageSize(Number(event.target.value) as PageSize)}>{PAGE_SIZES.map(value => <option key={value} value={value}>{value}</option>)}</select></div><div className="page-indicator">{p.page} <strong>{page}</strong> {p.of} <strong>{pageCount}</strong></div></section>
      <section className="panel table-panel"><div className="table-scroll"><table className="market-table"><thead><tr>
        <th><button className="sort-button" onClick={() => changeSort('name')}><span>{t('item')}</span><span className="sort-indicator">{indicator('name')}</span></button></th>
        <th><button className="sort-button" onClick={() => changeSort('currentPrice')}><span>{t('current')}</span><span className="sort-indicator">{indicator('currentPrice')}</span></button></th>
        {visibleRanges.map(range => { const key = rangeSort(range); return <th key={range} className={HOURLY_RANGES.has(range) ? 'hourly-column' : ''}><button className="sort-button" disabled={!key} title={HOURLY_RANGES.has(range) ? x.hourlyPending : undefined} onClick={() => key && changeSort(key, range)}><span>{rangeLabel(range, x)}</span><span className="sort-indicator">{key && (range === periodRange(period) || range === '24h' || range === '7d') ? indicator(key) : ''}</span></button></th> })}
        <th><button className="sort-button" onClick={() => changeSort('sales24h')}><span>{t('sales24h')}</span><span className="sort-indicator">{indicator('sales24h')}</span></button></th>
        <th><button className="sort-button" onClick={() => changeSort('potential')}><span>{t('potential')}</span><span className="sort-indicator">{indicator('potential')}</span></button></th>
        <th><button className="sort-button" onClick={() => changeSort('score')}><span>{t('score')}</span><span className="sort-indicator">{indicator('score')}</span></button></th>
        <th title={x.forecastHint}><button className="sort-button" onClick={() => changeSort('decision')}><span>{x.forecast}</span><span className="sort-indicator">{indicator('decision')}</span></button></th>
        <th><button className="sort-button" onClick={() => changeSort('updatedDate')}><span>{t('updated')}</span><span className="sort-indicator">{indicator('updatedDate')}</span></button></th>
      </tr></thead><tbody>
        {scannerLoading ? <tr><td colSpan={7 + visibleRanges.length} className="state-cell"><div className="spinner"/><strong>{u.loading}</strong></td></tr> : scannerError ? <tr><td colSpan={7 + visibleRanges.length} className="state-cell error-state"><strong>{u.loadError}</strong><button className="retry-button" onClick={() => setScannerReload(value => value + 1)}>{u.retry}</button></td></tr> : !scannerData?.items.length ? <tr><td colSpan={7 + visibleRanges.length} className="state-cell"><strong>{u.noData}</strong></td></tr> : scannerData.items.map(item => {
          const signal = item[mode]
          const href = itemHref(item)
          const variant = formatDimensions(item.dimensions, locale)
          return <tr key={item.rowId} className={!item.hasHistory ? 'no-history-row' : ''}>
            <td><a className="item-link item-link-v3" href={href} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); openItem(item) }}><ItemIcon item={catalogItem(item.id)} name={itemName(item)}/><span><span className="item-name">{itemName(item)}</span><span className="item-category">{categoryLabel(item.category, locale, u, x.prime)}{variant ? ` · ${variant}` : ''}{item.selectedModRank != null ? ` · ${x.rank} ${item.selectedModRank}` : ''}{!item.hasHistory ? ` · ${x.noHistory}` : ''}</span></span></a></td>
            <td className="price-cell">{fmtPlat(item.currentPrice)}</td>
            {visibleRanges.map(range => <td key={range} className={`${valueClass(rowRangeValue(item, range))} ${HOURLY_RANGES.has(range) ? 'hourly-column' : ''}`} title={HOURLY_RANGES.has(range) ? x.hourlyPending : undefined}><span className="change-cell-values"><strong>{fmtPercent(rowRangeValue(item, range))}</strong><small>{fmtPlatDelta(rowRangePlatinum(item, range))}</small></span></td>)}
            <td>{item.sales24h ?? '—'}</td><td><span className={signal.potential != null && signal.potential > 0 ? 'potential-badge' : 'potential-badge muted'}>{signal.potential != null && signal.potential > 0 ? <><strong>+{fmtPlat(signal.potential)}</strong>{signal.potentialPct != null ? <small>{fmtPlainPercent(signal.potentialPct)}</small> : null}</> : '—'}</span></td><td><span className={`score-badge ${signal.score != null && signal.score >= 80 ? 'high' : signal.score != null && signal.score >= 60 ? 'mid' : 'low'}`}>{signal.score == null ? '—' : fmtNumber(signal.score)}</span></td><td><ForecastIndicator signal={signal} fallbackChange={item.change7d} direction={rowTrendDirection(item)} title={t(decisionKey(signal.decision))} trendUp={x.trendUp} trendDown={x.trendDown} trendFlat={x.trendFlat}/></td><td className="updated-cell">{formatDate(item.updatedDate, locale)}</td>
          </tr>
        })}
      </tbody></table></div></section>
      {!scannerLoading && !scannerError && (scannerData?.filteredItems || 0) > 0 ? <nav className="pagination-bar" aria-label="Pagination"><div className="pagination-range">{p.showing} <strong>{showingStart}–{showingEnd}</strong> {p.of} <strong>{scannerData?.filteredItems}</strong></div><div className="pagination-buttons"><button disabled={page <= 1} onClick={() => setPage(1)}>« {p.first}</button><button disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>‹ {p.previous}</button><span>{p.page} <strong>{page}</strong> {p.of} <strong>{pageCount}</strong></span><button disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>{p.next} ›</button><button disabled={page >= pageCount} onClick={() => setPage(pageCount)}>{p.last} »</button></div></nav> : null}
    </main>}
    <FooterBar locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} t={t}/>
  </>
}
