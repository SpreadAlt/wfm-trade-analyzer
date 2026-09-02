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
  const method = String(init.method || 'GET').toUpperCase()
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      Language: language,
      ...(method !== 'GET' && method !== 'HEAD' ? { 'Content-Type': 'application/json' } : {}),
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
  requestRegistrationCode: (name: string, email: string) => Promise<void>
  completeRegistration: (name: string, email: string, password: string, otp: string) => Promise<void>
  resendRegistrationCode: (name: string, email: string) => Promise<void>
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

  const requestRegistrationCode = useCallback(async (name: string, email: string) => {
    await action(async () => {
      await accountRequestJson('/api/auth/registration/request', {
        method: 'POST',
        body: JSON.stringify({ name, email })
      })
    })
  }, [action])

  const completeRegistration = useCallback(async (name: string, email: string, password: string, otp: string) => {
    await action(async () => {
      await accountRequestJson('/api/auth/registration/confirm', {
        method: 'POST',
        body: JSON.stringify({ name, email, password, otp })
      })
      await refresh()
    })
  }, [action, refresh])

  const resendRegistrationCode = useCallback(async (name: string, email: string) => {
    await action(async () => {
      await accountRequestJson('/api/auth/registration/request', {
        method: 'POST',
        body: JSON.stringify({ name, email })
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
      await accountRequestJson('/api/auth/sign-out', { method: 'POST', body: '{}' })
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
    loading, busy, error, account, refresh, requestRegistrationCode, completeRegistration, resendRegistrationCode,
    requestPasswordReset, completePasswordReset, signIn, signOut,
    linkWfmProfile, unlinkWfmProfile, startSmartBuy, startSellAdvisor,
    loadPurchases, upsertPurchases, deletePurchase,
    clearError: () => setError(null)
  }), [
    loading, busy, error, account, refresh, requestRegistrationCode, completeRegistration, resendRegistrationCode,
    requestPasswordReset, completePasswordReset, signIn, signOut,
    linkWfmProfile, unlinkWfmProfile, startSmartBuy, startSellAdvisor,
    loadPurchases, upsertPurchases, deletePurchase
  ])
}

const baseCopy = (locale: Locale) => locale === 'ru' ? {
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

type AccountCopy = { [Key in keyof ReturnType<typeof baseCopy>]: string }

const localizedAccountCopy: Partial<Record<Locale, Partial<AccountCopy>>> = {
  de: {
    signIn: 'Anmelden', signUp: 'Registrieren', name: 'Benutzername',
    nameHint: '3–24 Zeichen: lateinische Buchstaben, Ziffern und _. Das erste Zeichen muss ein Buchstabe sein.',
    invalidName: 'Der Benutzername muss mit einem lateinischen Buchstaben beginnen und 3–24 Zeichen enthalten: A–Z, Ziffern oder _.',
    password: 'Passwort', confirmPassword: 'Passwort bestätigen', passwordMismatch: 'Die Passwörter stimmen nicht überein.',
    create: 'Konto erstellen', enter: 'Anmelden', logout: 'Abmelden', confirmLogout: 'Möchtest du dich wirklich abmelden?', cancel: 'Abbrechen', forgot: 'Passwort vergessen?',
    verifyTitle: 'E-Mail bestätigen', verifyCopy: 'Wir haben einen sechsstelligen Code an deine E-Mail-Adresse gesendet.', verificationCode: 'Code aus der E-Mail', verify: 'E-Mail bestätigen', resend: 'Neuen Code senden', cooldown: 'Neuer Code verfügbar in',
    resetTitle: 'Passwort wiederherstellen', resetCopy: 'Bestätige zuerst deine E-Mail. Danach senden wir dir ein neues Passwort mit 12 Zeichen.', sendCode: 'Code senden', resetConfirm: 'Bestätigen und Passwort erstellen', resetDoneTitle: 'Neues Passwort gesendet', resetDoneCopy: 'Prüfe deinen Posteingang und melde dich mit dem neuen automatisch erstellten Passwort an.', backToSignIn: 'Zurück zur Anmeldung', loading: 'Sitzung wird geprüft…'
  },
  fr: {
    signIn: 'Se connecter', signUp: 'S’inscrire', name: 'Nom d’utilisateur',
    nameHint: '3 à 24 caractères : lettres latines, chiffres et _. Le premier caractère doit être une lettre.',
    invalidName: 'Le nom doit commencer par une lettre latine et contenir 3 à 24 caractères : A–Z, chiffres ou _.',
    password: 'Mot de passe', confirmPassword: 'Confirmer le mot de passe', passwordMismatch: 'Les mots de passe ne correspondent pas.',
    create: 'Créer le compte', enter: 'Se connecter', logout: 'Se déconnecter', confirmLogout: 'Voulez-vous vraiment vous déconnecter ?', cancel: 'Annuler', forgot: 'Mot de passe oublié ?',
    verifyTitle: 'Confirmer l’e-mail', verifyCopy: 'Nous avons envoyé un code à six chiffres à votre adresse e-mail.', verificationCode: 'Code reçu par e-mail', verify: 'Confirmer l’e-mail', resend: 'Renvoyer le code', cooldown: 'Nouveau code disponible dans',
    resetTitle: 'Récupération du mot de passe', resetCopy: 'Confirmez d’abord votre e-mail. Nous vous enverrons ensuite un nouveau mot de passe de 12 caractères.', sendCode: 'Envoyer le code', resetConfirm: 'Confirmer et créer le mot de passe', resetDoneTitle: 'Nouveau mot de passe envoyé', resetDoneCopy: 'Consultez votre boîte de réception et connectez-vous avec le nouveau mot de passe généré automatiquement.', backToSignIn: 'Retour à la connexion', loading: 'Vérification de la session…'
  },
  es: {
    signIn: 'Iniciar sesión', signUp: 'Registrarse', name: 'Nombre de usuario',
    nameHint: '3–24 caracteres: letras latinas, números y _. El primer carácter debe ser una letra.',
    invalidName: 'El nombre debe comenzar con una letra latina y contener entre 3 y 24 caracteres: A–Z, números o _.',
    password: 'Contraseña', confirmPassword: 'Confirmar contraseña', passwordMismatch: 'Las contraseñas no coinciden.',
    create: 'Crear cuenta', enter: 'Iniciar sesión', logout: 'Cerrar sesión', confirmLogout: '¿Seguro que quieres cerrar sesión?', cancel: 'Cancelar', forgot: '¿Olvidaste la contraseña?',
    verifyTitle: 'Confirmar correo', verifyCopy: 'Hemos enviado un código de seis dígitos a tu correo.', verificationCode: 'Código del correo', verify: 'Confirmar correo', resend: 'Enviar otro código', cooldown: 'Podrás enviar otro código en',
    resetTitle: 'Recuperar contraseña', resetCopy: 'Primero confirma tu correo. Después te enviaremos una contraseña nueva de 12 caracteres.', sendCode: 'Enviar código', resetConfirm: 'Confirmar y crear contraseña', resetDoneTitle: 'Nueva contraseña enviada', resetDoneCopy: 'Revisa tu correo e inicia sesión con la nueva contraseña generada automáticamente.', backToSignIn: 'Volver al inicio de sesión', loading: 'Comprobando la sesión…'
  },
  pt: {
    signIn: 'Entrar', signUp: 'Registar', name: 'Nome de utilizador',
    nameHint: '3–24 caracteres: letras latinas, números e _. O primeiro carácter deve ser uma letra.',
    invalidName: 'O nome deve começar por uma letra latina e conter 3–24 caracteres: A–Z, números ou _.',
    password: 'Palavra-passe', confirmPassword: 'Confirmar palavra-passe', passwordMismatch: 'As palavras-passe não coincidem.',
    create: 'Criar conta', enter: 'Entrar', logout: 'Sair', confirmLogout: 'Tem a certeza de que pretende sair?', cancel: 'Cancelar', forgot: 'Esqueceu a palavra-passe?',
    verifyTitle: 'Confirmar e-mail', verifyCopy: 'Enviámos um código de seis dígitos para o seu e-mail.', verificationCode: 'Código do e-mail', verify: 'Confirmar e-mail', resend: 'Enviar novo código', cooldown: 'Novo código disponível em',
    resetTitle: 'Recuperar palavra-passe', resetCopy: 'Confirme primeiro o e-mail. Depois enviaremos uma nova palavra-passe de 12 caracteres.', sendCode: 'Enviar código', resetConfirm: 'Confirmar e criar palavra-passe', resetDoneTitle: 'Nova palavra-passe enviada', resetDoneCopy: 'Consulte o e-mail e entre com a nova palavra-passe gerada automaticamente.', backToSignIn: 'Voltar ao início de sessão', loading: 'A verificar a sessão…'
  },
  pl: {
    signIn: 'Zaloguj się', signUp: 'Rejestracja', name: 'Nazwa użytkownika',
    nameHint: '3–24 znaki: litery łacińskie, cyfry i _. Pierwszy znak musi być literą.',
    invalidName: 'Nazwa musi zaczynać się od litery łacińskiej i zawierać 3–24 znaki: A–Z, cyfry lub _.',
    password: 'Hasło', confirmPassword: 'Powtórz hasło', passwordMismatch: 'Hasła nie są zgodne.',
    create: 'Utwórz konto', enter: 'Zaloguj się', logout: 'Wyloguj się', confirmLogout: 'Czy na pewno chcesz się wylogować?', cancel: 'Anuluj', forgot: 'Nie pamiętasz hasła?',
    verifyTitle: 'Potwierdź e-mail', verifyCopy: 'Wysłaliśmy sześciocyfrowy kod na Twój adres e-mail.', verificationCode: 'Kod z wiadomości', verify: 'Potwierdź e-mail', resend: 'Wyślij nowy kod', cooldown: 'Nowy kod będzie dostępny za',
    resetTitle: 'Odzyskiwanie hasła', resetCopy: 'Najpierw potwierdź e-mail. Następnie wyślemy nowe 12-znakowe hasło.', sendCode: 'Wyślij kod', resetConfirm: 'Potwierdź i utwórz hasło', resetDoneTitle: 'Nowe hasło wysłane', resetDoneCopy: 'Sprawdź pocztę i zaloguj się przy użyciu nowego automatycznie wygenerowanego hasła.', backToSignIn: 'Wróć do logowania', loading: 'Sprawdzanie sesji…'
  },
  uk: {
    signIn: 'Увійти', signUp: 'Реєстрація', name: 'Нік',
    nameHint: '3–24 символи: латинські літери, цифри та _. Перший символ — літера.',
    invalidName: 'Нік має починатися з латинської літери та містити 3–24 символи: A–Z, цифри або _.',
    password: 'Пароль', confirmPassword: 'Повторіть пароль', passwordMismatch: 'Паролі не збігаються.',
    create: 'Створити акаунт', enter: 'Увійти', logout: 'Вийти', confirmLogout: 'Ви справді хочете вийти з акаунта?', cancel: 'Скасувати', forgot: 'Забули пароль?',
    verifyTitle: 'Підтвердження пошти', verifyCopy: 'Ми надіслали шестизначний код на вашу електронну пошту.', verificationCode: 'Код із листа', verify: 'Підтвердити пошту', resend: 'Надіслати новий код', cooldown: 'Новий код можна надіслати через',
    resetTitle: 'Відновлення пароля', resetCopy: 'Спочатку підтвердьте пошту. Після цього ми надішлемо новий 12-символьний пароль.', sendCode: 'Надіслати код', resetConfirm: 'Підтвердити й створити пароль', resetDoneTitle: 'Новий пароль надіслано', resetDoneCopy: 'Перевірте пошту та увійдіть із новим автоматично створеним паролем.', backToSignIn: 'Повернутися до входу', loading: 'Перевіряємо сесію…'
  },
  tr: {
    signIn: 'Giriş yap', signUp: 'Kayıt ol', name: 'Kullanıcı adı',
    nameHint: '3–24 karakter: Latin harfleri, rakamlar ve _. İlk karakter bir harf olmalıdır.',
    invalidName: 'Kullanıcı adı Latin harfiyle başlamalı ve 3–24 karakter içermelidir: A–Z, rakamlar veya _.',
    password: 'Parola', confirmPassword: 'Parolayı doğrula', passwordMismatch: 'Parolalar eşleşmiyor.',
    create: 'Hesap oluştur', enter: 'Giriş yap', logout: 'Çıkış yap', confirmLogout: 'Hesaptan çıkmak istediğinizden emin misiniz?', cancel: 'İptal', forgot: 'Parolanızı mı unuttunuz?',
    verifyTitle: 'E-postayı doğrula', verifyCopy: 'E-posta adresinize altı haneli bir kod gönderdik.', verificationCode: 'E-posta kodu', verify: 'E-postayı doğrula', resend: 'Yeni kod gönder', cooldown: 'Yeni kod gönderme süresi',
    resetTitle: 'Parola kurtarma', resetCopy: 'Önce e-postanızı doğrulayın. Ardından 12 karakterli yeni bir parola göndereceğiz.', sendCode: 'Kod gönder', resetConfirm: 'Doğrula ve parola oluştur', resetDoneTitle: 'Yeni parola gönderildi', resetDoneCopy: 'Gelen kutunuzu kontrol edin ve otomatik oluşturulan yeni parolayla giriş yapın.', backToSignIn: 'Girişe dön', loading: 'Oturum kontrol ediliyor…'
  },
  it: {
    signIn: 'Accedi', signUp: 'Registrati', name: 'Nome utente',
    nameHint: '3–24 caratteri: lettere latine, numeri e _. Il primo carattere deve essere una lettera.',
    invalidName: 'Il nome deve iniziare con una lettera latina e contenere 3–24 caratteri: A–Z, numeri o _.',
    password: 'Password', confirmPassword: 'Conferma password', passwordMismatch: 'Le password non coincidono.',
    create: 'Crea account', enter: 'Accedi', logout: 'Esci', confirmLogout: 'Vuoi davvero uscire dall’account?', cancel: 'Annulla', forgot: 'Password dimenticata?',
    verifyTitle: 'Conferma email', verifyCopy: 'Abbiamo inviato un codice di sei cifre al tuo indirizzo email.', verificationCode: 'Codice email', verify: 'Conferma email', resend: 'Invia un nuovo codice', cooldown: 'Nuovo codice disponibile tra',
    resetTitle: 'Recupero password', resetCopy: 'Prima conferma l’email. Poi invieremo una nuova password di 12 caratteri.', sendCode: 'Invia codice', resetConfirm: 'Conferma e crea password', resetDoneTitle: 'Nuova password inviata', resetDoneCopy: 'Controlla la posta e accedi con la nuova password generata automaticamente.', backToSignIn: 'Torna all’accesso', loading: 'Verifica della sessione…'
  },
  sv: {
    signIn: 'Logga in', signUp: 'Registrera', name: 'Användarnamn',
    nameHint: '3–24 tecken: latinska bokstäver, siffror och _. Det första tecknet måste vara en bokstav.',
    invalidName: 'Användarnamnet måste börja med en latinsk bokstav och innehålla 3–24 tecken: A–Z, siffror eller _.',
    password: 'Lösenord', confirmPassword: 'Bekräfta lösenord', passwordMismatch: 'Lösenorden matchar inte.',
    create: 'Skapa konto', enter: 'Logga in', logout: 'Logga ut', confirmLogout: 'Är du säker på att du vill logga ut?', cancel: 'Avbryt', forgot: 'Glömt lösenordet?',
    verifyTitle: 'Bekräfta e-post', verifyCopy: 'Vi har skickat en sexsiffrig kod till din e-postadress.', verificationCode: 'Kod från e-post', verify: 'Bekräfta e-post', resend: 'Skicka en ny kod', cooldown: 'Ny kod kan skickas om',
    resetTitle: 'Återställ lösenord', resetCopy: 'Bekräfta först din e-post. Därefter skickar vi ett nytt lösenord med 12 tecken.', sendCode: 'Skicka kod', resetConfirm: 'Bekräfta och skapa lösenord', resetDoneTitle: 'Nytt lösenord skickat', resetDoneCopy: 'Kontrollera inkorgen och logga in med det nya automatiskt genererade lösenordet.', backToSignIn: 'Tillbaka till inloggning', loading: 'Kontrollerar sessionen…'
  },
  cs: {
    signIn: 'Přihlásit se', signUp: 'Registrovat', name: 'Uživatelské jméno',
    nameHint: '3–24 znaků: latinská písmena, číslice a _. První znak musí být písmeno.',
    invalidName: 'Jméno musí začínat latinským písmenem a obsahovat 3–24 znaků: A–Z, číslice nebo _.',
    password: 'Heslo', confirmPassword: 'Potvrdit heslo', passwordMismatch: 'Hesla se neshodují.',
    create: 'Vytvořit účet', enter: 'Přihlásit se', logout: 'Odhlásit se', confirmLogout: 'Opravdu se chcete odhlásit?', cancel: 'Zrušit', forgot: 'Zapomenuté heslo?',
    verifyTitle: 'Ověřit e-mail', verifyCopy: 'Na váš e-mail jsme poslali šestimístný kód.', verificationCode: 'Kód z e-mailu', verify: 'Ověřit e-mail', resend: 'Poslat nový kód', cooldown: 'Nový kód lze poslat za',
    resetTitle: 'Obnovení hesla', resetCopy: 'Nejprve ověřte e-mail. Poté vám pošleme nové 12znakové heslo.', sendCode: 'Poslat kód', resetConfirm: 'Ověřit a vytvořit heslo', resetDoneTitle: 'Nové heslo odesláno', resetDoneCopy: 'Zkontrolujte e-mail a přihlaste se novým automaticky vygenerovaným heslem.', backToSignIn: 'Zpět k přihlášení', loading: 'Kontrola relace…'
  },
  ja: {
    signIn: 'ログイン', signUp: '登録', name: 'ユーザー名',
    nameHint: '3～24文字の英字・数字・_を使用し、先頭は英字にしてください。',
    invalidName: 'ユーザー名は英字で始まり、3～24文字の英字・数字・_のみ使用できます。',
    password: 'パスワード', confirmPassword: 'パスワードを確認', passwordMismatch: 'パスワードが一致しません。',
    create: 'アカウントを作成', enter: 'ログイン', logout: 'ログアウト', confirmLogout: 'アカウントからログアウトしますか？', cancel: 'キャンセル', forgot: 'パスワードを忘れた場合',
    verifyTitle: 'メールを確認', verifyCopy: 'メールアドレスに6桁のコードを送信しました。', verificationCode: 'メールのコード', verify: 'メールを確認', resend: '新しいコードを送信', cooldown: '次のコードを送信できるまで',
    resetTitle: 'パスワードの復旧', resetCopy: 'まずメールを確認してください。確認後、12文字の新しいパスワードを送信します。', sendCode: 'コードを送信', resetConfirm: '確認してパスワードを作成', resetDoneTitle: '新しいパスワードを送信しました', resetDoneCopy: '受信トレイを確認し、自動生成された新しいパスワードでログインしてください。', backToSignIn: 'ログインに戻る', loading: 'セッションを確認中…'
  },
  ko: {
    signIn: '로그인', signUp: '회원가입', name: '사용자 이름',
    nameHint: '3~24자의 영문자, 숫자, _를 사용하고 첫 글자는 영문자로 입력하세요.',
    invalidName: '사용자 이름은 영문자로 시작하고 3~24자의 영문자, 숫자 또는 _만 포함해야 합니다.',
    password: '비밀번호', confirmPassword: '비밀번호 확인', passwordMismatch: '비밀번호가 일치하지 않습니다.',
    create: '계정 만들기', enter: '로그인', logout: '로그아웃', confirmLogout: '계정에서 로그아웃하시겠습니까?', cancel: '취소', forgot: '비밀번호를 잊으셨나요?',
    verifyTitle: '이메일 확인', verifyCopy: '이메일 주소로 6자리 코드를 보냈습니다.', verificationCode: '이메일 코드', verify: '이메일 확인', resend: '새 코드 보내기', cooldown: '새 코드 전송 가능 시간',
    resetTitle: '비밀번호 복구', resetCopy: '먼저 이메일을 확인하세요. 확인 후 12자의 새 비밀번호를 보내드립니다.', sendCode: '코드 보내기', resetConfirm: '확인 후 비밀번호 만들기', resetDoneTitle: '새 비밀번호를 보냈습니다', resetDoneCopy: '받은편지함을 확인하고 자동 생성된 새 비밀번호로 로그인하세요.', backToSignIn: '로그인으로 돌아가기', loading: '세션 확인 중…'
  },
  'zh-hans': {
    signIn: '登录', signUp: '注册', name: '用户名',
    nameHint: '3–24个字符：英文字母、数字和下划线，首字符必须是字母。',
    invalidName: '用户名必须以英文字母开头，长度为3–24个字符，只能包含英文字母、数字或下划线。',
    password: '密码', confirmPassword: '确认密码', passwordMismatch: '两次输入的密码不一致。',
    create: '创建账户', enter: '登录', logout: '退出登录', confirmLogout: '确定要退出当前账户吗？', cancel: '取消', forgot: '忘记密码？',
    verifyTitle: '验证邮箱', verifyCopy: '我们已向您的邮箱发送六位验证码。', verificationCode: '邮件验证码', verify: '验证邮箱', resend: '发送新验证码', cooldown: '可重新发送验证码的时间',
    resetTitle: '恢复密码', resetCopy: '请先验证邮箱。验证成功后，我们会发送一个新的12字符密码。', sendCode: '发送验证码', resetConfirm: '验证并创建密码', resetDoneTitle: '新密码已发送', resetDoneCopy: '请检查收件箱，并使用自动生成的新密码登录。', backToSignIn: '返回登录', loading: '正在检查会话…'
  },
  'zh-hant': {
    signIn: '登入', signUp: '註冊', name: '使用者名稱',
    nameHint: '3–24個字元：英文字母、數字和底線，首字元必須是字母。',
    invalidName: '使用者名稱必須以英文字母開頭，長度為3–24個字元，只能包含英文字母、數字或底線。',
    password: '密碼', confirmPassword: '確認密碼', passwordMismatch: '兩次輸入的密碼不一致。',
    create: '建立帳戶', enter: '登入', logout: '登出', confirmLogout: '確定要登出目前帳戶嗎？', cancel: '取消', forgot: '忘記密碼？',
    verifyTitle: '驗證電子郵件', verifyCopy: '我們已向您的電子郵件傳送六位驗證碼。', verificationCode: '郵件驗證碼', verify: '驗證電子郵件', resend: '傳送新驗證碼', cooldown: '可重新傳送驗證碼的時間',
    resetTitle: '復原密碼', resetCopy: '請先驗證電子郵件。驗證成功後，我們會傳送一個新的12字元密碼。', sendCode: '傳送驗證碼', resetConfirm: '驗證並建立密碼', resetDoneTitle: '新密碼已傳送', resetDoneCopy: '請檢查收件匣，並使用自動產生的新密碼登入。', backToSignIn: '返回登入', loading: '正在檢查工作階段…'
  }
}

const copy = (locale: Locale): AccountCopy => ({
  ...baseCopy(locale),
  ...(localizedAccountCopy[locale] || {})
})

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
        <div className="account-identity-emblem" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M16 3 28 10v12L16 29 4 22V10Z"/><path d="m16 8 7 4v8l-7 4-7-4v-8Z"/><circle cx="16" cy="16" r="2.4"/></svg></div>
        <div className="account-identity"><strong>{login}</strong><small>{maskAccountEmail(auth.account.user.email)}</small></div>
        <button type="button" className="account-logout" disabled={auth.busy} onClick={() => { auth.clearError(); setLogoutConfirmation(true) }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10M13 8l4 4-4 4M9 12h8"/></svg>{t.logout}</button>
      </section>
      {logoutConfirmation ? <div className="account-confirm-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !auth.busy) setLogoutConfirmation(false) }}>
        <section className="panel account-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="account-logout-title">
          <div className="account-confirm-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10M13 8l4 4-4 4M9 12h8"/></svg></div>
          <h2 id="account-logout-title">{t.confirmLogout}</h2>
          {auth.error ? <small className="account-error">{auth.error}</small> : null}
          <div className="account-confirm-actions">
            <button type="button" className="account-confirm-cancel" disabled={auth.busy} onClick={() => setLogoutConfirmation(false)}>{t.cancel}</button>
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
        await auth.requestRegistrationCode(normalizedName, normalizedEmail)
        startCodeCooldown()
        setMode('verify')
        setOtp('')
      } else if (mode === 'verify') {
        const normalizedName = name.trim()
        if (!normalizedEmail || !ACCOUNT_LOGIN_PATTERN.test(normalizedName) || !password || otp.length !== 6) return
        await auth.completeRegistration(normalizedName, normalizedEmail, password, otp)
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
      if (mode !== 'signup') {
        setPassword('')
        setConfirmPassword('')
      }
    } catch (value) { applyServerCooldown(value) }
  }

  const resendCode = async () => {
    if (auth.busy || cooldownSeconds > 0) return
    setFormError(null)
    try {
      if (mode === 'verify') await auth.resendRegistrationCode(name.trim(), email.trim().toLowerCase())
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
