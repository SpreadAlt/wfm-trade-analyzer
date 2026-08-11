import { useMemo, useState } from 'react'
import { items } from './data'
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

const Chart = ({ history }: { history: HistoryPoint[] }) => {
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
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = pad.top + t * innerH
          const value = priceMax - t * (priceMax - priceMin)
          return (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="grid-line" />
              <text x={8} y={y + 4} className="axis-label">{value.toFixed(0)}</text>
            </g>
          )
        })}
        {history.map((p, i) => {
          const barW = Math.max(2, innerW / history.length - 3)
          const h = (p.volume / volumeMax) * 78
          return <rect key={p.label} x={px(i) - barW / 2} y={height - pad.bottom - h} width={barW} height={h} fill="url(#volumeFill)" rx="2" />
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
        <span><i className="legend-dot min-dot" />Мин</span>
        <span><i className="legend-dot median-dot" />Медиана</span>
        <span><i className="legend-dot max-dot" />Макс</span>
        <span><i className="legend-dot volume-dot" />Продажи</span>
      </div>
    </div>
  )
}

const Detail = ({ item, mode, onBack }: { item: MarketItem; mode: ScannerMode; onBack: () => void }) => {
  const potential = getPotential(item, mode)
  const score = getScore(item, mode)
  const decision = getDecision(item, mode)

  return (
    <main className="app-shell">
      <button className="back-button" onClick={onBack}>← Назад к сканеру</button>
      <section className="detail-header">
        <div>
          <div className="eyebrow">{item.category}</div>
          <h1>{item.name}</h1>
          <div className="price-big">{fmtPlat(item.current)}</div>
        </div>
        <div className="updated-card">
          <span>Обновлено</span>
          <strong>{item.updated}</strong>
        </div>
      </section>

      <section className="metric-grid">
        <div className="metric-card"><span>Изм. 1ч</span><strong className={valueClass(item.change1h)}>{fmtPercent(item.change1h)}</strong></div>
        <div className="metric-card"><span>Изм. 24ч</span><strong className={valueClass(item.change24h)}>{fmtPercent(item.change24h)}</strong></div>
        <div className="metric-card"><span>Изм. 7д</span><strong className={valueClass(item.change7d)}>{fmtPercent(item.change7d)}</strong></div>
        <div className="metric-card"><span>Продажа 24ч</span><strong>{item.sales24h}</strong></div>
      </section>

      <section className="signal-grid">
        <div className="signal-card potential-card">
          <span>{mode === 'buy' ? 'Потенциал покупки' : 'Потенциал продажи'}</span>
          <strong>+{fmtPlat(potential)}</strong>
        </div>
        <div className="signal-card score-card">
          <span>Оценка</span>
          <strong>{score}<small>/100</small></strong>
        </div>
        <div className={`signal-card ${decisionClass(decision)}`}>
          <span>Решение</span>
          <strong>{decision}</strong>
        </div>
      </section>

      <section className="panel chart-panel">
        <div className="panel-title-row">
          <div>
            <div className="eyebrow">Закрытые продажи</div>
            <h2>Цена за последние 48 часов</h2>
          </div>
          <div className="time-tabs">
            <button className="time-tab">24ч</button>
            <button className="time-tab active">48ч</button>
            <button className="time-tab">7д</button>
          </div>
        </div>
        <Chart history={item.history} />
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
    return sortDirection === 'asc' ? ' ↑' : ' ↓'
  }

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((item) => !q || item.name.toLowerCase().includes(q))
      .filter((item) => item.current >= minPrice)
      .filter((item) => getPotential(item, mode) >= minPotential)
      .sort((a, b) => {
        let result = 0

        if (sortKey === 'name') result = a.name.localeCompare(b.name, 'ru')
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
  }, [mode, query, minPrice, minPotential, sortKey, sortDirection])

  if (selected) {
    return <Detail item={selected} mode={mode} onBack={() => setSelected(null)} />
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-row">
            <div className="brand-mark">W</div>
            <div>
              <div className="eyebrow">Warframe Market analytics</div>
              <h1>WFM Trade Analyzer</h1>
            </div>
          </div>
          <p className="subtitle">Поиск сильных зон покупки и продажи по закрытой статистике рынка.</p>
        </div>
        <div className="status-pill"><span className="status-dot" /> Данные актуальны</div>
      </header>

      <section className="mode-tabs">
        <button className={mode === 'buy' ? 'mode-tab active buy' : 'mode-tab'} onClick={() => setMode('buy')}>Покупка</button>
        <button className={mode === 'sell' ? 'mode-tab active sell' : 'mode-tab'} onClick={() => setMode('sell')}>Продажа</button>
      </section>

      <section className="panel filters filters-compact">
        <label className="search-field">
          <span>Название</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Название предмета..." />
        </label>
        <label>
          <span>Минимальная цена</span>
          <div className="input-suffix"><input type="number" min="0" value={minPrice} onChange={(e) => setMinPrice(Number(e.target.value))} /><b>p</b></div>
        </label>
        <label>
          <span>Потенциал от</span>
          <div className="input-suffix"><input type="number" min="0" value={minPotential} onChange={(e) => setMinPotential(Number(e.target.value))} /><b>p</b></div>
        </label>
      </section>

      <section className="results-row">
        <span>Найдено</span>
        <strong>{rows.length}</strong>
      </section>

      <section className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th><button className="sort-button" onClick={() => handleSort('name')}>Предмет{sortIndicator('name')}</button></th>
                <th><button className="sort-button" onClick={() => handleSort('current')}>Сейчас{sortIndicator('current')}</button></th>
                <th><button className="sort-button" onClick={() => handleSort('change1h')}>Изм. 1ч{sortIndicator('change1h')}</button></th>
                <th><button className="sort-button" onClick={() => handleSort('change24h')}>Изм. 24ч{sortIndicator('change24h')}</button></th>
                <th><button className="sort-button" onClick={() => handleSort('change7d')}>Изм. 7д{sortIndicator('change7d')}</button></th>
                <th><button className="sort-button" onClick={() => handleSort('sales24h')}>Продажа 24ч{sortIndicator('sales24h')}</button></th>
                <th><button className="sort-button" onClick={() => handleSort('potential')}>Потенциал{sortIndicator('potential')}</button></th>
                <th><button className="sort-button" onClick={() => handleSort('score')}>Оценка{sortIndicator('score')}</button></th>
                <th><button className="sort-button" onClick={() => handleSort('decision')}>Решение{sortIndicator('decision')}</button></th>
                <th><button className="sort-button" onClick={() => handleSort('updated')}>Обновлено{sortIndicator('updated')}</button></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const potential = getPotential(item, mode)
                const score = getScore(item, mode)
                const decision = getDecision(item, mode)
                return (
                  <tr key={item.id} onClick={() => setSelected(item)}>
                    <td>
                      <div className="item-name">{item.name}</div>
                      <div className="item-category">{item.category}</div>
                    </td>
                    <td className="price-cell">{fmtPlat(item.current)}</td>
                    <td className={valueClass(item.change1h)}>{fmtPercent(item.change1h)}</td>
                    <td className={valueClass(item.change24h)}>{fmtPercent(item.change24h)}</td>
                    <td className={valueClass(item.change7d)}>{fmtPercent(item.change7d)}</td>
                    <td>{item.sales24h}</td>
                    <td><span className={potential > 0 ? 'potential-badge' : 'potential-badge muted'}>{potential > 0 ? `+${fmtPlat(potential)}` : '—'}</span></td>
                    <td><span className={`score-badge ${score >= 80 ? 'high' : score >= 60 ? 'mid' : 'low'}`}>{score}</span></td>
                    <td><span className={decisionClass(decision)}>{decision}</span></td>
                    <td className="updated-cell">{item.updated}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
