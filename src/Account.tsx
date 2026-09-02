import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import type { Locale } from './i18n'
import type { PortfolioPurchase } from './Portfolio'
import './account.css'

export type SmartBuyUsage = {
  limit: number
  windowHours: number
  used: number
  remaining: number
  cooldownSeconds: number
  cooldownRemainingSeconds: number
  canRun: boolean
  lastRunAt: string | null
}

export type FrameAccountSnapshot = {
  ok: true
  user: {
    id: string
    name: string
    email: string
    emailVerified: boolean
    image: string | null
    createdAt?: string
    updatedAt?: string
  }
  profile: {
    wfmProfile: string | null
    updatedAt: string | null
  }
  smartBuy: SmartBuyUsage
  access: {
    role: 'developer' | 'user'
    developer: boolean
    axiScanner: boolean
  }
}

export type SmartBuyStartResponse = {
  ok: true
  permitId: string
  profileSlug: string
  smartBuyVersion: string
  smartBuyRuntimeRevision: string
  jobId: string
  state: 'queued'
  queuedAt: string
  smartBuy: SmartBuyUsage
  analysis?: 'smart-buy' | 'sell-advisor'
}

type PurchaseListResponse = {
  ok: true
  purchases: PortfolioPurchase[]
}

export const accountRequestJson = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {})
    }
  })

  let payload: any = null
  try { payload = await response.json() } catch { /* ignore non-json body */ }

  if (!response.ok) {
    const error = new Error(payload?.error || payload?.message || `HTTP ${response.status}`) as Error & { status?: number; payload?: any }
    error.status = response.status
    error.payload = payload
    throw error
  }
  return payload as T
}

