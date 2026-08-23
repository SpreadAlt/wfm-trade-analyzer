import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Locale } from './i18n'
import type { CatalogItem } from './types'
import { ItemIcon } from './MarketVisuals'
import { accountRequestJson } from './Account'
import './developer.css'
import './axiScanner.css'

type AxiStart = { ok: true; jobId: string; state: string; reused?: boolean; queuedAt: string; expiresAt: string }
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
  breakEvenChancePct?: number | null
  expectedRareValueIntact?: number | null
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
        if (!stopped && next.state !== 'completed' && next.state !== 'failed') timer = window.setTimeout(poll, 4000)
      } catch (value) {
        if (!stopped) {
          setError(value instanceof Error ? value.message : String(value))
          timer = window.setTimeout(poll, 8000)
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
      const next = await accountRequestJson<AxiStart>('/api/axi-scanner/start', { method: 'POST', body: '{}' })
      sessionStorage.setItem(JOB_KEY, next.jobId)
      setJobId(next.jobId)
      await refresh(next.jobId)
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    } finally {
      setStarting(false)
    }
  }

  const rows = useMemo(() => [...(result?.rows || [])].sort((left, right) => (right.ratio ?? -Infinity) - (left.ratio ?? -Infinity)), [result])
  const running = Boolean(jobId && status && !['completed', 'failed'].includes(status.state))
  const remainingMinutes = result?.expiresAt ? Math.max(0, Math.ceil((Date.parse(result.expiresAt) - Date.now()) / 60000)) : null

  return <main className="app-shell axi-shell">
    <div className="detail-navigation"><a className="brand-plate detail-brand" href="/" aria-label="FrameAnalytics — home"><img src="/assets/frameanalytics-logo.png" alt="FrameAnalytics"/></a><button type="button" className="back-button" onClick={onBack}>← {ru ? 'К профилю' : 'Back to profile'}</button></div>
    <section className="panel axi-heading">
      <div><span className="eyebrow">Axi · Rare rewards</span><h1>{ru ? 'Сканер реликвий Акси' : 'Axi relic scanner'}</h1><p>{ru ? 'Сравнивает минимальную цену целой реликвии с минимальной ценой её золотой награды. Один общий запуск работает по кругу один час.' : 'Compares the minimum intact-relic price with the minimum price of its rare reward. One shared run loops for one hour.'}</p></div>
      <button type="button" className="primary-action axi-start" disabled={starting || running} onClick={() => void start()}>{starting ? (ru ? 'Запуск…' : 'Starting…') : running ? (ru ? 'Сканирование идёт' : 'Scanning') : (ru ? 'Запустить на 1 час' : 'Run for 1 hour')}</button>
    </section>
    {error ? <div className="account-message error">{error}</div> : null}
    <section className="axi-status-grid">
      <article className="panel"><span>{ru ? 'Состояние' : 'State'}</span><strong>{status?.state || (ru ? 'Не запущен' : 'Not started')}</strong><small>{status?.progress?.stage || '—'}</small></article>
      <article className="panel"><span>{ru ? 'Активные реликвии' : 'Active relics'}</span><strong>{result?.activeRelics ?? '—'}</strong><small>{ru ? `Исключено: ${result?.excludedRelics ?? '—'}` : `Excluded: ${result?.excludedRelics ?? '—'}`}</small></article>
      <article className="panel"><span>{ru ? 'Проход' : 'Cycle'}</span><strong>{result?.cycle || status?.progress?.cycle || '—'}</strong><small>{ru ? `Завершено: ${result?.completedCycles ?? status?.progress?.completedCycles ?? 0}` : `Completed: ${result?.completedCycles ?? status?.progress?.completedCycles ?? 0}`}</small></article>
      <article className="panel"><span>{ru ? 'Осталось' : 'Remaining'}</span><strong>{remainingMinutes == null ? '—' : `${remainingMinutes} ${ru ? 'мин' : 'min'}`}</strong><small>{time(result?.generatedAt, locale)}</small></article>
    </section>
    <section className="panel axi-method">
      <strong>{ru ? 'Как читать соотношение' : 'How to read the ratio'}</strong><span>{ru ? 'Цена золотой награды ÷ цена целой реликвии. Например, 8× означает: награда стоит в 8 раз дороже реликвии. Это не гарантированная прибыль: шанс редкой награды у intact-реликвии — 2%.' : 'Rare reward price ÷ intact relic price. For example, 8× means the reward is eight times the relic price. This is not guaranteed profit: an intact relic has a 2% rare-reward chance.'}</span>
    </section>
    <section className="panel table-panel axi-table-panel"><div className="table-scroll"><table className="axi-table"><thead><tr><th>{ru ? 'Реликвия' : 'Relic'}</th><th>{ru ? 'Золотая награда' : 'Rare reward'}</th><th>{ru ? 'Продажи 30д' : '30d sales'}</th><th>{ru ? 'Реликвия' : 'Relic price'}</th><th>{ru ? 'Награда' : 'Reward price'}</th><th>{ru ? 'Соотношение' : 'Ratio'}</th><th>{ru ? 'Безубыточный шанс' : 'Break-even chance'}</th><th>{ru ? 'Редкая ценность (2%)' : 'Rare value (2%)'}</th><th>{ru ? 'Обновлено' : 'Updated'}</th></tr></thead><tbody>
      {!jobId ? <tr><td colSpan={9} className="state-cell">{ru ? 'Запустите сканирование. После первого прохода реликвии без продаж за 30 дней будут исключены.' : 'Start a scan. After the first pass, relics with no sales in 30 days are excluded.'}</td></tr> : !rows.length ? <tr><td colSpan={9} className="state-cell"><div className="spinner"/>{ru ? 'Подготавливаем пары и проверяем ликвидность…' : 'Preparing pairs and checking liquidity…'}</td></tr> : rows.map(row => {
        const relicItem = catalog.get(row.relic.id)
        const rewardItem = catalog.get(row.reward.id)
        return <tr key={row.relationId} className={row.error ? 'axi-row-error' : ''}>
          <td><a className="axi-item" href={`/items/${encodeURIComponent(relicItem?.slug || row.relic.slug)}?id=${encodeURIComponent(row.relic.id)}&variant=${encodeURIComponent('subtype=intact')}`}><ItemIcon item={relicItem} name={relicItem?.name || row.relic.name}/><span><strong>{relicItem?.name || row.relic.name}</strong><small>Intact</small></span></a></td>
          <td><a className="axi-item" href={`/items/${encodeURIComponent(rewardItem?.slug || row.reward.slug)}?id=${encodeURIComponent(row.reward.id)}`}><ItemIcon item={rewardItem} name={rewardItem?.name || row.reward.name}/><span><strong>{rewardItem?.name || row.reward.name}</strong>{row.reward.itemCount > 1 ? <small>×{row.reward.itemCount}</small> : null}</span></a></td>
          <td>{fmt(row.relic.sales30d, 0)}</td><td>{plat(row.relicPrice)}</td><td>{plat(row.rewardLotPrice ?? row.rewardPrice)}</td><td><strong className="axi-ratio">{row.ratio == null ? '—' : `${fmt(row.ratio, 2)}×`}</strong></td><td>{row.breakEvenChancePct == null ? '—' : `${fmt(row.breakEvenChancePct, 2)}%`}</td><td>{plat(row.expectedRareValueIntact)}</td><td><span title={row.error || undefined}>{time(row.fetchedAt, locale)}</span></td>
        </tr>
      })}
    </tbody></table></div></section>
  </main>
}
