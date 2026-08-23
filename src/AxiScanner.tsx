import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Locale } from './i18n'
import type { CatalogItem } from './types'
import { ItemIcon } from './MarketVisuals'
import { accountRequestJson } from './Account'
import './developer.css'
import './axiScanner.css'

type AxiStart = { ok: true; jobId: string; state: string; reused?: boolean; queuedAt: string; expiresAt: string; durationMinutes?: number }
type AxiStop = { ok: true; jobId: string; state: 'cancelled'; stoppedAt: string }
type AxiJobStatus = { ok: true; jobId: string; state: string; expiresAt: string; progress?: { stage?: string; processed?: number; total?: number; percent?: number; cycle?: number; completedCycles?: number }; error?: string | null }
type AxiRow = {
  relationId: string
  relic: { id: string; slug: string; name: string; sales30d: number }
  reward: { id: string; slug: string; name: string; itemCount: number }
  relicPrice: number | null
  rewardPrice: number | null
  rewardLotPrice?: number | null
  ratio: number | null
  spread?: number | null
  possibleProfit?: number | null
  reward24hVolume?: number | null
  reward24hPoints?: number | null
  rewardPriceSource?: string | null
  relicSellers?: number
  rewardSellers?: number
  fetchedAt: string
  error?: string | null
}
type AxiResult = {
  ok: true
  jobId: string
  state: string
  generatedAt: string | null
  expiresAt: string
  cycle: number
  completedCycles?: number
  activeRelics: number
  activeRelations?: number
  excludedRelics: number
  scannedRelations?: number
  rows: AxiRow[]
}

