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
}

type SmartBuyPermitResponse = {
  ok: true
  permitId: string
  smartBuy: SmartBuyUsage
}

type PurchaseListResponse = {
  ok: true
  purchases: PortfolioPurchase[]
}

const requestJson = async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
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
    const error = new Error(payload?.error || `HTTP ${response.status}`) as Error & { status?: number; payload?: any }
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
  signUp: (name: string, email: string, password: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  linkWfmProfile: (profile: string) => Promise<void>
  unlinkWfmProfile: () => Promise<void>
  reserveSmartBuy: () => Promise<SmartBuyPermitResponse>
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
      const next = await requestJson<FrameAccountSnapshot>('/api/account')
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

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    await action(async () => {
      await requestJson('/api/auth/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
      })
      await refresh()
    })
  }, [action, refresh])

  const signIn = useCallback(async (email: string, password: string) => {
    await action(async () => {
      await requestJson('/api/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      })
      await refresh()
    })
  }, [action, refresh])

  const signOut = useCallback(async () => {
    await action(async () => {
      await requestJson('/api/auth/sign-out', { method: 'POST' })
      setAccount(null)
    })
  }, [action])

  const linkWfmProfile = useCallback(async (profile: string) => {
    await action(async () => {
      await requestJson('/api/account/wfm-profile', {
        method: 'PATCH',
        body: JSON.stringify({ profile })
      })
      await refresh()
    })
  }, [action, refresh])

  const unlinkWfmProfile = useCallback(async () => {
    await action(async () => {
      await requestJson('/api/account/wfm-profile', { method: 'DELETE' })
      await refresh()
    })
  }, [action, refresh])

  const reserveSmartBuy = useCallback(async () => {
    let result!: SmartBuyPermitResponse
    await action(async () => {
      result = await requestJson<SmartBuyPermitResponse>('/api/smart-buy/permit', { method: 'POST' })
      setAccount(current => current ? { ...current, smartBuy: result.smartBuy } : current)
    })
    return result
  }, [action])

  const loadPurchases = useCallback(async () => {
    const result = await requestJson<PurchaseListResponse>('/api/account/purchases')
    return result.purchases || []
  }, [])

  const upsertPurchases = useCallback(async (purchases: PortfolioPurchase[]) => {
    if (!purchases.length) return
    await requestJson('/api/account/purchases', {
      method: 'POST',
      body: JSON.stringify({ purchases })
    })
  }, [])

  const deletePurchase = useCallback(async (id: string) => {
    await requestJson(`/api/account/purchases?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
  }, [])

  return useMemo(() => ({
    loading, busy, error, account, refresh, signUp, signIn, signOut,
    linkWfmProfile, unlinkWfmProfile, reserveSmartBuy,
    loadPurchases, upsertPurchases, deletePurchase,
    clearError: () => setError(null)
  }), [
    loading, busy, error, account, refresh, signUp, signIn, signOut,
    linkWfmProfile, unlinkWfmProfile, reserveSmartBuy,
    loadPurchases, upsertPurchases, deletePurchase
  ])
}

const copy = (locale: Locale) => locale === 'ru' ? {
  title: 'Аккаунт FrameAnalytics',
  signedIn: 'Вы вошли как',
  serverSaved: 'Профиль и покупки синхронизируются с аккаунтом.',
  signIn: 'Войти',
  signUp: 'Регистрация',
  name: 'Имя',
  email: 'Email',
  password: 'Пароль',
  create: 'Создать аккаунт',
  enter: 'Войти',
  logout: 'Выйти',
  needAccount: 'Войдите или зарегистрируйтесь, чтобы использовать профиль, покупки и Smart Buy.',
  loading: 'Проверяем сессию…'
} : {
  title: 'FrameAnalytics account',
  signedIn: 'Signed in as',
  serverSaved: 'Your profile and purchases are synced with your account.',
  signIn: 'Sign in',
  signUp: 'Register',
  name: 'Name',
  email: 'Email',
  password: 'Password',
  create: 'Create account',
  enter: 'Sign in',
  logout: 'Sign out',
  needAccount: 'Sign in or register to use your profile, purchases and Smart Buy.',
  loading: 'Checking session…'
}

export const AccountPanel = ({ locale, auth }: { locale: Locale; auth: FrameAccountController }) => {
  const t = copy(locale)
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  if (auth.loading) {
    return <section className="panel account-panel account-loading"><div className="spinner"/><strong>{t.loading}</strong></section>
  }

  if (auth.account) {
    return <section className="panel account-panel account-signed">
      <div className="account-identity">
        <div className="account-avatar">{(auth.account.user.name || auth.account.user.email).slice(0, 2).toUpperCase()}</div>
        <div>
          <span className="eyebrow">{t.title}</span>
          <strong>{auth.account.user.name}</strong>
          <small>{auth.account.user.email}</small>
        </div>
      </div>
      <p>{t.serverSaved}</p>
      <button type="button" className="smart-buy-secondary danger" disabled={auth.busy} onClick={() => void auth.signOut()}>{t.logout}</button>
    </section>
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!email.trim() || !password) return
    try {
      if (mode === 'signup') {
        if (!name.trim()) return
        await auth.signUp(name.trim(), email.trim(), password)
      } else {
        await auth.signIn(email.trim(), password)
      }
      setPassword('')
    } catch { /* error is rendered from controller */ }
  }

  return <section className="panel account-panel account-auth-card">
    <div className="account-auth-header">
      <div className="account-auth-mark" aria-hidden="true"><span>FA</span></div>
      <div className="account-auth-copy">
        <span className="eyebrow">{t.title}</span>
        <h2>{mode === 'signup' ? t.signUp : t.signIn}</h2>
        <p>{t.needAccount}</p>
      </div>
    </div>

    <div className="account-tabs" role="tablist" aria-label={t.title}>
      <button type="button" role="tab" aria-selected={mode === 'signin'} className={mode === 'signin' ? 'active' : ''} onClick={() => { setMode('signin'); auth.clearError() }}>{t.signIn}</button>
      <button type="button" role="tab" aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); auth.clearError() }}>{t.signUp}</button>
    </div>

    <form className="account-form" onSubmit={submit}>
      {mode === 'signup' ? <label><span>{t.name}</span><input autoComplete="name" value={name} onChange={event => setName(event.target.value)} required/></label> : null}
      <label><span>{t.email}</span><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required/></label>
      <label><span>{t.password}</span><input type="password" minLength={8} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} required/></label>
      <button type="submit" className="primary-action account-submit" disabled={auth.busy}>
        {auth.busy ? <span className="account-submit-spinner" aria-hidden="true"/> : null}
        <span>{mode === 'signup' ? t.create : t.enter}</span>
      </button>
      {auth.error ? <small className="account-error">{auth.error}</small> : null}
    </form>
  </section>
}
