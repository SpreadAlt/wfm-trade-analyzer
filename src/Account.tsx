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
  signUp: (name: string, email: string, password: string) => Promise<void>
  verifyEmail: (email: string, otp: string) => Promise<void>
  resendVerification: (email: string) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  completePasswordReset: (email: string, otp: string) => Promise<void>
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

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    await action(async () => {
      await accountRequestJson('/api/auth/sign-up/email', {
        method: 'POST',
        body: JSON.stringify({ name, email, password })
      })
    })
  }, [action])

  const verifyEmail = useCallback(async (email: string, otp: string) => {
    await action(async () => {
      await accountRequestJson('/api/auth/email-otp/verify-email', {
        method: 'POST',
        body: JSON.stringify({ email, otp })
      })
      await refresh()
    })
  }, [action, refresh])

  const resendVerification = useCallback(async (email: string) => {
    await action(async () => {
      await accountRequestJson('/api/auth/email-otp/send-verification-otp', {
        method: 'POST',
        body: JSON.stringify({ email, type: 'email-verification' })
      })
    })
  }, [action])

  const requestPasswordReset = useCallback(async (email: string) => {
    await action(async () => {
      await accountRequestJson('/api/auth/email-otp/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({ email })
      })
    })
  }, [action])

  const completePasswordReset = useCallback(async (email: string, otp: string) => {
    await action(async () => {
      await accountRequestJson('/api/auth/password-recovery/confirm', {
        method: 'POST',
        body: JSON.stringify({ email, otp })
      })
    })
  }, [action])

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
    loading, busy, error, account, refresh, signUp, verifyEmail, resendVerification,
    requestPasswordReset, completePasswordReset, signIn, signOut,
    linkWfmProfile, unlinkWfmProfile, startSmartBuy, startSellAdvisor,
    loadPurchases, upsertPurchases, deletePurchase,
    clearError: () => setError(null)
  }), [
    loading, busy, error, account, refresh, signUp, verifyEmail, resendVerification,
    requestPasswordReset, completePasswordReset, signIn, signOut,
    linkWfmProfile, unlinkWfmProfile, startSmartBuy, startSellAdvisor,
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
  needAccount: 'Войдите в аккаунт или создайте новый. Регистрация подтверждается кодом из письма.',
  forgot: 'Забыли пароль?',
  verifyTitle: 'Подтверждение почты',
  verifyCopy: 'Мы отправили шестизначный код на указанный email.',
  verificationCode: 'Код из письма',
  verify: 'Подтвердить email',
  resend: 'Отправить код повторно',
  resetTitle: 'Восстановление пароля',
  resetCopy: 'Сначала подтвердите почту. После проверки кода мы отправим новый пароль из 12 символов.',
  sendCode: 'Отправить код',
  resetConfirm: 'Подтвердить и создать пароль',
  resetDoneTitle: 'Новый пароль отправлен',
  resetDoneCopy: 'Проверьте почту и войдите с новым автоматически сгенерированным паролем.',
  backToSignIn: 'Вернуться ко входу',
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
  needAccount: 'Sign in or create an account. Registration is confirmed with a code sent by email.',
  forgot: 'Forgot password?',
  verifyTitle: 'Verify your email',
  verifyCopy: 'We sent a six-digit code to your email address.',
  verificationCode: 'Email code',
  verify: 'Verify email',
  resend: 'Send a new code',
  resetTitle: 'Password recovery',
  resetCopy: 'First verify your email. After the code is accepted, we will email a new 12-character password.',
  sendCode: 'Send code',
  resetConfirm: 'Verify and create password',
  resetDoneTitle: 'New password sent',
  resetDoneCopy: 'Check your inbox and sign in with the new automatically generated password.',
  backToSignIn: 'Back to sign in',
  loading: 'Checking session…'
}

const maskAccountEmail = (value: string) => {
  const separator = value.lastIndexOf('@')
  if (separator <= 0) return '••••••'
  const local = value.slice(0, separator)
  const domainParts = value.slice(separator + 1).split('.')
  const host = domainParts.shift() || ''
  const mask = (part: string, visible: number) => `${part.slice(0, visible)}${'•'.repeat(Math.max(3, Math.min(6, part.length - visible)))}`
  return `${mask(local, Math.min(2, local.length))}@${mask(host, Math.min(1, host.length))}${domainParts.length ? `.${domainParts.join('.')}` : ''}`
}

