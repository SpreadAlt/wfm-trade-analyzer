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
  const language = (() => {
    try { return localStorage.getItem('frameanalytics-locale') || document.documentElement.lang || 'en' }
    catch { return 'en' }
  })()
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      Language: language,
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
  signIn: 'Войти',
  signUp: 'Регистрация',
  name: 'Ник',
  nameHint: '3–24 символа: латинские буквы, цифры и _. Первый символ — буква.',
  invalidName: 'Ник должен начинаться с латинской буквы и содержать 3–24 символа: A–Z, цифры или _.',
  email: 'Email',
  password: 'Пароль',
  confirmPassword: 'Повторите пароль',
  passwordMismatch: 'Пароли не совпадают.',
  create: 'Создать аккаунт',
  enter: 'Войти',
  logout: 'Выйти',
  confirmLogout: 'Вы действительно хотите выйти из аккаунта?',
  cancel: 'Отмена',
  forgot: 'Забыли пароль?',
  verifyTitle: 'Подтверждение почты',
  verifyCopy: 'Мы отправили шестизначный код на указанный email.',
  verificationCode: 'Код из письма',
  verify: 'Подтвердить email',
  resend: 'Отправить код повторно',
  cooldown: 'Новый код можно отправить через',
  resetTitle: 'Восстановление пароля',
  resetCopy: 'Сначала подтвердите почту. После проверки кода мы отправим новый пароль из 12 символов.',
  sendCode: 'Отправить код',
  resetConfirm: 'Подтвердить и создать пароль',
  resetDoneTitle: 'Новый пароль отправлен',
  resetDoneCopy: 'Проверьте почту и войдите с новым автоматически сгенерированным паролем.',
  backToSignIn: 'Вернуться ко входу',
  loading: 'Проверяем сессию…'
} : {
  signIn: 'Sign in',
  signUp: 'Register',
  name: 'Username',
  nameHint: '3–24 characters: Latin letters, digits and _. The first character must be a letter.',
  invalidName: 'The username must start with a Latin letter and contain 3–24 characters: A–Z, digits or _.',
  email: 'Email',
  password: 'Password',
  confirmPassword: 'Confirm password',
  passwordMismatch: 'Passwords do not match.',
  create: 'Create account',
  enter: 'Sign in',
  logout: 'Sign out',
  confirmLogout: 'Are you sure you want to sign out?',
  cancel: 'Cancel',
  forgot: 'Forgot password?',
  verifyTitle: 'Verify your email',
  verifyCopy: 'We sent a six-digit code to your email address.',
  verificationCode: 'Email code',
  verify: 'Verify email',
  resend: 'Send a new code',
  cooldown: 'A new code can be sent in',
  resetTitle: 'Password recovery',
  resetCopy: 'First verify your email. After the code is accepted, we will email a new 12-character password.',
  sendCode: 'Send code',
  resetConfirm: 'Verify and create password',
  resetDoneTitle: 'New password sent',
  resetDoneCopy: 'Check your inbox and sign in with the new automatically generated password.',
  backToSignIn: 'Back to sign in',
  loading: 'Checking session…'
}

const ACCOUNT_LOGIN_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,23}$/
const CODE_COOLDOWN_MS = 60_000
const CODE_COOLDOWN_STORAGE_KEY = 'frameanalytics-auth-code-cooldown-until'

const initialCodeCooldown = () => {
  try {
    const value = Number(localStorage.getItem(CODE_COOLDOWN_STORAGE_KEY))
    return Number.isFinite(value) && value > Date.now() ? value : 0
  } catch { return 0 }
}

