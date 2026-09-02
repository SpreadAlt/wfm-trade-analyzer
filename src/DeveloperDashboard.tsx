import { useCallback, useEffect, useState } from 'react'
import type { Locale } from './i18n'
import { accountRequestJson } from './Account'
import './developer.css'

type ManagedAccount = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  createdAt: string
  developer: boolean
  axiScanner: boolean
  disabled: boolean
  purchaseCount: number
  purchaseUnits: number
  investedPlatinum: number
  sessionCount: number
  sessionExpiresAt: number | null
  wfmProfile: string | null
  profileUpdatedAt: number | null
  accessUpdatedAt: number | null
  stateUpdatedAt: number | null
  smartBuy: { limit: number; used: number; remaining: number; cooldownSeconds: number; lastRunAt: string | null }
  axiRunCount: number
  axiLastRunAt: number | null
}

type AccountsResponse = { ok: true; accounts: ManagedAccount[] }

type UserActivitySummary = {
  total: number
  last24h: number
  last7d: number
  last30d: number
  firstRunAt: number | null
  lastRunAt: number | null
}

type AccountStatsResponse = {
  ok: true
  account: ManagedAccount & {
    updatedAt: string
    accessUpdatedAt: number | null
    stateUpdatedAt: number | null
    profileCreatedAt: number | null
  }
  portfolio: {
    records: number
    units: number
    invested: number
    averageUnitPrice: number
    firstPurchaseDate: string | null
    lastPurchaseDate: string | null
    firstRecordedAt: string | null
    lastUpdatedAt: number | null
    recent: Array<{
      id: string
      itemId: string
      slug: string
      name: string
      marketKey: string
      selectedModRank: number | null
      purchasePrice: number
      quantity: number
      purchaseDate: string
      createdAt: string
      updatedAt: number
    }>
  }
  smartBuy: UserActivitySummary & { current: ManagedAccount['smartBuy'] }
  axi: UserActivitySummary
  sessions: Array<{ id: string; createdAt: string; updatedAt: string; expiresAt: string; userAgent: string | null }>
}

type ResaleOpportunity = {
  rowId: string
  itemId: string
  name: string
  slug: string
  marketKey: string
  averagePrice24h: number
  sales24h: number
  minimumOnlineSell: number
  theoreticalProfit: number
  onlineSellOrders: number
  ordersFetchedAt: string | null
  wfmUrl: string | null
}

type ResaleScannerResponse = {
  ok: true
  state: string
  generatedAt: string | null
  counts: {
    liquidNonModSeries: number
    priceQualifiedSeries: number
    priceQualifiedItems: number
    opportunities: number
    newAlerts: number
    orderRequests: number
    orderCacheHits: number
    errors: number
    processedItems?: number
    totalItems?: number
  } | null
  opportunities: ResaleOpportunity[]
  alerts: ResaleOpportunity[]
}

type WfmTelemetry = {
  ok: true
  gatewayRevision: string
  generatedAt: string
  configured: { intervalMs: number; targetRps: number; hardMinimumIntervalMs?: number; hardMaximumRps?: number; belowThreeRps?: boolean; maxInFlight: number; warningDay: number; limitDay: number }
  current: { rps10s: number; rps60s: number; requests10s: number; requests60s: number; pending: number; pendingClients?: Record<string, number>; running: boolean; inFlight: number; inFlightClients?: Record<string, number> }
  daily: {
    day: string
    requests: number
    warningAt: number
    limit: number
    remaining: number
    warning: boolean
    blocked: boolean
    clients: Record<string, number>
    statuses: Record<string, number>
    routes?: Record<string, { requests: number; statuses: Record<string, number>; clients: Record<string, number> }>
  }
  upstream: {
    lastRequestAt: string | null
    lastStatus: number | null
    cooldownActive: boolean
    cooldownUntil: string | null
    consecutiveThrottles: number
    rateLimitEvents?: Array<{
      timestamp: string
      status: number
      client: string
      route: string
      endpoint: string
      method: string
      platform: string | null
      crossplay: string | null
      rps10s: number
      rps60s: number
      requests10s: number
      requests60s: number
      inFlight: number
      pending: number
      retryAfter: string | null
      appliedCooldownSeconds: number
      durationMs: number
      cfRay: string | null
    }>
  }
  totalRequests: number
}

type ProcessQueues = {
  ok: true
  generatedAt: string
  warnings?: string[]
  queues: Record<string, { label: string; backlogCount: number | null; oldestMessageAgeSeconds: number | null; error?: string }>
  active: {
    axiScanner: null | { jobId: string; state: string; scanType: string; queuedAt: string | null; startedAt: string | null; expiresAt: string | null; progress?: { processed?: number; total?: number; percent?: number } }
    resaleScanner: null | { state: string; generatedAt: string | null; processedItems: number; totalItems: number }
  }
}

type DeveloperCategory = 'overview' | 'scanners' | 'accounts'

