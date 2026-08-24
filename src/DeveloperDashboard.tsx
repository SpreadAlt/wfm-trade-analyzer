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
  sessionCount: number
  betaJoinedAt: number | null
  inviteCodePrefix: string | null
  inviteLabel: string | null
}

type AccountsResponse = { ok: true; accounts: ManagedAccount[] }

type BetaInvite = {
  codeHash: string
  codePrefix: string
  label: string | null
  maxUses: number
  uses: number
  expiresAt: number | null
  disabled: number | boolean
  createdAt: number
}

type BetaInvitesResponse = { ok: true; invites: BetaInvite[] }
type CreatedBetaInviteResponse = { ok: true; invite: BetaInvite & { code: string } }

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
  } | null
  opportunities: ResaleOpportunity[]
  alerts: ResaleOpportunity[]
}

const RESALE_NOTIFY_KEY = 'frameanalytics.resale-v1.notifications'

const platinum = (value: number) => `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}p`

const dateTime = (value: string | number | null, locale: Locale) => {
  const raw = String(value ?? '')
  const date = new Date(typeof value === 'number' || /^\d{10,13}$/.test(raw) ? Number(raw) : raw)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
}

export const DeveloperDashboard = ({ locale, onBack }: { locale: Locale; onBack: () => void }) => {
  const ru = locale === 'ru'
  const [query, setQuery] = useState('')
  const [accounts, setAccounts] = useState<ManagedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [invites, setInvites] = useState<BetaInvite[]>([])
  const [invitesLoading, setInvitesLoading] = useState(true)
  const [inviteSaving, setInviteSaving] = useState<string | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteLabel, setInviteLabel] = useState('beta-tester')
  const [inviteMaxUses, setInviteMaxUses] = useState(1)
  const [inviteExpiresDays, setInviteExpiresDays] = useState(30)
  const [createdInviteCode, setCreatedInviteCode] = useState<string | null>(null)
  const [resale, setResale] = useState<ResaleScannerResponse | null>(null)
  const [resaleLoading, setResaleLoading] = useState(true)
  const [resaleError, setResaleError] = useState<string | null>(null)
  const [notificationsEnabled, setNotificationsEnabled] = useState(() => (
    typeof Notification !== 'undefined'
    && Notification.permission === 'granted'
    && localStorage.getItem(RESALE_NOTIFY_KEY) === '1'
  ))

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
    const timer = window.setTimeout(() => { void load() }, 250)
    return () => window.clearTimeout(timer)
  }, [load])

  const loadInvites = useCallback(async () => {
    setInvitesLoading(true)
    setInviteError(null)
    try {
      const result = await accountRequestJson<BetaInvitesResponse>('/api/developer/beta-invites')
      setInvites(result.invites || [])
    } catch (value) {
      setInviteError(value instanceof Error ? value.message : String(value))
    } finally {
      setInvitesLoading(false)
    }
  }, [])

  useEffect(() => { void loadInvites() }, [loadInvites])

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
    void loadResale()
    const timer = window.setInterval(() => { void loadResale() }, 60_000)
    return () => window.clearInterval(timer)
  }, [loadResale])

  const toggleNotifications = async () => {
    if (typeof Notification === 'undefined') {
      setResaleError(ru ? 'Этот браузер не поддерживает уведомления.' : 'This browser does not support notifications.')
      return
    }
    if (notificationsEnabled) {
      localStorage.removeItem(RESALE_NOTIFY_KEY)
      setNotificationsEnabled(false)
      return
    }
    const permission = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission
    const enabled = permission === 'granted'
    setNotificationsEnabled(enabled)
    if (enabled) localStorage.setItem(RESALE_NOTIFY_KEY, '1')
    else setResaleError(ru ? 'Уведомления заблокированы в настройках браузера.' : 'Notifications are blocked in browser settings.')
  }

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

  const createInvite = async () => {
    setInviteSaving('create')
    setInviteError(null)
    setCreatedInviteCode(null)
    try {
      const result = await accountRequestJson<CreatedBetaInviteResponse>('/api/developer/beta-invites', {
        method: 'POST',
        body: JSON.stringify({
          label: inviteLabel,
          maxUses: inviteMaxUses,
          expiresInDays: inviteExpiresDays
        })
      })
      setCreatedInviteCode(result.invite.code)
      setInvites(current => [result.invite, ...current])
    } catch (value) {
      setInviteError(value instanceof Error ? value.message : String(value))
    } finally {
      setInviteSaving(null)
    }
  }

  const setInviteDisabled = async (invite: BetaInvite, disabled: boolean) => {
    setInviteSaving(invite.codeHash)
    setInviteError(null)
    try {
      await accountRequestJson('/api/developer/beta-invites', {
        method: 'PATCH',
        body: JSON.stringify({ codeHash: invite.codeHash, disabled })
      })
      setInvites(current => current.map(item => item.codeHash === invite.codeHash ? { ...item, disabled } : item))
    } catch (value) {
      setInviteError(value instanceof Error ? value.message : String(value))
    } finally {
      setInviteSaving(null)
    }
  }

  const copyInvite = async () => {
    if (!createdInviteCode) return
    try {
      await navigator.clipboard.writeText(createdInviteCode)
    } catch {
      setInviteError(ru ? 'Не удалось скопировать код автоматически.' : 'Could not copy the code automatically.')
    }
  }

  return <main className="app-shell developer-shell">
    <div className="detail-navigation">
      <a className="brand-plate detail-brand" href="/" aria-label="FrameAnalytics — home"><img src="/assets/frameanalytics-logo.png" alt="FrameAnalytics"/></a>
      <button type="button" className="back-button" onClick={onBack}>← {ru ? 'К профилю' : 'Back to profile'}</button>
    </div>
    <section className="panel developer-heading">
      <div><span className="eyebrow">FrameAnalytics</span><h1>{ru ? 'Кабинет разработчика' : 'Developer dashboard'}</h1><p>{ru ? 'Управление закрытыми функциями аккаунтов. Права проверяются Worker-ом при каждом запросе.' : 'Manage account access to private features. Every request is authorized by the Worker.'}</p></div>
      <div className="developer-private-badge">{ru ? 'Только владелец' : 'Owner only'}</div>
    </section>
    <section className="panel developer-invites-panel">
      <header className="developer-section-heading">
        <div><span className="eyebrow">Closed beta</span><h2>{ru ? 'Приглашения на бета-тест' : 'Beta invitations'}</h2><p>{ru ? 'Код показывается только один раз сразу после создания. В базе хранится только его хеш.' : 'The code is shown only once after creation. Only its hash is stored.'}</p></div>
        <button type="button" className="secondary-action" disabled={invitesLoading} onClick={() => void loadInvites()}>{ru ? 'Обновить список' : 'Refresh list'}</button>
      </header>
      <div className="developer-invite-form">
        <label><span>{ru ? 'Метка' : 'Label'}</span><input maxLength={100} value={inviteLabel} onChange={event => setInviteLabel(event.target.value)} /></label>
        <label><span>{ru ? 'Использований' : 'Uses'}</span><input type="number" min={1} max={100} value={inviteMaxUses} onChange={event => setInviteMaxUses(Math.max(1, Math.min(100, Number(event.target.value) || 1)))} /></label>
        <label><span>{ru ? 'Действует, дней' : 'Expires, days'}</span><input type="number" min={1} max={365} value={inviteExpiresDays} onChange={event => setInviteExpiresDays(Math.max(1, Math.min(365, Number(event.target.value) || 1)))} /></label>
        <button type="button" className="primary-action developer-create-invite" disabled={inviteSaving === 'create'} onClick={() => void createInvite()}>{inviteSaving === 'create' ? (ru ? 'Создание…' : 'Creating…') : (ru ? 'Создать ключ' : 'Create key')}</button>
      </div>
      {createdInviteCode ? <div className="developer-created-invite"><div><span>{ru ? 'Новый ключ — сохраните сейчас' : 'New key — save it now'}</span><strong>{createdInviteCode}</strong></div><button type="button" className="secondary-action" onClick={() => void copyInvite()}>{ru ? 'Копировать' : 'Copy'}</button></div> : null}
      {inviteError ? <div className="account-message error">{inviteError}</div> : null}
      <div className="table-scroll"><table className="developer-table developer-invites-table"><thead><tr><th>{ru ? 'Приглашение' : 'Invite'}</th><th>{ru ? 'Использовано' : 'Used'}</th><th>{ru ? 'Истекает' : 'Expires'}</th><th>{ru ? 'Состояние' : 'State'}</th><th>{ru ? 'Действие' : 'Action'}</th></tr></thead><tbody>
        {invitesLoading ? <tr><td colSpan={5} className="state-cell"><div className="spinner"/>{ru ? 'Загрузка приглашений…' : 'Loading invitations…'}</td></tr> : !invites.length ? <tr><td colSpan={5} className="state-cell">{ru ? 'Приглашений пока нет.' : 'No invitations yet.'}</td></tr> : invites.map(invite => {
          const disabled = Boolean(invite.disabled)
          const expired = Boolean(invite.expiresAt && invite.expiresAt <= Date.now())
          const exhausted = invite.uses >= invite.maxUses
          const state = disabled ? (ru ? 'Отключён' : 'Disabled') : expired ? (ru ? 'Истёк' : 'Expired') : exhausted ? (ru ? 'Использован' : 'Used') : (ru ? 'Активен' : 'Active')
          return <tr key={invite.codeHash}>
            <td><strong>{invite.label || '—'}</strong><small>{invite.codePrefix}…</small></td>
            <td>{invite.uses} / {invite.maxUses}</td>
            <td>{invite.expiresAt ? dateTime(invite.expiresAt, locale) : '—'}</td>
            <td><span className={`developer-state ${disabled || expired || exhausted ? 'muted' : 'active'}`}>{state}</span></td>
            <td><button type="button" className="secondary-action compact" disabled={inviteSaving === invite.codeHash || expired || exhausted} onClick={() => void setInviteDisabled(invite, !disabled)}>{disabled ? (ru ? 'Включить' : 'Enable') : (ru ? 'Отключить' : 'Disable')}</button></td>
          </tr>
        })}
      </tbody></table></div>
    </section>
    <section className="panel developer-resale-panel">
      <header className="developer-resale-heading">
        <div><span className="eyebrow">Hourly resale</span><h2>{ru ? 'Перепродажа с прибылью от 20p' : 'Resale opportunities from 20p'}</h2><p>{ru ? 'Только немоды: от 30 закрытых продаж за 24 часа, средняя цена от 45p и sell-orders игроков online/ingame.' : 'Non-mods only: at least 30 closed sales in 24h, average price from 45p, and online/ingame sell-orders.'}</p></div>
        <div className="developer-resale-actions">
          <button type="button" className={`secondary-action ${notificationsEnabled ? 'active' : ''}`} onClick={() => void toggleNotifications()}>🔔 {notificationsEnabled ? (ru ? 'Уведомления включены' : 'Notifications on') : (ru ? 'Включить уведомления' : 'Enable notifications')}</button>
          <button type="button" className="secondary-action" disabled={resaleLoading} onClick={() => void loadResale()}>{ru ? 'Обновить' : 'Refresh'}</button>
        </div>
      </header>
      {resaleError ? <div className="account-message error">{resaleError}</div> : null}
      <div className="developer-resale-summary">
        <div><span>{ru ? 'Найдено' : 'Found'}</span><strong>{resale?.counts?.opportunities ?? '—'}</strong></div>
        <div><span>{ru ? 'Кандидатов' : 'Candidates'}</span><strong>{resale?.counts?.priceQualifiedSeries ?? '—'}</strong></div>
        <div><span>{ru ? 'Проверено ордеров' : 'Order requests'}</span><strong>{resale?.counts ? resale.counts.orderRequests + resale.counts.orderCacheHits : '—'}</strong></div>
        <div><span>{ru ? 'Последняя проверка' : 'Last scan'}</span><strong>{resale?.generatedAt ? dateTime(resale.generatedAt, locale) : '—'}</strong></div>
      </div>
      <div className="table-scroll"><table className="developer-table developer-resale-table"><thead><tr><th>{ru ? 'Предмет' : 'Item'}</th><th>{ru ? 'Мин. ордер' : 'Min order'}</th><th>{ru ? 'Средняя 24ч' : '24h average'}</th><th>{ru ? 'Продажи 24ч' : 'Sales 24h'}</th><th>{ru ? 'Прибыль' : 'Profit'}</th><th>{ru ? 'Онлайн-ордеры' : 'Online orders'}</th></tr></thead><tbody>
        {resaleLoading && !resale ? <tr><td colSpan={6} className="state-cell"><div className="spinner"/>{ru ? 'Загрузка проверки…' : 'Loading scan…'}</td></tr> : !resale?.opportunities?.length ? <tr><td colSpan={6} className="state-cell">{resale?.state === 'waiting-first-hourly-scan' ? (ru ? 'Ожидается первая стандартная почасовая проверка.' : 'Waiting for the first regular hourly scan.') : (ru ? 'Сейчас подходящих предложений нет.' : 'No matching opportunities right now.')}</td></tr> : resale.opportunities.map(row => <tr key={row.rowId}>
          <td>{row.wfmUrl ? <a className="developer-resale-item" href={row.wfmUrl} target="_blank" rel="noreferrer"><strong>{row.name}</strong><small>{row.marketKey}</small></a> : <><strong>{row.name}</strong><small>{row.marketKey}</small></>}</td>
          <td>{platinum(row.minimumOnlineSell)}</td><td>{platinum(row.averagePrice24h)}</td><td>{new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { maximumFractionDigits: 0 }).format(row.sales24h)}</td><td><strong className="developer-resale-profit">+{platinum(row.theoreticalProfit)}</strong></td><td>{row.onlineSellOrders}</td>
        </tr>)}
      </tbody></table></div>
    </section>
    <section className="panel developer-controls">
      <label><span>{ru ? 'Поиск аккаунта' : 'Search accounts'}</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={ru ? 'Имя или email' : 'Name or email'}/></label>
      <button type="button" className="secondary-action" disabled={loading} onClick={() => void load()}>{ru ? 'Обновить' : 'Refresh'}</button>
    </section>
    {error ? <div className="account-message error">{error}</div> : null}
    <section className="panel table-panel developer-table-panel">
      <div className="table-scroll"><table className="developer-table developer-accounts-table"><thead><tr><th>{ru ? 'Аккаунт' : 'Account'}</th><th>{ru ? 'Регистрация' : 'Registration'}</th><th>{ru ? 'Данные' : 'Data'}</th><th>{ru ? 'Axi-сканер' : 'Axi scanner'}</th><th>{ru ? 'Доступ' : 'Access'}</th><th>{ru ? 'Сессии' : 'Sessions'}</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={6} className="state-cell"><div className="spinner"/>{ru ? 'Загрузка аккаунтов…' : 'Loading accounts…'}</td></tr> : !accounts.length ? <tr><td colSpan={6} className="state-cell">{ru ? 'Аккаунты не найдены.' : 'No accounts found.'}</td></tr> : accounts.map(account => <tr key={account.id} className={account.disabled ? 'developer-account-disabled' : ''}>
          <td><strong>{account.name || '—'}</strong><span className="developer-email">{account.email}</span>{account.developer ? <small className="developer-role">developer</small> : account.emailVerified ? <small>{ru ? 'Email подтверждён' : 'Email verified'}</small> : null}</td>
          <td>{dateTime(account.createdAt, locale)}{account.inviteLabel || account.inviteCodePrefix ? <small>{account.inviteLabel || account.inviteCodePrefix}</small> : null}</td>
          <td><strong>{account.purchaseCount}</strong><small>{ru ? 'покупок в профиле' : 'profile purchases'}</small></td>
          <td><label className="access-toggle"><input type="checkbox" checked={account.axiScanner} disabled={account.developer || account.disabled || saving === account.id} onChange={event => void setAxiAccess(account, event.target.checked)}/><span>{account.axiScanner ? (ru ? 'Разрешён' : 'Allowed') : (ru ? 'Закрыт' : 'Blocked')}</span></label></td>
          <td><button type="button" className={`secondary-action compact ${account.disabled ? 'danger' : ''}`} disabled={account.developer || saving === account.id} onClick={() => void setAccountDisabled(account, !account.disabled)}>{account.disabled ? (ru ? 'Восстановить' : 'Restore') : (ru ? 'Приостановить' : 'Suspend')}</button></td>
          <td><strong>{account.sessionCount}</strong><button type="button" className="secondary-action compact" disabled={account.developer || saving === account.id || account.sessionCount < 1} onClick={() => void revokeSessions(account)}>{ru ? 'Выйти везде' : 'Sign out all'}</button></td>
        </tr>)}
      </tbody></table></div>
    </section>
  </main>
}
