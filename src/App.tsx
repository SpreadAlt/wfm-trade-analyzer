import { useEffect, useMemo, useState } from 'react'
import { items } from './data'
import { localeNames, translations } from './i18n'
import type { Locale, Theme, TranslationKey } from './i18n'
import type { HistoryPoint, MarketItem, ScannerMode } from './types'

type SortKey =
  | 'name'
  | 'current'
  | 'change1h'
  | 'change24h'
  | 'change7d'
  | 'sales24h'
  | 'potential'
  | 'score'
  | 'decision'
  | 'updated'

type SortDirection = 'asc' | 'desc'

const fmtPercent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
const fmtPlat = (value: number) => `${value.toFixed(0)}p`

const valueClass = (value: number) => {
  if (value > 0) return 'positive'
  if (value < 0) return 'negative'
  return 'neutral'
}

const decisionClass = (decision: string) => {
  if (decision.includes('ВЫГОДНО ПОКУПАТЬ')) return 'decision buy-strong'
  if (decision.includes('ВЫГОДНО ПРОДАВАТЬ')) return 'decision sell-strong'
  if (decision.includes('МОЖЕТ УПАСТЬ')) return 'decision buy-watch'
  if (decision.includes('СЛЕДИТЬ ЗА ПОКУПКОЙ')) return 'decision buy-watch'
  if (decision.includes('МОЖЕТ ВЫРАСТИ')) return 'decision sell-watch'
  if (decision.includes('СЛЕДИТЬ ЗА ПРОДАЖЕЙ')) return 'decision sell-watch'
  return 'decision low'
}

const decisionRank = (decision: string) => {
  if (decision.includes('ВЫГОДНО ПОКУПАТЬ') || decision.includes('ВЫГОДНО ПРОДАВАТЬ')) return 4
  if (decision.includes('МОЖЕТ УПАСТЬ') || decision.includes('МОЖЕТ ВЫРАСТИ')) return 3
  if (decision.includes('СЛЕДИТЬ')) return 2
  return 1
}

const updatedRank = (value: string) => {
  const match = value.match(/(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})/)
  if (!match) return 0
  const [, day, month, hour, minute] = match
  return Number(month) * 1000000 + Number(day) * 10000 + Number(hour) * 100 + Number(minute)
}

const getPotential = (item: MarketItem, mode: ScannerMode) => mode === 'buy' ? item.buyPotential : item.sellPotential
const getScore = (item: MarketItem, mode: ScannerMode) => mode === 'buy' ? item.buyScore : item.sellScore
const getDecision = (item: MarketItem, mode: ScannerMode) => mode === 'buy' ? item.buyDecision : item.sellDecision

const getDecisionKey = (decision: string): TranslationKey => {
  if (decision.includes('ВЫГОДНО ПОКУПАТЬ')) return 'decisionBuyStrong'
  if (decision.includes('ВЫГОДНО ПРОДАВАТЬ')) return 'decisionSellStrong'
  if (decision.includes('МОЖЕТ УПАСТЬ')) return 'decisionBuyFalling'
  if (decision.includes('СЛЕДИТЬ ЗА ПОКУПКОЙ')) return 'decisionBuyWatch'
  if (decision.includes('МОЖЕТ ВЫРАСТИ')) return 'decisionSellRising'
  if (decision.includes('СЛЕДИТЬ ЗА ПРОДАЖЕЙ')) return 'decisionSellWatch'
  return 'decisionLow'
}

const getCategoryKey = (category: string): TranslationKey => {
  if (category === 'Prime Weapon') return 'categoryPrimeWeapon'
  if (category === 'Prime Warframe') return 'categoryPrimeWarframe'
  if (category === 'Primed Mod') return 'categoryPrimedMod'
  return 'categoryBaroWeapon'
}

type T = (key: TranslationKey) => string

