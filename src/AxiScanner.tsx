import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Locale } from './i18n'
import type { CatalogItem } from './types'
import { ItemIcon } from './MarketVisuals'
import { accountRequestJson } from './Account'
import './developer.css'
import './axiScanner.css'

type AxiScanType = 'axi-rare' | 'prime-sets'
type MarkupKind = 'percent' | 'platinum'
type MarkupSettings = { kind: MarkupKind; value: number }

type AxiStart = { ok: true; jobId: string; state: string; reused?: boolean; queuedAt: string; expiresAt: string; durationMinutes?: number; scanType?: AxiScanType; markup?: MarkupSettings; minimumAverage24h?: number; progress?: AxiJobStatus['progress']; error?: string | null }
type AxiStop = { ok: true; jobId: string; state: 'cancelled'; stoppedAt: string }
type AxiJobStatus = { ok: true; jobId: string; state: string; expiresAt: string; scanType?: AxiScanType; markup?: MarkupSettings; minimumAverage24h?: number; progress?: { stage?: string; processed?: number; total?: number; percent?: number; cycle?: number; completedCycles?: number }; error?: string | null }
type AxiRareRow = {
  rowType?: 'axi-rare'
  relationId: string
  relic: { id: string; slug: string; name: string; sales30d: number }
  reward: { id: string; slug: string; name: string; itemCount: number }
  relicPrice: number | null
  rewardPrice: number | null
  rewardLotPrice?: number | null
  ratio: number | null
  spread?: number | null
  possibleProfit?: number | null
  markupPercent?: number | null
  markupPlatinum?: number | null
  matchesMarkup?: boolean
  reward24hVolume?: number | null
  reward24hPoints?: number | null
  rewardPriceSource?: string | null
  relicSellers?: number
  rewardSellers?: number
  fetchedAt: string
  error?: string | null
}
type PrimeSetRow = {
  rowType: 'prime-set'
  relationId: string
  item: { id: string; slug: string; name: string; sales30d: number }
  purchasePrice: number | null
  averagePrice24h: number | null
  possibleProfit: number | null
  markupPercent: number | null
  markupPlatinum: number | null
  matchesMarkup: boolean
  sales24h: number | null
  onlineSellers: number
  visibleSellers: number
  fetchedAt: string
  error?: string | null
}
type AxiRow = AxiRareRow | PrimeSetRow
type AxiResult = {
  ok: true
  jobId: string
  state: string
  scanType?: AxiScanType
  markup?: MarkupSettings
  minimumAverage24h?: number
  filteredByMinimumAverage24h?: number
  generatedAt: string | null
  expiresAt: string
  cycle: number
  completedCycles?: number
  activeRelics: number
  activeItems?: number
  activeRelations?: number
  excludedRelics: number
  excludedItems?: number
  scannedRelations?: number
  rows: AxiRow[]
}

const JOB_KEY_PREFIX = 'frameanalytics-axi-scanner-job:'
const SCAN_TYPE_KEY = 'frameanalytics-axi-scanner-type'
const DURATION_KEY = 'frameanalytics-axi-scanner-duration'
const MARKUP_KEY_PREFIX = 'frameanalytics-axi-scanner-markup:'
const MINIMUM_AVERAGE_KEY_PREFIX = 'frameanalytics-axi-scanner-minimum-average-24h:'
const DURATION_OPTIONS = [15, 30, 60, 120, 240, 480, 1440] as const
const DEFAULT_MARKUP: Record<AxiScanType, MarkupSettings> = {
  'axi-rare': { kind: 'percent', value: 900 },
  'prime-sets': { kind: 'platinum', value: 20 }
}
const fmt = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: digits })
const plat = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${fmt(value)}p`
const pct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${fmt(value, 1)}%`
const time = (value: string | null | undefined, locale: Locale) => {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })
}
const readMarkup = (scanType: AxiScanType): MarkupSettings => {
  try {
    const stored = JSON.parse(localStorage.getItem(`${MARKUP_KEY_PREFIX}${scanType}`) || 'null') as Partial<MarkupSettings> | null
    const kind = stored?.kind === 'percent' || stored?.kind === 'platinum' ? stored.kind : DEFAULT_MARKUP[scanType].kind
    const value = Number(stored?.value)
    return { kind, value: Number.isFinite(value) && value >= 0 ? value : DEFAULT_MARKUP[scanType].value }
  } catch {
    return DEFAULT_MARKUP[scanType]
  }
}
const readMinimumAverage24h = (scanType: AxiScanType) => {
  const value = Number(localStorage.getItem(`${MINIMUM_AVERAGE_KEY_PREFIX}${scanType}`))
  return Number.isFinite(value) && value >= 0 ? value : 0
}
const isPrimeSetRow = (row: AxiRow): row is PrimeSetRow => row.rowType === 'prime-set'

