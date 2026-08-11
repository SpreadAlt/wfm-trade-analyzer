import { useEffect, useMemo, useState } from 'react'
import { fetchItem, fetchScanner } from './api'
import { localeNames, translations } from './i18n'
import type { Locale, Theme, TranslationKey } from './i18n'
import { uiText } from './uiText'
import { paginationText } from './paginationText'
import type { UiText } from './uiText'
import type { AnalysisPeriod, HistoryPoint, ItemDetail, Platform, ScannerItem, ScannerMode, ScannerResponse } from './types'

type SortKey = 'name' | 'current' | 'change1h' | 'change24h' | 'change7d' | 'sales24h' | 'potential' | 'score' | 'decision' | 'updated'
type SortDirection = 'asc' | 'desc'
type T = (key: TranslationKey) => string
type CategoryFilterId = 'prime_set' | 'prime_blueprint' | 'prime_part' | 'primed_mod' | 'rare_mod' | 'other_mod' | 'relic' | 'weapon' | 'cosmetic' | 'arcane' | 'resource' | 'archwing' | 'companion' | 'necramech' | 'equipment' | 'collectible' | 'ayatan' | 'utility' | 'misc' | 'syndicate'

type CategoryFilter = {
  id: CategoryFilterId
  label: keyof UiText
  defaultEnabled: boolean
  match: (item: ScannerItem) => boolean
}

const PLATFORM_NAMES: Record<Platform, string> = {
  pc: 'PC',
  ps4: 'PlayStation',
  xbox: 'Xbox',
  switch: 'Nintendo Switch'
}

const CATEGORY_FILTERS: CategoryFilter[] = [
  { id: 'prime_set', label: 'primeSets', defaultEnabled: true, match: item => item.subcategory === 'prime_set' },
  { id: 'prime_blueprint', label: 'primeBlueprints', defaultEnabled: true, match: item => item.subcategory === 'prime_blueprint' },
  { id: 'prime_part', label: 'primeParts', defaultEnabled: true, match: item => item.subcategory === 'prime_part' },
  { id: 'primed_mod', label: 'primedMods', defaultEnabled: true, match: item => item.subcategory === 'primed_mod' },
  { id: 'rare_mod', label: 'rareMods', defaultEnabled: true, match: item => item.subcategory === 'rare_mod' },
  { id: 'other_mod', label: 'otherMods', defaultEnabled: false, match: item => item.category === 'mod' && item.subcategory !== 'primed_mod' && item.subcategory !== 'rare_mod' },
  { id: 'relic', label: 'relics', defaultEnabled: false, match: item => item.category === 'relic' },
  { id: 'weapon', label: 'weapons', defaultEnabled: false, match: item => item.category === 'weapon' },
  { id: 'cosmetic', label: 'cosmetics', defaultEnabled: false, match: item => item.category === 'cosmetic' },
  { id: 'arcane', label: 'arcanes', defaultEnabled: false, match: item => item.category === 'arcane' },
  { id: 'resource', label: 'resources', defaultEnabled: false, match: item => item.category === 'resource' },
  { id: 'archwing', label: 'archwing', defaultEnabled: false, match: item => item.category === 'archwing' },
  { id: 'companion', label: 'companions', defaultEnabled: false, match: item => item.category === 'companion' },
  { id: 'necramech', label: 'necramechs', defaultEnabled: false, match: item => item.category === 'necramech' },
  { id: 'equipment', label: 'equipment', defaultEnabled: false, match: item => item.category === 'equipment' },
  { id: 'collectible', label: 'collectibles', defaultEnabled: false, match: item => item.category === 'collectible' },
  { id: 'ayatan', label: 'ayatan', defaultEnabled: false, match: item => item.category === 'ayatan' },
  { id: 'utility', label: 'utility', defaultEnabled: false, match: item => item.category === 'utility' },
  { id: 'misc', label: 'misc', defaultEnabled: false, match: item => item.category === 'misc' },
  { id: 'syndicate', label: 'syndicate', defaultEnabled: false, match: item => item.category === 'syndicate' }
]

const DEFAULT_CATEGORY_IDS = CATEGORY_FILTERS.filter(filter => filter.defaultEnabled).map(filter => filter.id)
const ALL_CATEGORY_IDS = CATEGORY_FILTERS.map(filter => filter.id)

const fmtNumber = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits).replace(/\.0$/, '')
const fmtPercent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
const fmtPlainPercent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}%`
const fmtPlat = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${fmtNumber(value)}p`
const valueClass = (value: number | null | undefined) => value == null || value === 0 ? 'neutral' : value > 0 ? 'positive' : 'negative'
const getPotential = (item: ScannerItem, mode: ScannerMode) => mode === 'buy' ? item.buyPotential : item.sellPotential
const getPotentialPct = (item: ScannerItem, mode: ScannerMode) => mode === 'buy' ? item.buyPotentialPct : item.sellPotentialPct
const getScore = (item: ScannerItem, mode: ScannerMode) => mode === 'buy' ? item.buyScore : item.sellScore
const getDecision = (item: ScannerItem, mode: ScannerMode) => mode === 'buy' ? item.buyDecision : item.sellDecision