const platinum = (value: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}p`

const dateTime = (value: string | number | null, locale: Locale) => {
  const raw = String(value ?? '')
  const date = new Date(typeof value === 'number' || /^\d{10,13}$/.test(raw) ? Number(raw) : raw)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
}

export const DeveloperDashboard = ({ locale, onBack }: { locale: Locale; onBack: () => void }) => {
  const ru = locale === 'ru'
  const [category, setCategory] = useState<DeveloperCategory>('overview')
  const [query, setQuery] = useState('')
  const [accounts, setAccounts] = useState<ManagedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedAccount, setSelectedAccount] = useState<ManagedAccount | null>(null)
  const [accountStats, setAccountStats] = useState<AccountStatsResponse | null>(null)
  const [accountStatsLoading, setAccountStatsLoading] = useState(false)
  const [accountStatsError, setAccountStatsError] = useState<string | null>(null)
  const [resale, setResale] = useState<ResaleScannerResponse | null>(null)
  const [resaleLoading, setResaleLoading] = useState(true)
  const [resaleError, setResaleError] = useState<string | null>(null)
  const [telemetry, setTelemetry] = useState<WfmTelemetry | null>(null)
  const [telemetryError, setTelemetryError] = useState<string | null>(null)
  const [processQueues, setProcessQueues] = useState<ProcessQueues | null>(null)
  const [processQueuesError, setProcessQueuesError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await accountRequestJson<AccountsResponse>(`/api/developer/accounts?limit=250&q=${encodeURIComponent(query.trim())}`)
      setAccounts(result.accounts || [])
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    } finally {
      setLoading(false)
    }
  }, [query])

  useEffect(() => {
    if (category !== 'accounts') return
    const timer = window.setTimeout(() => { void load() }, 250)
    return () => window.clearTimeout(timer)
  }, [category, load])

  const loadResale = useCallback(async () => {
    try {
      const result = await accountRequestJson<ResaleScannerResponse>('/api/developer/resale-scanner-v1')
      setResale(result)
      setResaleError(null)
    } catch (value) {
      setResaleError(value instanceof Error ? value.message : String(value))
    } finally {
      setResaleLoading(false)
    }
  }, [])

  useEffect(() => {
    if (category !== 'scanners') return
    void loadResale()
    const timer = window.setInterval(() => { void loadResale() }, 10_000)
    return () => window.clearInterval(timer)
  }, [category, loadResale])

  const loadTelemetry = useCallback(async () => {
    try {
      const result = await accountRequestJson<WfmTelemetry>('/api/developer/wfm-telemetry')
      setTelemetry(result)
      setTelemetryError(null)
    } catch (value) {
      setTelemetryError(value instanceof Error ? value.message : String(value))
    }
  }, [])

  useEffect(() => {
    if (category !== 'overview') return
    void loadTelemetry()
    const timer = window.setInterval(() => { void loadTelemetry() }, 10_000)
    return () => window.clearInterval(timer)
  }, [category, loadTelemetry])

  const loadProcessQueues = useCallback(async () => {
    try {
      setProcessQueues(await accountRequestJson<ProcessQueues>('/api/developer/process-queues'))
      setProcessQueuesError(null)
    } catch (value) {
      setProcessQueuesError(value instanceof Error ? value.message : String(value))
    }
  }, [])

  useEffect(() => {
    if (category !== 'overview') return
    void loadProcessQueues()
    const timer = window.setInterval(() => { void loadProcessQueues() }, 10_000)
    return () => window.clearInterval(timer)
  }, [category, loadProcessQueues])

  const setAxiAccess = async (account: ManagedAccount, enabled: boolean) => {
    setSaving(account.id)
    setError(null)
    try {
      await accountRequestJson('/api/developer/accounts', {
        method: 'PATCH',
        body: JSON.stringify({ userId: account.id, axiScanner: enabled })
      })
      setAccounts(current => current.map(item => item.id === account.id ? { ...item, axiScanner: account.developer || enabled } : item))
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    } finally {
      setSaving(null)
    }
  }

  const setAccountDisabled = async (account: ManagedAccount, disabled: boolean) => {
    const accepted = !disabled || window.confirm(ru
      ? `Приостановить аккаунт ${account.email}? Все его активные сессии будут завершены.`
      : `Suspend ${account.email}? All active sessions will be revoked.`)
    if (!accepted) return
    setSaving(account.id)
    setError(null)
    try {
      await accountRequestJson('/api/developer/accounts', {
        method: 'PATCH',
        body: JSON.stringify({ userId: account.id, disabled })
      })
      setAccounts(current => current.map(item => item.id === account.id
        ? { ...item, disabled, sessionCount: disabled ? 0 : item.sessionCount }
        : item))
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    } finally {
      setSaving(null)
    }
  }

  const revokeSessions = async (account: ManagedAccount) => {
    if (!window.confirm(ru ? `Завершить все сессии ${account.email}?` : `Sign ${account.email} out everywhere?`)) return
    setSaving(account.id)
    setError(null)
    try {
      await accountRequestJson('/api/developer/accounts', {
        method: 'POST',
        body: JSON.stringify({ userId: account.id, action: 'revoke-sessions' })
      })
      setAccounts(current => current.map(item => item.id === account.id ? { ...item, sessionCount: 0 } : item))
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    } finally {
      setSaving(null)
    }
  }

  const restoreSmartBuyLimit = async (account: ManagedAccount) => {
    if (!window.confirm(ru ? `Восстановить лимит Smart Buy для ${account.email}? Счётчик запусков за 24 часа станет равен нулю.` : `Restore the Smart Buy limit for ${account.email}? Their 24-hour run counter will be reset to zero.`)) return
    setSaving(account.id)
    setError(null)
    try {
      const result = await accountRequestJson<{ ok: true; smartBuy: ManagedAccount['smartBuy'] }>('/api/developer/accounts', {
        method: 'POST',
        body: JSON.stringify({ userId: account.id, action: 'reset-smart-buy-limit' })
      })
      setAccounts(current => current.map(item => item.id === account.id ? { ...item, smartBuy: result.smartBuy } : item))
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    } finally {
      setSaving(null)
    }
  }

  const openAccountStats = async (account: ManagedAccount) => {
    setSelectedAccount(account)
    setAccountStats(null)
    setAccountStatsError(null)
    setAccountStatsLoading(true)
    try {
      setAccountStats(await accountRequestJson<AccountStatsResponse>(`/api/developer/accounts/${encodeURIComponent(account.id)}/stats`))
    } catch (value) {
      setAccountStatsError(value instanceof Error ? value.message : String(value))
    } finally {
      setAccountStatsLoading(false)
    }
  }

  const closeAccountStats = () => {
    setSelectedAccount(null)
    setAccountStats(null)
    setAccountStatsError(null)
  }

  if (selectedAccount) {
    const stats = accountStats
    const account = stats?.account || selectedAccount
    return <main className="app-shell developer-shell developer-user-page">
      <div className="detail-navigation">
        <a className="brand-plate detail-brand" href="/" aria-label="FrameAnalytics — home"><img src="/assets/frameanalytics-logo.webp" alt="FrameAnalytics"/></a>
        <button type="button" className="back-button" onClick={closeAccountStats}>← {ru ? 'К списку аккаунтов' : 'Back to accounts'}</button>
      </div>
      <section className="panel developer-user-hero">
        <div><span className="eyebrow">{ru ? 'Статистика пользователя' : 'User statistics'}</span><h1>{account.name || '—'}</h1><p>{account.email}</p></div>
        <div className="developer-user-badges"><span className={`developer-state ${account.disabled ? 'danger' : 'active'}`}>{account.disabled ? (ru ? 'Приостановлен' : 'Suspended') : (ru ? 'Активен' : 'Active')}</span><span className={`developer-state ${account.emailVerified ? 'active' : 'muted'}`}>{account.emailVerified ? (ru ? 'Email подтверждён' : 'Email verified') : (ru ? 'Email не подтверждён' : 'Email unverified')}</span>{account.developer ? <span className="developer-state active">developer</span> : null}</div>
      </section>
      {accountStatsLoading ? <section className="panel developer-user-loading"><div className="spinner"/><strong>{ru ? 'Собираем статистику…' : 'Loading statistics…'}</strong></section> : null}
      {accountStatsError ? <div className="account-message error">{accountStatsError}</div> : null}
      {stats ? <>
        <section className="developer-user-metrics">
          <article className="panel"><span>{ru ? 'Записей в портфеле' : 'Portfolio records'}</span><strong>{stats.portfolio.records}</strong><small>{stats.portfolio.units} {ru ? 'единиц' : 'units'}</small></article>
          <article className="panel"><span>{ru ? 'Вложено' : 'Invested'}</span><strong>{platinum(stats.portfolio.invested)}</strong><small>{ru ? `Средняя цена ${platinum(stats.portfolio.averageUnitPrice)}` : `Average ${platinum(stats.portfolio.averageUnitPrice)}`}</small></article>
          <article className="panel"><span>Smart Buy</span><strong>{stats.smartBuy.total}</strong><small>{ru ? `${stats.smartBuy.last7d} за 7 дней` : `${stats.smartBuy.last7d} in 7 days`}</small></article>
          <article className="panel"><span>Axi / Prime Set</span><strong>{stats.axi.total}</strong><small>{ru ? `${stats.axi.last30d} за 30 дней` : `${stats.axi.last30d} in 30 days`}</small></article>
          <article className="panel"><span>{ru ? 'Активные сессии' : 'Active sessions'}</span><strong>{stats.sessions.length}</strong><small>{stats.sessions[0]?.updatedAt ? dateTime(stats.sessions[0].updatedAt, locale) : (ru ? 'нет активности' : 'no activity')}</small></article>
        </section>
        <section className="developer-user-grid">
          <article className="panel developer-user-info"><span className="eyebrow">{ru ? 'Аккаунт и доступ' : 'Account & access'}</span><dl><div><dt>{ru ? 'Создан' : 'Created'}</dt><dd>{dateTime(stats.account.createdAt, locale)}</dd></div><div><dt>{ru ? 'Обновлён' : 'Updated'}</dt><dd>{dateTime(stats.account.updatedAt, locale)}</dd></div><div><dt>WFM</dt><dd>{stats.account.wfmProfile ? <a href={`https://warframe.market/profile/${encodeURIComponent(stats.account.wfmProfile)}`} target="_blank" rel="noreferrer">@{stats.account.wfmProfile}</a> : '—'}</dd></div><div><dt>Axi / Prime Set</dt><dd>{stats.account.axiScanner ? (ru ? 'Разрешён' : 'Allowed') : (ru ? 'Закрыт' : 'Blocked')}</dd></div><div><dt>{ru ? 'Доступ изменён' : 'Access updated'}</dt><dd>{dateTime(stats.account.accessUpdatedAt, locale)}</dd></div><div><dt>ID</dt><dd><code>{stats.account.id}</code></dd></div></dl></article>
          <article className="panel developer-user-activity"><span className="eyebrow">{ru ? 'Активность инструментов' : 'Tool activity'}</span><div className="developer-user-activity-row"><strong>Smart Buy</strong><span>24h: {stats.smartBuy.last24h}</span><span>7d: {stats.smartBuy.last7d}</span><span>30d: {stats.smartBuy.last30d}</span><small>{ru ? 'Последний запуск' : 'Last run'}: {dateTime(stats.smartBuy.lastRunAt, locale)}</small></div><div className="developer-user-activity-row"><strong>Axi / Prime Set</strong><span>24h: {stats.axi.last24h}</span><span>7d: {stats.axi.last7d}</span><span>30d: {stats.axi.last30d}</span><small>{ru ? 'Последний запуск' : 'Last run'}: {dateTime(stats.axi.lastRunAt, locale)}</small></div></article>
        </section>
        <section className="panel developer-user-section"><header className="developer-section-heading"><div><span className="eyebrow">Sessions</span><h2>{ru ? 'Активные устройства' : 'Active devices'}</h2><p>{ru ? 'Показаны активные сессии без IP-адресов и токенов.' : 'Active sessions are shown without IP addresses or tokens.'}</p></div></header><div className="table-scroll"><table className="developer-table"><thead><tr><th>{ru ? 'Устройство' : 'Device'}</th><th>{ru ? 'Создана' : 'Created'}</th><th>{ru ? 'Активность' : 'Activity'}</th><th>{ru ? 'Истекает' : 'Expires'}</th></tr></thead><tbody>{!stats.sessions.length ? <tr><td colSpan={4} className="state-cell">{ru ? 'Активных сессий нет.' : 'No active sessions.'}</td></tr> : stats.sessions.map(session => <tr key={session.id}><td className="developer-user-agent">{session.userAgent || (ru ? 'Неизвестное устройство' : 'Unknown device')}</td><td>{dateTime(session.createdAt, locale)}</td><td>{dateTime(session.updatedAt, locale)}</td><td>{dateTime(session.expiresAt, locale)}</td></tr>)}</tbody></table></div></section>
        <section className="panel developer-user-section"><header className="developer-section-heading"><div><span className="eyebrow">Portfolio</span><h2>{ru ? 'Последние позиции' : 'Recent positions'}</h2><p>{ru ? 'До 100 последних обновлённых записей портфеля.' : 'Up to 100 most recently updated portfolio records.'}</p></div></header><div className="table-scroll"><table className="developer-table developer-user-purchases"><thead><tr><th>{ru ? 'Предмет' : 'Item'}</th><th>{ru ? 'Цена' : 'Price'}</th><th>{ru ? 'Количество' : 'Quantity'}</th><th>{ru ? 'Сумма' : 'Total'}</th><th>{ru ? 'Дата покупки' : 'Purchase date'}</th><th>{ru ? 'Обновлено' : 'Updated'}</th></tr></thead><tbody>{!stats.portfolio.recent.length ? <tr><td colSpan={6} className="state-cell">{ru ? 'Портфель пуст.' : 'Portfolio is empty.'}</td></tr> : stats.portfolio.recent.map(row => <tr key={row.id}><td><strong>{row.name}</strong><small>{row.marketKey}{row.selectedModRank === null ? '' : ` · rank ${row.selectedModRank}`}</small></td><td>{platinum(row.purchasePrice)}</td><td>{row.quantity}</td><td>{platinum(row.purchasePrice * row.quantity)}</td><td>{dateTime(row.purchaseDate, locale)}</td><td>{dateTime(row.updatedAt, locale)}</td></tr>)}</tbody></table></div></section>
      </> : null}
    </main>
  }

  return <main className="app-shell developer-shell">
    <div className="detail-navigation">
      <a className="brand-plate detail-brand" href="/" aria-label="FrameAnalytics — home"><img src="/assets/frameanalytics-logo.webp" alt="FrameAnalytics"/></a>
      <button type="button" className="back-button" onClick={onBack}>← {ru ? 'К профилю' : 'Back to profile'}</button>
    </div>
    <section className="panel developer-heading">
      <div><span className="eyebrow">FrameAnalytics</span><h1>{ru ? 'Кабинет разработчика' : 'Developer dashboard'}</h1><p>{ru ? 'Управление закрытыми функциями аккаунтов. Права проверяются Worker-ом при каждом запросе.' : 'Manage account access to private features. Every request is authorized by the Worker.'}</p></div>
      <div className="developer-private-badge">{ru ? 'Только владелец' : 'Owner only'}</div>
    </section>
    <nav className="panel developer-category-nav" aria-label={ru ? 'Разделы кабинета' : 'Dashboard sections'}>
      {([
        ['overview', ru ? 'Обзор и очереди' : 'Overview & queues'],
        ['scanners', ru ? 'Сканеры' : 'Scanners'],
        ['accounts', ru ? 'Аккаунты и лимиты' : 'Accounts & limits']
      ] as Array<[DeveloperCategory, string]>).map(([value, label]) => <button type="button" key={value} className={category === value ? 'active' : ''} onClick={() => setCategory(value)}>{label}</button>)}
    </nav>
    <section className="panel developer-process-panel" hidden={category !== 'overview'}>
      <header className="developer-section-heading"><div><span className="eyebrow">Runtime</span><h2>{ru ? 'Процессы в очереди' : 'Queued processes'}</h2><p>{ru ? 'Очереди Cloudflare и процессы, ожидающие общий WFM Gateway.' : 'Cloudflare queues and processes waiting for the shared WFM Gateway.'}</p></div><button type="button" className="secondary-action" onClick={() => void Promise.all([loadProcessQueues(), loadTelemetry()])}>{ru ? 'Обновить' : 'Refresh'}</button></header>
      {processQueuesError ? <div className="developer-inline-warning" role="status"><div><strong>{ru ? 'Метрики очередей временно недоступны' : 'Queue metrics are temporarily unavailable'}</strong><span>{ru ? 'Gateway продолжает работать. Обновите блок через несколько секунд.' : 'The Gateway is still running. Refresh this section in a few seconds.'}</span></div><button type="button" className="secondary-action compact" onClick={() => void loadProcessQueues()}>{ru ? 'Повторить' : 'Retry'}</button><code title={processQueuesError}>{processQueuesError}</code></div> : null}
      {processQueues?.warnings?.length ? <details className="developer-metric-warnings"><summary>{ru ? 'Часть данных ещё загружается' : 'Some metrics are still loading'}</summary><code>{processQueues.warnings.join(' · ')}</code></details> : null}
      <div className="developer-process-grid">
        {Object.entries(processQueues?.queues || {}).map(([key, queue]) => <article key={key}><span>{queue.label}</span><strong>{queue.backlogCount ?? '—'}</strong><small>{queue.error || (queue.oldestMessageAgeSeconds ? `${ru ? 'старейшее' : 'oldest'}: ${Math.round(queue.oldestMessageAgeSeconds)}s` : (ru ? 'сообщений в очереди' : 'queued messages'))}</small></article>)}
        <article><span>WFM Gateway</span><strong>{telemetry?.current.pending ?? '—'}</strong><small>{ru ? 'ожидают допуска' : 'waiting for admission'}</small></article>
        <article><span>{ru ? 'В работе WFM' : 'WFM in flight'}</span><strong>{telemetry?.current.inFlight ?? '—'}</strong><small>{telemetry?.configured.maxInFlight ? `${ru ? 'макс.' : 'max'} ${telemetry.configured.maxInFlight}` : '—'}</small></article>
      </div>
      <div className="developer-live-processes">
        <div><span>{ru ? 'Ожидают Gateway' : 'Waiting in Gateway'}</span><p>{telemetry && Object.keys(telemetry.current.pendingClients || {}).length ? Object.entries(telemetry.current.pendingClients || {}).map(([name, count]) => `${name}: ${count}`).join(' · ') : '—'}</p></div>
        <div><span>{ru ? 'Выполняются через Gateway' : 'Running through Gateway'}</span><p>{telemetry && Object.keys(telemetry.current.inFlightClients || {}).length ? Object.entries(telemetry.current.inFlightClients || {}).map(([name, count]) => `${name}: ${count}`).join(' · ') : '—'}</p></div>
        <div><span>Axi / Prime Set</span><p>{processQueues?.active.axiScanner ? `${processQueues.active.axiScanner.scanType} · ${processQueues.active.axiScanner.state} · ${processQueues.active.axiScanner.progress?.processed ?? 0}/${processQueues.active.axiScanner.progress?.total ?? '—'}` : (ru ? 'не запущен' : 'not running')}</p></div>
        <div><span>{ru ? 'Перепродажа' : 'Resale'}</span><p>{processQueues?.active.resaleScanner ? `${processQueues.active.resaleScanner.state} · ${processQueues.active.resaleScanner.processedItems}/${processQueues.active.resaleScanner.totalItems || '—'}` : '—'}</p></div>
      </div>
    </section>
    <section className="panel developer-telemetry-panel" hidden={category !== 'overview'}>
      <header className="developer-section-heading">
        <div><span className="eyebrow">Warframe Market gateway</span><h2>{ru ? 'Текущая скорость запросов' : 'Current request rate'}</h2><p>{ru ? 'Общая скорость API, Hourly, Smart Buy, Axi и сканера перепродажи. Данные обновляются каждые 10 секунд.' : 'Combined rate for API, Hourly, Smart Buy, Axi and resale scanner. Refreshes every 10 seconds.'}</p></div>
        <span className={`developer-state ${telemetry?.upstream.cooldownActive || telemetry?.daily.blocked ? 'danger' : 'active'}`}>{telemetry?.daily.blocked ? (ru ? 'Лимит достигнут' : 'Budget reached') : telemetry?.upstream.cooldownActive ? (ru ? 'Пауза WFM' : 'WFM cooldown') : (ru ? 'Норма' : 'Healthy')}</span>
      </header>
      {telemetryError ? <div className="account-message error">{telemetryError}</div> : null}
      <div className="developer-telemetry-summary">
        <div><span>{ru ? 'Скорость 10с' : '10s rate'}</span><strong>{telemetry ? `${telemetry.current.rps10s.toFixed(2)} req/s` : '—'}</strong><small>{telemetry ? `${telemetry.current.requests10s} / 10s` : '—'}</small></div>
        <div><span>{ru ? 'Скорость 60с' : '60s rate'}</span><strong>{telemetry ? `${telemetry.current.rps60s.toFixed(2)} req/s` : '—'}</strong><small>{telemetry ? `${telemetry.current.requests60s} / 60s` : '—'}</small></div>
        <div><span>{ru ? 'Очередь шлюза' : 'Gateway queue'}</span><strong>{telemetry ? telemetry.current.pending : '—'}</strong><small>{telemetry?.current.running ? (ru ? 'запрос выполняется' : 'request running') : (ru ? 'свободен' : 'idle')}</small></div>
        <div><span>{ru ? 'Сегодня' : 'Today'}</span><strong>{telemetry ? new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US').format(telemetry.daily.requests) : '—'}</strong><small>{telemetry ? `${new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US').format(telemetry.daily.remaining)} ${ru ? 'осталось' : 'remaining'}` : '—'}</small></div>
        <div><span>{ru ? 'Жёсткий максимум' : 'Hard ceiling'}</span><strong>{telemetry ? `${(telemetry.configured.hardMaximumRps ?? telemetry.configured.targetRps).toFixed(2)} req/s` : '—'}</strong><small>{telemetry ? `${telemetry.configured.intervalMs} ms · ${telemetry.configured.belowThreeRps === false ? '⚠' : '< 3 req/s'}` : '—'}</small></div>
        <div><span>{ru ? 'Ответ WFM' : 'WFM response'}</span><strong>{telemetry?.upstream.lastStatus ?? '—'}</strong><small>{telemetry?.upstream.lastRequestAt ? dateTime(telemetry.upstream.lastRequestAt, locale) : '—'}</small></div>
      </div>
      <div className="developer-telemetry-breakdown">
        <div><span>{ru ? 'По процессам' : 'By process'}</span><p>{telemetry && Object.keys(telemetry.daily.clients).length ? Object.entries(telemetry.daily.clients).sort((a, b) => b[1] - a[1]).map(([name, count]) => `${name}: ${count}`).join(' · ') : '—'}</p></div>
        <div><span>{ru ? 'По статусам' : 'By status'}</span><p>{telemetry && Object.keys(telemetry.daily.statuses).length ? Object.entries(telemetry.daily.statuses).sort((a, b) => b[1] - a[1]).map(([status, count]) => `${status}: ${count}`).join(' · ') : '—'}</p></div>
        <div className="developer-telemetry-routes"><span>{ru ? 'По endpoints' : 'By endpoint'}</span><p>{telemetry && Object.keys(telemetry.daily.routes || {}).length ? Object.entries(telemetry.daily.routes || {}).sort((a, b) => b[1].requests - a[1].requests).map(([name, route]) => `${name}: ${route.requests}${route.statuses['429'] ? ` (${route.statuses['429']}×429)` : ''}`).join(' · ') : '—'}</p></div>
      </div>
      <details className="developer-rate-limit-log">
        <summary className="developer-rate-limit-heading"><span>{ru ? 'Настоящие ответы WFM 429/509' : 'Upstream WFM 429/509 responses'} <b>{telemetry?.upstream.rateLimitEvents?.length ?? 0}</b></span><small>{ru ? 'Нажмите, чтобы показать последние 50 событий. Локальная пауза Gateway сюда не входит.' : 'Click to show the last 50 events. Local Gateway cooldown responses are excluded.'}</small></summary>
        <div className="table-scroll"><table className="developer-table developer-rate-limit-table"><thead><tr><th>{ru ? 'Время' : 'Time'}</th><th>Endpoint</th><th>{ru ? 'Процесс' : 'Process'}</th><th>{ru ? 'Скорость' : 'Rate'}</th><th>{ru ? 'Параллельно' : 'Concurrent'}</th><th>Retry-After</th><th>CF-Ray</th></tr></thead><tbody>
          {!telemetry?.upstream.rateLimitEvents?.length ? <tr><td colSpan={7} className="state-cell">{ru ? 'Зафиксированных upstream 429/509 пока нет.' : 'No upstream 429/509 events have been recorded yet.'}</td></tr> : telemetry.upstream.rateLimitEvents.map((event, index) => <tr key={`${event.timestamp}-${event.client}-${index}`}><td>{dateTime(event.timestamp, locale)}<small>HTTP {event.status}</small></td><td><code>{event.endpoint}</code><small>{event.platform ? `${event.platform}${event.crossplay ? ` · crossplay=${event.crossplay}` : ''}` : event.route}</small></td><td>{event.client}</td><td>{event.rps10s.toFixed(2)} req/s<small>{event.requests10s}/10s · {event.requests60s}/60s</small></td><td>{event.inFlight}<small>{ru ? `ожидает: ${event.pending}` : `pending: ${event.pending}`}</small></td><td>{event.retryAfter || '—'}<small>{ru ? `применено ${event.appliedCooldownSeconds}с` : `applied ${event.appliedCooldownSeconds}s`}</small></td><td><code>{event.cfRay || '—'}</code></td></tr>)}
        </tbody></table></div>
      </details>
    </section>
    <section className="panel developer-resale-panel" hidden={category !== 'scanners'}>
      <header className="developer-resale-heading">
        <div><span className="eyebrow">Hourly resale</span><h2>{ru ? 'Перепродажа с прибылью от 20p' : 'Resale opportunities from 20p'}</h2><p>{ru ? 'Без модов и мистификаторов: от 30 закрытых продаж за 24 часа, средняя цена от 45p и свежие sell-orders игроков online/ingame.' : 'Excludes mods and arcanes: at least 30 closed sales in 24h, average price from 45p, and fresh online/ingame sell-orders.'}</p></div>
        <div className="developer-resale-actions">
          <a className="secondary-action developer-tray-download" href="/downloads/frameanalytics-notifier.zip" download>▣ {ru ? 'Скачать уведомления в трей' : 'Download tray notifier'}</a>
          <button type="button" className="secondary-action" disabled={resaleLoading} onClick={() => void loadResale()}>{ru ? 'Обновить' : 'Refresh'}</button>
        </div>
      </header>
      {resaleError ? <div className="account-message error">{resaleError}</div> : null}
      <div className="developer-resale-summary">
        <div><span>{ru ? 'Найдено' : 'Found'}</span><strong>{resale?.counts?.opportunities ?? '—'}</strong></div>
        <div><span>{ru ? 'Кандидатов' : 'Candidates'}</span><strong>{resale?.counts?.priceQualifiedSeries ?? '—'}</strong></div>
        <div><span>{ru ? 'Проверено ордеров' : 'Order requests'}</span><strong>{resale?.counts ? resale.counts.orderRequests + resale.counts.orderCacheHits : '—'}</strong><small>{resale?.state === 'running' && resale.counts?.totalItems ? `${resale.counts.processedItems ?? 0}/${resale.counts.totalItems}` : null}</small></div>
        <div><span>{resale?.state === 'running' ? (ru ? 'Сканирование' : 'Scanning') : (ru ? 'Последняя проверка' : 'Last scan')}</span><strong>{resale?.generatedAt ? dateTime(resale.generatedAt, locale) : '—'}</strong></div>
      </div>
      <div className="table-scroll"><table className="developer-table developer-resale-table"><thead><tr><th>{ru ? 'Предмет' : 'Item'}</th><th>{ru ? 'Мин. ордер' : 'Min order'}</th><th>{ru ? 'Средняя 24ч' : '24h average'}</th><th>{ru ? 'Продажи 24ч' : 'Sales 24h'}</th><th>{ru ? 'Прибыль' : 'Profit'}</th><th>{ru ? 'Онлайн-ордеры' : 'Online orders'}</th></tr></thead><tbody>
        {resaleLoading && !resale ? <tr><td colSpan={6} className="state-cell"><div className="spinner"/>{ru ? 'Загрузка проверки…' : 'Loading scan…'}</td></tr> : !resale?.opportunities?.length ? <tr><td colSpan={6} className="state-cell">{resale?.state === 'waiting-first-hourly-scan' ? (ru ? 'Ожидается первая стандартная почасовая проверка.' : 'Waiting for the first regular hourly scan.') : (ru ? 'Сейчас подходящих предложений нет.' : 'No matching opportunities right now.')}</td></tr> : resale.opportunities.map(row => <tr key={row.rowId}>
          <td>{row.wfmUrl ? <a className="developer-resale-item" href={row.wfmUrl} target="_blank" rel="noreferrer"><strong>{row.name}</strong><small>{row.marketKey}</small></a> : <><strong>{row.name}</strong><small>{row.marketKey}</small></>}</td>
          <td>{platinum(row.minimumOnlineSell)}</td><td>{platinum(row.averagePrice24h)}</td><td>{new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 0 }).format(row.sales24h)}</td><td><strong className="developer-resale-profit">+{platinum(row.theoreticalProfit)}</strong></td><td>{row.onlineSellOrders}</td>
        </tr>)}
      </tbody></table></div>
    </section>
    <section className="panel developer-controls" hidden={category !== 'accounts'}>
      <label><span>{ru ? 'Поиск аккаунта' : 'Search accounts'}</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={ru ? 'Имя или email' : 'Name or email'}/></label>
      <button type="button" className="secondary-action" disabled={loading} onClick={() => void load()}>{ru ? 'Обновить' : 'Refresh'}</button>
    </section>
    {error && category === 'accounts' ? <div className="account-message error">{error}</div> : null}
    <section className="panel table-panel developer-table-panel" hidden={category !== 'accounts'}>
      <div className="table-scroll"><table className="developer-table developer-accounts-table"><thead><tr><th>{ru ? 'Аккаунт' : 'Account'}</th><th>{ru ? 'Регистрация и WFM' : 'Registration & WFM'}</th><th>{ru ? 'Портфель' : 'Portfolio'}</th><th>{ru ? 'Лимиты' : 'Limits'}</th><th>{ru ? 'Доступ' : 'Access'}</th><th>{ru ? 'Сессии' : 'Sessions'}</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6} className="state-cell"><div className="spinner"/>{ru ? 'Загрузка аккаунтов…' : 'Loading accounts…'}</td></tr> : !accounts.length ? <tr><td colSpan={6} className="state-cell">{ru ? 'Аккаунты не найдены.' : 'No accounts found.'}</td></tr> : accounts.map(account => <tr key={account.id} className={account.disabled ? 'developer-account-disabled' : ''}>
          <td><strong>{account.name || '—'}</strong><span className="developer-email">{account.email}</span>{account.developer ? <small className="developer-role">developer</small> : account.emailVerified ? <small>{ru ? 'Email подтверждён' : 'Email verified'}</small> : null}<button type="button" className="secondary-action compact developer-stats-button" onClick={() => void openAccountStats(account)}>{ru ? 'Подробная статистика' : 'Detailed statistics'}</button></td>
          <td>{dateTime(account.createdAt, locale)}{account.wfmProfile ? <a className="developer-profile-link" href={`https://warframe.market/profile/${encodeURIComponent(account.wfmProfile)}`} target="_blank" rel="noreferrer">@{account.wfmProfile}</a> : <small>{ru ? 'WFM профиль не указан' : 'No WFM profile'}</small>}</td>
          <td><strong>{account.purchaseCount}</strong><small>{ru ? `${account.purchaseUnits} ед. · вложено ${platinum(account.investedPlatinum)}` : `${account.purchaseUnits} units · ${platinum(account.investedPlatinum)} invested`}</small></td>
          <td><div className="developer-limit"><strong>Smart Buy {account.smartBuy.used}/{account.smartBuy.limit}</strong><small>{ru ? `Осталось: ${account.smartBuy.remaining}` : `Remaining: ${account.smartBuy.remaining}`}{account.smartBuy.lastRunAt ? ` · ${dateTime(account.smartBuy.lastRunAt, locale)}` : ''}</small><button type="button" className="secondary-action compact" disabled={saving === account.id || account.smartBuy.used < 1} onClick={() => void restoreSmartBuyLimit(account)}>{ru ? 'Восстановить лимит' : 'Restore limit'}</button></div></td>
          <td><label className="access-toggle"><input type="checkbox" checked={account.axiScanner} disabled={account.developer || account.disabled || saving === account.id} onChange={event => void setAxiAccess(account, event.target.checked)}/><span>{account.axiScanner ? (ru ? 'Axi разрешён' : 'Axi allowed') : (ru ? 'Axi закрыт' : 'Axi blocked')}</span></label><small>{ru ? `Запусков Axi: ${account.axiRunCount}` : `Axi runs: ${account.axiRunCount}`}</small><button type="button" className={`secondary-action compact ${account.disabled ? 'danger' : ''}`} disabled={account.developer || saving === account.id} onClick={() => void setAccountDisabled(account, !account.disabled)}>{account.disabled ? (ru ? 'Восстановить аккаунт' : 'Restore account') : (ru ? 'Приостановить' : 'Suspend')}</button></td>
          <td><strong>{account.sessionCount}</strong><small>{account.sessionExpiresAt ? `${ru ? 'до' : 'until'} ${dateTime(account.sessionExpiresAt, locale)}` : (ru ? 'активных сессий нет' : 'no active sessions')}</small><button type="button" className="secondary-action compact" disabled={account.developer || saving === account.id || account.sessionCount < 1} onClick={() => void revokeSessions(account)}>{ru ? 'Выйти везде' : 'Sign out all'}</button></td>
        </tr>)}
      </tbody></table></div>
    </section>
  </main>
}