export type FrameAccountController = {
  loading: boolean
  busy: boolean
  error: string | null
  account: FrameAccountSnapshot | null
  refresh: () => Promise<FrameAccountSnapshot | null>
  signUp: (name: string, email: string, password: string, inviteCode: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  linkWfmProfile: (profile: string) => Promise<void>
  unlinkWfmProfile: () => Promise<void>
  startSmartBuy: () => Promise<SmartBuyStartResponse>
  startSellAdvisor: () => Promise<SmartBuyStartResponse>
  loadPurchases: () => Promise<PortfolioPurchase[]>
  upsertPurchases: (purchases: PortfolioPurchase[]) => Promise<void>
  deletePurchase: (id: string) => Promise<void>
  clearError: () => void
}

export const useFrameAccount = (): FrameAccountController => {
  const [account, setAccount] = useState<FrameAccountSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      const next = await accountRequestJson<FrameAccountSnapshot>('/api/account')
      setAccount(next)
      setError(null)
      return next
    } catch (value) {
      const status = (value as Error & { status?: number })?.status
      if (status === 401) {
        setAccount(null)
        setError(null)
        return null
      }
      const message = value instanceof Error ? value.message : String(value)
      setError(message)
      throw value
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const action = useCallback(async (work: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try { await work() }
    catch (value) {
      setError(value instanceof Error ? value.message : String(value))
      throw value
    } finally {
      setBusy(false)
    }
  }, [])

  const signUp = useCallback(async (name: string, email: string, password: string, inviteCode: string) => {
    await action(async () => {
      await accountRequestJson('/api/beta/sign-up', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, inviteCode })
      })
      await refresh()
    })
  }, [action, refresh])

  const signIn = useCallback(async (email: string, password: string) => {
    await action(async () => {
      await accountRequestJson('/api/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      })
      await refresh()
    })
  }, [action, refresh])

  const signOut = useCallback(async () => {
    await action(async () => {
      await accountRequestJson('/api/auth/sign-out', { method: 'POST' })
      setAccount(null)
    })
  }, [action])

  const linkWfmProfile = useCallback(async (profile: string) => {
    await action(async () => {
      await accountRequestJson('/api/account/wfm-profile', {
        method: 'PATCH',
        body: JSON.stringify({ profile })
      })
      await refresh()
    })
  }, [action, refresh])

  const unlinkWfmProfile = useCallback(async () => {
    await action(async () => {
      await accountRequestJson('/api/account/wfm-profile', { method: 'DELETE' })
      await refresh()
    })
  }, [action, refresh])

  const startSmartBuy = useCallback(async () => {
    let result!: SmartBuyStartResponse
    await action(async () => {
      result = await accountRequestJson<SmartBuyStartResponse>('/api/smart-buy/start', { method: 'POST' })
      setAccount(current => current ? { ...current, smartBuy: result.smartBuy } : current)
    })
    return result
  }, [action])

  const startSellAdvisor = useCallback(async () => {
    let result!: SmartBuyStartResponse
    await action(async () => {
      result = await accountRequestJson<SmartBuyStartResponse>('/api/sell-advisor/start', { method: 'POST' })
      setAccount(current => current ? { ...current, smartBuy: result.smartBuy } : current)
    })
    return result
  }, [action])

  const loadPurchases = useCallback(async () => {
    const result = await accountRequestJson<PurchaseListResponse>('/api/account/purchases')
    return result.purchases || []
  }, [])

  const upsertPurchases = useCallback(async (purchases: PortfolioPurchase[]) => {
    if (!purchases.length) return
    await accountRequestJson('/api/account/purchases', {
      method: 'POST',
      body: JSON.stringify({ purchases })
    })
  }, [])

  const deletePurchase = useCallback(async (id: string) => {
    await accountRequestJson(`/api/account/purchases?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  }, [])

  return useMemo(() => ({
    loading, busy, error, account, refresh, signUp, signIn, signOut,
    linkWfmProfile, unlinkWfmProfile, startSmartBuy, startSellAdvisor,
    loadPurchases, upsertPurchases, deletePurchase,
    clearError: () => setError(null)
  }), [
    loading, busy, error, account, refresh, signUp, signIn, signOut,
    linkWfmProfile, unlinkWfmProfile, startSmartBuy, startSellAdvisor,
    loadPurchases, upsertPurchases, deletePurchase
  ])
}

const copy = (locale: Locale) => locale === 'ru' ? {
  title: 'Аккаунт FrameAnalytics',
  signedIn: 'Вы вошли как',
  serverSaved: 'Профиль и покупки синхронизируются с аккаунтом.',
  sessionActive: 'Сессия активна',
  syncTitle: 'Облачная синхронизация',
  syncDetail: 'Изменения сохраняются автоматически',
  signIn: 'Войти',
  signUp: 'Регистрация',
  name: 'Имя',
  email: 'Email',
  password: 'Пароль',
  inviteCode: 'Код приглашения',
  invitePlaceholder: 'FA-XXXX-XXXX-XXXX',
  create: 'Создать аккаунт',
  enter: 'Войти',
  logout: 'Выйти',
  needAccount: 'FrameAnalytics работает в режиме закрытой беты. Войдите или зарегистрируйтесь по приглашению.',
  loading: 'Проверяем сессию…'
} : {
  title: 'FrameAnalytics account',
  signedIn: 'Signed in as',
  serverSaved: 'Your profile and purchases are synced with your account.',
  sessionActive: 'Session active',
  syncTitle: 'Cloud sync',
  syncDetail: 'Changes are saved automatically',
  signIn: 'Sign in',
  signUp: 'Register',
  name: 'Name',
  email: 'Email',
  password: 'Password',
  inviteCode: 'Invite code',
  invitePlaceholder: 'FA-XXXX-XXXX-XXXX',
  create: 'Create account',
  enter: 'Sign in',
  logout: 'Sign out',
  needAccount: 'FrameAnalytics is in closed beta. Sign in or register with an invitation.',
  loading: 'Checking session…'
}

export const AccountPanel = ({ locale, auth }: { locale: Locale; auth: FrameAccountController }) => {
  const t = copy(locale)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')

  if (auth.loading) {
    return <section className="panel account-panel account-loading"><div className="spinner"/><strong>{t.loading}</strong></section>
  }

  if (auth.account) {
    return <section className="panel account-panel account-signed">
      <div className="account-signed-header">
        <div className="account-identity">
          <div className="account-avatar">{(auth.account.user.name || auth.account.user.email).slice(0, 2).toUpperCase()}</div>
          <div>
            <span className="eyebrow">{t.title}</span>
            <strong>{auth.account.user.name}</strong>
            <small>{auth.account.user.email}</small>
          </div>
        </div>
        <span className="account-session-status"><i aria-hidden="true"/>{t.sessionActive}</span>
      </div>
      <div className="account-sync-state">
        <span className="account-sync-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7.5 18.5h9a4 4 0 0 0 .7-7.9 5.7 5.7 0 0 0-10.9-1.5A4.8 4.8 0 0 0 7.5 18.5Z"/><path d="m9 13 2 2 4-4"/></svg></span>
        <div><strong>{t.syncTitle}</strong><p>{t.serverSaved}</p><small>{t.syncDetail}</small></div>
      </div>
      <button type="button" className="account-logout" disabled={auth.busy} onClick={() => void auth.signOut()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10M13 8l4 4-4 4M9 12h8"/></svg>{t.logout}</button>
    </section>
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !password) return
    try {
      if (mode === 'signup') {
        if (!name.trim()) return
        if (!inviteCode.trim()) return
        await auth.signUp(name.trim(), email.trim(), password, inviteCode.trim())
      } else {
        await auth.signIn(email.trim(), password)
      }
      setPassword('')
      setInviteCode('')
    } catch { /* error is rendered from controller */ }
  }

  return <section className="panel account-panel">
    <div className="account-auth-copy"><span className="eyebrow">{t.title}</span><h2>{mode === 'signup' ? t.signUp : t.signIn}</h2><p>{t.needAccount}</p></div>
    <div className="account-tabs">
      <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); auth.clearError() }}>{t.signIn}</button>
      <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); auth.clearError() }}>{t.signUp}</button>
    </div>
    <form className="account-form" onSubmit={submit}>
      {mode === 'signup' ? <label><span>{t.name}</span><input autoComplete="name" value={name} onChange={event => setName(event.target.value)} required/></label> : null}
      {mode === 'signup' ? <label><span>{t.inviteCode}</span><input autoComplete="one-time-code" maxLength={32} placeholder={t.invitePlaceholder} value={inviteCode} onChange={event => setInviteCode(event.target.value.toUpperCase())} required/></label> : null}
      <label><span>{t.email}</span><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required/></label>
      <label><span>{t.password}</span><input type="password" minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} required/></label>
      <button type="submit" className="primary-action" disabled={auth.busy}>{mode === 'signup' ? t.create : t.enter}</button>
      {auth.error ? <small className="account-error">{auth.error}</small> : null}
    </form>
  </section>
}