export const AxiScannerPage = ({ locale, catalog, onBack }: { locale: Locale; catalog: Map<string, CatalogItem>; onBack: () => void }) => {
  const ru = locale === 'ru'
  const initialType: AxiScanType = localStorage.getItem(SCAN_TYPE_KEY) === 'prime-sets' ? 'prime-sets' : 'axi-rare'
  const [scanType, setScanTypeState] = useState<AxiScanType>(initialType)
  const [jobId, setJobId] = useState(() => sessionStorage.getItem(`${JOB_KEY_PREFIX}${initialType}`) || '')
  const [status, setStatus] = useState<AxiJobStatus | null>(null)
  const [result, setResult] = useState<AxiResult | null>(null)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [durationMinutes, setDurationMinutes] = useState<number>(() => {
    const stored = Number(localStorage.getItem(DURATION_KEY))
    return DURATION_OPTIONS.includes(stored as typeof DURATION_OPTIONS[number]) ? stored : 60
  })
  const [markupByType, setMarkupByType] = useState<Record<AxiScanType, MarkupSettings>>(() => ({
    'axi-rare': readMarkup('axi-rare'),
    'prime-sets': readMarkup('prime-sets')
  }))
  const [minimumAverageByType, setMinimumAverageByType] = useState<Record<AxiScanType, number>>(() => ({
    'axi-rare': readMinimumAverage24h('axi-rare'),
    'prime-sets': readMinimumAverage24h('prime-sets')
  }))
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => typeof Notification !== 'undefined' && Notification.permission === 'granted')
  const [error, setError] = useState<string | null>(null)
  const markup = markupByType[scanType]
  const minimumAverage24h = minimumAverageByType[scanType]

  const refresh = useCallback(async (id: string) => {
    const nextStatus = await accountRequestJson<AxiJobStatus>(`/api/axi-scanner/status?id=${encodeURIComponent(id)}`)
    setStatus(nextStatus)
    const nextResult = await accountRequestJson<AxiResult>(`/api/axi-scanner/result?id=${encodeURIComponent(id)}`)
    setResult(nextResult)
    setError(null)
    return nextStatus
  }, [])

  useEffect(() => {
    if (!jobId) return
    let stopped = false
    let timer = 0
    const poll = async () => {
      try {
        const next = await refresh(jobId)
        if (!stopped && !['completed', 'failed', 'cancelled'].includes(next.state)) timer = window.setTimeout(poll, 5000)
      } catch (value) {
        if (!stopped) {
          setError(value instanceof Error ? value.message : String(value))
          timer = window.setTimeout(poll, 10000)
        }
      }
    }
    timer = window.setTimeout(poll, 1500)
    return () => { stopped = true; window.clearTimeout(timer) }
  }, [jobId, refresh])

  const selectScanType = (nextType: AxiScanType) => {
    if (nextType === scanType) return
    localStorage.setItem(SCAN_TYPE_KEY, nextType)
    setScanTypeState(nextType)
    setStatus(null)
    setResult(null)
    setError(null)
    setJobId(sessionStorage.getItem(`${JOB_KEY_PREFIX}${nextType}`) || '')
  }

  const updateMarkup = (patch: Partial<MarkupSettings>) => {
    setMarkupByType(current => {
      const next = { ...current[scanType], ...patch }
      const normalized = { kind: next.kind, value: Math.max(0, Number(next.value) || 0) }
      localStorage.setItem(`${MARKUP_KEY_PREFIX}${scanType}`, JSON.stringify(normalized))
      return { ...current, [scanType]: normalized }
    })
  }

  const updateMinimumAverage24h = (value: number) => {
    const normalized = Math.max(0, Number(value) || 0)
    localStorage.setItem(`${MINIMUM_AVERAGE_KEY_PREFIX}${scanType}`, String(normalized))
    setMinimumAverageByType(current => ({ ...current, [scanType]: normalized }))
  }

  const start = async () => {
    setStarting(true)
    setError(null)
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        const permission = await Notification.requestPermission()
        setNotificationsEnabled(permission === 'granted')
      }
      localStorage.setItem(DURATION_KEY, String(durationMinutes))
      const next = await accountRequestJson<AxiStart>('/api/axi-scanner/start', {
        method: 'POST',
        body: JSON.stringify({ durationMinutes, scanType, markupKind: markup.kind, markupValue: markup.value, minimumAverage24h })
      })
      sessionStorage.setItem(`${JOB_KEY_PREFIX}${scanType}`, next.jobId)
      setJobId(next.jobId)
      setStatus({
        ok: true,
        jobId: next.jobId,
        state: next.state,
        expiresAt: next.expiresAt,
        scanType: next.scanType || scanType,
        markup: next.markup || markup,
        minimumAverage24h: next.minimumAverage24h ?? minimumAverage24h,
        progress: next.progress,
        error: next.error || null
      })
      setResult(null)
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    } finally {
      setStarting(false)
    }
  }

  const stop = async () => {
    if (!jobId) return
    setStopping(true)
    setError(null)
    try {
      await accountRequestJson<AxiStop>(`/api/axi-scanner/stop?id=${encodeURIComponent(jobId)}`, { method: 'POST', body: '{}' })
      await refresh(jobId)
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    } finally {
      setStopping(false)
    }
  }

  const enableNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setError(ru ? 'Этот браузер не поддерживает уведомления.' : 'This browser does not support notifications.')
      return
    }
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    setNotificationsEnabled(permission === 'granted')
    if (permission === 'denied') setError(ru ? 'Уведомления заблокированы в настройках браузера.' : 'Notifications are blocked in browser settings.')
  }

  const rows = useMemo(() => [...(result?.rows || [])].sort((left, right) => (right.markupPercent ?? -Infinity) - (left.markupPercent ?? -Infinity)), [result])
  const running = Boolean(jobId && status && !['completed', 'failed', 'cancelled'].includes(status.state))
  const remainingMinutes = result?.expiresAt ? Math.max(0, Math.ceil((Date.parse(result.expiresAt) - Date.now()) / 60000)) : null
  const stateLabel = status?.state === 'running' ? (ru ? 'Сканирование' : 'Running')
    : status?.state === 'queued' ? (ru ? 'В очереди' : 'Queued')
      : status?.state === 'completed' ? (ru ? 'Завершено' : 'Completed')
        : status?.state === 'cancelled' ? (ru ? 'Остановлено' : 'Stopped')
          : status?.state === 'failed' ? (ru ? 'Ошибка' : 'Failed')
            : (ru ? 'Не запущен' : 'Not started')
  const durationLabel = (minutes: number) => minutes < 60
    ? `${minutes} ${ru ? 'мин' : 'min'}`
    : minutes === 60
      ? (ru ? '1 час' : '1 hour')
      : minutes < 1440
        ? `${minutes / 60} ${ru ? 'ч' : 'h'}`
        : (ru ? '24 часа' : '24 hours')

  useEffect(() => {
    if (!jobId || !notificationsEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const storageKey = `frameanalytics-axi-alerted:${jobId}`
    const alerted = new Set<string>(JSON.parse(sessionStorage.getItem(storageKey) || '[]'))
    const candidates = rows.filter(row => row.matchesMarkup === true && !alerted.has(row.relationId))
    for (const row of candidates) {
      if (isPrimeSetRow(row)) {
        const item = catalog.get(row.item.id)
        new Notification(`Prime Set: +${plat(row.possibleProfit)}`, {
          body: `${item?.name || row.item.name}: ${plat(row.purchasePrice)} → ${plat(row.averagePrice24h)} (${pct(row.markupPercent)})`,
          icon: item?.thumb || item?.icon || '/assets/favicon.png',
          tag: `prime-set-${jobId}-${row.relationId}`
        })
      } else {
        const relicItem = catalog.get(row.relic.id)
        const rewardItem = catalog.get(row.reward.id)
        new Notification(`Axi: +${plat(row.possibleProfit ?? row.spread)}`, {
          body: `${relicItem?.name || row.relic.name}: ${plat(row.relicPrice)} → ${rewardItem?.name || row.reward.name}: ${plat(row.rewardLotPrice ?? row.rewardPrice)} (${pct(row.markupPercent)})`,
          icon: rewardItem?.thumb || rewardItem?.icon || relicItem?.thumb || relicItem?.icon || '/assets/favicon.png',
          tag: `axi-${jobId}-${row.relationId}`
        })
      }
      alerted.add(row.relationId)
    }
    if (candidates.length) sessionStorage.setItem(storageKey, JSON.stringify([...alerted]))
  }, [catalog, jobId, notificationsEnabled, rows])

  const modeDescription = scanType === 'axi-rare'
    ? (ru ? 'Сравнивает цену неповреждённой реликвии Акси со средней ценой её золотой награды за 24 часа.' : 'Compares an intact Axi relic with its rare reward’s 24h average price.')
    : (ru ? 'Сравнивает минимальный онлайн sell-order Prime Set со средней ценой закрытых продаж за 24 часа.' : 'Compares each Prime Set’s minimum online sell order with its 24h closed-sale average.')

  return <main className="app-shell axi-shell">
    <div className="detail-navigation"><a className="brand-plate detail-brand" href="/" aria-label="FrameAnalytics — home"><img src="/assets/frameanalytics-logo.png" alt="FrameAnalytics"/></a><button type="button" className="back-button" onClick={onBack}>← {ru ? 'К профилю' : 'Back to profile'}</button></div>
    <section className="panel axi-heading">
      <div><span className="eyebrow">Axi · Prime market</span><h1>{ru ? 'Сканер Axi и Prime Set' : 'Axi and Prime Set scanner'}</h1><p>{modeDescription}</p></div>
      <div className="axi-heading-actions">
        <label className="axi-duration"><span>{ru ? 'Время сканирования' : 'Scan duration'}</span><select value={durationMinutes} disabled={running || starting} onChange={event => setDurationMinutes(Number(event.target.value))}>{DURATION_OPTIONS.map(minutes => <option value={minutes} key={minutes}>{durationLabel(minutes)}</option>)}</select></label>
        <button type="button" className={`secondary-action axi-notification ${notificationsEnabled ? 'active' : ''}`} onClick={() => void enableNotifications()} aria-pressed={notificationsEnabled}>🔔 <span>{notificationsEnabled ? (ru ? 'Уведомления включены' : 'Notifications on') : (ru ? 'Включить уведомления' : 'Enable alerts')}</span></button>
        {running ? <button type="button" className="secondary-action axi-stop" disabled={stopping} onClick={() => void stop()}>{stopping ? (ru ? 'Остановка…' : 'Stopping…') : (ru ? 'Остановить' : 'Stop')}</button> : <button type="button" className="primary-action axi-start" disabled={starting} onClick={() => void start()}>{starting ? (ru ? 'Запуск…' : 'Starting…') : `${ru ? 'Запустить на' : 'Run for'} ${durationLabel(durationMinutes)}`}</button>}
      </div>
    </section>
    <section className="panel axi-settings">
      <div className="axi-mode-tabs" role="tablist" aria-label={ru ? 'Тип сканирования' : 'Scan type'}>
        <button type="button" className={scanType === 'axi-rare' ? 'active' : ''} disabled={running || starting} onClick={() => selectScanType('axi-rare')}>{ru ? 'Axi: золотые награды' : 'Axi rare rewards'}</button>
        <button type="button" className={scanType === 'prime-sets' ? 'active' : ''} disabled={running || starting} onClick={() => selectScanType('prime-sets')}>{ru ? 'Prime комплекты' : 'Prime Sets'}</button>
      </div>
      <div className="axi-markup-setting">
        <span>{ru ? 'Минимальная наценка для уведомления' : 'Minimum alert markup'}</span>
        <div><input type="number" min="0" step="1" value={markup.value} disabled={running || starting} onChange={event => updateMarkup({ value: Number(event.target.value) })}/><select value={markup.kind} disabled={running || starting} onChange={event => updateMarkup({ kind: event.target.value as MarkupKind })}><option value="percent">%</option><option value="platinum">{ru ? 'платина' : 'platinum'}</option></select></div>
        <small>{scanType === 'axi-rare' ? (ru ? 'Считается от цены реликвии.' : 'Calculated from the relic price.') : (ru ? 'Считается от минимального онлайн-ордера комплекта.' : 'Calculated from the set’s minimum online order.')}</small>
      </div>
      <div className="axi-markup-setting axi-average-setting">
        <span>{ru ? 'Мин. средняя цена за 24ч' : 'Minimum 24h average price'}</span>
        <div><input type="number" min="0" step="1" value={minimumAverage24h} disabled={running || starting} onChange={event => updateMinimumAverage24h(Number(event.target.value))}/><span className="axi-setting-unit">p</span></div>
        <small>{ru ? 'Предметы дешевле значения не запрашивают ордера WFM. Лоты по 1–3p всегда игнорируются.' : 'Items below this value skip WFM order requests. Listings priced at 1–3p are always ignored.'}</small>
      </div>
    </section>
    {error ? <div className="account-message error">{error}</div> : null}
    <section className="axi-status-grid">
      <article className="panel"><span>{ru ? 'Состояние' : 'State'}</span><strong>{stateLabel}</strong><small>{status?.progress?.stage || '—'}</small></article>
      <article className="panel"><span>{scanType === 'axi-rare' ? (ru ? 'Активные реликвии' : 'Active relics') : (ru ? 'Prime комплекты' : 'Prime Sets')}</span><strong>{scanType === 'axi-rare' ? result?.activeRelics ?? '—' : result?.activeItems ?? '—'}</strong><small>{ru ? `Исключено: ${scanType === 'axi-rare' ? result?.excludedRelics ?? '—' : result?.excludedItems ?? '—'} · фильтр 24ч: ${result?.filteredByMinimumAverage24h ?? 0}` : `Excluded: ${scanType === 'axi-rare' ? result?.excludedRelics ?? '—' : result?.excludedItems ?? '—'} · 24h filter: ${result?.filteredByMinimumAverage24h ?? 0}`}</small></article>
      <article className="panel"><span>{ru ? 'Проход' : 'Cycle'}</span><strong>{result?.cycle || status?.progress?.cycle || '—'}</strong><small>{ru ? `Завершено: ${result?.completedCycles ?? status?.progress?.completedCycles ?? 0}` : `Completed: ${result?.completedCycles ?? status?.progress?.completedCycles ?? 0}`}</small></article>
      <article className="panel"><span>{ru ? 'Осталось' : 'Remaining'}</span><strong>{remainingMinutes == null ? '—' : `${remainingMinutes} ${ru ? 'мин' : 'min'}`}</strong><small>{time(result?.generatedAt, locale)}</small></article>
    </section>
    {scanType === 'axi-rare' ? <section className="panel table-panel axi-table-panel"><div className="table-scroll"><table className="axi-table"><thead><tr><th>{ru ? 'Реликвия' : 'Relic'}</th><th>{ru ? 'Золотая награда' : 'Rare reward'}</th><th>{ru ? 'Продажи 30д' : '30d sales'}</th><th>{ru ? 'Реликвия · онлайн мин.' : 'Relic · online minimum'}</th><th>{ru ? 'Награда · средняя 24ч' : 'Reward · 24h average'}</th><th>{ru ? 'Наценка' : 'Markup'}</th><th>{ru ? 'Возможная прибыль' : 'Possible profit'}</th><th>{ru ? 'Обновлено' : 'Updated'}</th></tr></thead><tbody>
      {!jobId ? <tr><td colSpan={8} className="state-cell">{ru ? 'Выберите настройки и запустите сканирование.' : 'Choose settings and start a scan.'}</td></tr> : !rows.length ? <tr><td colSpan={8} className="state-cell"><div className="spinner"/>{ru ? 'Подготавливаем пары и проверяем ликвидность…' : 'Preparing pairs and checking liquidity…'}</td></tr> : rows.filter(row => !isPrimeSetRow(row)).map(row => {
        const relicItem = catalog.get(row.relic.id)
        const rewardItem = catalog.get(row.reward.id)
        const possibleProfit = row.possibleProfit ?? row.spread
        return <tr key={row.relationId} className={`${row.error ? 'axi-row-error' : ''} ${row.matchesMarkup ? 'axi-row-match' : ''}`}>
          <td><a className="axi-item" href={`/items/${encodeURIComponent(relicItem?.slug || row.relic.slug)}?id=${encodeURIComponent(row.relic.id)}&variant=${encodeURIComponent('subtype=intact')}`}><ItemIcon item={relicItem} name={relicItem?.name || row.relic.name}/><span><strong>{relicItem?.name || row.relic.name}</strong><small>{ru ? 'Неповреждённая' : 'Intact'}</small></span></a></td>
          <td><a className="axi-item" href={`/items/${encodeURIComponent(rewardItem?.slug || row.reward.slug)}?id=${encodeURIComponent(row.reward.id)}`}><ItemIcon item={rewardItem} name={rewardItem?.name || row.reward.name}/><span><strong>{rewardItem?.name || row.reward.name}</strong>{row.reward.itemCount > 1 ? <small>×{row.reward.itemCount}</small> : null}</span></a></td>
          <td>{fmt(row.relic.sales30d, 0)}</td><td>{plat(row.relicPrice)}</td><td title={row.reward24hVolume != null ? `${fmt(row.reward24hVolume, 0)} / 24h` : undefined}>{plat(row.rewardLotPrice ?? row.rewardPrice)}</td><td><strong className={`axi-ratio ${row.matchesMarkup ? 'axi-ratio-alert' : ''}`}>{pct(row.markupPercent)}</strong><small>{plat(row.markupPlatinum ?? possibleProfit)}</small></td><td><strong className={(possibleProfit ?? 0) > 0 ? 'axi-profit-positive' : ''}>{possibleProfit == null ? '—' : `${possibleProfit > 0 ? '+' : ''}${plat(possibleProfit)}`}</strong></td><td><span title={row.error || undefined}>{time(row.fetchedAt, locale)}</span></td>
        </tr>
      })}
    </tbody></table></div></section> : <section className="panel table-panel axi-table-panel"><div className="table-scroll"><table className="axi-table axi-prime-table"><thead><tr><th>Prime Set</th><th>{ru ? 'Продажи 30д' : '30d sales'}</th><th>{ru ? 'Онлайн мин.' : 'Online minimum'}</th><th>{ru ? 'Средняя 24ч' : '24h average'}</th><th>{ru ? 'Продажи 24ч' : '24h sales'}</th><th>{ru ? 'Наценка' : 'Markup'}</th><th>{ru ? 'Возможная прибыль' : 'Possible profit'}</th><th>{ru ? 'Обновлено' : 'Updated'}</th></tr></thead><tbody>
      {!jobId ? <tr><td colSpan={8} className="state-cell">{ru ? 'Выберите настройки и запустите сканирование Prime комплектов.' : 'Choose settings and start a Prime Set scan.'}</td></tr> : !rows.length ? <tr><td colSpan={8} className="state-cell"><div className="spinner"/>{ru ? 'Подготавливаем Prime комплекты…' : 'Preparing Prime Sets…'}</td></tr> : rows.filter(isPrimeSetRow).map(row => {
        const item = catalog.get(row.item.id)
        return <tr key={row.relationId} className={`${row.error ? 'axi-row-error' : ''} ${row.matchesMarkup ? 'axi-row-match' : ''}`}>
          <td><a className="axi-item" href={`/items/${encodeURIComponent(item?.slug || row.item.slug)}?id=${encodeURIComponent(row.item.id)}`}><ItemIcon item={item} name={item?.name || row.item.name}/><span><strong>{item?.name || row.item.name}</strong><small>Prime Set</small></span></a></td>
          <td>{fmt(row.item.sales30d, 0)}</td><td>{plat(row.purchasePrice)}</td><td>{plat(row.averagePrice24h)}</td><td>{fmt(row.sales24h, 0)}</td><td><strong className={`axi-ratio ${row.matchesMarkup ? 'axi-ratio-alert' : ''}`}>{pct(row.markupPercent)}</strong><small>{plat(row.markupPlatinum)}</small></td><td><strong className={(row.possibleProfit ?? 0) > 0 ? 'axi-profit-positive' : ''}>{row.possibleProfit == null ? '—' : `${row.possibleProfit > 0 ? '+' : ''}${plat(row.possibleProfit)}`}</strong></td><td><span title={row.error || undefined}>{time(row.fetchedAt, locale)}</span></td>
        </tr>
      })}
    </tbody></table></div></section>}
  </main>
}
