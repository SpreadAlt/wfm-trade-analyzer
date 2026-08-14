import { useMemo } from 'react'
import type { Locale } from './i18n'
import type { HistoryPoint, TimeRange } from './types'

const fmtNumber = (value: number, digits = 1) => value.toFixed(digits).replace(/\.0$/, '')
const intlLocale = (locale: Locale) => locale === 'zh-hans' ? 'zh-Hans' : locale === 'zh-hant' ? 'zh-Hant' : locale
const parsePointDate = (value: string) => Date.parse(value.includes('T') ? value : `${value}T00:00:00Z`)

const formatDate = (value: string, locale: Locale, short = false) => {
  const date = new Date(parsePointDate(value))
  if (Number.isNaN(date.getTime())) return value
  const hourly = value.includes('T')
  return new Intl.DateTimeFormat(intlLocale(locale), hourly
    ? { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }
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

export const HistoryChart = ({ history, latestDate, range, locale, labels }: {
  history: HistoryPoint[]
  latestDate: string
  range: TimeRange
  locale: Locale
  labels: { empty: string; chart: string; min: string; median: string; max: string; sales: string }
}) => {
  const cutoff = useMemo(() => {
    const latest = parsePointDate(latestDate)
    if (!Number.isFinite(latest)) return Number.NEGATIVE_INFINITY
    const amount = Number(range.slice(0, -1))
    const duration = range.endsWith('h') ? amount * 60 * 60 * 1000 : Math.max(0, amount - 1) * 24 * 60 * 60 * 1000
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

  return <div className="chart-shell">
    <svg viewBox={`0 0 ${width} ${height}`} className="price-chart" role="img" aria-label={labels.chart}>
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
      {[0, .5, 1].map(ratio => <text key={ratio} x={width - pad.right + 8} y={height - pad.bottom - ratio * volumeBand + 4} className="axis-label sales-axis">{Math.round(volumeMax * ratio)}</text>)}
      {xIndexes.map(index => <text key={index} x={px(index)} y={height - 17} textAnchor="middle" className="axis-label">{formatDate(visible[index]?.date, locale, true)}</text>)}
    </svg>
    <div className="legend"><span><i className="legend-dot min-dot"/>{labels.min}</span><span><i className="legend-dot median-dot"/>{labels.median}</span><span><i className="legend-dot max-dot"/>{labels.max}</span><span><i className="legend-dot volume-dot"/>{labels.sales}</span></div>
  </div>
}
