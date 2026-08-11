import { useEffect, useMemo, useState } from 'react'
import { items } from './data'
import { localeNames, translations } from './i18n'
import type { Locale, Theme, TranslationKey } from './i18n'
import type { HistoryPoint, MarketItem, ScannerMode } from './types'

type SortKey = 'name' | 'current' | 'change1h' | 'change24h' | 'change7d' | 'sales24h' | 'potential' | 'score' | 'decision' | 'updated'
type SortDirection = 'asc' | 'desc'
type T = (key: TranslationKey) => string

const fmtPercent = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
const fmtPlat = (value: number) => `${value.toFixed(0)}p`
const valueClass = (value: number) => value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral'
const getPotential = (item: MarketItem, mode: ScannerMode) => mode === 'buy' ? item.buyPotential : item.sellPotential
const getScore = (item: MarketItem, mode: ScannerMode) => mode === 'buy' ? item.buyScore : item.sellScore
const getDecision = (item: MarketItem, mode: ScannerMode) => mode === 'buy' ? item.buyDecision : item.sellDecision

const decisionClass = (decision: string) => {
  if (decision.includes('ВЫГОДНО ПОКУПАТЬ')) return 'decision buy-strong'
  if (decision.includes('ВЫГОДНО ПРОДАВАТЬ')) return 'decision sell-strong'
  if (decision.includes('МОЖЕТ УПАСТЬ') || decision.includes('СЛЕДИТЬ ЗА ПОКУПКОЙ')) return 'decision buy-watch'
  if (decision.includes('МОЖЕТ ВЫРАСТИ') || decision.includes('СЛЕДИТЬ ЗА ПРОДАЖЕЙ')) return 'decision sell-watch'
  return 'decision low'
}

const decisionRank = (decision: string) => {
  if (decision.includes('ВЫГОДНО')) return 4
  if (decision.includes('МОЖЕТ')) return 3
  if (decision.includes('СЛЕДИТЬ')) return 2
  return 1
}

const decisionKey = (decision: string): TranslationKey => {
  if (decision.includes('ВЫГОДНО ПОКУПАТЬ')) return 'decisionBuyStrong'
  if (decision.includes('ВЫГОДНО ПРОДАВАТЬ')) return 'decisionSellStrong'
  if (decision.includes('МОЖЕТ УПАСТЬ')) return 'decisionBuyFalling'
  if (decision.includes('СЛЕДИТЬ ЗА ПОКУПКОЙ')) return 'decisionBuyWatch'
  if (decision.includes('МОЖЕТ ВЫРАСТИ')) return 'decisionSellRising'
  if (decision.includes('СЛЕДИТЬ ЗА ПРОДАЖЕЙ')) return 'decisionSellWatch'
  return 'decisionLow'
}

const categoryKey = (category: MarketItem['category']): TranslationKey => {
  if (category === 'Prime Weapon') return 'categoryPrimeWeapon'
  if (category === 'Prime Warframe') return 'categoryPrimeWarframe'
  if (category === 'Primed Mod') return 'categoryPrimedMod'
  return 'categoryBaroWeapon'
}

const updatedRank = (value: string) => {
  const m = value.match(/(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})/)
  if (!m) return 0
  return Number(m[2]) * 1000000 + Number(m[1]) * 10000 + Number(m[3]) * 100 + Number(m[4])
}

const Chart = ({ history, t }: { history: HistoryPoint[]; t: T }) => {
  const width = 1000
  const height = 410
  const pad = { left: 54, right: 54, top: 24, bottom: 50 }
  const priceMin = Math.floor(Math.min(...history.map(p => p.min)) - 4)
  const priceMax = Math.ceil(Math.max(...history.map(p => p.max)) + 4)
  const volumeMax = Math.max(...history.map(p => p.volume))
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const px = (i: number) => pad.left + (i / Math.max(1, history.length - 1)) * innerW
  const py = (v: number) => pad.top + (1 - (v - priceMin) / Math.max(1, priceMax - priceMin)) * innerH
  const line = (key: 'min' | 'median' | 'max') => history.map((p,i) => `${i === 0 ? 'M' : 'L'} ${px(i).toFixed(1)} ${py(p[key]).toFixed(1)}`).join(' ')
  return <div className="chart-shell">
    <svg viewBox={`0 0 ${width} ${height}`} className="price-chart">
      {[0,.25,.5,.75,1].map(r => {
        const y = pad.top + r * innerH
        const value = priceMax - r * (priceMax-priceMin)
        return <g key={r}><line x1={pad.left} x2={width-pad.right} y1={y} y2={y} className="grid-line"/><text x="8" y={y+4} className="axis-label">{value.toFixed(0)}</text></g>
      })}
      {history.map((p,i) => {
        const barW = Math.max(2, innerW/history.length-3)
        const h = p.volume/volumeMax*80
        return <rect key={p.label} x={px(i)-barW/2} y={height-pad.bottom-h} width={barW} height={h} rx="2" className="volume-bar"/>
      })}
      <path d={line('min')} className="line min-line"/>
      <path d={line('median')} className="line median-line"/>
      <path d={line('max')} className="line max-line"/>
      {[0,12,24,36,47].map(i => <text key={i} x={px(i)} y={height-15} textAnchor="middle" className="axis-label">{history[i]?.label.replace(' ',' · ')}</text>)}
    </svg>
    <div className="legend"><span><i className="legend-dot min-dot"/>{t('min')}</span><span><i className="legend-dot median-dot"/>{t('median')}</span><span><i className="legend-dot max-dot"/>{t('max')}</span><span><i className="legend-dot volume-dot"/>{t('sales')}</span></div>
  </div>
}

