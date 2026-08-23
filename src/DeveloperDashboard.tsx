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
  purchaseCount: number
}

type AccountsResponse = { ok: true; accounts: ManagedAccount[] }

const dateTime = (value: string, locale: Locale) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US')
}

export const DeveloperDashboard = ({ locale, onBack }: { locale: Locale; onBack: () => void }) => {
  const ru = locale === 'ru'
  const [query, setQuery] = useState('')
  const [accounts, setAccounts] = useState<ManagedAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

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

  return <main className="app-shell developer-shell">
    <div className="detail-navigation">
      <a className="brand-plate detail-brand" href="/" aria-label="FrameAnalytics — home"><img src="/assets/frameanalytics-logo.png" alt="FrameAnalytics"/></a>
      <button type="button" className="back-button" onClick={onBack}>← {ru ? 'К профилю' : 'Back to profile'}</button>
    </div>
    <section className="panel developer-heading">
      <div><span className="eyebrow">FrameAnalytics</span><h1>{ru ? 'Кабинет разработчика' : 'Developer dashboard'}</h1><p>{ru ? 'Управление закрытыми функциями аккаунтов. Права проверяются Worker-ом при каждом запросе.' : 'Manage account access to private features. Every request is authorized by the Worker.'}</p></div>
      <div className="developer-private-badge">{ru ? 'Только владелец' : 'Owner only'}</div>
    </section>
    <section className="panel developer-controls">
      <label><span>{ru ? 'Поиск аккаунта' : 'Search accounts'}</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={ru ? 'Имя или email' : 'Name or email'}/></label>
      <button type="button" className="secondary-action" disabled={loading} onClick={() => void load()}>{ru ? 'Обновить' : 'Refresh'}</button>
    </section>
    {error ? <div className="account-message error">{error}</div> : null}
    <section className="panel table-panel developer-table-panel">
      <div className="table-scroll"><table className="developer-table"><thead><tr><th>{ru ? 'Аккаунт' : 'Account'}</th><th>Email</th><th>{ru ? 'Создан' : 'Created'}</th><th>{ru ? 'Покупки' : 'Purchases'}</th><th>{ru ? 'Axi-сканер' : 'Axi scanner'}</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={5} className="state-cell"><div className="spinner"/>{ru ? 'Загрузка аккаунтов…' : 'Loading accounts…'}</td></tr> : !accounts.length ? <tr><td colSpan={5} className="state-cell">{ru ? 'Аккаунты не найдены.' : 'No accounts found.'}</td></tr> : accounts.map(account => <tr key={account.id}>
          <td><strong>{account.name || '—'}</strong>{account.developer ? <small className="developer-role">developer</small> : null}</td>
          <td><span className="developer-email">{account.email}</span>{account.emailVerified ? <small>{ru ? 'Подтверждён' : 'Verified'}</small> : null}</td>
          <td>{dateTime(account.createdAt, locale)}</td><td>{account.purchaseCount}</td>
          <td><label className="access-toggle"><input type="checkbox" checked={account.axiScanner} disabled={account.developer || saving === account.id} onChange={event => void setAxiAccess(account, event.target.checked)}/><span>{account.axiScanner ? (ru ? 'Разрешён' : 'Allowed') : (ru ? 'Закрыт' : 'Blocked')}</span></label></td>
        </tr>)}
      </tbody></table></div>
    </section>
  </main>
}