const Chart = ({ history, t }: { history: HistoryPoint[]; t: T }) => {
  const width = 960
  const height = 390
  const pad = { left: 48, right: 48, top: 24, bottom: 48 }
  const priceMin = Math.min(...history.map((p) => p.min))
  const priceMax = Math.max(...history.map((p) => p.max))
  const volumeMax = Math.max(...history.map((p) => p.volume))
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const px = (i: number) => pad.left + (i / Math.max(1, history.length - 1)) * innerW
  const py = (v: number) => pad.top + (1 - (v - priceMin) / Math.max(1, priceMax - priceMin)) * innerH
  const line = (key: 'min' | 'median' | 'max') =>
    history.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(p[key]).toFixed(1)}`).join(' ')

  return (
    <div className="chart-shell">
      <svg viewBox={`0 0 ${width} ${height}`} className="price-chart" role="img">
        <defs>
          <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(103, 181, 255, .72)" />
            <stop offset="100%" stopColor="rgba(103, 181, 255, .12)" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
          const y = pad.top + ratio * innerH
          const value = priceMax - ratio * (priceMax - priceMin)
          return (
            <g key={ratio}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="grid-line" />
              <text x={8} y={y + 4} className="axis-label">{value.toFixed(0)}</text>
            </g>
          )
        })}
        {history.map((point, i) => {
          const barW = Math.max(2, innerW / history.length - 3)
          const h = (point.volume / volumeMax) * 78
          return <rect key={point.label} x={px(i) - barW / 2} y={height - pad.bottom - h} width={barW} height={h} fill="url(#volumeFill)" rx="2" />
        })}
        <path d={line('min')} className="line min-line" />
        <path d={line('median')} className="line median-line" />
        <path d={line('max')} className="line max-line" />
        {[0, 12, 24, 36, 47].map((i) => (
          <text key={i} x={px(i)} y={height - 16} textAnchor="middle" className="axis-label">
            {history[i]?.label.replace(' ', ' · ')}
          </text>
        ))}
      </svg>
      <div className="legend">
        <span><i className="legend-dot min-dot" />{t('min')}</span>
        <span><i className="legend-dot median-dot" />{t('median')}</span>
        <span><i className="legend-dot max-dot" />{t('max')}</span>
        <span><i className="legend-dot volume-dot" />{t('sales')}</span>
      </div>
    </div>
  )
}

const FooterDrawer = ({
  locale,
  setLocale,
  theme,
  setTheme,
  t
}: {
  locale: Locale
  setLocale: (locale: Locale) => void
  theme: Theme
  setTheme: (theme: Theme) => void
  t: T
}) => {
  const [open, setOpen] = useState(false)

  return (
    <footer className={`footer-drawer ${open ? 'open' : ''}`}>
      <button className="footer-handle" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
        <span className="footer-handle-main">
          <span className="footer-brand-mark" aria-hidden="true">
            <svg viewBox="0 0 64 64" className="footer-logo-svg">
              <defs>
                <linearGradient id="faFooterGradient" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#79dcff" />
                  <stop offset="100%" stopColor="#58e5ad" />
                </linearGradient>
              </defs>
              <path d="M12 14 H52 V22 H20 V30 H42 V38 H20 V50 H12 Z" fill="url(#faFooterGradient)" />
              <path d="M44 14 H52 L60 50 H51.5 L49.8 42 H38.2 L36.5 50 H28 Z M40 34 H48 L44 21 Z" fill="url(#faFooterGradient)" />
            </svg>
          </span>
          <span className="footer-brand-copy">
            <strong>FrameAnalytics</strong>
            <small>{t('settingsInfo')}</small>
          </span>
        </span>
        <span className="footer-chevron">{open ? '⌄' : '⌃'}</span>
      </button>
      <div className="footer-content">
        <div className="footer-grid">
          <section>
            <h3>{t('language')}</h3>
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              {Object.entries(localeNames).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </select>
          </section>
          <section>
            <h3>{t('theme')}</h3>
            <select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}>
              <option value="system">{t('themeSystem')}</option>
              <option value="light">{t('themeLight')}</option>
              <option value="dark">{t('themeDark')}</option>
            </select>
          </section>
          <section>
            <h3>{t('links')}</h3>
            <div className="footer-links">
              <a href="https://warframe.market/" target="_blank" rel="noreferrer">{t('sourceMarket')}</a>
              <a href="https://relics.run/history/" target="_blank" rel="noreferrer">{t('sourceHistory')}</a>
              <a href="https://docs.warframe.market/" target="_blank" rel="noreferrer">{t('sourceApi')}</a>
              <a href="https://github.com/" target="_blank" rel="noreferrer">{t('sourceGithub')}</a>
            </div>
          </section>
          <section>
            <h3>{t('project')}</h3>
            <div className="footer-meta">
              <span>{t('dataSources')}: Warframe.market · Relics.run</span>
              <span>{t('version')}: 0.4.0</span>
            </div>
          </section>
        </div>
        <div className="footer-disclaimer">{t('disclaimer')}</div>
      </div>
    </footer>
  )
}

const Detail = ({
  item,
  mode,
  onBack,
  t
}: {
  item: MarketItem
  mode: ScannerMode
  onBack: () => void
  t: T
}) => {
  const potential = getPotential(item, mode)
  const score = getScore(item, mode)
  const rawDecision = getDecision(item, mode)
  const decision = t(getDecisionKey(rawDecision))

  return (
    <main className="app-shell detail-shell">
      <button className="back-button" onClick={onBack}>{t('back')}</button>
      <section className="detail-header">
        <div>
          <div className="eyebrow">{t(getCategoryKey(item.category))}</div>
          <h1>{item.name}</h1>
          <div className="price-big">{fmtPlat(item.current)}</div>
        </div>
        <div className="updated-card">
          <span>{t('updated')}</span>
          <strong>{item.updated}</strong>
        </div>
      </section>

      <section className="metric-grid">
        <div className="metric-card"><span>{t('change1h')}</span><strong className={valueClass(item.change1h)}>{fmtPercent(item.change1h)}</strong></div>
        <div className="metric-card"><span>{t('change24h')}</span><strong className={valueClass(item.change24h)}>{fmtPercent(item.change24h)}</strong></div>
        <div className="metric-card"><span>{t('change7d')}</span><strong className={valueClass(item.change7d)}>{fmtPercent(item.change7d)}</strong></div>
        <div className="metric-card"><span>{t('sales24h')}</span><strong>{item.sales24h}</strong></div>
      </section>

      <section className="signal-grid">
        <div className="signal-card potential-card">
          <span>{mode === 'buy' ? t('buyPotential') : t('sellPotential')}</span>
          <strong>+{fmtPlat(potential)}</strong>
        </div>
        <div className="signal-card score-card">
          <span>{t('score')}</span>
          <strong>{score}<small>/100</small></strong>
        </div>
        <div className={`signal-card ${decisionClass(rawDecision)}`}>
          <span>{t('decision')}</span>
          <strong>{decision}</strong>
        </div>
      </section>

      <section className="panel chart-panel">
        <div className="panel-title-row">
          <div>
            <div className="eyebrow">{t('closedSales')}</div>
            <h2>{t('price48h')}</h2>
          </div>
          <div className="time-tabs">
            <button className="time-tab">24h</button>
            <button className="time-tab active">48h</button>
            <button className="time-tab">7d</button>
          </div>
        </div>
        <Chart history={item.history} t={t} />
      </section>
    </main>
  )
}

export default function App() {
  const [mode, setMode] = useState<ScannerMode>('buy')
  const [query, setQuery] = useState('')
  const [minPrice, setMinPrice] = useState(0)
  const [minPotential, setMinPotential] = useState(0)
  const [selected, setSelected] = useState<MarketItem | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('potential')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [locale, setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem('wfm-locale')
    if (saved && saved in localeNames) return saved as Locale
    const browser = navigator.language.toLowerCase()
    const exact = Object.keys(localeNames).find((code) => browser === code)
    if (exact) return exact as Locale
    if (browser.startsWith('zh-tw') || browser.startsWith('zh-hk') || browser.startsWith('zh-mo')) return 'zh-hant'
    if (browser.startsWith('zh')) return 'zh-hans'
    const base = browser.split('-')[0]
    if (base in localeNames) return base as Locale
    return 'en'
  })
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('wfm-theme')
    if (saved === 'system' || saved === 'light' || saved === 'dark') return saved
    return 'dark'
  })

  const t: T = (key) => translations[locale][key]

  useEffect(() => {
    localStorage.setItem('wfm-locale', locale)
    document.documentElement.lang = locale
  }, [locale])

  useEffect(() => {
    localStorage.setItem('wfm-theme', theme)
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
      document.documentElement.dataset.theme = resolved
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection((value) => value === 'asc' ? 'desc' : 'asc')
      return
    }
    setSortKey(key)
    setSortDirection(key === 'name' ? 'asc' : 'desc')
  }

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return ''
    return sortDirection === 'asc' ? '↑' : '↓'
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((item) => !q || item.name.toLowerCase().includes(q))
      .filter((item) => item.current >= minPrice)
      .filter((item) => getPotential(item, mode) >= minPotential)
      .sort((a, b) => {
        let result = 0
        if (sortKey === 'name') result = a.name.localeCompare(b.name, locale)
        if (sortKey === 'current') result = a.current - b.current
        if (sortKey === 'change1h') result = a.change1h - b.change1h
        if (sortKey === 'change24h') result = a.change24h - b.change24h
        if (sortKey === 'change7d') result = a.change7d - b.change7d
        if (sortKey === 'sales24h') result = a.sales24h - b.sales24h
        if (sortKey === 'potential') result = getPotential(a, mode) - getPotential(b, mode)
        if (sortKey === 'score') result = getScore(a, mode) - getScore(b, mode)
        if (sortKey === 'decision') result = decisionRank(getDecision(a, mode)) - decisionRank(getDecision(b, mode))
        if (sortKey === 'updated') result = updatedRank(a.updated) - updatedRank(b.updated)
        return sortDirection === 'asc' ? result : -result
      })
  }, [mode, query, minPrice, minPotential, sortKey, sortDirection, locale])

  return (
    <>
      {selected ? (
        <Detail item={selected} mode={mode} onBack={() => setSelected(null)} t={t} />
      ) : (
        <main className="app-shell">
          <header className="topbar">
            <div>
              <div className="brand-row">
                <div className="brand-mark" aria-hidden="true">
                  <svg viewBox="0 0 64 64" className="brand-logo-svg">
                    <defs>
                      <linearGradient id="faMainGradient" x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor="#79dcff" />
                        <stop offset="100%" stopColor="#58e5ad" />
                      </linearGradient>
                    </defs>
                    <path d="M12 14 H52 V22 H20 V30 H42 V38 H20 V50 H12 Z" fill="url(#faMainGradient)" />
                    <path d="M44 14 H52 L60 50 H51.5 L49.8 42 H38.2 L36.5 50 H28 Z M40 34 H48 L44 21 Z" fill="url(#faMainGradient)" />
                  </svg>
                </div>
                <div>
                  <div className="eyebrow">{t('analytics')}</div>
                  <h1>{t('title')}</h1>
                </div>
              </div>
              <p className="subtitle">{t('subtitle')}</p>
            </div>
            <div className="status-pill"><span className="status-dot" /> {t('dataFresh')}</div>
          </header>

          <section className="mode-tabs">
            <button className={mode === 'buy' ? 'mode-tab active buy' : 'mode-tab'} onClick={() => setMode('buy')}>{t('buy')}</button>
            <button className={mode === 'sell' ? 'mode-tab active sell' : 'mode-tab'} onClick={() => setMode('sell')}>{t('sell')}</button>
          </section>

          <section className="panel filters filters-compact">
            <label className="search-field">
              <span>{t('name')}</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('searchPlaceholder')} />
            </label>
            <label>
              <span>{t('minPrice')}</span>
              <div className="input-suffix"><input type="number" min="0" value={minPrice} onChange={(event) => setMinPrice(Number(event.target.value))} /><b>p</b></div>
            </label>
            <label>
              <span>{t('potentialFrom')}</span>
              <div className="input-suffix"><input type="number" min="0" value={minPotential} onChange={(event) => setMinPotential(Number(event.target.value))} /><b>p</b></div>
            </label>
          </section>

          <section className="results-row">
            <span>{t('found')}</span>
            <strong>{rows.length}</strong>
          </section>

          <section className="panel table-panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th><button className="sort-button" onClick={() => handleSort('name')}><span>{t('item')}</span><span className="sort-indicator">{sortIndicator('name')}</span></button></th>
                    <th><button className="sort-button" onClick={() => handleSort('current')}><span>{t('current')}</span><span className="sort-indicator">{sortIndicator('current')}</span></button></th>
                    <th><button className="sort-button" onClick={() => handleSort('change1h')}><span>{t('change1h')}</span><span className="sort-indicator">{sortIndicator('change1h')}</span></button></th>
                    <th><button className="sort-button" onClick={() => handleSort('change24h')}><span>{t('change24h')}</span><span className="sort-indicator">{sortIndicator('change24h')}</span></button></th>
                    <th><button className="sort-button" onClick={() => handleSort('change7d')}><span>{t('change7d')}</span><span className="sort-indicator">{sortIndicator('change7d')}</span></button></th>
                    <th><button className="sort-button" onClick={() => handleSort('sales24h')}><span>{t('sales24h')}</span><span className="sort-indicator">{sortIndicator('sales24h')}</span></button></th>
                    <th><button className="sort-button" onClick={() => handleSort('potential')}><span>{t('potential')}</span><span className="sort-indicator">{sortIndicator('potential')}</span></button></th>
                    <th><button className="sort-button" onClick={() => handleSort('score')}><span>{t('score')}</span><span className="sort-indicator">{sortIndicator('score')}</span></button></th>
                    <th><button className="sort-button" onClick={() => handleSort('decision')}><span>{t('decision')}</span><span className="sort-indicator">{sortIndicator('decision')}</span></button></th>
                    <th><button className="sort-button" onClick={() => handleSort('updated')}><span>{t('updated')}</span><span className="sort-indicator">{sortIndicator('updated')}</span></button></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const potential = getPotential(item, mode)
                    const score = getScore(item, mode)
                    const rawDecision = getDecision(item, mode)
                    const decision = t(getDecisionKey(rawDecision))
                    return (
                      <tr key={item.id} onClick={() => setSelected(item)}>
                        <td>
                          <div className="item-name">{item.name}</div>
                          <div className="item-category">{t(getCategoryKey(item.category))}</div>
                        </td>
                        <td className="price-cell">{fmtPlat(item.current)}</td>
                        <td className={valueClass(item.change1h)}>{fmtPercent(item.change1h)}</td>
                        <td className={valueClass(item.change24h)}>{fmtPercent(item.change24h)}</td>
                        <td className={valueClass(item.change7d)}>{fmtPercent(item.change7d)}</td>
                        <td>{item.sales24h}</td>
                        <td><span className={potential > 0 ? 'potential-badge' : 'potential-badge muted'}>{potential > 0 ? `+${fmtPlat(potential)}` : '—'}</span></td>
                        <td><span className={`score-badge ${score >= 80 ? 'high' : score >= 60 ? 'mid' : 'low'}`}>{score}</span></td>
                        <td><span className={decisionClass(rawDecision)}>{decision}</span></td>
                        <td className="updated-cell">{item.updated}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      )}
      <FooterDrawer locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} t={t} />
    </>
  )
}
