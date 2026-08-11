import { useMemo, useState } from 'react'
import { items } from './data'
import type { HistoryPoint, MarketItem, ScannerMode } from './types'

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
  const potential = mode === 'buy' ? item.buyPotential : item.sellPotential
  const score = mode === 'buy' ? item.buyScore : item.sellScore
  const decision = mode === 'buy' ? item.buyDecision : item.sellDecision

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
  const [minPotential, setMinPotential] = useState(0)
  const [minSales, setMinSales] = useState(0)
  const [minScore, setMinScore] = useState(0)
  const [selected, setSelected] = useState<MarketItem | null>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return items
      .filter((item) => !q || item.name.toLowerCase().includes(q) || item.category.toLowerCase().includes(q))
      .filter((item) => (mode === 'buy' ? item.buyPotential : item.sellPotential) >= minPotential)
      .filter((item) => item.sales24h >= minSales)
      .filter((item) => (mode === 'buy' ? item.buyScore : item.sellScore) >= minScore)
      .sort((a, b) => {
        const pa = mode === 'buy' ? a.buyPotential : a.sellPotential
        const pb = mode === 'buy' ? b.buyPotential : b.sellPotential
        return pb - pa
      })
  }, [mode, query, minPotential, minSales, minScore])

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

      <section className="panel filters">
        <label className="search-field">
          <span>Поиск</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Название предмета..." />
        </label>
        <label>
          <span>Потенциал от</span>
          <div className="input-suffix"><input type="number" min="0" value={minPotential} onChange={(e) => setMinPotential(Number(e.target.value))} /><b>p</b></div>
        </label>
        <label>
          <span>Продажа 24ч от</span>
          <input type="number" min="0" value={minSales} onChange={(e) => setMinSales(Number(e.target.value))} />
        </label>
        <label>
          <span>Оценка от</span>
          <input type="number" min="0" max="100" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))} />
        </label>
      </section>

      <section className="summary-row">
        <div><span>Найдено</span><strong>{rows.length}</strong></div>
        <div><span>Режим</span><strong>{mode === 'buy' ? 'Покупка' : 'Продажа'}</strong></div>
        <div><span>Сортировка</span><strong>Потенциал ↓</strong></div>
      </section>

      <section className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Предмет</th>
                <th>Сейчас</th>
                <th>Изм. 1ч</th>
                <th>Изм. 24ч</th>
                <th>Изм. 7д</th>
                <th>Продажа 24ч</th>
                <th>Потенциал</th>
                <th>Оценка</th>
                <th>Решение</th>
                <th>Обновлено</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const potential = mode === 'buy' ? item.buyPotential : item.sellPotential
                const score = mode === 'buy' ? item.buyScore : item.sellScore
                const decision = mode === 'buy' ? item.buyDecision : item.sellDecision
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