const JOB_KEY = 'frameanalytics-axi-scanner-job'
const DURATION_KEY = 'frameanalytics-axi-scanner-duration'
const DURATION_OPTIONS = [15, 30, 60, 120, 240, 480, 1440] as const
const fmt = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString(undefined, { maximumFractionDigits: digits })
const plat = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${fmt(value)}p`
const time = (value: string | null | undefined, locale: Locale) => {
  const date = new Date(value || '')
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })
}

export const AxiScannerPage = ({ locale, catalog, onBack }: { locale: Locale; catalog: Map<string, CatalogItem>; onBack: () => void }) => {
  const ru = locale === 'ru'
  const [jobId, setJobId] = useState(() => sessionStorage.getItem(JOB_KEY) || '')
  const [status, setStatus] = useState<AxiJobStatus | null>(null)
  const [result, setResult] = useState<AxiResult | null>(null)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [durationMinutes, setDurationMinutes] = useState<number>(() => {
    const stored = Number(localStorage.getItem(DURATION_KEY))
    return DURATION_OPTIONS.includes(stored as typeof DURATION_OPTIONS[number]) ? stored : 60
  })
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => typeof Notification !== 'undefined' && Notification.permission === 'granted')
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (id: string) => {
    const [nextStatus, nextResult] = await Promise.all([
      accountRequestJson<AxiJobStatus>(`/api/axi-scanner/status?id=${encodeURIComponent(id)}`),
      accountRequestJson<AxiResult>(`/api/axi-scanner/result?id=${encodeURIComponent(id)}`)
    ])
    setStatus(nextStatus)
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
        if (!stopped && !['completed', 'failed', 'cancelled'].includes(next.state)) timer = window.setTimeout(poll, 10000)
      } catch (value) {
        if (!stopped) {
          setError(value instanceof Error ? value.message : String(value))
          timer = window.setTimeout(poll, 15000)
        }
      }
    }
    void poll()
    return () => { stopped = true; window.clearTimeout(timer) }
  }, [jobId, refresh])

  const start = async () => {
    setStarting(true)
    setError(null)
    try {
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        const permission = await Notification.requestPermission()
        setNotificationsEnabled(permission === 'granted')
      }
      localStorage.setItem(DURATION_KEY, String(durationMinutes))
      const next = await accountRequestJson<AxiStart>('/api/axi-scanner/start', { method: 'POST', body: JSON.stringify({ durationMinutes }) })
      sessionStorage.setItem(JOB_KEY, next.jobId)
      setJobId(next.jobId)
      await refresh(next.jobId)
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

  const rows = useMemo(() => [...(result?.rows || [])].sort((left, right) => (right.ratio ?? -Infinity) - (left.ratio ?? -Infinity)), [result])
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
    const candidates = rows.filter(row => (row.ratio ?? 0) > 10 && !alerted.has(row.relationId))
    for (const row of candidates) {
      const relicItem = catalog.get(row.relic.id)
      const rewardItem = catalog.get(row.reward.id)
      const relicName = relicItem?.name || row.relic.name
      const rewardName = rewardItem?.name || row.reward.name
      const icon = rewardItem?.thumb || rewardItem?.icon || relicItem?.thumb || relicItem?.icon || '/assets/favicon.png'
      new Notification(ru ? `Axi: найдено ${fmt(row.ratio, 2)}×` : `Axi: ${fmt(row.ratio, 2)}× found`, {
        body: ru
          ? `${relicName}: ${plat(row.relicPrice)} → ${rewardName}: ${plat(row.rewardLotPrice ?? row.rewardPrice)}`
          : `${relicName}: ${plat(row.relicPrice)} → ${rewardName}: ${plat(row.rewardLotPrice ?? row.rewardPrice)}`,
        icon,
        tag: `axi-${jobId}-${row.relationId}`
      })
      alerted.add(row.relationId)
    }
    if (candidates.length) sessionStorage.setItem(storageKey, JSON.stringify([...alerted]))
  }, [catalog, jobId, notificationsEnabled, rows, ru])

  return <main className="app-shell axi-shell">
    <div className="detail-navigation"><a className="brand-plate detail-brand" href="/" aria-label="FrameAnalytics — home"><img src="/assets/frameanalytics-logo.png" alt="FrameAnalytics"/></a><button type="button" className="back-button" onClick={onBack}>← {ru ? 'К профилю' : 'Back to profile'}</button></div>
    <section className="panel axi-heading">
      <div><span className="eyebrow">Axi · Rare rewards</span><h1>{ru ? 'Сканер реликвий Акси' : 'Axi relic scanner'}</h1><p>{ru ? 'Сравнивает самый дешёвый sell-order реликвии со средней ценой закрытых продаж золотой награды за 24 часа.' : 'Compares the cheapest relic sell order with the rare reward’s average closed-sale price over 24 hours.'}</p></div>
      <div className="axi-heading-actions">
        <label className="axi-duration"><span>{ru ? 'Время сканирования' : 'Scan duration'}</span><select value={durationMinutes} disabled={running || starting} onChange={event => setDurationMinutes(Number(event.target.value))}>{DURATION_OPTIONS.map(minutes => <option value={minutes} key={minutes}>{durationLabel(minutes)}</option>)}</select></label>
        <button type="button" className={`secondary-action axi-notification ${notificationsEnabled ? 'active' : ''}`} onClick={() => void enableNotifications()} title={ru ? 'Уведомлять при соотношении больше 10×' : 'Notify when the ratio exceeds 10×'} aria-pressed={notificationsEnabled}>🔔 <span>{notificationsEnabled ? (ru ? 'Уведомления включены' : 'Notifications on') : (ru ? 'Уведомления ×10' : '10× alerts')}</span></button>
        {running ? <button type="button" className="secondary-action axi-stop" disabled={stopping} onClick={() => void stop()}>{stopping ? (ru ? 'Остановка…' : 'Stopping…') : (ru ? 'Остановить' : 'Stop')}</button> : <button type="button" className="primary-action axi-start" disabled={starting} onClick={() => void start()}>{starting ? (ru ? 'Запуск…' : 'Starting…') : `${ru ? 'Запустить на' : 'Run for'} ${durationLabel(durationMinutes)}`}</button>}
      </div>
    </section>
    {error ? <div className="account-message error">{error}</div> : null}
    <section className="axi-status-grid">
      <article className="panel"><span>{ru ? 'Состояние' : 'State'}</span><strong>{stateLabel}</strong><small>{status?.progress?.stage || '—'}</small></article>
      <article className="panel"><span>{ru ? 'Активные реликвии' : 'Active relics'}</span><strong>{result?.activeRelics ?? '—'}</strong><small>{ru ? `Исключено: ${result?.excludedRelics ?? '—'}` : `Excluded: ${result?.excludedRelics ?? '—'}`}</small></article>
      <article className="panel"><span>{ru ? 'Проход' : 'Cycle'}</span><strong>{result?.cycle || status?.progress?.cycle || '—'}</strong><small>{ru ? `Завершено: ${result?.completedCycles ?? status?.progress?.completedCycles ?? 0}` : `Completed: ${result?.completedCycles ?? status?.progress?.completedCycles ?? 0}`}</small></article>
      <article className="panel"><span>{ru ? 'Осталось' : 'Remaining'}</span><strong>{remainingMinutes == null ? '—' : `${remainingMinutes} ${ru ? 'мин' : 'min'}`}</strong><small>{time(result?.generatedAt, locale)}</small></article>
    </section>
    <section className="panel table-panel axi-table-panel"><div className="table-scroll"><table className="axi-table"><thead><tr><th>{ru ? 'Реликвия' : 'Relic'}</th><th>{ru ? 'Золотая награда' : 'Rare reward'}</th><th>{ru ? 'Продажи 30д' : '30d sales'}</th><th title={ru ? 'Только ордера игроков online или ingame' : 'Only orders from online or ingame players'}>{ru ? 'Реликвия · онлайн мин.' : 'Relic · online minimum'}</th><th>{ru ? 'Награда · средняя 24ч' : 'Reward · 24h average'}</th><th>{ru ? 'Соотношение' : 'Ratio'}</th><th>{ru ? 'Возможная прибыль' : 'Possible profit'}</th><th>{ru ? 'Обновлено' : 'Updated'}</th></tr></thead><tbody>
      {!jobId ? <tr><td colSpan={8} className="state-cell">{ru ? 'Запустите сканирование. После первого прохода реликвии без продаж за 30 дней будут исключены.' : 'Start a scan. After the first pass, relics with no sales in 30 days are excluded.'}</td></tr> : !rows.length ? <tr><td colSpan={8} className="state-cell"><div className="spinner"/>{ru ? 'Подготавливаем пары и проверяем ликвидность…' : 'Preparing pairs and checking liquidity…'}</td></tr> : rows.map(row => {
        const relicItem = catalog.get(row.relic.id)
        const rewardItem = catalog.get(row.reward.id)
        const possibleProfit = row.possibleProfit ?? row.spread
        return <tr key={row.relationId} className={row.error ? 'axi-row-error' : ''}>
          <td><a className="axi-item" href={`/items/${encodeURIComponent(relicItem?.slug || row.relic.slug)}?id=${encodeURIComponent(row.relic.id)}&variant=${encodeURIComponent('subtype=intact')}`}><ItemIcon item={relicItem} name={relicItem?.name || row.relic.name}/><span><strong>{relicItem?.name || row.relic.name}</strong><small>{ru ? 'Неповреждённая' : 'Intact'}</small></span></a></td>
          <td><a className="axi-item" href={`/items/${encodeURIComponent(rewardItem?.slug || row.reward.slug)}?id=${encodeURIComponent(row.reward.id)}`}><ItemIcon item={rewardItem} name={rewardItem?.name || row.reward.name}/><span><strong>{rewardItem?.name || row.reward.name}</strong>{row.reward.itemCount > 1 ? <small>×{row.reward.itemCount}</small> : null}</span></a></td>
          <td>{fmt(row.relic.sales30d, 0)}</td><td>{plat(row.relicPrice)}</td><td title={row.reward24hVolume != null ? (ru ? `Продано за 24ч: ${fmt(row.reward24hVolume, 0)}` : `24h volume: ${fmt(row.reward24hVolume, 0)}`) : undefined}>{plat(row.rewardLotPrice ?? row.rewardPrice)}</td><td><strong className={`axi-ratio ${(row.ratio ?? 0) > 10 ? 'axi-ratio-alert' : ''}`}>{row.ratio == null ? '—' : `${fmt(row.ratio, 2)}×`}</strong></td><td><strong className={(possibleProfit ?? 0) > 0 ? 'axi-profit-positive' : ''}>{possibleProfit == null ? '—' : `${possibleProfit > 0 ? '+' : ''}${plat(possibleProfit)}`}</strong></td><td><span title={row.error || undefined}>{time(row.fetchedAt, locale)}</span></td>
        </tr>
      })}
    </tbody></table></div></section>
  </main>
}