const FooterBar = ({ locale, setLocale, theme, setTheme, t }: { locale: Locale; setLocale:(v:Locale)=>void; theme:Theme; setTheme:(v:Theme)=>void; t:T }) => {
  return <footer className="footer-bar">
    <div className="footer-brand">
      <img src="/assets/frameanalytics-logo.png" alt="FrameAnalytics"/>
    </div>
    <div className="footer-control">
      <span>{t('language')}</span>
      <select value={locale} onChange={e => setLocale(e.target.value as Locale)}>
        {Object.entries(localeNames).map(([code,label]) => <option value={code} key={code}>{label}</option>)}
      </select>
    </div>
    <div className="footer-control">
      <span>{t('theme')}</span>
      <select value={theme} onChange={e => setTheme(e.target.value as Theme)}>
        <option value="system">{t('themeSystem')}</option>
        <option value="light">{t('themeLight')}</option>
        <option value="dark">{t('themeDark')}</option>
      </select>
    </div>
    <a className="footer-market-link" href="https://warframe.market/" target="_blank" rel="noreferrer">{t('sourceMarket')}</a>
    <div className="footer-version">{t('version')} 0.4.5</div>
  </footer>
}

const Detail = ({ item, mode, onBack, t }: { item:MarketItem; mode:ScannerMode; onBack:()=>void; t:T }) => {
  const potential = getPotential(item,mode)
  const score = getScore(item,mode)
  const rawDecision = getDecision(item,mode)
  return <main className="app-shell detail-shell">
    <button className="back-button" onClick={onBack}>{t('back')}</button>
    <section className="detail-header"><div><div className="eyebrow">{t(categoryKey(item.category))}</div><h1>{item.name}</h1><div className="price-big">{fmtPlat(item.current)}</div></div><div className="updated-card"><span>{t('updated')}</span><strong>{item.updated}</strong></div></section>
    <section className="metric-grid"><div className="metric-card"><span>{t('change1h')}</span><strong className={valueClass(item.change1h)}>{fmtPercent(item.change1h)}</strong></div><div className="metric-card"><span>{t('change24h')}</span><strong className={valueClass(item.change24h)}>{fmtPercent(item.change24h)}</strong></div><div className="metric-card"><span>{t('change7d')}</span><strong className={valueClass(item.change7d)}>{fmtPercent(item.change7d)}</strong></div><div className="metric-card"><span>{t('sales24h')}</span><strong>{item.sales24h}</strong></div></section>
    <section className="signal-grid"><div className="signal-card potential-card"><span>{mode==='buy'?t('buyPotential'):t('sellPotential')}</span><strong>{potential > 0 ? `+${fmtPlat(potential)}` : '—'}</strong></div><div className="signal-card score-card"><span>{t('score')}</span><strong>{score}<small>/100</small></strong></div><div className={`signal-card ${decisionClass(rawDecision)}`}><span>{t('decision')}</span><strong>{t(decisionKey(rawDecision))}</strong></div></section>
    <section className="panel chart-panel"><div className="panel-title-row"><div><div className="eyebrow">{t('closedSales')}</div><h2>{t('price48h')}</h2></div><div className="time-tabs"><button className="time-tab">24h</button><button className="time-tab active">48h</button><button className="time-tab">7d</button></div></div><Chart history={item.history} t={t}/></section>
  </main>
}

