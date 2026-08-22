import { useMemo, useState } from 'react'
import type { Locale } from './i18n'
import type { HistoryPoint, MarketEvent, TimeRange } from './types'

const fmtNumber = (value: number, digits = 1) => value.toFixed(digits).replace(/\.0$/, '')
const intlLocale = (locale: Locale) => locale === 'zh-hans' ? 'zh-Hans' : locale === 'zh-hant' ? 'zh-Hant' : locale
const parsePointDate = (value: string) => Date.parse(value.includes('T') ? value : `${value}T00:00:00Z`)

const formatDate = (value: string, locale: Locale, short = false) => {
  const date = new Date(parsePointDate(value))
  if (Number.isNaN(date.getTime())) return value
  const hourly = value.includes('T')
  return new Intl.DateTimeFormat(intlLocale(locale), hourly
    ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }
    : short
      ? { day: '2-digit', month: '2-digit', timeZone: 'UTC' }
      : { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(date)
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

export const HistoryChart = ({ history, latestDate, range, locale, labels, events = [] }: {
  history: HistoryPoint[]
  latestDate: string
  range: TimeRange
  locale: Locale
  labels: { empty: string; chart: string; min: string; median: string; max: string; sales: string }
  events?: MarketEvent[]
}) => {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const cutoff = useMemo(() => {
    const latest = parsePointDate(latestDate)
    if (!Number.isFinite(latest)) return Number.NEGATIVE_INFINITY
    const amount = Number(range.slice(0, -1))
    // Changes are calculated against the point exactly N hours/days before
    // the latest point. Keep that reference point visible on the chart too.
    const duration = range.endsWith('h')
      ? amount * 60 * 60 * 1000
      : amount * 24 * 60 * 60 * 1000
    return latest - duration
  }, [latestDate, range])
  const visible = useMemo(() => history.filter(point => parsePointDate(point.date) >= cutoff), [history, cutoff])

  if (!visible.length) return <div className="empty-state chart-empty">{labels.empty}</div>
  const width = 1000
  const height = 430
  const pad = { left: 58, right: 62, top: 24, bottom: 52 }
  const prices = visible.flatMap(point => [point.min, point.median, point.max]).filter((value): value is number => value != null && Number.isFinite(value))
  if (!prices.length) return <div className="empty-state chart-empty">{labels.empty}</div>

  const rawMin = Math.min(...prices)
  const rawMax = Math.max(...prices)
  const pricePad = Math.max(1, (rawMax - rawMin) * .05)
  const priceMin = Math.max(0, Math.floor(rawMin - pricePad))
  const priceMax = Math.max(priceMin + 1, Math.ceil(rawMax + pricePad))
  const volumeMax = Math.max(1, ...visible.map(point => point.sales || 0))
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const volumeBand = innerH * .28
  const px = (index: number) => pad.left + (index / Math.max(1, visible.length - 1)) * innerW
  const py = (value: number) => pad.top + (1 - (value - priceMin) / Math.max(1, priceMax - priceMin)) * innerH
  const xIndexes = Array.from(new Set([0, Math.round((visible.length - 1) * .25), Math.round((visible.length - 1) * .5), Math.round((visible.length - 1) * .75), visible.length - 1]))
  const activeIndex = hoverIndex == null ? null : Math.min(hoverIndex, visible.length - 1)
  const activePoint = activeIndex == null ? null : visible[activeIndex]
  const activeX = activeIndex == null ? 0 : px(activeIndex)
  const tooltipPosition = activeX < width * .25 ? 'start' : activeX > width * .75 ? 'end' : 'center'
  const visibleEvents = events.filter(event => {
    const at = Date.parse(event.startAt || '')
    return Number.isFinite(at) && at >= parsePointDate(visible[0].date) && at <= parsePointDate(visible[visible.length - 1].date)
  }).map(event => {
    const eventAt = Date.parse(event.startAt || '')
    let nearest = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    visible.forEach((point, index) => {
      const distance = Math.abs(parsePointDate(point.date) - eventAt)
      if (distance < nearestDistance) { nearest = index; nearestDistance = distance }
    })
    return { event, x: px(nearest) }
  })

  const updateHover = (clientX: number, bounds: DOMRect) => {
    const viewX = (clientX - bounds.left) * width / Math.max(1, bounds.width)
    const ratio = (viewX - pad.left) / innerW
    setHoverIndex(Math.max(0, Math.min(visible.length - 1, Math.round(ratio * (visible.length - 1)))))
  }

  return <div className="chart-shell">
    <svg viewBox={`0 0 ${width} ${height}`} className="price-chart" role="img" aria-label={labels.chart} tabIndex={0}
      onPointerMove={event => updateHover(event.clientX, event.currentTarget.getBoundingClientRect())}
      onPointerLeave={() => setHoverIndex(null)}
      onBlur={() => setHoverIndex(null)}
      onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        setHoverIndex(current => Math.max(0, Math.min(visible.length - 1, (current ?? visible.length - 1) + (event.key === 'ArrowRight' ? 1 : -1))))
      }}>
      {[0, .25, .5, .75, 1].map(ratio => {
        const y = pad.top + ratio * innerH
        return <g key={ratio}><line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="grid-line"/><text x="8" y={y + 4} className="axis-label">{fmtNumber(priceMax - ratio * (priceMax - priceMin), 0)}</text></g>
      })}
      {visible.map((point, index) => {
        const barW = Math.max(2, innerW / Math.max(1, visible.length) - 3)
        const barH = (point.sales / volumeMax) * volumeBand
        return <rect key={`${point.date}-${index}`} x={px(index) - barW / 2} y={height - pad.bottom - barH} width={barW} height={barH} rx="2" className="volume-bar"><title>{`${formatDate(point.date, locale)} · ${labels.sales}: ${point.sales}`}</title></rect>
      })}
      <path d={buildLinePath(visible, 'min', px, py)} className="line min-line"/>
      <path d={buildLinePath(visible, 'median', px, py)} className="line median-line"/>
      <path d={buildLinePath(visible, 'max', px, py)} className="line max-line"/>
      {visibleEvents.map(({ event, x }) => <g key={event.fingerprint} className={`chart-event-marker ${event.eventType}`}>
        <line x1={x} x2={x} y1={pad.top} y2={height - pad.bottom} className="event-guide"/>
        <circle cx={x} cy={pad.top + 10} r="8" className="event-node"/>
        <text x={x} y={pad.top + 14} textAnchor="middle" className="event-symbol">{event.eventType === 'baro' ? 'B' : 'P'}</text>
        <title>{`${event.eventType === 'baro' ? "Baro Ki'Teer" : 'Prime Resurgence'} · ${formatDate(event.startAt || '', locale)}`}</title>
      </g>)}
      {activePoint ? <g className="chart-hover" aria-hidden="true">
        <line x1={activeX} x2={activeX} y1={pad.top} y2={height - pad.bottom} className="hover-guide"/>
        {(['min', 'median', 'max'] as const).map(key => activePoint[key] == null ? null : <circle key={key} cx={activeX} cy={py(activePoint[key]!)} r="5" className={`hover-point ${key}-point`}/>)}</g> : null}
      {[0, .5, 1].map(ratio => <text key={ratio} x={width - pad.right + 8} y={height - pad.bottom - ratio * volumeBand + 4} className="axis-label sales-axis">{Math.round(volumeMax * ratio)}</text>)}
      {xIndexes.map(index => <text key={index} x={px(index)} y={height - 17} textAnchor="middle" className="axis-label">{formatDate(visible[index]?.date, locale, true)}</text>)}
    </svg>
    {activePoint ? <div className={`chart-tooltip tooltip-${tooltipPosition}`} style={{ left: `${activeX / width * 100}%` }}>
      <strong>{formatDate(activePoint.date, locale)}</strong>
      <span><i className="tooltip-dot min-dot"/>{labels.min}<b>{activePoint.min == null ? '—' : fmtNumber(activePoint.min)}p</b></span>
      <span><i className="tooltip-dot median-dot"/>{labels.median}<b>{activePoint.median == null ? '—' : fmtNumber(activePoint.median)}p</b></span>
      <span><i className="tooltip-dot max-dot"/>{labels.max}<b>{activePoint.max == null ? '—' : fmtNumber(activePoint.max)}p</b></span>
      <span><i className="tooltip-dot volume-dot"/>{labels.sales}<b>{activePoint.sales}</b></span>
    </div> : null}
    <div className="legend"><span><i className="legend-dot min-dot"/>{labels.min}</span><span><i className="legend-dot median-dot"/>{labels.median}</span><span><i className="legend-dot max-dot"/>{labels.max}</span><span><i className="legend-dot volume-dot"/>{labels.sales}</span></div>
  </div>
}
