import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchCatalog, fetchEvents, fetchHourly, fetchHourlyIndex, fetchItem, fetchMetrics, fetchScanner } from './api'
import { getExtraText } from './extraText'
import { HistoryChart } from './HistoryChart'
import { CATEGORY_IDS, ForecastIndicator, formatDimensions, ItemIcon, MarketEventBadge } from './MarketVisuals'
import type { CategoryId } from './MarketVisuals'
import { AccountButton, createTemporaryAccount, loadTemporaryAccount, portfolioText, PurchaseDialog, saveTemporaryAccount } from './Portfolio'
import type { PortfolioPurchase, TemporaryAccount } from './Portfolio'
import { localeNames, translations } from './i18n'
import type { Locale, Theme, TranslationKey } from './i18n'
import { paginationText } from './paginationText'
import { SmartBuyPanel } from './SmartBuy'
import { AccountPanel, useFrameAccount } from './Account'
import type { FrameAccountController } from './Account'
import { uiText } from './uiText'
import type { UiText } from './uiText'
import type {
  AnalysisPeriod, CatalogItem, HourlyIndexRow, HourlyIndexResponse, HourlyRange, HourlyResponse, HourlySeries, ItemDetail, ItemSeries,
  MarketEvent, MetricSeries, MetricsItem, PeriodAnalytics, Platform, ScannerItem, ScannerMode, ScannerSignal,
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
const HOURLY_INDEX_SORTS = new Set<ScannerSort>(['currentPrice', 'change1h', 'change4h', 'change12h', 'change24h', 'updatedDate'])
const fmtNumber = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits).replace(/\.0$/, '')
const fmtPercent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
const fmtPlainPercent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`
const fmtPlat = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${fmtNumber(value)}p`
const fmtPlatDelta = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${fmtNumber(value)}p`
const valueClass = (value: number | null | undefined) => value == null || value === 0 ? 'neutral' : value > 0 ? 'positive' : 'negative'
const intlLocale = (locale: Locale) => locale === 'zh-hans' ? 'zh-Hans' : locale === 'zh-hant' ? 'zh-Hant' : locale
const periodRange = (period: AnalysisPeriod): TimeRange => `${period}d` as TimeRange
const hourlyKey = (platform: Platform, crossplay: boolean, id: string) => `${platform}:${crossplay ? 'crossplay' : 'platform'}:${id}`
const supportsHourly = (platform: Platform, crossplay: boolean) => platform !== 'switch' && crossplay
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
const mergeDailyHistory = (stored: ItemSeries['history'], live: ItemSeries['history']) => {
  const points = new Map<string, ItemSeries['history'][number]>()
  for (const point of stored || []) points.set(point.date.slice(0, 10), { ...point, date: point.date.slice(0, 10) })
  for (const point of live || []) points.set(point.date.slice(0, 10), { ...point, date: point.date.slice(0, 10) })
  return [...points.values()].sort((left, right) => left.date.localeCompare(right.date)).slice(-180)
}
const dailyReferencePoint = (history: ItemSeries['history'], days: number) => {
  const latest = [...history].reverse().find(point => point.median != null && Number.isFinite(point.median))
  if (!latest) return null
  const target = Date.parse(`${latest.date.slice(0, 10)}T00:00:00Z`) - days * 24 * 60 * 60 * 1000
  return [...history].reverse().find(point => Date.parse(`${point.date.slice(0, 10)}T00:00:00Z`) <= target && point.median != null && Number.isFinite(point.median)) || null
}
const formatDate = (value: string | null | undefined, locale: Locale) => {
  if (!value) return '—'
  const hasTime = value.includes('T')
  const date = new Date(hasTime ? value : `${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(intlLocale(locale), hasTime
    ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
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
const hourlySeriesFromIndex = (row: HourlyIndexRow): HourlySeries => ({
  marketKey: row.marketKey,
  dimensions: row.dimensions || {},
  currentPrice: row.currentPrice,
  latestAt: row.latestAt,
  changes: {
    '1h': { percent: row.change1h, platinum: row.change1hPlatinum, referenceAt: null },
    '4h': { percent: row.change4h, platinum: row.change4hPlatinum, referenceAt: null },
    '12h': { percent: row.change12h, platinum: row.change12hPlatinum, referenceAt: null },
    '24h': { percent: row.change24h, platinum: row.change24hPlatinum, referenceAt: null }
  },
  history: [],
  dailyLatestDate: null,
  dailyHistory: []
})
const scannerFallbackFromIndex = (row: HourlyIndexRow, period: AnalysisPeriod): ScannerItem => ({
  rowId: row.rowId, itemId: row.itemId, id: row.id, name: row.name, displayName: row.displayName,
  slug: row.slug, category: row.category, subcategory: row.subcategory, defaultEnabled: row.defaultEnabled,
  marketMode: 'none', marketKey: row.marketKey, variantKey: row.marketKey.startsWith('subtype=') ? row.marketKey : null,
  dimensions: row.dimensions, selectedModRank: row.selectedModRank, period, hasHistory: false, hasCurrentDay: false,
  currentPrice: row.currentPrice, change1h: row.change1h, change24h: row.change24h, change7d: null, changePeriod: null,
  sales24h: null, averageVolume7d: null, channelPosition: null, coveragePct: null, volatility: null,
  updatedDate: row.fetchedAt, buy: emptySignal(), sell: emptySignal(), buyPotential: null, buyPotentialPct: null,
  buyScore: null, buyDecision: 'LOW_PRIORITY', sellPotential: null, sellPotentialPct: null, sellScore: null,
  sellDecision: 'LOW_PRIORITY'
})
const hourlyIndexRowFromScanner = (item: ScannerItem): HourlyIndexRow => ({
  rowId: item.rowId,
  itemId: item.itemId,
  id: item.id,
  slug: item.slug,
  name: item.name,
  displayName: item.displayName,
  category: item.category,
  subcategory: item.subcategory,
  defaultEnabled: item.defaultEnabled,
  marketKey: item.marketKey,
  dimensions: item.dimensions || {},
  selectedModRank: item.selectedModRank,
  hasHourlyHistory: false,
  hourlyState: 'daily-only',
  currentPrice: item.currentPrice,
  latestAt: item.updatedDate,
  fetchedAt: item.updatedDate,
  change1h: null,
  change1hPlatinum: null,
  change4h: null,
  change4hPlatinum: null,
  change12h: null,
  change12hPlatinum: null,
  change24h: item.change24h,
  change24hPlatinum: platinumChange(item.currentPrice, item.change24h),
  daily: item
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
type RouteState = { kind: 'scanner' | 'item' | 'portfolio'; slug: string | null; id: string | null; variant: string | null; rank: number | null }
const readRoute = (): RouteState => {
  const match = location.pathname.match(/^\/items?\/([^/]+)\/?$/)
  const params = new URLSearchParams(location.search)
  const rankValue = Number(params.get('rank'))
  const rank = params.has('rank') && Number.isInteger(rankValue) && rankValue >= 0 ? rankValue : null
  if (/^\/(?:profile|portfolio)\/?$/.test(location.pathname)) {
    return { kind: 'portfolio', slug: null, id: null, variant: null, rank: null }
  }
  return match
    ? { kind: 'item', slug: decodeURIComponent(match[1]), id: params.get('id'), variant: params.get('variant'), rank }
    : { kind: 'scanner', slug: null, id: null, variant: null, rank: null }
}
const FooterBar = ({ locale, setLocale, theme, setTheme, t }: { locale: Locale; setLocale: (value: Locale) => void; theme: Theme; setTheme: (value: Theme) => void; t: T }) => <footer className="footer-bar">
  <a className="footer-brand" href="/" aria-label="FrameAnalytics — home"><img src="/assets/frameanalytics-logo.png" alt="FrameAnalytics"/></a>
  <div className="footer-control"><span>{t('language')}</span><select value={locale} onChange={event => setLocale(event.target.value as Locale)}>{Object.entries(localeNames).map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select></div>
  <div className="footer-control"><span>{t('theme')}</span><select value={theme} onChange={event => setTheme(event.target.value as Theme)}><option value="system">{t('themeSystem')}</option><option value="light">{t('themeLight')}</option><option value="dark">{t('themeDark')}</option></select></div>
  <a className="footer-market-link" href="https://warframe.market/" target="_blank" rel="noreferrer">{t('sourceMarket')}</a>
  <div className="footer-version">{t('version')} 0.9.0</div>
  <div className="footer-disclaimer">{t('disclaimer')}</div>
</footer>
const PlatformGlyph = ({ platform }: { platform: Platform }) => <svg viewBox="0 0 24 24" aria-hidden="true">
  {platform === 'pc' ? <><rect x="3.5" y="4.5" width="17" height="12" rx="2"/><path d="M9 20h6M12 16.5V20"/></>
    : platform === 'ps4' ? <><path d="M7.5 8.2h9a4.4 4.4 0 0 1 4.2 5.6l-1 3.4a1.8 1.8 0 0 1-3  .8l-2-2H9.3l-2 2a1.8 1.8 0 0 1-3-.8l-1-3.4a4.4 4.4 0 0 1 4.2-5.6Z"/><path d="M7.5 11v4M5.5 13h4M16.5 11.5h.01M18.5 14h.01"/></>
      : platform === 'xbox' ? <><circle cx="12" cy="12" r="8.5"/><path d="m7.2 7.7 3.2 2.5L6.8 16M16.8 7.7l-3.2 2.5 3.6 5.8M9.5 6.5c1.7-1 3.3-1 5 0"/></>
        : <><rect x="4" y="3.5" width="7" height="17" rx="3"/><rect x="13" y="3.5" width="7" height="17" rx="3"/><circle cx="7.5" cy="8" r="1.2"/><circle cx="16.5" cy="15.5" r="1.2"/></>}
</svg>
const CrossplayGlyph = () => <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.8 12h16.4M12 3.5c2.2 2.3 3.4 5.1 3.4 8.5S14.2 18.2 12 20.5M12 3.5C9.8 5.8 8.6 8.6 8.6 12s1.2 6.2 3.4 8.5"/></svg>
const MarketSelector = ({ platform, crossplay, locale, onPlatform, onCrossplay }: {
  platform: Platform
  crossplay: boolean
  locale: Locale
  onPlatform: (value: Platform) => void
  onCrossplay: () => void
}) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const x = getExtraText(locale)
  const crossplayLabel = platform === 'switch' ? x.crossplayUnavailable : crossplay ? x.crossplayOn : x.crossplayOff
  useEffect(() => {
    if (!open) return
    const close = (event: PointerEvent) => { if (!ref.current?.contains(event.target as Node)) setOpen(false) }
    addEventListener('pointerdown', close)
    return () => removeEventListener('pointerdown', close)
  }, [open])
  return <div className="market-selector" ref={ref}>
    <button type="button" className={`crossplay-button ${crossplay ? 'active' : ''}`} disabled={platform === 'switch'} aria-label={crossplayLabel} title={crossplayLabel} aria-pressed={crossplay} onClick={onCrossplay}><CrossplayGlyph/></button>
    <button type="button" className="platform-button" aria-haspopup="menu" aria-expanded={open} aria-label={PLATFORM_NAMES[platform]} title={PLATFORM_NAMES[platform]} onClick={() => setOpen(value => !value)}><PlatformGlyph platform={platform}/><span aria-hidden="true">⌄</span></button>
    {open ? <div className="platform-menu" role="menu">{(Object.keys(PLATFORM_NAMES) as Platform[]).map(value => <button type="button" role="menuitemradio" aria-checked={platform === value} className={platform === value ? 'selected' : ''} key={value} onClick={() => { onPlatform(value); setOpen(false) }}><PlatformGlyph platform={value}/><span>{PLATFORM_NAMES[value]}</span>{platform === value ? <b aria-hidden="true">✓</b> : null}</button>)}</div> : null}
  </div>
}
const Detail = ({ detail, metrics, hourly, summary, catalogItem, events, variantKey, selectedRank, platform, crossplay, period, visibleRanges, mode, locale, loading, hourlyLoading, error, hasAccount, onBack, onRetry, onVariant, onRank, onPlatform, onCrossplay, onOpenAccount, onAddPurchase, t }: {
  detail: ItemDetail | null
  metrics: MetricsItem | null
  hourly: HourlyResponse | null
  summary: ScannerItem | null
  catalogItem?: CatalogItem
  events: MarketEvent[]
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
  hasAccount: boolean
  onBack: () => void
  onRetry: () => void
  onVariant: (variant: string | null) => void
  onRank: (rank: number | null) => void
  onPlatform: (platform: Platform) => void
  onCrossplay: () => void
  onOpenAccount: () => void
  onAddPurchase: (purchase: Omit<PortfolioPurchase, 'id' | 'createdAt'>) => void
  t: T
}) => {
  const u = uiText[locale]
  const x = getExtraText(locale)
  const [chartRange, setChartRange] = useState<TimeRange>(periodRange(period))
  const [purchaseOpen, setPurchaseOpen] = useState(false)
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
  const liveDailyCurrent = [...(hourlySeries?.dailyHistory || [])].reverse().find(point => point.median != null)?.median ?? null
  const currentPrice = hourlySeries ? hourlySeries.currentPrice ?? liveDailyCurrent : series?.currentPrice ?? summary?.currentPrice ?? null
  const mergedDailyHistory = mergeDailyHistory(series?.history || [], hourlySeries?.dailyHistory || [])
  const liveDailyAvailable = Boolean(hourlySeries?.dailyHistory?.length)
  const liveDailyChange = (range: TimeRange) => {
    const days = Number(range.replace('d', ''))
    const reference = dailyReferencePoint(mergedDailyHistory, days)
    if (!reference || reference.median == null || reference.median === 0 || currentPrice == null) return null
    return (currentPrice - reference.median) / reference.median * 100
  }
  const liveDailyPlatinum = (range: TimeRange) => {
    const reference = dailyReferencePoint(mergedDailyHistory, Number(range.replace('d', '')))
    return reference?.median == null || currentPrice == null ? null : currentPrice - reference.median
  }
  const currentEvent = events.find(event => event.status === 'active' || event.status === 'upcoming') || null
  const rangeValue = (range: TimeRange) => {
    if (HOURLY_RANGES.has(range)) return hourlySeries?.changes[range as HourlyRange]?.percent ?? (range === '24h' ? series?.change24h ?? summary?.change24h ?? null : null)
    if (liveDailyAvailable) return liveDailyChange(range)
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
      if (liveDailyAvailable) return liveDailyPlatinum(range)
      const periodMetrics = metricSeries?.periods[range.replace('d', '') as '7' | '30' | '90' | '180']
      return platinumChange(currentPrice, value, periodMetrics?.referencePrice)
    }
    return platinumChange(currentPrice, value)
  }
  const hourlyChart = HOURLY_RANGES.has(chartRange) && hourlySeries
  const chartHistory = hourlyChart
    ? hourlySeries.history.map(point => ({ date: point.timestamp, min: point.min, median: point.median, max: point.max, sales: point.volume }))
    : mergedDailyHistory
  const chartLatest = hourlyChart ? hourlySeries.latestAt || hourly?.fetchedAt || '' : hourlySeries?.dailyLatestDate || mergedDailyHistory[mergedDailyHistory.length - 1]?.date || series?.updatedDate || ''
  useEffect(() => { setChartRange(periodRange(period)) }, [period])
  return <main className="app-shell detail-shell">
    <div className="detail-navigation"><a className="brand-plate detail-brand" href="/" aria-label="FrameAnalytics — home"><img src="/assets/frameanalytics-logo.png" alt="FrameAnalytics"/></a><button className="back-button" onClick={onBack}>{t('back')}</button></div>
    {loading ? <section className="panel state-panel"><div className="spinner"/><strong>{u.loading}</strong></section> : error || !detail ? <section className="panel state-panel error-state"><strong>{u.loadError}</strong><button className="retry-button" onClick={onRetry}>{u.retry}</button></section> : <>
      <section className="detail-hero panel">
        <div className="detail-identity"><ItemIcon item={catalogItem} name={name} large/><div><div className="eyebrow">{categoryLabel(detail.category, locale, u, x.prime)}</div><h1>{name}{currentEvent ? <MarketEventBadge event={currentEvent} locale={locale}/> : null}</h1><div className="identity-tags">{variantLabel ? <span>{x.variant}: {variantLabel}</span> : null}{selectedRank != null || canonicalRank != null ? <span>{x.rank}: {selectedRank ?? canonicalRank}</span> : null}{!series?.hasHistory && !hourlySeries ? <span className="no-history-tag">{x.noHistory}</span> : null}</div><div className="price-big">{fmtPlat(currentPrice)}</div></div></div>
        <div className="detail-actions"><div className="detail-action-row"><MarketSelector platform={platform} crossplay={crossplay} locale={locale} onPlatform={onPlatform} onCrossplay={onCrossplay}/><AccountButton locale={locale} active={hasAccount} onClick={onOpenAccount}/></div>{Object.keys(detail.variants || {}).length ? <label className="variant-select"><span>{x.variant}</span><select value={variantKey || ''} onChange={event => onVariant(event.target.value || null)}><option value="">{x.chooseVariant}</option>{Object.entries(detail.variants).map(([key, value]) => <option key={key} value={key}>{formatDimensions(value.dimensions, locale) || key}</option>)}</select></label> : null}{rankOptions.length ? <label className="variant-select"><span>{x.rank}</span><select value={selectedRank ?? canonicalRank ?? ''} onChange={event => onRank(event.target.value === '' ? null : Number(event.target.value))}>{rankOptions.map(rank => <option value={rank} key={rank}>{x.rank} {rank}</option>)}</select></label> : null}<div className="detail-meta-row"><span>{t('updated')}: <strong>{formatDate(hourly?.fetchedAt || series?.updatedDate, locale)}</strong></span><button type="button" className="portfolio-add" onClick={() => hasAccount ? setPurchaseOpen(true) : onOpenAccount()}>{locale === 'ru' ? 'Добавить покупку' : 'Add purchase'}</button></div></div>
      </section>
      <section className="detail-dashboard panel">
        <div className="range-strip">{visibleRanges.map(range => <div className={`${HOURLY_RANGES.has(range) ? hourlySeries ? 'range-live' : 'range-unavailable' : ''}`} key={range} title={HOURLY_RANGES.has(range) && !hourlySeries ? x.hourlyUnavailable : undefined}><span>{rangeLabel(range, x)}</span><strong className={valueClass(rangeValue(range))}>{fmtPercent(rangeValue(range))}</strong><small className={valueClass(rangePlatinum(range))}>{fmtPlatDelta(rangePlatinum(range))}</small>{HOURLY_RANGES.has(range) ? <i>{hourlyLoading ? '···' : hourlySeries ? '●' : '○'}</i> : null}</div>)}</div>
        <div className="insight-row"><div><span>{mode === 'buy' ? t('buyPotential') : t('sellPotential')}</span><strong>{analytics?.[mode].potential != null && analytics[mode].potential! > 0 ? `+${fmtPlat(analytics[mode].potential)}` : '—'}<small>{analytics?.[mode].potentialPct != null && analytics[mode].potentialPct! > 0 ? fmtPlainPercent(analytics[mode].potentialPct) : ''}</small></strong></div><div><span>{t('score')}</span><strong>{signal.score == null ? '—' : fmtNumber(signal.score)}<small>{signal.score == null ? '' : '/100'}</small></strong></div><div className="insight-forecast"><span>{x.forecast}</span><ForecastIndicator signal={signal} fallbackChange={series?.change7d ?? null} direction={currentEvent ? 'down' : consensusDirection(visibleRanges.map(rangeValue))} title={t(decisionKey(signal.decision))} trendUp={x.trendUp} trendDown={x.trendDown} trendFlat={x.trendFlat}/>{currentEvent ? <MarketEventBadge event={currentEvent} locale={locale} compact/> : null}</div><a className="insight-market-link" href={`https://warframe.market/items/${encodeURIComponent(detail.slug)}`} target="_blank" rel="noopener noreferrer" title={x.wfmItemHint}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 5h5v5M19 5l-8 8"/><path d="M17 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h5"/></svg><span>{x.openOnWfm}</span></a></div>
        {analytics ? <div className="analysis-strip"><span className="analysis-item" title={x.typicalPriceHint} aria-label={`${x.typicalPrice}. ${x.typicalPriceHint}`}><small>{x.typicalPrice}<i className="metric-help" aria-hidden="true">?</i></small><strong>{fmtPlat(analytics.baseline)}</strong></span><span className="analysis-item" title={x.lowerPriceHint} aria-label={`${x.lowerPrice}. ${x.lowerPriceHint}`}><small>{x.lowerPrice}<i className="metric-help" aria-hidden="true">?</i></small><strong>{fmtPlat(analytics.q25)}</strong></span><span className="analysis-item" title={x.upperPriceHint} aria-label={`${x.upperPrice}. ${x.upperPriceHint}`}><small>{x.upperPrice}<i className="metric-help" aria-hidden="true">?</i></small><strong>{fmtPlat(analytics.q75)}</strong></span><span className="analysis-item" title={x.priceFluctuationHint} aria-label={`${x.priceFluctuation}. ${x.priceFluctuationHint}`}><small>{x.priceFluctuation}<i className="metric-help" aria-hidden="true">?</i></small><strong>{fmtPlainPercent(analytics.volatility)}</strong></span></div> : null}
      </section>
      <section className="panel chart-panel">
        <div className="panel-title-row"><div><div className="eyebrow">{t('closedSales')} · {u.analysisWindow}: {rangeLabel(chartRange, x)}</div><h2>{u.priceHistory}</h2></div><div className="time-tabs time-tabs-all">{TIME_RANGES.map(range => { const unavailable = HOURLY_RANGES.has(range) && range !== '24h' && !hourlySeries; return <button key={range} disabled={unavailable} title={unavailable ? x.hourlyUnavailable : undefined} className={chartRange === range ? 'time-tab active' : 'time-tab'} onClick={() => !unavailable && setChartRange(range)}>{rangeLabel(range, x)}</button> })}</div></div>
        <HistoryChart history={chartHistory} latestDate={chartLatest} range={chartRange} locale={locale} events={events} labels={{ empty: u.noData, chart: u.priceHistory, min: t('min'), median: t('median'), max: t('max'), sales: t('sales') }}/>
      </section>
      <PurchaseDialog locale={locale} name={name} currentPrice={currentPrice} open={purchaseOpen} onClose={() => setPurchaseOpen(false)} onSave={value => { onAddPurchase({ itemId: detail.id, slug: detail.slug, name, marketKey, selectedModRank: selectedRank ?? canonicalRank, ...value }); setPurchaseOpen(false) }}/>
    </>}
  </main>
}
type PortfolioMarketEntry = {
  purchase: PortfolioPurchase
  row: DisplayMarketRow | null
}
const PortfolioPage = ({ account, auth, entries, loading, error, platform, crossplay, mode, visibleRanges, locale, catalog, events, onBack, onRetry, onRemove, onOpenItem, onPlatform, onCrossplay, onMode, currentPriceFor, rangeValueFor, rangePlatinumFor, t }: {
  account: TemporaryAccount | null
  auth: FrameAccountController
  entries: PortfolioMarketEntry[]
  loading: boolean
  error: string | null
  platform: Platform
  crossplay: boolean
  mode: ScannerMode
  visibleRanges: TimeRange[]
  locale: Locale
  catalog: Map<string, CatalogItem>
  events: MarketEvent[]
  onBack: () => void
  onRetry: () => void
  onRemove: (id: string) => void
  onOpenItem: (purchase: PortfolioPurchase) => void
  onPlatform: (value: Platform) => void
  onCrossplay: () => void
  onMode: (value: ScannerMode) => void
  currentPriceFor: (row: DisplayMarketRow) => number | null
  rangeValueFor: (row: DisplayMarketRow, range: TimeRange) => number | null
  rangePlatinumFor: (row: DisplayMarketRow, range: TimeRange) => number | null
  t: T
}) => {
  const text = portfolioText(locale)
  const x = getExtraText(locale)
  const u = uiText[locale]
  const invested = account?.purchases.reduce((sum, purchase) => sum + purchase.purchasePrice * purchase.quantity, 0) || 0
  const pricedEntries = entries.filter((entry): entry is PortfolioMarketEntry & { row: DisplayMarketRow } => Boolean(entry.row && currentPriceFor(entry.row) != null))
  const currentValue = pricedEntries.reduce((sum, entry) => sum + (currentPriceFor(entry.row) || 0) * entry.purchase.quantity, 0)
  const pricedInvestment = pricedEntries.reduce((sum, entry) => sum + entry.purchase.purchasePrice * entry.purchase.quantity, 0)
  const profit = currentValue - pricedInvestment
  const returnPct = pricedInvestment > 0 ? profit / pricedInvestment * 100 : null
  const eventFor = (itemId: string) => events.find(event => event.itemId === itemId && (event.status === 'active' || event.status === 'upcoming')) || null
  return <main className="app-shell portfolio-shell">
    <div className="detail-navigation"><a className="brand-plate detail-brand" href="/" aria-label="FrameAnalytics — home"><img src="/assets/frameanalytics-logo.png" alt="FrameAnalytics"/></a><button type="button" className="back-button" onClick={onBack}>← {text.back}</button></div>
    <div className="portfolio-heading"><div><span>{auth.account ? auth.account.user.email : text.title}</span><h1>{text.title}</h1><p>{auth.account ? (locale === 'ru' ? 'Данные профиля сохраняются в аккаунте FrameAnalytics.' : 'Profile data is saved to your FrameAnalytics account.') : (locale === 'ru' ? 'Войдите или зарегистрируйтесь, чтобы открыть личный кабинет.' : 'Sign in or register to open your profile.')}</p></div><div className="topbar-actions"><MarketSelector platform={platform} crossplay={crossplay} locale={locale} onPlatform={onPlatform} onCrossplay={onCrossplay}/><AccountButton locale={locale} active={Boolean(auth.account)} onClick={() => undefined}/></div></div>
    <AccountPanel locale={locale} auth={auth}/>
    {!auth.account ? null : <>
      <section className="portfolio-summary-grid">
        <article className="panel"><span>{text.total}</span><strong>{fmtPlat(invested)}</strong><small>{account.purchases.length} · {text.purchases.toLowerCase()}</small></article>
        <article className="panel"><span>{text.currentValue}</span><strong>{pricedEntries.length ? fmtPlat(currentValue) : '—'}</strong><small>{pricedEntries.length}/{entries.length}</small></article>
        <article className={`panel ${valueClass(profit)}`} title={text.profitHint}><span>{text.possibleProfit}</span><strong>{pricedEntries.length ? fmtPlatDelta(profit) : '—'}</strong><small>{text.returnPct}: {fmtPercent(returnPct)}</small></article>
      </section>
      <SmartBuyPanel locale={locale} catalog={catalog} auth={auth}/>
      <section className="mode-tabs portfolio-mode-tabs"><button className={mode === 'buy' ? 'mode-tab active buy' : 'mode-tab'} onClick={() => onMode('buy')}>{t('buy')}</button><button className={mode === 'sell' ? 'mode-tab active sell' : 'mode-tab'} onClick={() => onMode('sell')}>{t('sell')}</button></section>
      {!account.purchases.length ? <section className="panel portfolio-empty">{text.empty}</section> : <section className="panel table-panel portfolio-table-panel"><div className="table-scroll"><table className="market-table portfolio-table"><thead><tr>
        <th>{t('item')}</th><th>{text.price}</th><th>{text.quantity}</th><th>{t('current')}</th>
        {visibleRanges.map(range => <th key={range} className={HOURLY_RANGES.has(range) ? 'hourly-column' : ''}>{rangeLabel(range, x)}</th>)}
        <th>{t('sales24h')}</th><th>{t('potential')}</th><th>{t('score')}</th><th>{x.forecast}</th><th>{text.possibleProfit}</th><th>{t('updated')}</th><th aria-label={text.remove}/>
      </tr></thead><tbody>
        {loading ? <tr><td colSpan={12 + visibleRanges.length} className="state-cell"><div className="spinner"/><strong>{text.loading}</strong></td></tr> : error ? <tr><td colSpan={12 + visibleRanges.length} className="state-cell error-state"><strong>{text.loadError}</strong><button className="retry-button" onClick={onRetry}>{text.retry}</button></td></tr> : entries.map(({ purchase, row }) => {
          const item = row?.item || null
          const signal = row?.canonical && item ? item[mode] : emptySignal()
          const currentPrice = row ? currentPriceFor(row) : null
          const rowProfit = currentPrice == null ? null : (currentPrice - purchase.purchasePrice) * purchase.quantity
          const rowReturn = currentPrice == null || purchase.purchasePrice <= 0 ? null : (currentPrice - purchase.purchasePrice) / purchase.purchasePrice * 100
          const catalogItem = catalog.get(purchase.itemId)
          const name = catalogItem?.name || item?.displayName || purchase.name
          const variant = item ? formatDimensions(item.dimensions, locale) : ''
          const currentEvent = eventFor(purchase.itemId)
          const trend = row ? consensusDirection(visibleRanges.map(range => rangeValueFor(row, range))) : 'flat'
          return <tr key={purchase.id} className={!row ? 'no-history-row' : !row.canonical ? 'hourly-only-row' : ''}>
            <td><button type="button" className="item-link item-link-v3 portfolio-item-link" onClick={() => onOpenItem(purchase)}><ItemIcon item={catalogItem} name={name}/><span><span className="item-name" title={name}><span className="item-name-text">{name}</span>{currentEvent ? <MarketEventBadge event={currentEvent} locale={locale} compact/> : null}</span><span className="item-category">{item ? categoryLabel(item.category, locale, u, x.prime) : text.unavailableMarket}{variant ? ` · ${variant}` : ''}{purchase.selectedModRank != null ? ` · ${x.rank} ${purchase.selectedModRank}` : ''}<br/>{formatDate(purchase.purchaseDate, locale)}</span></span></button></td>
            <td>{fmtPlat(purchase.purchasePrice)}</td><td>{purchase.quantity}</td><td className="price-cell">{fmtPlat(currentPrice)}</td>
            {visibleRanges.map(range => <td key={range} className={`${row ? valueClass(rangeValueFor(row, range)) : 'neutral'} ${HOURLY_RANGES.has(range) ? 'hourly-column' : ''}`}><span className="change-cell-values"><strong>{row ? fmtPercent(rangeValueFor(row, range)) : '—'}</strong><small>{row ? fmtPlatDelta(rangePlatinumFor(row, range)) : '—'}</small></span></td>)}
            <td>{row?.canonical ? item?.sales24h ?? '—' : '—'}</td><td><span className={signal.potential != null && signal.potential > 0 ? 'potential-badge' : 'potential-badge muted'}>{signal.potential != null && signal.potential > 0 ? <><strong>+{fmtPlat(signal.potential)}</strong>{signal.potentialPct != null ? <small>{fmtPlainPercent(signal.potentialPct)}</small> : null}</> : '—'}</span></td><td><span className={`score-badge ${signal.score != null && signal.score >= 80 ? 'high' : signal.score != null && signal.score >= 60 ? 'mid' : 'low'}`}>{signal.score == null ? '—' : fmtNumber(signal.score)}</span></td><td><ForecastIndicator signal={signal} fallbackChange={item?.change7d ?? null} direction={currentEvent ? 'down' : trend} title={t(decisionKey(signal.decision))} trendUp={x.trendUp} trendDown={x.trendDown} trendFlat={x.trendFlat}/></td><td><span className={`portfolio-profit ${valueClass(rowProfit)}`}><strong>{fmtPlatDelta(rowProfit)}</strong><small>{fmtPercent(rowReturn)}</small></span></td><td className="updated-cell">{formatDate(row?.hourlyFetchedAt || item?.updatedDate, locale)}</td><td><button type="button" className="portfolio-remove" onClick={() => onRemove(purchase.id)} title={text.remove} aria-label={`${text.remove}: ${name}`}>×</button></td>
          </tr>
        })}
      </tbody></table></div></section>}
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
  const [sort, setSort] = useState<ScannerSort>('updatedDate')
  const [direction, setDirection] = useState<SortDirection>('desc')
  const [pageSize, setPageSize] = useState<PageSize>(loadPageSize)
  const [page, setPage] = useState(1)
  const [scannerData, setScannerData] = useState<Awaited<ReturnType<typeof fetchScanner>> | null>(null)
  const [scannerLoading, setScannerLoading] = useState(true)
  const [scannerError, setScannerError] = useState<string | null>(null)
  const [scannerReload, setScannerReload] = useState(0)
  const [hourlyIndexData, setHourlyIndexData] = useState<HourlyIndexResponse | null>(null)
  const [hourlyIndexLoading, setHourlyIndexLoading] = useState(false)
  const [hourlyIndexError, setHourlyIndexError] = useState<string | null>(null)
  const [portfolioMarketRows, setPortfolioMarketRows] = useState<HourlyIndexRow[]>([])
  const [portfolioLoading, setPortfolioLoading] = useState(false)
  const [portfolioError, setPortfolioError] = useState<string | null>(null)
  const [portfolioReload, setPortfolioReload] = useState(0)
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
  const [temporaryAccount, setTemporaryAccount] = useState<TemporaryAccount | null>(loadTemporaryAccount)
  const auth = useFrameAccount()
  const [marketEvents, setMarketEvents] = useState<MarketEvent[]>([])
  const popoverRef = useRef<HTMLElement | null>(null)
  const hourlyCheckedAt = useRef<Record<string, number>>({})
  const t: T = key => translations[locale][key]
  const u = uiText[locale]
  const x = getExtraText(locale)
  const p = paginationText[locale]
  const catalogItem = (id: string) => catalog.get(id)
  const itemName = (item: { id: string; name: string }) => catalogItem(item.id)?.name || item.name
  const hourlySortActive = supportsHourly(platform, crossplay) && (HOURLY_INDEX_SORTS.has(sort) || rankFilter === 'all')
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
  useEffect(() => { saveTemporaryAccount(temporaryAccount) }, [temporaryAccount])
  useEffect(() => {
    const userId = auth.account?.user.id
    if (!userId) return
    let cancelled = false
    const run = async () => {
      try {
        const marker = `frameanalytics-account-migrated:${userId}`
        const localPurchases = temporaryAccount?.purchases || []
        if (localStorage.getItem(marker) !== '1' && localPurchases.length) {
          await auth.upsertPurchases(localPurchases)
        }
        const serverPurchases = await auth.loadPurchases()
        if (cancelled) return
        setTemporaryAccount(current => ({
          ...(current || createTemporaryAccount()),
          purchases: serverPurchases
        }))
        localStorage.setItem(marker, '1')
      } catch (error) {
        console.error('FrameAnalytics account purchase sync failed', error)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [auth.account?.user.id])
  useEffect(() => {
    const controller = new AbortController()
    fetchCatalog(locale, controller.signal).then(response => setCatalog(new Map(response.items.map(item => [item.id, item])))).catch(() => setCatalog(new Map()))
    return () => controller.abort()
  }, [locale])
  useEffect(() => {
    const controller = new AbortController()
    fetchEvents(controller.signal).then(response => setMarketEvents(response.events)).catch(() => setMarketEvents([]))
    return () => controller.abort()
  }, [hourlyRefresh])
  useEffect(() => {
    if (route.kind !== 'portfolio' || !temporaryAccount?.purchases.length) {
      setPortfolioMarketRows([])
      setPortfolioLoading(false)
      setPortfolioError(null)
      return
    }
    const controller = new AbortController()
    const ids = [...new Set(temporaryAccount.purchases.map(purchase => purchase.itemId))]
    const batches: string[][] = []
    for (let index = 0; index < ids.length; index += 100) batches.push(ids.slice(index, index + 100))
    setPortfolioLoading(true)
    setPortfolioError(null)
    const marketRequests = supportsHourly(platform, crossplay)
      ? batches.map(batch => fetchHourlyIndex({
        platform, crossplay, rank: 'all', period, mode, ids: batch,
        offset: 0, limit: 200, sort: 'name', direction: 'asc', language: locale
      }, controller.signal).then(data => {
        if (data.groupedByItem) throw new Error('Profile requires independent market rows')
        return data.items
      }))
      : batches.map(batch => fetchScanner({
        platform, crossplay, period, mode, ids: batch,
        offset: 0, limit: 200, sort: 'name', direction: 'asc', language: locale
      }, controller.signal).then(data => data.items.map(hourlyIndexRowFromScanner)))
    Promise.all([
      Promise.all(marketRequests),
      Promise.allSettled(ids.map(id => fetchMetrics(platform, id, controller.signal)))
    ]).then(([marketBatches, metricResults]) => {
      if (controller.signal.aborted) return
      setPortfolioMarketRows(marketBatches.flat())
      const metrics: Record<string, MetricsItem> = {}
      metricResults.forEach((result, index) => {
        if (result.status === 'fulfilled') metrics[`${platform}:${ids[index]}`] = result.value.item
      })
      setRangeMetrics(current => ({ ...current, ...metrics }))
      setPortfolioLoading(false)
    }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setPortfolioError(error instanceof Error ? error.message : String(error))
      setPortfolioLoading(false)
    })
    return () => controller.abort()
  }, [route.kind, temporaryAccount, platform, crossplay, period, mode, locale, portfolioReload])
  useEffect(() => {
    setPage(1)
  }, [query, minPrice, minPotential, mode, platform, crossplay, period, categories, rankFilter, sort, direction, pageSize])
  useEffect(() => {
    if (hourlySortActive) { setScannerLoading(false); return }
    const controller = new AbortController()
    setScannerLoading(true); setScannerError(null)
    fetchScanner({
      platform, period, mode, crossplay, search: query,
      categories: categories.length === CATEGORY_IDS.length ? undefined : categories,
      minPrice, minPotential, offset: (page - 1) * pageSize, limit: pageSize, sort, direction, language: locale
    }, controller.signal).then(data => { setScannerData(data); setScannerLoading(false) }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setScannerError(error instanceof Error ? error.message : String(error)); setScannerLoading(false)
    })
    return () => controller.abort()
  }, [platform, period, mode, crossplay, query, categories, minPrice, minPotential, page, pageSize, sort, direction, locale, scannerReload, hourlySortActive])
  useEffect(() => {
    if (!hourlySortActive) { setHourlyIndexLoading(false); setHourlyIndexError(null); return }
    const controller = new AbortController()
    setHourlyIndexLoading(true); setHourlyIndexError(null)
    fetchHourlyIndex({
      platform, crossplay, rank: rankFilter, period, mode, search: query,
      categories: categories.length === CATEGORY_IDS.length ? undefined : categories,
      minPrice, minPotential, offset: (page - 1) * pageSize, limit: pageSize,
      sort, direction,
      language: locale
    }, controller.signal).then(data => {
      if (data.groupedByItem) throw new Error('Hourly Index requires independent market-row mode')
      setHourlyIndexData(data); setHourlyIndexLoading(false)
    }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setHourlyIndexError(error instanceof Error ? error.message : String(error)); setHourlyIndexLoading(false)
    })
    return () => controller.abort()
  }, [hourlySortActive, platform, crossplay, rankFilter, period, mode, query, categories, minPrice, minPotential, page, pageSize, sort, direction, locale, scannerReload, hourlyRefresh])
  const selectedSummary = useMemo(() => {
    if (route.kind !== 'item') return null
    const dailyRows = hourlySortActive ? (hourlyIndexData?.items || []).map(item => item.daily).filter((item): item is ScannerItem => Boolean(item)) : scannerData?.items || []
    return dailyRows.find(item => item.id === route.id && (route.variant ? item.variantKey === route.variant : true)) || null
  }, [route, scannerData, hourlyIndexData, hourlySortActive])
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
    if (hourlySortActive || !scannerData?.items.length || !supportsHourly(platform, crossplay)) { setHourlyLoading(false); setHourlyPartial(false); return }
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
  }, [scannerData, platform, crossplay, hourlyRefresh, hourlySortActive])
  useEffect(() => {
    const needsSupplement = visibleRanges.some(range => ['30d', '90d', '180d'].includes(range) && range !== periodRange(period))
    const sourceIds = hourlySortActive ? (hourlyIndexData?.items || []).map(item => item.itemId) : (scannerData?.items || []).map(item => item.id)
    if (!needsSupplement || !sourceIds.length) { setRangesLoading(false); return }
    const ids = [...new Set(sourceIds)]
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
  }, [visibleRanges, period, scannerData, hourlyIndexData, hourlySortActive, platform, rangeMetrics])
  const activeTotal = hourlySortActive ? hourlyIndexData?.filteredItems || 0 : scannerData?.filteredItems || 0
  const activeOffset = hourlySortActive ? hourlyIndexData?.offset || 0 : scannerData?.offset || 0
  const activeReturned = hourlySortActive ? hourlyIndexData?.returned || 0 : scannerData?.returned || 0
  const activeLoading = hourlySortActive ? hourlyIndexLoading : scannerLoading
  const activeError = hourlySortActive ? hourlyIndexError : scannerError
  const pageCount = Math.max(1, Math.ceil(activeTotal / pageSize))
  useEffect(() => { if (page > pageCount) setPage(pageCount) }, [page, pageCount])
  const showingStart = activeTotal ? activeOffset + 1 : 0
  const showingEnd = activeTotal ? activeOffset + activeReturned : 0
  const getMetricSeries = (item: ScannerItem): MetricSeries | null => {
    const metrics = rangeMetrics[`${platform}:${item.id}`]
    return metrics ? (item.variantKey ? metrics.variants[item.variantKey] || null : metrics) : null
  }
  const displayRows = useMemo<DisplayMarketRow[]>(() => hourlySortActive ? (hourlyIndexData?.items || []).map((indexRow): DisplayMarketRow => {
    const item = indexRow.daily || scannerFallbackFromIndex(indexRow, period)
    return {
      rowId: indexRow.rowId,
      item,
      marketKey: indexRow.marketKey,
      selectedModRank: indexRow.selectedModRank,
      canonical: Boolean(indexRow.daily),
      hourly: indexRow.hasHourlyHistory ? hourlySeriesFromIndex(indexRow) : null,
      hourlyFetchedAt: indexRow.fetchedAt
    }
  }) : (scannerData?.items || []).flatMap((item): DisplayMarketRow[] => {
    const hourly = hourlyRows[hourlyKey(platform, crossplay, item.id)]
    if (item.selectedModRank == null) {
      return [{ rowId: item.rowId, item, marketKey: item.marketKey, selectedModRank: null, canonical: true, hourly: findHourlySeries(hourly, item.marketKey), hourlyFetchedAt: hourly?.fetchedAt || null }]
    }
    if (!supportsHourly(platform, crossplay)) {
      return [{ rowId: item.rowId, item, marketKey: item.marketKey, selectedModRank: item.selectedModRank, canonical: true, hourly: null, hourlyFetchedAt: null }]
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
  }), [hourlySortActive, hourlyIndexData, period, scannerData, hourlyRows, platform, crossplay, rankFilter])
  const portfolioEntries = useMemo<PortfolioMarketEntry[]>(() => (temporaryAccount?.purchases || []).map(purchase => {
    const candidates = portfolioMarketRows.filter(row => row.itemId === purchase.itemId)
    const market = candidates.find(row => row.marketKey === purchase.marketKey)
      || (purchase.selectedModRank != null ? candidates.find(row => row.selectedModRank === purchase.selectedModRank || row.dimensions?.mod_rank === purchase.selectedModRank) : null)
      || (candidates.length === 1 ? candidates[0] : null)
      || null
    if (!market) return { purchase, row: null }
    const item = market.daily || scannerFallbackFromIndex(market, period)
    return {
      purchase,
      row: {
        rowId: `${purchase.id}::${market.rowId}`,
        item,
        marketKey: market.marketKey,
        selectedModRank: market.selectedModRank,
        canonical: Boolean(market.daily),
        hourly: market.hasHourlyHistory ? hourlySeriesFromIndex(market) : null,
        hourlyFetchedAt: market.fetchedAt
      }
    }
  }), [temporaryAccount, portfolioMarketRows, period])
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
  const currentEventFor = (itemId: string) => marketEvents.find(event => event.itemId === itemId && (event.status === 'active' || event.status === 'upcoming')) || null
  const changeSort = (next: ScannerSort, range?: TimeRange) => {
    if (range && !HOURLY_RANGES.has(range)) setPeriod(Number(range.replace('d', '')) as AnalysisPeriod)
    if (sort === next) setDirection(value => value === 'asc' ? 'desc' : 'asc')
    else { setSort(next); setDirection(next === 'name' ? 'asc' : 'desc') }
  }
  const indicator = (key: ScannerSort) => sort === key ? (direction === 'asc' ? '↑' : '↓') : ''
  const rangeSort = (range: TimeRange): ScannerSort | null => range === '1h' ? supportsHourly(platform, crossplay) ? 'change1h' : null : range === '4h' ? supportsHourly(platform, crossplay) ? 'change4h' : null : range === '12h' ? supportsHourly(platform, crossplay) ? 'change12h' : null : range === '24h' ? 'change24h' : range === '7d' ? 'change7d' : 'changePeriod'
  const toggleCategory = (id: CategoryId) => setCategories(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])
  const toggleRange = (range: TimeRange) => setVisibleRanges(current => current.includes(range) ? current.filter(value => value !== range) : TIME_RANGES.filter(value => current.includes(value) || value === range))
  const itemHref = (row: DisplayMarketRow) => {
    const item = row.item
    const params = new URLSearchParams({ platform, period: String(period), crossplay: String(crossplay), id: item.id })
    if (item.variantKey) params.set('variant', item.variantKey)
    if (row.selectedModRank != null) params.set('rank', String(row.selectedModRank))
    return `/items/${encodeURIComponent(item.slug)}?${params}`
  }
  const openItem = (row: DisplayMarketRow) => { history.pushState({ frameanalyticsFromScanner: true }, '', itemHref(row)); setRoute(readRoute()); setOpenPanel(null); scrollTo({ top: 0 }) }
  const closeItem = () => { if (history.state?.frameanalyticsFromScanner || history.state?.frameanalyticsFromPortfolio) history.back(); else { history.replaceState(null, '', '/'); setRoute(readRoute()) }; scrollTo({ top: 0 }) }
  const openPortfolio = () => {
    if (route.kind === 'portfolio') return
    const params = new URLSearchParams({ platform, period: String(period), crossplay: String(crossplay) })
    history.pushState({ frameanalyticsPortfolioFrom: route.kind }, '', `/profile?${params}`)
    setRoute(readRoute())
    setOpenPanel(null)
    scrollTo({ top: 0 })
  }
  const closePortfolio = () => {
    if (history.state?.frameanalyticsPortfolioFrom) history.back()
    else { history.replaceState(null, '', '/'); setRoute(readRoute()) }
    scrollTo({ top: 0 })
  }
  const openPortfolioItem = (purchase: PortfolioPurchase) => {
    const params = new URLSearchParams({ platform, period: String(period), crossplay: String(crossplay), id: purchase.itemId })
    if (purchase.marketKey.includes('=') && !purchase.marketKey.startsWith('mod_rank=')) params.set('variant', purchase.marketKey)
    if (purchase.selectedModRank != null) params.set('rank', String(purchase.selectedModRank))
    history.pushState({ frameanalyticsFromPortfolio: true }, '', `/items/${encodeURIComponent(purchase.slug)}?${params}`)
    setRoute(readRoute())
    scrollTo({ top: 0 })
  }
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
  const addPurchase = (purchase: Omit<PortfolioPurchase, 'id' | 'createdAt'>) => {
    const savedPurchase: PortfolioPurchase = { ...purchase, id: crypto.randomUUID(), createdAt: new Date().toISOString() }
    setTemporaryAccount(current => {
      const account = current || createTemporaryAccount()
      return { ...account, purchases: [...account.purchases, savedPurchase] }
    })
    if (auth.account) void auth.upsertPurchases([savedPurchase]).catch(error => console.error('Purchase sync failed', error))
  }
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    params.set('platform', platform); params.set('period', String(period)); params.set('crossplay', String(crossplay))
    if (route.kind === 'item' && route.id) params.set('id', route.id)
    if (route.kind === 'item' && route.variant) params.set('variant', route.variant)
    if (route.kind === 'item' && route.rank != null) params.set('rank', String(route.rank))
    const path = route.kind === 'item' && route.slug ? `/items/${encodeURIComponent(route.slug)}` : route.kind === 'portfolio' ? '/profile' : '/'
    history.replaceState(history.state, '', `${path}?${params}`)
  }, [platform, period, crossplay, route.kind, route.slug, route.id, route.variant, route.rank])
  return <>
    <div className="background-layer"/><div className="background-shade"/>
    {route.kind === 'item' ? <Detail detail={detail} metrics={detailMetrics} hourly={detailHourly} summary={selectedSummary} catalogItem={route.id ? catalogItem(route.id) : undefined} events={route.id ? marketEvents.filter(event => event.itemId === route.id) : []} variantKey={route.variant} selectedRank={route.rank} platform={platform} crossplay={crossplay} period={period} visibleRanges={visibleRanges} mode={mode} locale={locale} loading={detailLoading} hourlyLoading={hourlyLoading} error={detailError} hasAccount={Boolean(auth.account)} onBack={closeItem} onRetry={() => setDetailReload(value => value + 1)} onVariant={changeVariant} onRank={changeRank} onPlatform={next => { setPlatform(next); if (next === 'switch') setCrossplay(false) }} onCrossplay={() => platform !== 'switch' && setCrossplay(value => !value)} onOpenAccount={openPortfolio} onAddPurchase={addPurchase} t={t}/> : route.kind === 'portfolio' ? <PortfolioPage account={temporaryAccount} auth={auth} entries={portfolioEntries} loading={portfolioLoading} error={portfolioError} platform={platform} crossplay={crossplay} mode={mode} visibleRanges={visibleRanges} locale={locale} catalog={catalog} events={marketEvents} onBack={closePortfolio} onRetry={() => setPortfolioReload(value => value + 1)} onRemove={id => { setTemporaryAccount(current => current ? { ...current, purchases: current.purchases.filter(item => item.id !== id) } : null); if (auth.account) void auth.deletePurchase(id).catch(error => console.error('Purchase delete sync failed', error)) }} onOpenItem={openPortfolioItem} onPlatform={next => { setPlatform(next); if (next === 'switch') setCrossplay(false) }} onCrossplay={() => platform !== 'switch' && setCrossplay(value => !value)} onMode={setMode} currentPriceFor={rowCurrentPrice} rangeValueFor={rowRangeValue} rangePlatinumFor={rowRangePlatinum} t={t}/> : <main className="app-shell">
      <header className="topbar"><div><a className="brand-plate" href="/" aria-label="FrameAnalytics — home"><img src="/assets/frameanalytics-logo.png" alt="FrameAnalytics"/></a><p className="subtitle">{t('subtitle')}</p></div><div className="topbar-actions"><MarketSelector platform={platform} crossplay={crossplay} locale={locale} onPlatform={next => { setPlatform(next); if (next === 'switch') setCrossplay(false) }} onCrossplay={() => platform !== 'switch' && setCrossplay(value => !value)}/><AccountButton locale={locale} active={Boolean(auth.account)} onClick={openPortfolio}/></div></header>
      <section className="mode-tabs"><button className={mode === 'buy' ? 'mode-tab active buy' : 'mode-tab'} onClick={() => setMode('buy')}>{t('buy')}</button><button className={mode === 'sell' ? 'mode-tab active sell' : 'mode-tab'} onClick={() => setMode('sell')}>{t('sell')}</button></section>
      <section className="panel filters filters-v3" ref={popoverRef}>
        <label className="search-field"><span>{t('name')}</span><input value={queryInput} onChange={event => setQueryInput(event.target.value)} placeholder={t('searchPlaceholder')}/></label>
        <label><span>{t('minPrice')}</span><div className="input-suffix"><input type="number" min="0" value={minPrice} onChange={event => setMinPrice(Math.max(0, Number(event.target.value)))}/><b>p</b></div></label>
        <label><span>{t('potentialFrom')}</span><div className="input-suffix"><input type="number" min="0" value={minPotential} onChange={event => setMinPotential(Math.max(0, Number(event.target.value)))}/><b>p</b></div></label>
        <label><span>{x.rankFilter}</span><select value={rankFilter} onChange={event => setRankFilter(event.target.value as RankFilter)}><option value="base">{x.rankBase}</option><option value="all">{x.rankAll}</option></select></label>
        <div className="filter-field category-filter"><span>{u.categories}</span><button className="control-button" onClick={() => setOpenPanel(value => value === 'categories' ? null : 'categories')}>{u.categories}<b>{categories.length}/{CATEGORY_IDS.length}</b><i>⌄</i></button>{openPanel === 'categories' ? <div className="category-panel"><div className="category-actions"><button onClick={() => setCategories([...CATEGORY_IDS])}>{u.selectAll}</button><button onClick={() => setCategories([])}>{u.clear}</button></div><div className="category-list">{CATEGORY_IDS.map(id => <label className="category-option" key={id}><input type="checkbox" checked={categories.includes(id)} onChange={() => toggleCategory(id)}/><span>{categoryLabel(id, locale, u, x.prime)}</span></label>)}</div></div> : null}</div>
        <div className="filter-field ranges-filter"><span>{x.shownRanges}</span><button className="control-button" onClick={() => setOpenPanel(value => value === 'ranges' ? null : 'ranges')}>{x.chooseRanges}<b>{visibleRanges.length}/{TIME_RANGES.length}</b><i>⌄</i></button>{openPanel === 'ranges' ? <div className="category-panel ranges-panel"><div className="category-actions"><button onClick={() => setVisibleRanges([...TIME_RANGES])}>{x.allRanges}</button><button onClick={() => setVisibleRanges(DEFAULT_RANGES)}>{u.defaults}</button></div><div className="range-options">{TIME_RANGES.map(range => <label className="range-option" key={range}><input type="checkbox" checked={visibleRanges.includes(range)} onChange={() => toggleRange(range)}/><span>{rangeLabel(range, x)}</span></label>)}</div></div> : null}</div>
      </section>
      <section className="results-row results-toolbar"><div className="results-count"><span>{t('found')}</span><strong>{activeTotal}</strong>{scannerData || hourlyIndexData ? <em>{(hourlySortActive ? hourlyIndexData?.catalogTotal : scannerData?.catalogTotal) ?? 3837} {x.catalogSummary} · {(hourlySortActive ? hourlyIndexData?.marketSeries : scannerData?.marketSeries ?? scannerData?.totalItems) ?? 0} {x.seriesSummary}</em> : null}</div><div className="range-load-state">{hourlyIndexLoading ? x.loadingHourly : hourlyLoading ? x.loadingHourly : hourlyPartial ? x.hourlyPartial : rangesLoading ? x.loadingRanges : rangesError ? x.rangesError : ''}</div><div className="page-size-control"><span>{p.perPage}</span><select value={pageSize} onChange={event => setPageSize(Number(event.target.value) as PageSize)}>{PAGE_SIZES.map(value => <option key={value} value={value}>{value}</option>)}</select></div><div className="page-indicator">{p.page} <strong>{page}</strong> {p.of} <strong>{pageCount}</strong></div></section>
      <section className="panel table-panel"><div className="table-scroll"><table className="market-table"><thead><tr>
        <th><button className="sort-button" onClick={() => changeSort('name')}><span>{t('item')}</span><span className="sort-indicator">{indicator('name')}</span></button></th>
        <th><button className="sort-button" onClick={() => changeSort('currentPrice')}><span>{t('current')}</span><span className="sort-indicator">{indicator('currentPrice')}</span></button></th>
        {visibleRanges.map(range => { const key = rangeSort(range); return <th key={range} className={HOURLY_RANGES.has(range) ? 'hourly-column' : ''}><button className="sort-button" disabled={!key} title={HOURLY_RANGES.has(range) ? key ? x.hourlyLive : x.hourlyUnavailable : undefined} onClick={() => key && changeSort(key, range)}><span>{rangeLabel(range, x)}</span><span className="sort-indicator">{key && (HOURLY_RANGES.has(range) || range === periodRange(period) || range === '7d') ? indicator(key) : ''}</span></button></th> })}
        <th><button className="sort-button" disabled={rankFilter === 'base'} onClick={() => changeSort('sales24h')}><span>{t('sales24h')}</span><span className="sort-indicator">{indicator('sales24h')}</span></button></th>
        <th><button className="sort-button" disabled={rankFilter === 'base'} onClick={() => changeSort('potential')}><span>{t('potential')}</span><span className="sort-indicator">{indicator('potential')}</span></button></th>
        <th><button className="sort-button" disabled={rankFilter === 'base'} onClick={() => changeSort('score')}><span>{t('score')}</span><span className="sort-indicator">{indicator('score')}</span></button></th>
        <th title={x.forecastHint}><button className="sort-button" disabled={rankFilter === 'base'} onClick={() => changeSort('decision')}><span>{x.forecast}</span><span className="sort-indicator">{indicator('decision')}</span></button></th>
        <th><button className="sort-button" disabled={rankFilter === 'base'} onClick={() => changeSort('updatedDate')}><span>{t('updated')}</span><span className="sort-indicator">{indicator('updatedDate')}</span></button></th>
      </tr></thead><tbody>
        {activeLoading ? <tr><td colSpan={7 + visibleRanges.length} className="state-cell"><div className="spinner"/><strong>{u.loading}</strong></td></tr> : activeError ? <tr><td colSpan={7 + visibleRanges.length} className="state-cell error-state"><strong>{u.loadError}</strong><button className="retry-button" onClick={() => setScannerReload(value => value + 1)}>{u.retry}</button></td></tr> : !displayRows.length ? <tr><td colSpan={7 + visibleRanges.length} className="state-cell"><strong>{u.noData}</strong></td></tr> : displayRows.map(row => {
          const item = row.item
          const signal = row.canonical ? item[mode] : emptySignal()
          const href = itemHref(row)
          const variant = formatDimensions(item.dimensions, locale)
          return <tr key={row.rowId} className={!row.canonical ? 'hourly-only-row' : !item.hasHistory ? 'no-history-row' : ''}>
            <td><a className="item-link item-link-v3" href={href} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); openItem(row) }}><ItemIcon item={catalogItem(item.id)} name={itemName(item)}/><span><span className="item-name" title={itemName(item)}><span className="item-name-text">{itemName(item)}</span>{currentEventFor(item.id) ? <MarketEventBadge event={currentEventFor(item.id)!} locale={locale} compact/> : null}</span><span className="item-category" title={`${categoryLabel(item.category, locale, u, x.prime)}${variant ? ` · ${variant}` : ''}${row.selectedModRank != null ? ` · ${x.rank} ${row.selectedModRank}` : ''}`}>{categoryLabel(item.category, locale, u, x.prime)}{variant ? ` · ${variant}` : ''}{row.selectedModRank != null ? ` · ${x.rank} ${row.selectedModRank}` : ''}{row.canonical && !item.hasHistory ? ` · ${x.noHistory}` : ''}</span></span></a></td>
            <td className="price-cell">{fmtPlat(rowCurrentPrice(row))}</td>
            {visibleRanges.map(range => { const live = row.hourly; return <td key={range} className={`${valueClass(rowRangeValue(row, range))} ${HOURLY_RANGES.has(range) ? live ? 'hourly-column hourly-live' : 'hourly-column hourly-missing' : ''}`} title={HOURLY_RANGES.has(range) ? live ? `${x.hourlyLive} · ${formatDate(row.hourlyFetchedAt, locale)}` : x.hourlyUnavailable : !row.canonical ? x.hourlyOnlyRank : undefined}><span className="change-cell-values"><strong>{fmtPercent(rowRangeValue(row, range))}</strong><small>{fmtPlatDelta(rowRangePlatinum(row, range))}</small></span></td> })}
            <td>{row.canonical ? item.sales24h ?? '—' : '—'}</td><td><span className={signal.potential != null && signal.potential > 0 ? 'potential-badge' : 'potential-badge muted'}>{signal.potential != null && signal.potential > 0 ? <><strong>+{fmtPlat(signal.potential)}</strong>{signal.potentialPct != null ? <small>{fmtPlainPercent(signal.potentialPct)}</small> : null}</> : '—'}</span></td><td><span className={`score-badge ${signal.score != null && signal.score >= 80 ? 'high' : signal.score != null && signal.score >= 60 ? 'mid' : 'low'}`}>{signal.score == null ? '—' : fmtNumber(signal.score)}</span></td><td><ForecastIndicator signal={signal} fallbackChange={row.canonical ? item.change7d : null} direction={currentEventFor(item.id) ? 'down' : rowTrendDirection(row)} title={t(decisionKey(signal.decision))} trendUp={x.trendUp} trendDown={x.trendDown} trendFlat={x.trendFlat}/></td><td className="updated-cell">{formatDate(row.hourlyFetchedAt || (row.canonical ? item.updatedDate : null), locale)}</td>
          </tr>
        })}
      </tbody></table></div></section>
      {!activeLoading && !activeError && activeTotal > 0 ? <nav className="pagination-bar" aria-label="Pagination"><div className="pagination-range">{p.showing} <strong>{showingStart}–{showingEnd}</strong> {p.of} <strong>{activeTotal}</strong></div><div className="pagination-buttons"><button disabled={page <= 1} onClick={() => setPage(1)}>« {p.first}</button><button disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>‹ {p.previous}</button><span>{p.page} <strong>{page}</strong> {p.of} <strong>{pageCount}</strong></span><button disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>{p.next} ›</button><button disabled={page >= pageCount} onClick={() => setPage(pageCount)}>{p.last} »</button></div></nav> : null}
    </main>}
    <FooterBar locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} t={t}/>
  </>
}