export const AccountPanel = ({ locale, auth }: { locale: Locale; auth: FrameAccountController }) => {
  const t = copy(locale)
  const [mode, setMode] = useState<'signin' | 'signup' | 'verify' | 'reset-email' | 'reset-code' | 'reset-done'>('signin')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')

  if (auth.loading) {
    return <section className="panel account-panel account-loading"><div className="spinner"/><strong>{t.loading}</strong></section>
  }

  if (auth.account) {
    const login = auth.account.user.name?.trim() || auth.account.user.email.split('@')[0]
    return <section className="panel account-panel account-signed">
      <div className="account-identity"><strong>{login}</strong><small>{maskAccountEmail(auth.account.user.email)}</small></div>
      <button type="button" className="account-logout" disabled={auth.busy} onClick={() => void auth.signOut()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10M13 8l4 4-4 4M9 12h8"/></svg>{t.logout}</button>
    </section>
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    try {
      if (mode === 'signup') {
        if (!name.trim() || !normalizedEmail || !password) return
        await auth.signUp(name.trim(), normalizedEmail, password)
        setMode('verify')
        setOtp('')
      } else if (mode === 'verify') {
        if (!normalizedEmail || otp.length !== 6) return
        await auth.verifyEmail(normalizedEmail, otp)
      } else if (mode === 'reset-email') {
        if (!normalizedEmail) return
        await auth.requestPasswordReset(normalizedEmail)
        setMode('reset-code')
        setOtp('')
      } else if (mode === 'reset-code') {
        if (!normalizedEmail || otp.length !== 6) return
        await auth.completePasswordReset(normalizedEmail, otp)
        setMode('reset-done')
        setOtp('')
      } else if (mode === 'signin') {
        if (!normalizedEmail || !password) return
        await auth.signIn(normalizedEmail, password)
      }
      setPassword('')
    } catch { /* error is rendered from controller */ }
  }

  const selectMode = (next: typeof mode) => {
    setMode(next)
    setOtp('')
    setPassword('')
    auth.clearError()
  }

  const isRegistration = mode === 'signup' || mode === 'verify'
  const heading = mode === 'verify' ? t.verifyTitle
    : mode === 'reset-email' || mode === 'reset-code' ? t.resetTitle
      : mode === 'reset-done' ? t.resetDoneTitle
        : mode === 'signup' ? t.signUp : t.signIn
  const explanation = mode === 'verify' ? t.verifyCopy
    : mode === 'reset-email' || mode === 'reset-code' ? t.resetCopy
      : mode === 'reset-done' ? t.resetDoneCopy : t.needAccount

  return <section className="panel account-panel">
    <div className="account-auth-copy"><span className="eyebrow">{t.title}</span><h2>{heading}</h2><p>{explanation}</p></div>
    {mode === 'signin' || mode === 'signup' ? <div className="account-tabs">
      <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => selectMode('signin')}>{t.signIn}</button>
      <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => selectMode('signup')}>{t.signUp}</button>
    </div> : null}
    {mode === 'reset-done' ? <button type="button" className="primary-action account-submit" onClick={() => selectMode('signin')}>{t.backToSignIn}</button> : <form className="account-form" onSubmit={submit}>
      {mode === 'signup' ? <label><span>{t.name}</span><input autoComplete="name" value={name} onChange={event => setName(event.target.value)} required/></label> : null}
      <label><span>{t.email}</span><input type="email" autoComplete="email" readOnly={mode === 'verify' || mode === 'reset-code'} value={email} onChange={event => setEmail(event.target.value)} required/></label>
      {mode === 'verify' || mode === 'reset-code' ? <label><span>{t.verificationCode}</span><input className="account-otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} required/></label> : null}
      {mode === 'signin' || mode === 'signup' ? <label><span>{t.password}</span><input type="password" minLength={8} autoComplete={isRegistration ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} required/></label> : null}
      <button type="submit" className="primary-action account-submit" disabled={auth.busy}>{auth.busy ? <span className="account-submit-spinner"/> : null}{mode === 'signup' ? t.create : mode === 'verify' ? t.verify : mode === 'reset-email' ? t.sendCode : mode === 'reset-code' ? t.resetConfirm : t.enter}</button>
      {mode === 'signin' ? <button type="button" className="account-text-action" onClick={() => selectMode('reset-email')}>{t.forgot}</button> : null}
      {mode === 'verify' ? <button type="button" className="account-text-action" disabled={auth.busy} onClick={() => void auth.resendVerification(email.trim().toLowerCase())}>{t.resend}</button> : null}
      {mode === 'reset-email' || mode === 'reset-code' || mode === 'verify' ? <button type="button" className="account-text-action muted" onClick={() => selectMode('signin')}>{t.backToSignIn}</button> : null}
      {auth.error ? <small className="account-error">{auth.error}</small> : null}
    </form>}
  </section>
}