export default function App() {
  const [mode,setMode] = useState<ScannerMode>('buy')
  const [query,setQuery] = useState('')
  const [minPrice,setMinPrice] = useState(0)
  const [minPotential,setMinPotential] = useState(0)
  const [selected,setSelected] = useState<MarketItem|null>(null)
  const [sortKey,setSortKey] = useState<SortKey>('potential')
  const [sortDirection,setSortDirection] = useState<SortDirection>('desc')
  const [locale,setLocale] = useState<Locale>(() => {
    const saved = localStorage.getItem('frameanalytics-locale')
    if (saved && saved in localeNames) return saved as Locale
    const browser = navigator.language.toLowerCase()
    if (browser.startsWith('zh-tw') || browser.startsWith('zh-hk') || browser.startsWith('zh-mo')) return 'zh-hant'
    if (browser.startsWith('zh')) return 'zh-hans'
    const base = browser.split('-')[0]
    return base in localeNames ? base as Locale : 'en'
  })
  const [theme,setTheme] = useState<Theme>(() => {
    const saved = localStorage.getItem('frameanalytics-theme')
    return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system'
  })
  const t:T = key => translations[locale][key]

  useEffect(() => { localStorage.setItem('frameanalytics-locale',locale); document.documentElement.lang=locale },[locale])
  useEffect(() => {
    localStorage.setItem('frameanalytics-theme',theme)
    const media = matchMedia('(prefers-color-scheme: dark)')
    const apply = () => document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
    apply(); media.addEventListener('change',apply); return () => media.removeEventListener('change',apply)
  },[theme])

  const handleSort = (key:SortKey) => { if (sortKey===key) setSortDirection(v => v==='asc'?'desc':'asc'); else { setSortKey(key); setSortDirection(key==='name'?'asc':'desc') } }
  const indicator = (key:SortKey) => sortKey===key ? (sortDirection==='asc'?'↑':'↓') : ''
  const rows = useMemo(() => items.filter(i => !query.trim() || i.name.toLowerCase().includes(query.trim().toLowerCase())).filter(i => i.current>=minPrice).filter(i => getPotential(i,mode)>=minPotential).sort((a,b) => {
    let r=0
    if(sortKey==='name') r=a.name.localeCompare(b.name,locale)
    if(sortKey==='current') r=a.current-b.current
    if(sortKey==='change1h') r=a.change1h-b.change1h
    if(sortKey==='change24h') r=a.change24h-b.change24h
    if(sortKey==='change7d') r=a.change7d-b.change7d
    if(sortKey==='sales24h') r=a.sales24h-b.sales24h
    if(sortKey==='potential') r=getPotential(a,mode)-getPotential(b,mode)
    if(sortKey==='score') r=getScore(a,mode)-getScore(b,mode)
    if(sortKey==='decision') r=decisionRank(getDecision(a,mode))-decisionRank(getDecision(b,mode))
    if(sortKey==='updated') r=updatedRank(a.updated)-updatedRank(b.updated)
    return sortDirection==='asc'?r:-r
  }),[mode,query,minPrice,minPotential,sortKey,sortDirection,locale])

  return <>
    <div className="background-layer"/><div className="background-shade"/>
    {selected ? <Detail item={selected} mode={mode} onBack={() => setSelected(null)} t={t}/> : <main className="app-shell">
      <header className="topbar"><div><div className="brand-plate"><img src="/assets/frameanalytics-logo.png" alt="FrameAnalytics"/></div><p className="subtitle">{t('subtitle')}</p></div><div className="status-pill"><span className="status-dot"/>{t('dataFresh')}</div></header>
      <section className="mode-tabs"><button className={mode==='buy'?'mode-tab active buy':'mode-tab'} onClick={()=>setMode('buy')}>{t('buy')}</button><button className={mode==='sell'?'mode-tab active sell':'mode-tab'} onClick={()=>setMode('sell')}>{t('sell')}</button></section>
      <section className="panel filters"><label><span>{t('name')}</span><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('searchPlaceholder')}/></label><label><span>{t('minPrice')}</span><div className="input-suffix"><input type="number" min="0" value={minPrice} onChange={e=>setMinPrice(Number(e.target.value))}/><b>p</b></div></label><label><span>{t('potentialFrom')}</span><div className="input-suffix"><input type="number" min="0" value={minPotential} onChange={e=>setMinPotential(Number(e.target.value))}/><b>p</b></div></label></section>
      <section className="results-row"><span>{t('found')}</span><strong>{rows.length}</strong></section>
      <section className="panel table-panel"><div className="table-scroll"><table><thead><tr>{([['name','item'],['current','current'],['change1h','change1h'],['change24h','change24h'],['change7d','change7d'],['sales24h','sales24h'],['potential','potential'],['score','score'],['decision','decision'],['updated','updated']] as [SortKey,TranslationKey][]).map(([key,label]) => <th key={key}><button className="sort-button" onClick={()=>handleSort(key)}><span>{t(label)}</span><span className="sort-indicator">{indicator(key)}</span></button></th>)}</tr></thead><tbody>{rows.map(item => { const p=getPotential(item,mode); const s=getScore(item,mode); const d=getDecision(item,mode); return <tr key={item.id} onClick={()=>setSelected(item)}><td><div className="item-name">{item.name}</div><div className="item-category">{t(categoryKey(item.category))}</div></td><td className="price-cell">{fmtPlat(item.current)}</td><td className={valueClass(item.change1h)}>{fmtPercent(item.change1h)}</td><td className={valueClass(item.change24h)}>{fmtPercent(item.change24h)}</td><td className={valueClass(item.change7d)}>{fmtPercent(item.change7d)}</td><td>{item.sales24h}</td><td><span className={p>0?'potential-badge':'potential-badge muted'}>{p>0?`+${fmtPlat(p)}`:'—'}</span></td><td><span className={`score-badge ${s>=80?'high':s>=60?'mid':'low'}`}>{s}</span></td><td><span className={decisionClass(d)}>{t(decisionKey(d))}</span></td><td className="updated-cell">{item.updated}</td></tr>})}</tbody></table></div></section>
    </main>}
    <FooterBar locale={locale} setLocale={setLocale} theme={theme} setTheme={setTheme} t={t}/>
  </>
}