const formatCooldown = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

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
  const [confirmPassword, setConfirmPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [logoutConfirmation, setLogoutConfirmation] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState(initialCodeCooldown)
  const [clock, setClock] = useState(Date.now())
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - clock) / 1000))

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return
    const timer = window.setInterval(() => setClock(Date.now()), 250)
    return () => window.clearInterval(timer)
  }, [cooldownUntil])

  useEffect(() => {
    if (cooldownUntil > clock) return
    try { localStorage.removeItem(CODE_COOLDOWN_STORAGE_KEY) } catch { /* storage is optional */ }
  }, [cooldownUntil, clock])

  const startCodeCooldown = (seconds = CODE_COOLDOWN_MS / 1000) => {
    const next = Date.now() + Math.max(1, seconds) * 1000
    setCooldownUntil(next)
    setClock(Date.now())
    try { localStorage.setItem(CODE_COOLDOWN_STORAGE_KEY, String(next)) } catch { /* storage is optional */ }
  }

  const applyServerCooldown = (value: unknown) => {
    const retryAfter = Number((value as Error & { payload?: { retryAfterSeconds?: unknown } })?.payload?.retryAfterSeconds)
    if (Number.isFinite(retryAfter) && retryAfter > 0) startCodeCooldown(retryAfter)
  }

  if (auth.loading) {
    return <section className="panel account-panel account-loading"><div className="spinner"/><strong>{t.loading}</strong></section>
  }

  if (auth.account) {
    const login = auth.account.user.name?.trim() || auth.account.user.email.split('@')[0]
    const confirmSignOut = async () => {
      try {
        await auth.signOut()
        setLogoutConfirmation(false)
      } catch { /* the controller exposes the server error in the dialog */ }
    }
    return <>
      <section className="panel account-panel account-signed">
        <div className="account-identity"><strong>{login}</strong><small>{maskAccountEmail(auth.account.user.email)}</small></div>
        <button type="button" className="account-logout" disabled={auth.busy} onClick={() => { auth.clearError(); setLogoutConfirmation(true) }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10M13 8l4 4-4 4M9 12h8"/></svg>{t.logout}</button>
      </section>
      {logoutConfirmation ? <div className="account-confirm-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !auth.busy) setLogoutConfirmation(false) }}>
        <section className="panel account-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="account-logout-title">
          <div className="account-confirm-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10M13 8l4 4-4 4M9 12h8"/></svg></div>
          <h2 id="account-logout-title">{t.confirmLogout}</h2>
          {auth.error ? <small className="account-error">{auth.error}</small> : null}
          <div className="account-confirm-actions">
            <button type="button" className="secondary-action" disabled={auth.busy} onClick={() => setLogoutConfirmation(false)}>{t.cancel}</button>
            <button type="button" className="account-logout account-confirm-logout" disabled={auth.busy} onClick={() => void confirmSignOut()}>{auth.busy ? <span className="account-submit-spinner"/> : null}{t.logout}</button>
          </div>
        </section>
      </div> : null}
    </>
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const normalizedEmail = email.trim().toLowerCase()
    setFormError(null)
    try {
      if (mode === 'signup') {
        const normalizedName = name.trim()
        if (!ACCOUNT_LOGIN_PATTERN.test(normalizedName)) { setFormError(t.invalidName); return }
        if (password !== confirmPassword) { setFormError(t.passwordMismatch); return }
        if (!normalizedEmail || !password || cooldownSeconds > 0) return
        await auth.signUp(normalizedName, normalizedEmail, password)
        startCodeCooldown()
        setMode('verify')
        setOtp('')
      } else if (mode === 'verify') {
        if (!normalizedEmail || otp.length !== 6) return
        await auth.verifyEmail(normalizedEmail, otp)
      } else if (mode === 'reset-email') {
        if (!normalizedEmail || cooldownSeconds > 0) return
        await auth.requestPasswordReset(normalizedEmail)
        startCodeCooldown()
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
      setConfirmPassword('')
    } catch (value) { applyServerCooldown(value) }
  }

  const resendCode = async () => {
    if (auth.busy || cooldownSeconds > 0) return
    setFormError(null)
    try {
      if (mode === 'verify') await auth.resendVerification(email.trim().toLowerCase())
      else if (mode === 'reset-code') await auth.requestPasswordReset(email.trim().toLowerCase())
      else return
      startCodeCooldown()
    } catch (value) { applyServerCooldown(value) }
  }

  const selectMode = (next: typeof mode) => {
    setMode(next)
    setOtp('')
    setPassword('')
    setConfirmPassword('')
    setFormError(null)
    auth.clearError()
  }

  const isRegistration = mode === 'signup' || mode === 'verify'
  const heading = mode === 'verify' ? t.verifyTitle
    : mode === 'reset-email' || mode === 'reset-code' ? t.resetTitle
      : mode === 'reset-done' ? t.resetDoneTitle
        : mode === 'signup' ? t.signUp : t.signIn
  const explanation = mode === 'verify' ? t.verifyCopy
    : mode === 'reset-email' || mode === 'reset-code' ? t.resetCopy
      : mode === 'reset-done' ? t.resetDoneCopy : ''
  const sendsCode = mode === 'signup' || mode === 'reset-email'
  const submitDisabled = auth.busy || (sendsCode && cooldownSeconds > 0)
  const submitLabel = cooldownSeconds > 0 && sendsCode
    ? `${t.cooldown} ${formatCooldown(cooldownSeconds)}`
    : mode === 'signup' ? t.create : mode === 'verify' ? t.verify : mode === 'reset-email' ? t.sendCode : mode === 'reset-code' ? t.resetConfirm : t.enter

  return <section className="panel account-panel">
    <div className="account-auth-copy"><h2>{heading}</h2>{explanation ? <p>{explanation}</p> : null}</div>
    {mode === 'signin' || mode === 'signup' ? <div className="account-tabs">
      <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => selectMode('signin')}>{t.signIn}</button>
      <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => selectMode('signup')}>{t.signUp}</button>
    </div> : null}
    {mode === 'reset-done' ? <button type="button" className="primary-action account-submit" onClick={() => selectMode('signin')}>{t.backToSignIn}</button> : <form className="account-form" onSubmit={submit}>
      {mode === 'signup' ? <label><span>{t.name}</span><input autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z][A-Za-z0-9_]{2,23}" title={t.nameHint} value={name} onChange={event => setName(event.target.value)} required/><small className="account-field-hint">{t.nameHint}</small></label> : null}
      <label><span>{t.email}</span><input type="email" autoComplete="email" readOnly={mode === 'verify' || mode === 'reset-code'} value={email} onChange={event => setEmail(event.target.value)} required/></label>
      {mode === 'verify' || mode === 'reset-code' ? <label><span>{t.verificationCode}</span><input className="account-otp-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} required/></label> : null}
      {mode === 'signin' || mode === 'signup' ? <label><span>{t.password}</span><input type="password" minLength={8} autoComplete={isRegistration ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} required/></label> : null}
      {mode === 'signup' ? <label><span>{t.confirmPassword}</span><input type="password" minLength={8} autoComplete="new-password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} required/></label> : null}
      <button type="submit" className="primary-action account-submit" disabled={submitDisabled}>{auth.busy ? <span className="account-submit-spinner"/> : null}{submitLabel}</button>
      {mode === 'signin' ? <button type="button" className="account-text-action" onClick={() => selectMode('reset-email')}>{t.forgot}</button> : null}
      {mode === 'verify' || mode === 'reset-code' ? <button type="button" className="account-text-action" disabled={auth.busy || cooldownSeconds > 0} onClick={() => void resendCode()}>{cooldownSeconds > 0 ? `${t.cooldown} ${formatCooldown(cooldownSeconds)}` : t.resend}</button> : null}
      {cooldownSeconds > 0 && (mode === 'signup' || mode === 'reset-email') ? <small className="account-cooldown" role="status">{t.cooldown} {formatCooldown(cooldownSeconds)}</small> : null}
      {mode === 'reset-email' || mode === 'reset-code' || mode === 'verify' ? <button type="button" className="account-text-action muted" onClick={() => selectMode('signin')}>{t.backToSignIn}</button> : null}
      {formError ? <small className="account-error">{formError}</small> : null}
      {auth.error ? <small className="account-error">{auth.error}</small> : null}
    </form>}
  </section>
}