const decisionClass = (decision: string) => {
  if (decision === 'BUY_STRONG') return 'decision buy-strong'
  if (decision === 'SELL_STRONG') return 'decision sell-strong'
  if (decision === 'BUY_PRICE_MAY_FALL' || decision === 'BUY_WATCH') return 'decision buy-watch'
  if (decision === 'SELL_PRICE_MAY_RISE' || decision === 'SELL_WATCH') return 'decision sell-watch'
  return 'decision low'
}

const decisionRank = (decision: string) => {
  if (decision === 'BUY_STRONG' || decision === 'SELL_STRONG') return 4
  if (decision === 'BUY_PRICE_MAY_FALL' || decision === 'SELL_PRICE_MAY_RISE') return 3
  if (decision === 'BUY_WATCH' || decision === 'SELL_WATCH') return 2
  return 1
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

const getItemName = (item: { name: string; names?: Record<string, string> }, locale: Locale) => item.names?.[locale] || item.name

const getCategoryFilter = (item: ScannerItem) => CATEGORY_FILTERS.find(filter => filter.match(item))
const getCategoryLabel = (item: ScannerItem, u: UiText) => {
  const filter = getCategoryFilter(item)
  return filter ? u[filter.label] : item.category
}

const intlLocale = (locale: Locale) => locale === 'zh-hans' ? 'zh-Hans' : locale === 'zh-hant' ? 'zh-Hant' : locale

const formatDate = (value: string | null | undefined, locale: Locale, short = false) => {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(intlLocale(locale), short ? { day: '2-digit', month: '2-digit', timeZone: 'UTC' } : { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date)
}

const updatedRank = (value: string | null | undefined) => value ? Date.parse(`${value}T00:00:00Z`) || 0 : 0
const periodLabel = (period: AnalysisPeriod, t: T, u: UiText) => period === 7 ? t('range7d') : period === 30 ? u.range30d : u.range90d

const loadSavedCategories = (): CategoryFilterId[] => {
  try {
    const raw = localStorage.getItem('frameanalytics-categories')
    if (!raw) return DEFAULT_CATEGORY_IDS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return DEFAULT_CATEGORY_IDS
    const valid = parsed.filter((value): value is CategoryFilterId => ALL_CATEGORY_IDS.includes(value as CategoryFilterId))
    return valid.length || parsed.length === 0 ? valid : DEFAULT_CATEGORY_IDS
  } catch {
    return DEFAULT_CATEGORY_IDS
  }
}

const buildLinePath = (history: HistoryPoint[], key: 'min' | 'median' | 'max', px: (index: number) => number, py: (value: number) => number) => {
  let path = ''
  let drawing = false
  history.forEach((point, index) => {
    const value = point[key]
    if (value == null || !Number.isFinite(value)) {
      drawing = false
      return
    }
    path += `${drawing ? ' L' : ' M'} ${px(index).toFixed(1)} ${py(value).toFixed(1)}`
    drawing = true
  })
  return path.trim()
}

const Chart = ({ history, latestDate, range, locale, t, u }: { history: HistoryPoint[]; latestDate: string; range: AnalysisPeriod; locale: Locale; t: T; u: UiText }) => {
  const cutoff = useMemo(() => {
    const latest = new Date(`${latestDate}T00:00:00Z`)
    latest.setUTCDate(latest.getUTCDate() - (range - 1))
    return latest.getTime()
  }, [latestDate, range])

  const visible = useMemo(() => history.filter(point => Date.parse(`${point.date}T00:00:00Z`) >= cutoff), [history, cutoff])

  if (!visible.length) return <div className="empty-state chart-empty">{u.noData}</div>

  const width = 1000
  const height = 430
  const pad = { left: 58, right: 62, top: 24, bottom: 52 }
  const priceValues = visible.flatMap(point => [point.min, point.median, point.max]).filter((value): value is number => value != null && Number.isFinite(value))

  if (!priceValues.length) return <div className="empty-state chart-empty">{u.noData}</div>

  const rawMin = Math.min(...priceValues)
  const rawMax = Math.max(...priceValues)
  const pricePad = Math.max(1, (rawMax - rawMin) * 0.05)
  const priceMin = Math.max(0, Math.floor(rawMin - pricePad))
  const priceMax = Math.max(priceMin + 1, Math.ceil(rawMax + pricePad))
  const volumeMax = Math.max(1, ...visible.map(point => point.sales || 0))
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const volumeBand = innerH * 0.28
  const px = (index: number) => pad.left + (index / Math.max(1, visible.length - 1)) * innerW
  const py = (value: number) => pad.top + (1 - (value - priceMin) / Math.max(1, priceMax - priceMin)) * innerH
  const line = (key: 'min' | 'median' | 'max') => buildLinePath(visible, key, px, py)
  const xIndexes = Array.from(new Set([0, Math.round((visible.length - 1) * .25), Math.round((visible.length - 1) * .5), Math.round((visible.length - 1) * .75), visible.length - 1]))

  return <div className="chart-shell">
    <svg viewBox={`0 0 ${width} ${height}`} className="price-chart" role="img" aria-label={u.priceHistory}>
      {[0, .25, .5, .75, 1].map(ratio => {
        const y = pad.top + ratio * innerH
        const value = priceMax - ratio * (priceMax - priceMin)
        return <g key={ratio}><line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="grid-line"/><text x="8" y={y + 4} className="axis-label">{fmtNumber(value, 0)}</text></g>
      })}
      {visible.map((point, index) => {
        const barW = Math.max(2, innerW / Math.max(1, visible.length) - 3)
        const barH = (point.sales / volumeMax) * volumeBand
        return <rect key={`${point.date}-${index}`} x={px(index) - barW / 2} y={height - pad.bottom - barH} width={barW} height={barH} rx="2" className="volume-bar"><title>{`${formatDate(point.date, locale)} · ${t('sales')}: ${point.sales}`}</title></rect>
      })}
      <path d={line('min')} className="line min-line"/>
      <path d={line('median')} className="line median-line"/>
      <path d={line('max')} className="line max-line"/>
      {[0, .5, 1].map(ratio => {
        const y = height - pad.bottom - ratio * volumeBand
        const value = Math.round(volumeMax * ratio)
        return <text key={ratio} x={width - pad.right + 8} y={y + 4} className="axis-label sales-axis">{value}</text>
      })}
      {xIndexes.map(index => <text key={index} x={px(index)} y={height - 17} textAnchor="middle" className="axis-label">{formatDate(visible[index]?.date, locale, true)}</text>)}
    </svg>
    <div className="legend"><span><i className="legend-dot min-dot"/>{t('min')}</span><span><i className="legend-dot median-dot"/>{t('median')}</span><span><i className="legend-dot max-dot"/>{t('max')}</span><span><i className="legend-dot volume-dot"/>{t('sales')}</span></div>
  </div>
}

const FooterBar = ({ locale, setLocale, theme, setTheme, t }: { locale: Locale; setLocale: (value: Locale) => void; theme: Theme; setTheme: (value: Theme) => void; t: T }) => <footer className="footer-bar">
  <div className="footer-brand"><img src="/assets/frameanalytics-logo.png" alt="FrameAnalytics"/></div>
  <div className="footer-control"><span>{t('language')}</span><select value={locale} onChange={(event: { target: { value: string } }) => setLocale(event.target.value as Locale)}>{Object.entries(localeNames).map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select></div>
  <div className="footer-control"><span>{t('theme')}</span><select value={theme} onChange={(event: { target: { value: string } }) => setTheme(event.target.value as Theme)}><option value="system">{t('themeSystem')}</option><option value="light">{t('themeLight')}</option><option value="dark">{t('themeDark')}</option></select></div>
  <a className="footer-market-link" href="https://warframe.market/" target="_blank" rel="noreferrer">{t('sourceMarket')}</a>
  <div className="footer-version">{t('version')} 0.5.4</div>
  <div className="footer-disclaimer">{t('disclaimer')}</div>
</footer>


const Detail = ({ summary, detail, platform, period, loading, error, onBack, onRetry, locale, mode, t, u }: { summary: ScannerItem; detail: ItemDetail | null; platform: Platform; period: AnalysisPeriod; loading: boolean; error: string | null; onBack: () => void; onRetry: () => void; locale: Locale; mode: ScannerMode; t: T; u: UiText }) => {
  const [chartRange, setChartRange] = useState<AnalysisPeriod>(period)
  const analytics = detail?.analytics ?? null
  const potential = mode === 'buy' ? analytics?.buy.potential ?? getPotential(summary, mode) : analytics?.sell.potential ?? getPotential(summary, mode)
  const potentialPct = mode === 'buy' ? analytics?.buy.potentialPct ?? getPotentialPct(summary, mode) : analytics?.sell.potentialPct ?? getPotentialPct(summary, mode)
  const score = mode === 'buy' ? analytics?.buy.score ?? getScore(summary, mode) : analytics?.sell.score ?? getScore(summary, mode)
  const rawDecision = mode === 'buy' ? analytics?.buy.decision ?? getDecision(summary, mode) : analytics?.sell.decision ?? getDecision(summary, mode)
  const displayName = getItemName(detail ?? summary, locale)

  return <main className="app-shell detail-shell">
    <button className="back-button" onClick={onBack}>{t('back')}</button>
    <section className="detail-header">
      <div><div className="eyebrow">{getCategoryLabel(summary, u)} · {PLATFORM_NAMES[platform]} · {periodLabel(period, t, u)}</div><h1>{displayName}</h1><div className="price-big">{fmtPlat(summary.currentPrice)}</div></div>
      <div className="updated-card"><span>{t('updated')}</span><strong>{formatDate(summary.updatedDate, locale)}</strong></div>
    </section>
    <section className="metric-grid">
      <div className="metric-card"><span>{t('change1h')}</span><strong className="neutral">—</strong></div>
      <div className="metric-card"><span>{t('change24h')}</span><strong className={valueClass(summary.change24h)}>{fmtPercent(summary.change24h)}</strong></div>
      <div className="metric-card"><span>{t('change7d')}</span><strong className={valueClass(summary.change7d)}>{fmtPercent(summary.change7d)}</strong></div>
      <div className="metric-card"><span>{t('sales24h')}</span><strong>{summary.sales24h}</strong></div>
    </section>
    <section className="signal-grid">
      <div className={`signal-card potential-card ${mode === 'sell' ? 'sell' : ''}`}><span>{mode === 'buy' ? t('buyPotential') : t('sellPotential')}</span><strong>{potential != null && potential > 0 ? `+${fmtPlat(potential)}` : '—'}{potentialPct != null && potentialPct > 0 ? <small> {fmtPlainPercent(potentialPct)}</small> : null}</strong></div>
      <div className="signal-card score-card"><span>{t('score')}</span><strong>{score == null ? '—' : score}<small>{score == null ? '' : '/100'}</small></strong></div>
      <div className={`signal-card ${decisionClass(rawDecision)}`}><span>{t('decision')}</span><strong>{t(decisionKey(rawDecision))}</strong></div>
    </section>
    {loading ? <section className="panel state-panel"><div className="spinner"/><strong>{u.loading}</strong></section> : error ? <section className="panel state-panel error-state"><strong>{u.loadError}</strong><button className="retry-button" onClick={onRetry}>{u.retry}</button></section> : detail && analytics ? <>
      <section className="analysis-grid">
        <div className="analysis-card"><span>{u.baseline}</span><strong>{fmtPlat(analytics.baseline)}</strong></div>
        <div className="analysis-card"><span>{u.q25}</span><strong>{fmtPlat(analytics.q25)}</strong></div>
        <div className="analysis-card"><span>{u.q75}</span><strong>{fmtPlat(analytics.q75)}</strong></div>
        <div className="analysis-card"><span>{u.volatility}</span><strong>{fmtPlainPercent(analytics.volatility)}</strong></div>
      </section>
      <section className="panel chart-panel">
        <div className="panel-title-row"><div><div className="eyebrow">{t('closedSales')} · {u.analysisWindow}: {periodLabel(period, t, u)}</div><h2>{u.priceHistory}</h2></div><div className="time-tabs"><button className={chartRange === 7 ? 'time-tab active' : 'time-tab'} onClick={() => setChartRange(7)}>{t('range7d')}</button><button className={chartRange === 30 ? 'time-tab active' : 'time-tab'} onClick={() => setChartRange(30)}>{u.range30d}</button><button className={chartRange === 90 ? 'time-tab active' : 'time-tab'} onClick={() => setChartRange(90)}>{u.range90d}</button></div></div>
        <Chart history={detail.history} latestDate={detail.updatedDate ?? summary.updatedDate ?? ''} range={chartRange} locale={locale} t={t} u={u}/>
      </section>
    </> : null}
  </main>
}

type RouteState = {
  kind: 'scanner' | 'item'
  slug: string | null
  id: string | null
}

const readRoute = (): RouteState => {
  const match = window.location.pathname.match(/^\/item\/([^/]+)\/?$/)
  const params = new URLSearchParams(window.location.search)
  if (!match) return { kind: 'scanner', slug: null, id: null }
  return {
    kind: 'item',
    slug: decodeURIComponent(match[1]),
    id: params.get('id')
  }
}

const loadPlatform = (): Platform => {
  const params = new URLSearchParams(window.location.search)
  const urlValue = params.get('platform')
  if (urlValue === 'pc' || urlValue === 'ps4' || urlValue === 'xbox' || urlValue === 'switch') return urlValue
  const saved = localStorage.getItem('frameanalytics-platform')
  return saved === 'pc' || saved === 'ps4' || saved === 'xbox' || saved === 'switch' ? saved : 'pc'
}

const loadPeriod = (): AnalysisPeriod => {
  const params = new URLSearchParams(window.location.search)
  const urlValue = Number(params.get('period'))
  if (urlValue === 7 || urlValue === 30 || urlValue === 90) return urlValue
  const saved = Number(localStorage.getItem('frameanalytics-period'))
  return saved === 7 || saved === 30 || saved === 90 ? saved : 30
}

const PAGE_SIZES = [25, 50, 100, 200] as const

type PageSize = typeof PAGE_SIZES[number]

const loadPageSize = (): PageSize => {
  const saved = Number(localStorage.getItem('frameanalytics-page-size'))
  return PAGE_SIZES.includes(saved as PageSize) ? saved as PageSize : 50
}

export default function App() {
  const [mode, setMode] = useState<ScannerMode>('buy')
  const [query, setQuery] = useState('')
  const [minPrice, setMinPrice] = useState(0)
  const [minPotential, setMinPotential] = useState(0)
  const [sortKey, setSortKey] = useState<SortKey>('potential')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [platform, setPlatform] = useState<Platform>(loadPlatform)
  const [period, setPeriod] = useState<AnalysisPeriod>(loadPeriod)
  const [enabledCategories, setEnabledCategories] = useState<CategoryFilterId[]>(loadSavedCategories)
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [scannerData, setScannerData] = useState<ScannerResponse | null>(null)
  const [scannerLoading, setScannerLoading] = useState(true)
  const [scannerError, setScannerError] = useState<string | null>(null)
  const [scannerReload, setScannerReload] = useState(0)
  const [route, setRoute] = useState<RouteState>(readRoute)
  const [detail, setDetail] = useState<ItemDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [detailReload, setDetailReload] = useState(0)
  const [pageSize, setPageSize] = useState<PageSize>(loadPageSize)
  const [page, setPage] = useState(1)
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem('frameanalytics-locale')
    if (saved && saved in localeNames) return saved as Locale
    const browser = navigator.language.toLowerCase()
    if (browser.startsWith('zh-tw') || browser.startsWith('zh-hk') || browser.startsWith('zh-mo')) return 'zh-hant'
    if (browser.startsWith('zh')) return 'zh-hans'
    const base = browser.split('-')[0]
    return base in localeNames ? base as Locale : 'en'
  })
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('frameanalytics-theme')
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
  })

  const t: T = key => translations[locale][key]
  const u = uiText[locale]
  const p = paginationText[locale]

  useEffect(() => {
    const onPopState = () => {
      const nextRoute = readRoute()
      setRoute(nextRoute)
      const params = new URLSearchParams(window.location.search)
      const nextPlatform = params.get('platform')
      const nextPeriod = Number(params.get('period'))
      if (nextPlatform === 'pc' || nextPlatform === 'ps4' || nextPlatform === 'xbox' || nextPlatform === 'switch') setPlatform(nextPlatform)
      if (nextPeriod === 7 || nextPeriod === 30 || nextPeriod === 90) setPeriod(nextPeriod)
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    localStorage.setItem('frameanalytics-locale', locale)
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    localStorage.setItem('frameanalytics-theme', theme)
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => localStorage.setItem('frameanalytics-platform', platform), [platform])
  useEffect(() => localStorage.setItem('frameanalytics-period', String(period)), [period])
  useEffect(() => localStorage.setItem('frameanalytics-categories', JSON.stringify(enabledCategories)), [enabledCategories])
  useEffect(() => localStorage.setItem('frameanalytics-page-size', String(pageSize)), [pageSize])

  useEffect(() => {
    if (route.kind !== 'item' || !route.slug) return
    const params = new URLSearchParams(window.location.search)
    params.set('platform', platform)
    params.set('period', String(period))
    if (route.id) params.set('id', route.id)
    const next = `/item/${encodeURIComponent(route.slug)}?${params.toString()}`
    window.history.replaceState(window.history.state, '', next)
  }, [route.kind, route.slug, route.id, platform, period])

  useEffect(() => {
    const controller = new AbortController()
    setScannerLoading(true)
    setScannerError(null)
    setScannerData(null)
    fetchScanner(platform, period, controller.signal).then(data => {
      setScannerData(data)
      setScannerLoading(false)
    }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setScannerError(error instanceof Error ? error.message : String(error))
      setScannerLoading(false)
    })
    return () => controller.abort()
  }, [platform, period, scannerReload])

  const selectedSummary = useMemo(() => {
    if (route.kind !== 'item' || !scannerData) return null
    if (route.id) {
      const byId = scannerData.items.find(item => item.id === route.id)
      if (byId) return byId
    }
    if (route.slug) return scannerData.items.find(item => item.slug === route.slug) ?? null
    return null
  }, [route, scannerData])

  useEffect(() => {
    const itemId = selectedSummary?.id ?? route.id
    if (route.kind !== 'item' || !itemId) {
      setDetail(null)
      setDetailError(null)
      setDetailLoading(false)
      return
    }
    const controller = new AbortController()
    setDetail(null)
    setDetailError(null)
    setDetailLoading(true)
    fetchItem(platform, period, itemId, controller.signal).then(data => {
      setDetail(data.item)
      setDetailLoading(false)
    }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setDetailError(error instanceof Error ? error.message : String(error))
      setDetailLoading(false)
    })
    return () => controller.abort()
  }, [route.kind, route.id, selectedSummary?.id, platform, period, detailReload])

  const enabledSet = useMemo(() => new Set(enabledCategories), [enabledCategories])

  const categoryCounts = useMemo(() => {
    const counts = new Map<CategoryFilterId, number>()
    CATEGORY_FILTERS.forEach(filter => counts.set(filter.id, 0))
    for (const item of scannerData?.items ?? []) {
      const filter = getCategoryFilter(item)
      if (filter) counts.set(filter.id, (counts.get(filter.id) ?? 0) + 1)
    }
    return counts
  }, [scannerData])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDirection(value => value === 'asc' ? 'desc' : 'asc')
    else {
      setSortKey(key)
      setSortDirection(key === 'name' ? 'asc' : 'desc')
    }
  }

  const indicator = (key: SortKey) => sortKey === key ? (sortDirection === 'asc' ? '↑' : '↓') : ''

  const rows = useMemo(() => {
    const source = scannerData?.items ?? []
    const normalizedQuery = query.trim().toLocaleLowerCase(intlLocale(locale))
    const filtered = source.filter(item => {
      const category = getCategoryFilter(item)
      if (!category || !enabledSet.has(category.id)) return false
      if (normalizedQuery) {
        const localizedName = getItemName(item, locale).toLocaleLowerCase(intlLocale(locale))
        const englishName = item.name.toLocaleLowerCase('en')
        if (!localizedName.includes(normalizedQuery) && !englishName.includes(normalizedQuery)) return false
      }
      if ((item.currentPrice ?? 0) < minPrice) return false
      if ((getPotential(item, mode) ?? 0) < minPotential) return false
      return true
    })

    return filtered.sort((a, b) => {
      const nullOrder = (av: number | null | undefined, bv: number | null | undefined) => {
        const aMissing = av == null || !Number.isFinite(av)
        const bMissing = bv == null || !Number.isFinite(bv)
        if (aMissing && bMissing) return 0
        if (aMissing) return 1
        if (bMissing) return -1
        return null
      }

      let result = 0
      if (sortKey === 'name') result = getItemName(a, locale).localeCompare(getItemName(b, locale), intlLocale(locale))
      else if (sortKey === 'decision') result = decisionRank(getDecision(a, mode)) - decisionRank(getDecision(b, mode))
      else if (sortKey === 'updated') result = updatedRank(a.updatedDate) - updatedRank(b.updatedDate)
      else {
        const av = sortKey === 'current' ? a.currentPrice : sortKey === 'change1h' ? a.change1h : sortKey === 'change24h' ? a.change24h : sortKey === 'change7d' ? a.change7d : sortKey === 'sales24h' ? a.sales24h : sortKey === 'potential' ? getPotential(a, mode) : getScore(a, mode)
        const bv = sortKey === 'current' ? b.currentPrice : sortKey === 'change1h' ? b.change1h : sortKey === 'change24h' ? b.change24h : sortKey === 'change7d' ? b.change7d : sortKey === 'sales24h' ? b.sales24h : sortKey === 'potential' ? getPotential(b, mode) : getScore(b, mode)
        const missing = nullOrder(av, bv)
        if (missing != null && missing !== 0) return missing
        result = (av ?? 0) - (bv ?? 0)
      }
      return sortDirection === 'asc' ? result : -result
    })
  }, [scannerData, enabledSet, query, minPrice, minPotential, mode, sortKey, sortDirection, locale])

  useEffect(() => {
    setPage(1)
  }, [query, minPrice, minPotential, mode, platform, period, enabledCategories, sortKey, sortDirection, pageSize, locale])

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))

  useEffect(() => {
    setPage(current => Math.min(Math.max(1, current), pageCount))
  }, [pageCount])

  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return rows.slice(start, start + pageSize)
  }, [rows, page, pageSize])

  const showingStart = rows.length ? (page - 1) * pageSize + 1 : 0
  const showingEnd = rows.length ? Math.min(page * pageSize, rows.length) : 0

  const toggleCategory = (id: CategoryFilterId) => setEnabledCategories(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id])

  const statusText = scannerLoading ? u.loading : scannerError ? u.loadError : scannerData ? `${u.dataDate}: ${formatDate(scannerData.latestDate, locale)}` : u.loadError

  const itemHref = (item: ScannerItem) => `/item/${encodeURIComponent(item.slug)}?platform=${encodeURIComponent(platform)}&period=${period}&id=${encodeURIComponent(item.id)}`

  const openItem = (item: ScannerItem) => {
    const href = itemHref(item)
    window.history.pushState({ frameanalyticsFromScanner: true }, '', href)
    setRoute(readRoute())
    setCategoriesOpen(false)
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const closeItem = () => {
    if (window.history.state?.frameanalyticsFromScanner) {
      window.history.back()
      return
    }
    window.history.replaceState(null, '', '/')
    setRoute(readRoute())
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const detailSummary = selectedSummary ?? (detail ? {
    id: detail.id,
    name: detail.name,
    names: detail.names,
    slug: detail.slug,
    category: detail.category,
    subcategory: detail.subcategory,
    defaultEnabled: detail.defaultEnabled,
    currentPrice: detail.currentPrice,
    change1h: detail.change1h,
    change24h: detail.change24h,
    change7d: detail.change7d,
    sales24h: detail.sales24h,
    updatedDate: detail.updatedDate,
    buyPotential: detail.analytics?.buy.potential ?? null,
    buyPotentialPct: detail.analytics?.buy.potentialPct ?? null,
    buyScore: detail.analytics?.buy.score ?? null,
    buyDecision: detail.analytics?.buy.decision ?? 'LOW_PRIORITY',
    sellPotential: detail.analytics?.sell.potential ?? null,
    sellPotentialPct: detail.analytics?.sell.potentialPct ?? null,
    sellScore: detail.analytics?.sell.score ?? null,
    sellDecision: detail.analytics?.sell.decision ?? 'LOW_PRIORITY'
  } satisfies ScannerItem : null)

  return <>
    <div className="background-layer"/><div className="background-shade"/>
    {route.kind === 'item' ? detailSummary ? <Detail key={`${detailSummary.id}-${period}`} summary={detailSummary} detail={detail} platform={platform} period={period} loading={detailLoading} error={detailError} onBack={closeItem} onRetry={() => setDetailReload(value => value + 1)} locale={locale} mode={mode} t={t} u={u}/> : <main className="app-shell detail-shell"><button className="back-button" onClick={closeItem}>{t('back')}</button><section className="panel state-panel">{detailLoading || scannerLoading ? <><div className="spinner"/><strong>{u.loading}</strong></> : <><strong>{u.noData}</strong><button className="retry-button" onClick={() => { setScannerReload(value => value + 1); setDetailReload(value => value + 1) }}>{u.retry}</button></>}</section></main> : <main className="app-shell">
      <header className="topbar"><div><div className="brand-plate"><img src="/assets/frameanalytics-logo.png" alt="FrameAnalytics"/></div><p className="subtitle">{t('subtitle')}</p></div><div className={`status-pill ${scannerLoading ? 'loading' : scannerError ? 'error' : ''}`}><span className="status-dot"/>{statusText}</div></header>
      <section className="mode-tabs"><button className={mode === 'buy' ? 'mode-tab active buy' : 'mode-tab'} onClick={() => setMode('buy')}>{t('buy')}</button><button className={mode === 'sell' ? 'mode-tab active sell' : 'mode-tab'} onClick={() => setMode('sell')}>{t('sell')}</button></section>
      <section className="panel filters">
        <label className="search-field"><span>{t('name')}</span><input value={query} onChange={(event: { target: { value: string } }) => setQuery(event.target.value)} placeholder={t('searchPlaceholder')}/></label>
        <label><span>{t('minPrice')}</span><div className="input-suffix"><input type="number" min="0" value={minPrice} onChange={(event: { target: { value: string } }) => setMinPrice(Number(event.target.value))}/><b>p</b></div></label>
        <label><span>{t('potentialFrom')}</span><div className="input-suffix"><input type="number" min="0" value={minPotential} onChange={(event: { target: { value: string } }) => setMinPotential(Number(event.target.value))}/><b>p</b></div></label>
        <label><span>{u.platform}</span><select value={platform} onChange={(event: { target: { value: string } }) => setPlatform(event.target.value as Platform)}>{Object.entries(PLATFORM_NAMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label><span>{u.analysisPeriod}</span><select value={period} onChange={(event: { target: { value: string } }) => setPeriod(Number(event.target.value) as AnalysisPeriod)}><option value={7}>{t('range7d')}</option><option value={30}>{u.range30d}</option><option value={90}>{u.range90d}</option></select></label>
        <div className="filter-field category-filter"><span>{u.categories}</span><button className="control-button" onClick={() => setCategoriesOpen(value => !value)}>{u.categories} <b>{enabledCategories.length}/{CATEGORY_FILTERS.length}</b><i>{categoriesOpen ? '▲' : '▼'}</i></button>{categoriesOpen ? <div className="category-panel"><div className="category-actions"><button onClick={() => setEnabledCategories(DEFAULT_CATEGORY_IDS)}>{u.defaults}</button><button onClick={() => setEnabledCategories(ALL_CATEGORY_IDS)}>{u.selectAll}</button><button onClick={() => setEnabledCategories([])}>{u.clear}</button></div><div className="category-list">{CATEGORY_FILTERS.map(filter => <label className="category-option" key={filter.id}><input type="checkbox" checked={enabledSet.has(filter.id)} onChange={() => toggleCategory(filter.id)}/><span>{u[filter.label]}</span><b>{categoryCounts.get(filter.id) ?? 0}</b></label>)}</div></div> : null}</div>
        <div className="filter-field"><span>{u.crossplay}</span><button className="control-button disabled-control" disabled title={u.unavailable}>{u.crossplay} · —</button></div>
      </section>
      <section className="results-row results-toolbar"><div className="results-count"><span>{t('found')}</span><strong>{rows.length}</strong>{scannerData ? <em>{PLATFORM_NAMES[platform]} · {periodLabel(period, t, u)}</em> : null}</div><div className="page-size-control"><span>{p.perPage}</span><select value={pageSize} onChange={event => setPageSize(Number(event.target.value) as PageSize)}>{PAGE_SIZES.map(value => <option key={value} value={value}>{value}</option>)}</select></div><div className="page-indicator">{p.page} <strong>{page}</strong> {p.of} <strong>{pageCount}</strong></div></section>
      <section className="panel table-panel"><div className="table-scroll"><table><thead><tr>{([['name', 'item'], ['current', 'current'], ['change1h', 'change1h'], ['change24h', 'change24h'], ['change7d', 'change7d'], ['sales24h', 'sales24h'], ['potential', 'potential'], ['score', 'score'], ['decision', 'decision'], ['updated', 'updated']] as [SortKey, TranslationKey][]).map(([key, label]) => <th key={key}><button className="sort-button" onClick={() => handleSort(key)}><span>{t(label)}</span><span className="sort-indicator">{indicator(key)}</span></button></th>)}</tr></thead><tbody>
        {scannerLoading ? <tr><td colSpan={10} className="state-cell"><div className="spinner"/><strong>{u.loading}</strong></td></tr> : scannerError ? <tr><td colSpan={10} className="state-cell error-state"><strong>{u.loadError}</strong><button className="retry-button" onClick={() => setScannerReload(value => value + 1)}>{u.retry}</button></td></tr> : rows.length === 0 ? <tr><td colSpan={10} className="state-cell"><strong>{u.noData}</strong></td></tr> : pageRows.map(item => {
          const potential = getPotential(item, mode)
          const potentialPct = getPotentialPct(item, mode)
          const score = getScore(item, mode)
          const decision = getDecision(item, mode)
          const href = itemHref(item)
          return <tr key={item.id}><td><a className="item-link" href={href} onClick={event => { if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); openItem(item) }}><div className="item-name">{getItemName(item, locale)}</div><div className="item-category">{getCategoryLabel(item, u)}</div></a></td><td className="price-cell">{fmtPlat(item.currentPrice)}</td><td className="neutral">—</td><td className={valueClass(item.change24h)}>{fmtPercent(item.change24h)}</td><td className={valueClass(item.change7d)}>{fmtPercent(item.change7d)}</td><td>{item.sales24h}</td><td><span className={potential != null && potential > 0 ? 'potential-badge' : 'potential-badge muted'}>{potential != null && potential > 0 ? <><strong>+{fmtPlat(potential)}</strong>{potentialPct != null ? <small>{fmtPlainPercent(potentialPct)}</small> : null}</> : '—'}</span></td><td><span className={`score-badge ${score != null && score >= 80 ? 'high' : score != null && score >= 60 ? 'mid' : 'low'}`}>{score ?? '—'}</span></td><td><span className={decisionClass(decision)}>{t(decisionKey(decision))}</span></td><td className="updated-cell">{formatDate(item.updatedDate, locale)}</td></tr>
        })}
      </tbody></table></div></section>
      {!scannerLoading && !scannerError && rows.length > 0 ? <nav className="pagination-bar" aria-label="Pagination"><div className="pagination-range">{p.showing} <strong>{showingStart}–{showingEnd}</strong> {p.of} <strong>{rows.length}</strong></div><div className="pagination-buttons"><button disabled={page <= 1} onClick={() => setPage(1)}>« {p.first}</button><button disabled={page <= 1} onClick={() => setPage(value => Math.max(1, value - 1))}>‹ {p.previous}</button><span>{p.page} <strong>{page}</strong> {p.of} <strong>{pageCount}</strong></span><button disabled={page >= pageCount} onClick={() => setPage(value => Math.min(pageCount, value + 1))}>{p.next} ›</button><button disabled={page >= pageCount} onClick={() => setPage(pageCount)}>{p.last} »</button></div></nav> : null}
    </main>}
    <FooterBar locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} t={t}/>
  </>
}
