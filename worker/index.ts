import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { emailOTP } from "better-auth/plugins";

type D1Result = {
  success?: boolean;
  meta?: { changes?: number };
};

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<D1Result>;
};

type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatement;
  batch<T = D1Result>(statements: D1PreparedStatement[]): Promise<T[]>;
};

type FetcherLike = {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
};

type Env = {
  frameanalytics_auth: D1DatabaseLike;
  ASSETS: FetcherLike;
  SMART_BUY_API?: FetcherLike;
  SMART_BUY_CONSUMER?: FetcherLike;
  HOURLY_ADMIN?: FetcherLike;
  WFM_GATEWAY?: FetcherLike;
  BETTER_AUTH_SECRET: string;
  SMART_BUY_START_SECRET: string;
  WFM_GATEWAY_TOKEN?: string;
  DESKTOP_NOTIFY_TOKEN?: string;
  DEVELOPER_EMAIL?: string;
  ADMIN_KEY?: string;
  RESEND_API_KEY?: string;
  AUTH_EMAIL_FROM?: string;
};

type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified?: boolean;
  image?: string | null;
};

const json = (value: unknown, status = 200, extraHeaders: HeadersInit = {}) =>
  new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });

const nowMs = () => Date.now();
const AUTH_OTP_EXPIRES_SECONDS = 10 * 60;
const EMAIL_CODE_COOLDOWN_MS = 60 * 1000;
const ACCOUNT_LOGIN_PATTERN = /^[A-Za-z][A-Za-z0-9_]{2,23}$/;
const SMART_BUY_DAILY_LIMIT = 30;
const SMART_BUY_WINDOW_MS = 24 * 60 * 60 * 1000;
const SMART_BUY_COOLDOWN_MS = 60 * 1000;

const SMART_BUY_START_HEADER = "X-FrameAnalytics-SmartBuy-Token";
const WFM_GATEWAY_HEADER = "X-FrameAnalytics-Gateway-Token";
const PUBLIC_ANALYTICS_READ_PATHS = new Set([
  "/api/catalog-v3",
  "/api/scanner-v3",
  "/api/item-v3",
  "/api/metrics-v3",
  "/api/metrics-v3/batch",
  "/api/hourly-v1",
  "/api/hourly-index-v1",
  "/api/events-v1",
]);
const ACCOUNT_ANALYTICS_READ_PATHS = new Set([
  "/api/smart-buy-v2/status",
  "/api/smart-buy-v2/result",
]);
const ANALYTICS_READ_PATHS = new Set([...PUBLIC_ANALYTICS_READ_PATHS, ...ACCOUNT_ANALYTICS_READ_PATHS]);
const ANALYTICS_STATUS_PATHS: Record<string, string> = {
  "/api/internal/api-status": "/",
  "/api/internal/hourly-status": "/hourly-v1-status",
  "/api/internal/hourly-freshness": "/hourly-v1-freshness",
  "/api/internal/hourly-index-status": "/hourly-index-v1-status",
};

type SmartBuyJobStart = {
  ok: true;
  smartBuyVersion: string;
  smartBuyRuntimeRevision: string;
  jobId: string;
  state: "queued";
  queuedAt: string;
  analysis?: "smart-buy" | "sell-advisor" | "axi-scanner";
  reused?: boolean;
  expiresAt?: string | null;
  axiScannerVersion?: string;
  axiScannerRuntimeRevision?: string;
};

const normalizeWfmProfile = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return null;

  try {
    const url = new URL(text.includes("://") ? text : `https://warframe.market/profile/${text}`);
    const host = url.hostname.toLowerCase();
    if (host !== "warframe.market" && !host.endsWith(".warframe.market")) return null;

    const parts = url.pathname.split("/").filter(Boolean);
    const profileIndex = parts.findIndex((part) => part.toLowerCase() === "profile");
    const slug = profileIndex >= 0 ? decodeURIComponent(parts[profileIndex + 1] || "").trim() : "";
    return /^[A-Za-z0-9_.-]{2,64}$/.test(slug) ? slug : null;
  } catch {
    const slug = text.replace(/^@/, "").trim();
    return /^[A-Za-z0-9_.-]{2,64}$/.test(slug) ? slug : null;
  }
};

const escapeEmailHtml = (value: string) => value
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#039;");

const AUTH_MAIL_COPY = {
  en: { verifySubject: "FrameAnalytics verification code", resetSubject: "FrameAnalytics password recovery", signInSubject: "FrameAnalytics sign-in code", verifyLine: "Your email verification code", resetLine: "Your password recovery code", signInLine: "Your sign-in code", expires: "The code is valid for 10 minutes.", ignore: "If you did not request it, ignore this email.", passwordSubject: "Your new FrameAnalytics password", passwordLine: "A new password has been created for your account", sessions: "All previous sessions have been closed.", contact: "If you did not recover access, contact the administrator.", cooldown: "A code was already sent. Try again in {seconds} seconds.", blocked: "This account is blocked.", invalidName: "The username must start with a Latin letter and contain 3–24 characters: A–Z, digits or _." },
  ru: { verifySubject: "Код подтверждения FrameAnalytics", resetSubject: "Восстановление пароля FrameAnalytics", signInSubject: "Код входа FrameAnalytics", verifyLine: "Код подтверждения адреса электронной почты", resetLine: "Код восстановления пароля", signInLine: "Код входа в аккаунт", expires: "Код действует 10 минут.", ignore: "Если вы не запрашивали код, проигнорируйте это письмо.", passwordSubject: "Новый пароль FrameAnalytics", passwordLine: "Для аккаунта создан новый пароль", sessions: "Все прежние сессии завершены.", contact: "Если вы не восстанавливали доступ, обратитесь к администратору.", cooldown: "Код уже отправлен. Повторите через {seconds} сек.", blocked: "Этот аккаунт заблокирован.", invalidName: "Ник должен начинаться с латинской буквы и содержать 3–24 символа: A–Z, цифры или _." },
  de: { verifySubject: "FrameAnalytics-Bestätigungscode", resetSubject: "FrameAnalytics-Passwortwiederherstellung", signInSubject: "FrameAnalytics-Anmeldecode", verifyLine: "Dein Code zur Bestätigung der E-Mail-Adresse", resetLine: "Dein Code zur Passwortwiederherstellung", signInLine: "Dein Anmeldecode", expires: "Der Code ist 10 Minuten gültig.", ignore: "Wenn du den Code nicht angefordert hast, ignoriere diese E-Mail.", passwordSubject: "Dein neues FrameAnalytics-Passwort", passwordLine: "Für dein Konto wurde ein neues Passwort erstellt", sessions: "Alle bisherigen Sitzungen wurden beendet.", contact: "Wenn du den Zugriff nicht wiederhergestellt hast, wende dich an den Administrator.", cooldown: "Ein Code wurde bereits gesendet. Versuche es in {seconds} Sekunden erneut.", blocked: "Dieses Konto ist gesperrt.", invalidName: "Der Benutzername muss mit einem lateinischen Buchstaben beginnen und 3–24 Zeichen enthalten: A–Z, Ziffern oder _." },
  fr: { verifySubject: "Code de confirmation FrameAnalytics", resetSubject: "Récupération du mot de passe FrameAnalytics", signInSubject: "Code de connexion FrameAnalytics", verifyLine: "Votre code de confirmation d’adresse e-mail", resetLine: "Votre code de récupération du mot de passe", signInLine: "Votre code de connexion", expires: "Le code est valable pendant 10 minutes.", ignore: "Si vous ne l’avez pas demandé, ignorez cet e-mail.", passwordSubject: "Votre nouveau mot de passe FrameAnalytics", passwordLine: "Un nouveau mot de passe a été créé pour votre compte", sessions: "Toutes les anciennes sessions ont été fermées.", contact: "Si vous n’avez pas demandé cette récupération, contactez l’administrateur.", cooldown: "Un code a déjà été envoyé. Réessayez dans {seconds} secondes.", blocked: "Ce compte est bloqué.", invalidName: "Le nom d’utilisateur doit commencer par une lettre latine et contenir 3 à 24 caractères : A–Z, chiffres ou _." },
  es: { verifySubject: "Código de confirmación de FrameAnalytics", resetSubject: "Recuperación de contraseña de FrameAnalytics", signInSubject: "Código de acceso de FrameAnalytics", verifyLine: "Tu código de confirmación de correo", resetLine: "Tu código de recuperación de contraseña", signInLine: "Tu código de acceso", expires: "El código es válido durante 10 minutos.", ignore: "Si no lo solicitaste, ignora este correo.", passwordSubject: "Tu nueva contraseña de FrameAnalytics", passwordLine: "Se ha creado una nueva contraseña para tu cuenta", sessions: "Todas las sesiones anteriores se han cerrado.", contact: "Si no solicitaste la recuperación, contacta con el administrador.", cooldown: "Ya se ha enviado un código. Inténtalo de nuevo en {seconds} segundos.", blocked: "Esta cuenta está bloqueada.", invalidName: "El nombre debe comenzar con una letra latina y contener entre 3 y 24 caracteres: A–Z, números o _." },
  pt: { verifySubject: "Código de confirmação FrameAnalytics", resetSubject: "Recuperação de palavra-passe FrameAnalytics", signInSubject: "Código de acesso FrameAnalytics", verifyLine: "O seu código de confirmação de e-mail", resetLine: "O seu código de recuperação de palavra-passe", signInLine: "O seu código de acesso", expires: "O código é válido durante 10 minutos.", ignore: "Se não pediu este código, ignore este e-mail.", passwordSubject: "A sua nova palavra-passe FrameAnalytics", passwordLine: "Foi criada uma nova palavra-passe para a sua conta", sessions: "Todas as sessões anteriores foram terminadas.", contact: "Se não recuperou o acesso, contacte o administrador.", cooldown: "Já foi enviado um código. Tente novamente dentro de {seconds} segundos.", blocked: "Esta conta está bloqueada.", invalidName: "O nome deve começar por uma letra latina e conter 3–24 caracteres: A–Z, números ou _." },
  pl: { verifySubject: "Kod potwierdzający FrameAnalytics", resetSubject: "Odzyskiwanie hasła FrameAnalytics", signInSubject: "Kod logowania FrameAnalytics", verifyLine: "Kod potwierdzający adres e-mail", resetLine: "Kod odzyskiwania hasła", signInLine: "Kod logowania", expires: "Kod jest ważny przez 10 minut.", ignore: "Jeśli nie proszono o kod, zignoruj tę wiadomość.", passwordSubject: "Nowe hasło FrameAnalytics", passwordLine: "Dla konta utworzono nowe hasło", sessions: "Wszystkie poprzednie sesje zostały zakończone.", contact: "Jeśli nie odzyskiwano dostępu, skontaktuj się z administratorem.", cooldown: "Kod został już wysłany. Spróbuj ponownie za {seconds} s.", blocked: "To konto jest zablokowane.", invalidName: "Nazwa musi zaczynać się od litery łacińskiej i zawierać 3–24 znaki: A–Z, cyfry lub _." },
  uk: { verifySubject: "Код підтвердження FrameAnalytics", resetSubject: "Відновлення пароля FrameAnalytics", signInSubject: "Код входу FrameAnalytics", verifyLine: "Код підтвердження електронної пошти", resetLine: "Код відновлення пароля", signInLine: "Код входу", expires: "Код дійсний 10 хвилин.", ignore: "Якщо ви не запитували код, проігноруйте цей лист.", passwordSubject: "Новий пароль FrameAnalytics", passwordLine: "Для облікового запису створено новий пароль", sessions: "Усі попередні сесії завершено.", contact: "Якщо ви не відновлювали доступ, зверніться до адміністратора.", cooldown: "Код уже надіслано. Повторіть через {seconds} с.", blocked: "Цей обліковий запис заблоковано.", invalidName: "Нік має починатися з латинської літери та містити 3–24 символи: A–Z, цифри або _." },
  tr: { verifySubject: "FrameAnalytics doğrulama kodu", resetSubject: "FrameAnalytics parola kurtarma", signInSubject: "FrameAnalytics giriş kodu", verifyLine: "E-posta doğrulama kodunuz", resetLine: "Parola kurtarma kodunuz", signInLine: "Giriş kodunuz", expires: "Kod 10 dakika geçerlidir.", ignore: "Bu kodu istemediyseniz e-postayı yok sayın.", passwordSubject: "Yeni FrameAnalytics parolanız", passwordLine: "Hesabınız için yeni bir parola oluşturuldu", sessions: "Önceki tüm oturumlar kapatıldı.", contact: "Erişim kurtarma talebinde bulunmadıysanız yöneticiyle iletişime geçin.", cooldown: "Kod zaten gönderildi. {seconds} saniye sonra tekrar deneyin.", blocked: "Bu hesap engellendi.", invalidName: "Kullanıcı adı Latin harfiyle başlamalı ve 3–24 karakter içermelidir: A–Z, rakamlar veya _." },
  it: { verifySubject: "Codice di conferma FrameAnalytics", resetSubject: "Recupero password FrameAnalytics", signInSubject: "Codice di accesso FrameAnalytics", verifyLine: "Il tuo codice di conferma email", resetLine: "Il tuo codice di recupero password", signInLine: "Il tuo codice di accesso", expires: "Il codice è valido per 10 minuti.", ignore: "Se non hai richiesto il codice, ignora questa email.", passwordSubject: "La tua nuova password FrameAnalytics", passwordLine: "È stata creata una nuova password per il tuo account", sessions: "Tutte le sessioni precedenti sono state chiuse.", contact: "Se non hai richiesto il recupero, contatta l’amministratore.", cooldown: "È già stato inviato un codice. Riprova tra {seconds} secondi.", blocked: "Questo account è bloccato.", invalidName: "Il nome deve iniziare con una lettera latina e contenere 3–24 caratteri: A–Z, numeri o _." },
  sv: { verifySubject: "FrameAnalytics bekräftelsekod", resetSubject: "FrameAnalytics lösenordsåterställning", signInSubject: "FrameAnalytics inloggningskod", verifyLine: "Din kod för e-postbekräftelse", resetLine: "Din kod för lösenordsåterställning", signInLine: "Din inloggningskod", expires: "Koden är giltig i 10 minuter.", ignore: "Om du inte begärde koden kan du ignorera mejlet.", passwordSubject: "Ditt nya FrameAnalytics-lösenord", passwordLine: "Ett nytt lösenord har skapats för ditt konto", sessions: "Alla tidigare sessioner har avslutats.", contact: "Kontakta administratören om du inte begärde återställningen.", cooldown: "En kod har redan skickats. Försök igen om {seconds} sekunder.", blocked: "Det här kontot är blockerat.", invalidName: "Användarnamnet måste börja med en latinsk bokstav och innehålla 3–24 tecken: A–Z, siffror eller _." },
  cs: { verifySubject: "Ověřovací kód FrameAnalytics", resetSubject: "Obnovení hesla FrameAnalytics", signInSubject: "Přihlašovací kód FrameAnalytics", verifyLine: "Váš kód pro ověření e-mailu", resetLine: "Váš kód pro obnovení hesla", signInLine: "Váš přihlašovací kód", expires: "Kód platí 10 minut.", ignore: "Pokud jste kód nevyžádali, tento e-mail ignorujte.", passwordSubject: "Vaše nové heslo FrameAnalytics", passwordLine: "Pro váš účet bylo vytvořeno nové heslo", sessions: "Všechny předchozí relace byly ukončeny.", contact: "Pokud jste obnovení nevyžádali, kontaktujte správce.", cooldown: "Kód již byl odeslán. Zkuste to znovu za {seconds} sekund.", blocked: "Tento účet je zablokovaný.", invalidName: "Jméno musí začínat latinským písmenem a obsahovat 3–24 znaků: A–Z, číslice nebo _." },
  ja: { verifySubject: "FrameAnalytics 確認コード", resetSubject: "FrameAnalytics パスワード復旧", signInSubject: "FrameAnalytics ログインコード", verifyLine: "メールアドレス確認コード", resetLine: "パスワード復旧コード", signInLine: "ログインコード", expires: "コードの有効期限は10分です。", ignore: "心当たりがない場合は、このメールを無視してください。", passwordSubject: "新しい FrameAnalytics パスワード", passwordLine: "アカウント用の新しいパスワードが作成されました", sessions: "以前のセッションはすべて終了しました。", contact: "復旧を依頼していない場合は管理者に連絡してください。", cooldown: "コードは送信済みです。{seconds}秒後にもう一度お試しください。", blocked: "このアカウントはブロックされています。", invalidName: "ユーザー名は英字で始まり、3～24文字の英字・数字・_のみ使用できます。" },
  ko: { verifySubject: "FrameAnalytics 확인 코드", resetSubject: "FrameAnalytics 비밀번호 복구", signInSubject: "FrameAnalytics 로그인 코드", verifyLine: "이메일 확인 코드", resetLine: "비밀번호 복구 코드", signInLine: "로그인 코드", expires: "코드는 10분 동안 유효합니다.", ignore: "요청하지 않았다면 이 메일을 무시하세요.", passwordSubject: "새 FrameAnalytics 비밀번호", passwordLine: "계정에 새 비밀번호가 생성되었습니다", sessions: "이전의 모든 세션이 종료되었습니다.", contact: "복구를 요청하지 않았다면 관리자에게 문의하세요.", cooldown: "코드가 이미 전송되었습니다. {seconds}초 후 다시 시도하세요.", blocked: "이 계정은 차단되었습니다.", invalidName: "사용자 이름은 영문자로 시작하고 3~24자의 영문자, 숫자 또는 _만 포함해야 합니다." },
  "zh-hans": { verifySubject: "FrameAnalytics 验证码", resetSubject: "FrameAnalytics 密码恢复", signInSubject: "FrameAnalytics 登录验证码", verifyLine: "您的邮箱验证码", resetLine: "您的密码恢复验证码", signInLine: "您的登录验证码", expires: "验证码有效期为10分钟。", ignore: "如果不是您本人请求，请忽略此邮件。", passwordSubject: "您的新 FrameAnalytics 密码", passwordLine: "已为您的账户创建新密码", sessions: "所有旧会话均已结束。", contact: "如果不是您本人恢复访问，请联系管理员。", cooldown: "验证码已发送，请在{seconds}秒后重试。", blocked: "此账户已被封禁。", invalidName: "用户名必须以英文字母开头，长度为3–24个字符，只能包含英文字母、数字或下划线。" },
  "zh-hant": { verifySubject: "FrameAnalytics 驗證碼", resetSubject: "FrameAnalytics 密碼復原", signInSubject: "FrameAnalytics 登入驗證碼", verifyLine: "您的電子郵件驗證碼", resetLine: "您的密碼復原驗證碼", signInLine: "您的登入驗證碼", expires: "驗證碼有效期限為10分鐘。", ignore: "如果不是您本人要求，請忽略此郵件。", passwordSubject: "您的新 FrameAnalytics 密碼", passwordLine: "已為您的帳戶建立新密碼", sessions: "所有舊工作階段均已結束。", contact: "如果不是您本人復原存取權，請聯絡管理員。", cooldown: "驗證碼已傳送，請在{seconds}秒後重試。", blocked: "此帳戶已被封鎖。", invalidName: "使用者名稱必須以英文字母開頭，長度為3–24個字元，只能包含英文字母、數字或底線。" },
} as const;

type AuthMailLocale = keyof typeof AUTH_MAIL_COPY;

const authMailLocale = (request: Request): AuthMailLocale => {
  const raw = String(request.headers.get("Language") || "en").trim().toLowerCase().replace(/_/g, "-");
  if (raw in AUTH_MAIL_COPY) return raw as AuthMailLocale;
  if (raw.startsWith("zh-hant")) return "zh-hant";
  if (raw.startsWith("zh")) return "zh-hans";
  const short = raw.split("-")[0];
  return short in AUTH_MAIL_COPY ? short as AuthMailLocale : "en";
};

const assertEmailDeliveryConfigured = (env: Env) => {
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  const from = String(env.AUTH_EMAIL_FROM || "").trim();
  if (!apiKey || !from) throw new Error("Transactional email is not configured");
  return { apiKey, from };
};

const sendAuthEmail = async (
  env: Env,
  message: { to: string; subject: string; text: string; html: string },
) => {
  const { apiKey, from } = assertEmailDeliveryConfigured(env);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
      html: message.html,
    }),
  });
  if (!response.ok) {
    const details = (await response.text()).slice(0, 500);
    console.error("frameanalytics-email-delivery-error", response.status, details);
    throw new Error("Email delivery failed");
  }
};

const sendOtpEmail = async (
  env: Env,
  email: string,
  otp: string,
  type: "sign-in" | "email-verification" | "forget-password" | "change-email",
  locale: AuthMailLocale,
) => {
  const code = escapeEmailHtml(otp);
  const copy = AUTH_MAIL_COPY[locale];
  const verification = type === "email-verification" || type === "change-email";
  const subject = verification
    ? copy.verifySubject
    : type === "forget-password"
      ? copy.resetSubject
      : copy.signInSubject;
  const purpose = verification
    ? copy.verifyLine
    : type === "forget-password"
      ? copy.resetLine
      : copy.signInLine;
  await sendAuthEmail(env, {
    to: email,
    subject,
    text: `${purpose}: ${otp}. ${copy.expires} ${copy.ignore}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#102033"><h1 style="font-size:22px;margin:0 0 14px">FrameAnalytics</h1><p>${purpose}:</p><div style="font:700 30px/1.2 ui-monospace,monospace;letter-spacing:.18em;padding:16px 18px;border-radius:12px;background:#eef8f5;color:#087c64">${code}</div><p style="color:#64748b;font-size:13px;line-height:1.55">${copy.expires} ${copy.ignore}</p></div>`,
  });
};

const createAuth = (env: Env, request: Request) => {
  const origin = new URL(request.url).origin;
  const locale = authMailLocale(request);
  return betterAuth({
    database: env.frameanalytics_auth as any,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    trustedOrigins: [origin],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignUp: false,
    },
    plugins: [
      emailOTP({
        disableSignUp: true,
        overrideDefaultEmailVerification: true,
        otpLength: 6,
        expiresIn: AUTH_OTP_EXPIRES_SECONDS,
        allowedAttempts: 5,
        storeOTP: "hashed",
        rateLimit: { window: 60, max: 1 },
        sendVerificationOTP: async ({ email, otp, type }) => {
          await sendOtpEmail(env, email, otp, type, locale);
        },
      }),
    ],
  });
};

let schemaReady: Promise<void> | null = null;

const ensureSchema = async (auth: ReturnType<typeof createAuth>, env: Env) => {
  if (!schemaReady) {
    schemaReady = (async () => {
      const { runMigrations } = await getMigrations(auth.options);
      await runMigrations();

      const schemaStatements = [
        `CREATE TABLE IF NOT EXISTS frameanalytics_profile (
          user_id TEXT PRIMARY KEY NOT NULL,
          wfm_profile TEXT,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
        )`,
        `CREATE TABLE IF NOT EXISTS frameanalytics_purchase (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          item_id TEXT NOT NULL,
          slug TEXT NOT NULL,
          name TEXT NOT NULL,
          market_key TEXT NOT NULL,
          selected_mod_rank INTEGER,
          purchase_price REAL NOT NULL,
          quantity INTEGER NOT NULL,
          purchase_date TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS idx_frameanalytics_purchase_user
          ON frameanalytics_purchase(user_id, created_at DESC)`,
        `CREATE TABLE IF NOT EXISTS frameanalytics_smart_buy_run (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS idx_frameanalytics_smart_buy_run_user_time
          ON frameanalytics_smart_buy_run(user_id, created_at DESC)`,
        `CREATE TABLE IF NOT EXISTS frameanalytics_access (
          user_id TEXT PRIMARY KEY NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          axi_scanner INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          updated_by TEXT,
          FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS idx_frameanalytics_access_axi
          ON frameanalytics_access(axi_scanner, updated_at DESC)`,
        `CREATE TABLE IF NOT EXISTS frameanalytics_account_state (
          user_id TEXT PRIMARY KEY NOT NULL,
          disabled INTEGER NOT NULL DEFAULT 0,
          updated_at INTEGER NOT NULL,
          updated_by TEXT,
          FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS idx_frameanalytics_account_state_disabled
          ON frameanalytics_account_state(disabled, updated_at DESC)`,
        `CREATE TABLE IF NOT EXISTS frameanalytics_email_cooldown (
          email_key TEXT PRIMARY KEY NOT NULL,
          next_allowed_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_frameanalytics_email_cooldown_next
          ON frameanalytics_email_cooldown(next_allowed_at)`,
        `CREATE TABLE IF NOT EXISTS frameanalytics_username (
          username_key TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL UNIQUE,
          updated_at INTEGER NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS frameanalytics_pending_registration (
          email_key TEXT PRIMARY KEY NOT NULL,
          email TEXT NOT NULL,
          username TEXT NOT NULL,
          username_key TEXT NOT NULL UNIQUE,
          otp_hash TEXT NOT NULL,
          expires_at INTEGER NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_frameanalytics_pending_registration_expiry
          ON frameanalytics_pending_registration(expires_at)`,
        `CREATE TABLE IF NOT EXISTS frameanalytics_deleted_account (
          user_id TEXT PRIMARY KEY NOT NULL,
          original_name TEXT NOT NULL,
          original_email TEXT NOT NULL,
          original_email_verified INTEGER NOT NULL DEFAULT 0,
          deleted_at INTEGER NOT NULL,
          deleted_by TEXT,
          FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS idx_frameanalytics_deleted_account_deleted_at
          ON frameanalytics_deleted_account(deleted_at DESC)`,
        `CREATE TABLE IF NOT EXISTS frameanalytics_axi_run (
          job_id TEXT PRIMARY KEY NOT NULL,
          requested_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          expires_at INTEGER,
          FOREIGN KEY (requested_by) REFERENCES user(id) ON DELETE CASCADE
        )`,
        `CREATE INDEX IF NOT EXISTS idx_frameanalytics_axi_run_created
          ON frameanalytics_axi_run(created_at DESC)`,
      ];

      for (const statement of schemaStatements) {
        await env.frameanalytics_auth.prepare(statement).run();
      }
      await env.frameanalytics_auth.prepare(`
        INSERT OR IGNORE INTO frameanalytics_username (username_key, user_id, updated_at)
        SELECT LOWER(TRIM(u.name)), u.id, ?
        FROM user u
        LEFT JOIN frameanalytics_deleted_account deleted ON deleted.user_id = u.id
        WHERE deleted.user_id IS NULL AND TRIM(COALESCE(u.name, '')) <> ''
      `).bind(nowMs()).run();
    })().catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
};

const requireSession = async (auth: ReturnType<typeof createAuth>, request: Request, env: Env) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  const user = session.user as SessionUser;
  const owner = Boolean(developerEmail(env) && user.email.trim().toLowerCase() === developerEmail(env));
  if (!owner) {
    const state = await env.frameanalytics_auth.prepare(`
      SELECT disabled
      FROM frameanalytics_account_state
      WHERE user_id = ?
    `).bind(user.id).first<{ disabled: number }>();
    if (Number(state?.disabled ?? 0) === 1) return null;
  }
  return user;
};

const claimEmailCodeCooldown = async (env: Env, email: string) => {
  const emailKey = email.trim().toLowerCase();
  const now = nowMs();
  const nextAllowedAt = now + EMAIL_CODE_COOLDOWN_MS;
  const result = await env.frameanalytics_auth.prepare(`
    INSERT INTO frameanalytics_email_cooldown (email_key, next_allowed_at, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(email_key) DO UPDATE SET
      next_allowed_at = excluded.next_allowed_at,
      updated_at = excluded.updated_at
    WHERE frameanalytics_email_cooldown.next_allowed_at <= ?
  `).bind(emailKey, nextAllowedAt, now, now).run();
  if (Number(result.meta?.changes ?? 0) > 0) {
    return { allowed: true as const, retryAfterSeconds: 0 };
  }
  const current = await env.frameanalytics_auth.prepare(`
    SELECT next_allowed_at AS nextAllowedAt
    FROM frameanalytics_email_cooldown
    WHERE email_key = ?
  `).bind(emailKey).first<{ nextAllowedAt: number }>();
  return {
    allowed: false as const,
    retryAfterSeconds: Math.max(1, Math.ceil((Number(current?.nextAllowedAt ?? nextAllowedAt) - now) / 1000)),
  };
};

const blockedAccountByEmail = async (env: Env, email: string) => {
  const ownerEmail = developerEmail(env);
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || normalizedEmail === ownerEmail) return false;
  const state = await env.frameanalytics_auth.prepare(`
    SELECT COALESCE(state.disabled, 0) AS disabled
    FROM user u
    LEFT JOIN frameanalytics_account_state state ON state.user_id = u.id
    WHERE LOWER(u.email) = ?
    LIMIT 1
  `).bind(normalizedEmail).first<{ disabled: number }>();
  return Number(state?.disabled ?? 0) === 1;
};

type AccountAccess = {
  role: "developer" | "user";
  developer: boolean;
  axiScanner: boolean;
};

const developerEmail = (env: Env) => String(env.DEVELOPER_EMAIL || "").trim().toLowerCase();

const readAccountAccess = async (env: Env, user: SessionUser): Promise<AccountAccess> => {
  const owner = Boolean(developerEmail(env) && user.email.trim().toLowerCase() === developerEmail(env));
  if (owner) {
    await env.frameanalytics_auth.prepare(`
      INSERT INTO frameanalytics_access (user_id, role, axi_scanner, updated_at, updated_by)
      VALUES (?, 'developer', 1, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        role = 'developer',
        axi_scanner = 1,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).bind(user.id, nowMs(), user.id).run();
    return { role: "developer", developer: true, axiScanner: true };
  }
  const row = await env.frameanalytics_auth.prepare(`
    SELECT role, axi_scanner AS axiScanner
    FROM frameanalytics_access
    WHERE user_id = ?
  `).bind(user.id).first<{ role: string; axiScanner: number }>();
  return {
    role: "user",
    developer: false,
    axiScanner: Number(row?.axiScanner ?? 0) === 1,
  };
};

const requireDeveloper = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  const user = await requireSession(auth, request, env);
  if (!user) return { user: null, access: null, response: json({ ok: false, error: "Unauthorized" }, 401) };
  const access = await readAccountAccess(env, user);
  if (!access.developer) return { user, access, response: json({ ok: false, error: "Developer access required" }, 403) };
  return { user, access, response: null };
};

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const desktopNotifyAuthorized = async (request: Request, env: Env) => {
  const expected = String(env.DESKTOP_NOTIFY_TOKEN || "").trim();
  const authorization = String(request.headers.get("Authorization") || "");
  const provided = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";
  if (!expected || !provided) return false;
  return (await sha256(expected)) === (await sha256(provided));
};

const handleAnalyticsProxy = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "GET" });
  }
  const sourceUrl = new URL(request.url);
  if (!PUBLIC_ANALYTICS_READ_PATHS.has(sourceUrl.pathname)) {
    const user = await requireSession(auth, request, env);
    if (!user) return json({ ok: false, error: "Unauthorized" }, 401);
  }
  if (sourceUrl.pathname === "/api/internal/smart-buy-status") {
    if (!env.SMART_BUY_CONSUMER) return json({ ok: false, error: "SMART_BUY_CONSUMER binding is missing" }, 503);
    const targetUrl = new URL("https://frameanalytics-smartbuy.internal/");
    targetUrl.search = sourceUrl.search;
    return env.SMART_BUY_CONSUMER.fetch(new Request(targetUrl, {
      method: "GET",
      headers: { Accept: "application/json" }
    }));
  }

  if (!env.SMART_BUY_API) return json({ ok: false, error: "SMART_BUY_API binding is missing" }, 503);
  const targetPath = ANALYTICS_STATUS_PATHS[sourceUrl.pathname] || sourceUrl.pathname;
  const targetUrl = new URL(`https://frameanalytics-api.internal${targetPath}`);
  targetUrl.search = sourceUrl.search;
  const headers = new Headers({ Accept: "application/json" });
  const language = request.headers.get("Language");
  if (language) headers.set("Language", language);
  return env.SMART_BUY_API.fetch(new Request(targetUrl, { method: "GET", headers }));
};

const handleManualMarketItem = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
  const user = await requireSession(auth, request, env);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);
  if (!env.HOURLY_ADMIN) return json({ ok: false, error: "HOURLY_ADMIN binding is missing" }, 503);
  const authorization = request.headers.get("Authorization");
  if (!authorization) return json({ ok: false, error: "ADMIN_KEY is required" }, 401);
  const body = await request.text();
  return env.HOURLY_ADMIN.fetch(new Request("https://frameanalytics-hourly.internal/admin/manual-market-item-v1", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: authorization,
    },
    body,
  }));
};

const readSmartBuyUsage = async (env: Env, userId: string) => {
  const now = nowMs();
  const since = now - SMART_BUY_WINDOW_MS;
  const cooldownCutoff = now - SMART_BUY_COOLDOWN_MS;

  const countRow = await env.frameanalytics_auth
    .prepare(`
      SELECT COUNT(*) AS used
      FROM frameanalytics_smart_buy_run
      WHERE user_id = ? AND created_at > ?
    `)
    .bind(userId, since)
    .first<{ used: number }>();

  const lastRow = await env.frameanalytics_auth
    .prepare(`
      SELECT created_at
      FROM frameanalytics_smart_buy_run
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `)
    .bind(userId)
    .first<{ created_at: number }>();

  const used = Number(countRow?.used ?? 0);
  const lastRunAt = Number(lastRow?.created_at ?? 0) || null;
  const cooldownRemainingSeconds = lastRunAt
    ? Math.max(0, Math.ceil((lastRunAt + SMART_BUY_COOLDOWN_MS - now) / 1000))
    : 0;

  return {
    limit: SMART_BUY_DAILY_LIMIT,
    windowHours: 24,
    used,
    remaining: Math.max(0, SMART_BUY_DAILY_LIMIT - used),
    cooldownSeconds: SMART_BUY_COOLDOWN_MS / 1000,
    cooldownRemainingSeconds,
    canRun: used < SMART_BUY_DAILY_LIMIT && (!lastRunAt || lastRunAt <= cooldownCutoff),
    lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
  };
};

const reserveSmartBuyRun = async (env: Env, userId: string) => {
  const now = nowMs();
  const id = crypto.randomUUID();
  const since = now - SMART_BUY_WINDOW_MS;
  const cooldownCutoff = now - SMART_BUY_COOLDOWN_MS;

  const result = await env.frameanalytics_auth
    .prepare(`
      INSERT INTO frameanalytics_smart_buy_run (id, user_id, created_at)
      SELECT ?, ?, ?
      WHERE
        (
          SELECT COUNT(*)
          FROM frameanalytics_smart_buy_run
          WHERE user_id = ? AND created_at > ?
        ) < ${SMART_BUY_DAILY_LIMIT}
        AND
        COALESCE(
          (
            SELECT MAX(created_at)
            FROM frameanalytics_smart_buy_run
            WHERE user_id = ?
          ),
          0
        ) <= ?
    `)
    .bind(id, userId, now, userId, since, userId, cooldownCutoff)
    .run();

  const changes = Number(result.meta?.changes ?? 0);
  return changes > 0 ? id : null;
};

const releaseSmartBuyRun = async (env: Env, userId: string, permitId: string) => {
  try {
    await env.frameanalytics_auth
      .prepare(`DELETE FROM frameanalytics_smart_buy_run WHERE id = ? AND user_id = ?`)
      .bind(permitId, userId)
      .run();
  } catch (error) {
    console.error("frameanalytics-analysis-permit-release-error", error);
  }
};

const readBody = async <T,>(request: Request): Promise<T> => {
  try {
    return (await request.json()) as T;
  } catch {
    throw new Error("Invalid JSON body");
  }
};

const secureRandomIndex = (length: number) => {
  const cutoff = Math.floor(256 / length) * length;
  while (true) {
    const value = crypto.getRandomValues(new Uint8Array(1))[0];
    if (value < cutoff) return value % length;
  }
};

const generateTemporaryPassword = () => {
  const groups = [
    "ABCDEFGHJKLMNPQRSTUVWXYZ",
    "abcdefghijkmnopqrstuvwxyz",
    "23456789",
    "!@#$%*-_",
  ];
  const all = groups.join("");
  const chars = groups.map((group) => group[secureRandomIndex(group.length)]);
  while (chars.length < 12) chars.push(all[secureRandomIndex(all.length)]);
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = secureRandomIndex(index + 1);
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }
  return chars.join("");
};

const generateRegistrationOtp = () => {
  let value = "";
  while (value.length < 6) value += String(secureRandomIndex(10));
  return value;
};

const registrationOtpHash = (env: Env, email: string, otp: string) =>
  sha256(`${env.BETTER_AUTH_SECRET}\u0000${email}\u0000${otp}`);

const registrationErrorCopy = (request: Request) => authMailLocale(request) === "ru" ? {
  invalidEmail: "Укажите корректный email.",
  emailTaken: "Аккаунт с такой почтой уже существует.",
  nameTaken: "Этот ник уже занят.",
  invalidCode: "Неверный или уже использованный код подтверждения.",
  expiredCode: "Срок действия кода истёк. Запросите новый код.",
  invalidPassword: "Пароль должен содержать от 8 до 128 символов.",
} : {
  invalidEmail: "Enter a valid email address.",
  emailTaken: "An account with this email already exists.",
  nameTaken: "This username is already taken.",
  invalidCode: "The verification code is invalid or has already been used.",
  expiredCode: "The verification code has expired. Request a new code.",
  invalidPassword: "The password must contain 8 to 128 characters.",
};

const handleRegistrationRequest = async (request: Request, env: Env) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
  }
  try {
    assertEmailDeliveryConfigured(env);
  } catch {
    return json({ ok: false, error: "Email delivery is not configured" }, 503);
  }
  const body = await readBody<{ name?: unknown; email?: unknown }>(request);
  const name = String(body.name || "").trim();
  const usernameKey = name.toLowerCase();
  const email = String(body.email || "").trim().toLowerCase();
  const copy = registrationErrorCopy(request);
  if (!ACCOUNT_LOGIN_PATTERN.test(name)) {
    return json({ ok: false, error: AUTH_MAIL_COPY[authMailLocale(request)].invalidName }, 400);
  }
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return json({ ok: false, error: copy.invalidEmail }, 400);
  }

  const now = nowMs();
  await env.frameanalytics_auth.prepare(`DELETE FROM frameanalytics_pending_registration WHERE expires_at <= ?`).bind(now).run();
  const [existingEmail, existingName, pendingName] = await Promise.all([
    env.frameanalytics_auth.prepare(`SELECT id FROM user WHERE LOWER(email) = ? LIMIT 1`).bind(email).first<{ id: string }>(),
    env.frameanalytics_auth.prepare(`
      SELECT u.id
      FROM user u
      LEFT JOIN frameanalytics_deleted_account deleted ON deleted.user_id = u.id
      WHERE deleted.user_id IS NULL AND LOWER(TRIM(u.name)) = ?
      LIMIT 1
    `).bind(usernameKey).first<{ id: string }>(),
    env.frameanalytics_auth.prepare(`
      SELECT email_key AS emailKey
      FROM frameanalytics_pending_registration
      WHERE username_key = ? AND email_key <> ? AND expires_at > ?
      LIMIT 1
    `).bind(usernameKey, email, now).first<{ emailKey: string }>(),
  ]);
  if (existingEmail) return json({ ok: false, error: copy.emailTaken }, 409);
  if (existingName || pendingName) return json({ ok: false, error: copy.nameTaken }, 409);

  const cooldown = await claimEmailCodeCooldown(env, email);
  if (!cooldown.allowed) {
    const mailCopy = AUTH_MAIL_COPY[authMailLocale(request)];
    return json({
      ok: false,
      error: mailCopy.cooldown.replace("{seconds}", String(cooldown.retryAfterSeconds)),
      retryAfterSeconds: cooldown.retryAfterSeconds,
    }, 429, { "Retry-After": String(cooldown.retryAfterSeconds) });
  }

  const otp = generateRegistrationOtp();
  const otpHash = await registrationOtpHash(env, email, otp);
  const expiresAt = now + AUTH_OTP_EXPIRES_SECONDS * 1000;
  try {
    await env.frameanalytics_auth.prepare(`
      INSERT INTO frameanalytics_pending_registration (
        email_key, email, username, username_key, otp_hash, expires_at, attempts, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(email_key) DO UPDATE SET
        email = excluded.email,
        username = excluded.username,
        username_key = excluded.username_key,
        otp_hash = excluded.otp_hash,
        expires_at = excluded.expires_at,
        attempts = 0,
        updated_at = excluded.updated_at
    `).bind(email, email, name, usernameKey, otpHash, expiresAt, now, now).run();
  } catch {
    return json({ ok: false, error: copy.nameTaken }, 409);
  }
  try {
    await sendOtpEmail(env, email, otp, "email-verification", authMailLocale(request));
  } catch (error) {
    await env.frameanalytics_auth.prepare(`DELETE FROM frameanalytics_pending_registration WHERE email_key = ?`).bind(email).run();
    throw error;
  }
  return json({ ok: true, expiresInSeconds: AUTH_OTP_EXPIRES_SECONDS });
};

const handleRegistrationConfirm = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
  }
  const body = await readBody<{ name?: unknown; email?: unknown; password?: unknown; otp?: unknown }>(request);
  const name = String(body.name || "").trim();
  const usernameKey = name.toLowerCase();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const otp = String(body.otp || "").trim();
  const copy = registrationErrorCopy(request);
  if (!ACCOUNT_LOGIN_PATTERN.test(name)) return json({ ok: false, error: AUTH_MAIL_COPY[authMailLocale(request)].invalidName }, 400);
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return json({ ok: false, error: copy.invalidEmail }, 400);
  if (password.length < 8 || password.length > 128) return json({ ok: false, error: copy.invalidPassword }, 400);
  if (!/^\d{6}$/.test(otp)) return json({ ok: false, error: copy.invalidCode }, 400);

  const pending = await env.frameanalytics_auth.prepare(`
    SELECT username, username_key AS usernameKey, otp_hash AS otpHash, expires_at AS expiresAt, attempts
    FROM frameanalytics_pending_registration
    WHERE email_key = ?
  `).bind(email).first<{ username: string; usernameKey: string; otpHash: string; expiresAt: number; attempts: number }>();
  if (!pending || pending.usernameKey !== usernameKey || pending.username !== name) {
    return json({ ok: false, error: copy.invalidCode }, 400);
  }
  if (Number(pending.expiresAt) <= nowMs()) {
    await env.frameanalytics_auth.prepare(`DELETE FROM frameanalytics_pending_registration WHERE email_key = ?`).bind(email).run();
    return json({ ok: false, error: copy.expiredCode }, 410);
  }
  const otpHash = await registrationOtpHash(env, email, otp);
  if (Number(pending.attempts) >= 5 || otpHash !== pending.otpHash) {
    await env.frameanalytics_auth.prepare(`
      UPDATE frameanalytics_pending_registration
      SET attempts = attempts + 1, updated_at = ?
      WHERE email_key = ? AND attempts < 5
    `).bind(nowMs(), email).run();
    return json({ ok: false, error: copy.invalidCode }, 400);
  }
  const claim = await env.frameanalytics_auth.prepare(`
    UPDATE frameanalytics_pending_registration
    SET attempts = 5, updated_at = ?
    WHERE email_key = ? AND otp_hash = ? AND attempts < 5 AND expires_at > ?
  `).bind(nowMs(), email, otpHash, nowMs()).run();
  if (Number(claim.meta?.changes ?? 0) < 1) return json({ ok: false, error: copy.invalidCode }, 409);

  const existingEmail = await env.frameanalytics_auth.prepare(`SELECT id FROM user WHERE LOWER(email) = ? LIMIT 1`).bind(email).first<{ id: string }>();
  const existingName = await env.frameanalytics_auth.prepare(`
    SELECT u.id
    FROM user u
    LEFT JOIN frameanalytics_deleted_account deleted ON deleted.user_id = u.id
    WHERE deleted.user_id IS NULL AND LOWER(TRIM(u.name)) = ?
    LIMIT 1
  `).bind(usernameKey).first<{ id: string }>();
  if (existingEmail || existingName) {
    await env.frameanalytics_auth.prepare(`DELETE FROM frameanalytics_pending_registration WHERE email_key = ?`).bind(email).run();
    return json({ ok: false, error: existingEmail ? copy.emailTaken : copy.nameTaken }, 409);
  }

  const reservationId = `pending:${crypto.randomUUID()}`;
  try {
    await env.frameanalytics_auth.prepare(`
      INSERT INTO frameanalytics_username (username_key, user_id, updated_at)
      VALUES (?, ?, ?)
    `).bind(usernameKey, reservationId, nowMs()).run();
  } catch {
    await env.frameanalytics_auth.prepare(`DELETE FROM frameanalytics_pending_registration WHERE email_key = ?`).bind(email).run();
    return json({ ok: false, error: copy.nameTaken }, 409);
  }

  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.delete("Content-Length");
  let signUpResponse: Response;
  try {
    signUpResponse = await auth.handler(new Request(`${new URL(request.url).origin}/api/auth/sign-up/email`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name, email, password }),
    }));
  } catch (error) {
    await env.frameanalytics_auth.batch([
      env.frameanalytics_auth.prepare(`DELETE FROM frameanalytics_username WHERE user_id = ?`).bind(reservationId),
      env.frameanalytics_auth.prepare(`DELETE FROM frameanalytics_pending_registration WHERE email_key = ?`).bind(email),
    ]);
    throw error;
  }
  const signUpPayload = await signUpResponse.clone().json().catch(() => null) as { user?: { id?: unknown } } | null;
  const userId = String(signUpPayload?.user?.id || "").trim();
  const created = userId ? await env.frameanalytics_auth.prepare(`SELECT id FROM user WHERE id = ? AND LOWER(email) = ?`).bind(userId, email).first<{ id: string }>() : null;
  if (!signUpResponse.ok || !created) {
    await env.frameanalytics_auth.batch([
      env.frameanalytics_auth.prepare(`DELETE FROM frameanalytics_username WHERE user_id = ?`).bind(reservationId),
      env.frameanalytics_auth.prepare(`DELETE FROM frameanalytics_pending_registration WHERE email_key = ?`).bind(email),
    ]);
    return signUpResponse.ok ? json({ ok: false, error: copy.emailTaken }, 409) : signUpResponse;
  }

  await env.frameanalytics_auth.batch([
    env.frameanalytics_auth.prepare(`UPDATE user SET emailVerified = 1 WHERE id = ?`).bind(userId),
    env.frameanalytics_auth.prepare(`UPDATE frameanalytics_username SET user_id = ?, updated_at = ? WHERE user_id = ?`).bind(userId, nowMs(), reservationId),
    env.frameanalytics_auth.prepare(`DELETE FROM frameanalytics_pending_registration WHERE email_key = ?`).bind(email),
  ]);
  return auth.handler(new Request(`${new URL(request.url).origin}/api/auth/sign-in/email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password }),
  }));
};

const handlePasswordRecoveryConfirm = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
  }
  assertEmailDeliveryConfigured(env);
  const body = await readBody<{ email?: unknown; otp?: unknown }>(request);
  const email = String(body.email || "").trim().toLowerCase();
  const otp = String(body.otp || "").trim();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
    return json({ ok: false, error: "Invalid email" }, 400);
  }
  if (!/^\d{6}$/.test(otp)) {
    return json({ ok: false, error: "Invalid verification code" }, 400);
  }

  const password = generateTemporaryPassword();
  const headers = new Headers(request.headers);
  headers.set("Content-Type", "application/json");
  headers.delete("Content-Length");
  const resetResponse = await auth.handler(new Request(
    `${new URL(request.url).origin}/api/auth/email-otp/reset-password`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ email, otp, password }),
    },
  ));
  if (!resetResponse.ok) return resetResponse;

  const locale = authMailLocale(request);
  const copy = AUTH_MAIL_COPY[locale];
  const safePassword = escapeEmailHtml(password);
  await sendAuthEmail(env, {
    to: email,
    subject: copy.passwordSubject,
    text: `${copy.passwordLine}: ${password}. ${copy.sessions} ${copy.contact}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#102033"><h1 style="font-size:22px;margin:0 0 14px">FrameAnalytics</h1><p>${copy.passwordLine}:</p><div style="font:700 24px/1.2 ui-monospace,monospace;letter-spacing:.08em;padding:16px 18px;border-radius:12px;background:#eef8f5;color:#087c64">${safePassword}</div><p style="color:#64748b;font-size:13px;line-height:1.55">${copy.sessions} ${copy.contact}</p></div>`,
  });
  return json({ ok: true, passwordSent: true });
};

const handleAccount = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  const user = await requireSession(auth, request, env);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const profile = await env.frameanalytics_auth
    .prepare(`
      SELECT wfm_profile, created_at, updated_at
      FROM frameanalytics_profile
      WHERE user_id = ?
    `)
    .bind(user.id)
    .first<{ wfm_profile: string | null; created_at: number; updated_at: number }>();

  const usage = await readSmartBuyUsage(env, user.id);
  const access = await readAccountAccess(env, user);

  return json({
    ok: true,
    user,
    profile: {
      wfmProfile: profile?.wfm_profile ?? null,
      updatedAt: profile?.updated_at ? new Date(profile.updated_at).toISOString() : null,
    },
    smartBuy: usage,
    access,
  });
};

const handleDeveloperAccounts = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  const guard = await requireDeveloper(request, env, auth);
  if (guard.response || !guard.user) return guard.response!;
  const ownerEmail = developerEmail(env);

  if (request.method === "GET") {
    const url = new URL(request.url);
    const search = String(url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 100);
    const requestedPage = Math.max(1, Math.floor(Number(url.searchParams.get("page")) || 1));
    const pageSize = 25;
    const deletedOnly = url.searchParams.get("deleted") === "1";
    const deletedClause = deletedOnly ? "deleted.user_id IS NOT NULL" : "deleted.user_id IS NULL";
    const pattern = `%${search}%`;
    const countRow = await env.frameanalytics_auth.prepare(`
      SELECT COUNT(*) AS total
      FROM user u
      LEFT JOIN frameanalytics_deleted_account deleted ON deleted.user_id = u.id
      WHERE ${deletedClause}
        AND (? = '' OR LOWER(COALESCE(deleted.original_email, u.email)) LIKE ? OR LOWER(COALESCE(deleted.original_name, u.name)) LIKE ?)
    `).bind(search, pattern, pattern).first<{ total: number }>();
    const total = Number(countRow?.total ?? 0);
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, pages);
    const offset = (page - 1) * pageSize;
    const rows = await env.frameanalytics_auth.prepare(`
      SELECT
        u.id,
        COALESCE(deleted.original_name, u.name) AS name,
        COALESCE(deleted.original_email, u.email) AS email,
        COALESCE(deleted.original_email_verified, u.emailVerified) AS emailVerified,
        u.createdAt AS createdAt,
        deleted.deleted_at AS deletedAt,
        COALESCE(a.axi_scanner, 0) AS axiScanner,
        COALESCE(s.disabled, 0) AS disabled,
        a.updated_at AS accessUpdatedAt,
        s.updated_at AS stateUpdatedAt,
        profile.wfm_profile AS wfmProfile,
        profile.updated_at AS profileUpdatedAt,
        COALESCE(p.purchaseCount, 0) AS purchaseCount,
        COALESCE(p.purchaseUnits, 0) AS purchaseUnits,
        COALESCE(p.investedPlatinum, 0) AS investedPlatinum,
        COALESCE(sess.sessionCount, 0) AS sessionCount,
        sess.sessionExpiresAt AS sessionExpiresAt,
        COALESCE(smart.smartBuyUsed, 0) AS smartBuyUsed,
        smart.smartBuyLastRunAt AS smartBuyLastRunAt,
        COALESCE(axi.axiRunCount, 0) AS axiRunCount,
        axi.axiLastRunAt AS axiLastRunAt
      FROM user u
      LEFT JOIN frameanalytics_deleted_account deleted ON deleted.user_id = u.id
      LEFT JOIN frameanalytics_access a ON a.user_id = u.id
      LEFT JOIN frameanalytics_account_state s ON s.user_id = u.id
      LEFT JOIN frameanalytics_profile profile ON profile.user_id = u.id
      LEFT JOIN (
        SELECT user_id, COUNT(*) AS purchaseCount, SUM(quantity) AS purchaseUnits, SUM(purchase_price * quantity) AS investedPlatinum
        FROM frameanalytics_purchase
        GROUP BY user_id
      ) p ON p.user_id = u.id
      LEFT JOIN (
        SELECT user_id, SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS smartBuyUsed, MAX(created_at) AS smartBuyLastRunAt
        FROM frameanalytics_smart_buy_run
        GROUP BY user_id
      ) smart ON smart.user_id = u.id
      LEFT JOIN (
        SELECT requested_by AS user_id, COUNT(*) AS axiRunCount, MAX(created_at) AS axiLastRunAt
        FROM frameanalytics_axi_run
        GROUP BY requested_by
      ) axi ON axi.user_id = u.id
      LEFT JOIN (
        SELECT userId AS user_id, COUNT(*) AS sessionCount, MAX(expiresAt) AS sessionExpiresAt
        FROM "session"
        WHERE expiresAt > ?
        GROUP BY userId
      ) sess ON sess.user_id = u.id
      WHERE ${deletedClause}
        AND (? = '' OR LOWER(COALESCE(deleted.original_email, u.email)) LIKE ? OR LOWER(COALESCE(deleted.original_name, u.name)) LIKE ?)
      ORDER BY
        CASE WHEN deleted.user_id IS NULL AND LOWER(u.email) = ? THEN 0 ELSE 1 END,
        CASE WHEN deleted.user_id IS NOT NULL THEN deleted.deleted_at END DESC,
        u.createdAt DESC
      LIMIT ? OFFSET ?
    `).bind(nowMs() - SMART_BUY_WINDOW_MS, nowMs(), search, pattern, pattern, ownerEmail, pageSize, offset).all<{
      id: string;
      name: string;
      email: string;
      emailVerified: number;
      createdAt: string;
      deletedAt: number | null;
      axiScanner: number;
      disabled: number;
      accessUpdatedAt: number | null;
      stateUpdatedAt: number | null;
      wfmProfile: string | null;
      profileUpdatedAt: number | null;
      purchaseCount: number;
      purchaseUnits: number;
      investedPlatinum: number;
      sessionCount: number;
      sessionExpiresAt: number | null;
      smartBuyUsed: number;
      smartBuyLastRunAt: number | null;
      axiRunCount: number;
      axiLastRunAt: number | null;
    }>();
    return json({
      ok: true,
      accounts: (rows.results ?? []).map((row) => ({
        ...row,
        emailVerified: Boolean(row.emailVerified),
        deleted: Boolean(row.deletedAt),
        developer: !row.deletedAt && row.email.trim().toLowerCase() === ownerEmail,
        axiScanner: (!row.deletedAt && row.email.trim().toLowerCase() === ownerEmail) || Number(row.axiScanner) === 1,
        disabled: row.deletedAt ? true : row.email.trim().toLowerCase() === ownerEmail ? false : Number(row.disabled) === 1,
        purchaseCount: Number(row.purchaseCount) || 0,
        purchaseUnits: Number(row.purchaseUnits) || 0,
        investedPlatinum: Number(row.investedPlatinum) || 0,
        sessionCount: Number(row.sessionCount) || 0,
        smartBuy: {
          limit: SMART_BUY_DAILY_LIMIT,
          used: Number(row.smartBuyUsed) || 0,
          remaining: Math.max(0, SMART_BUY_DAILY_LIMIT - (Number(row.smartBuyUsed) || 0)),
          cooldownSeconds: SMART_BUY_COOLDOWN_MS / 1000,
          lastRunAt: row.smartBuyLastRunAt ? new Date(Number(row.smartBuyLastRunAt)).toISOString() : null,
        },
        axiRunCount: Number(row.axiRunCount) || 0,
      })),
      page,
      pageSize,
      total,
      pages,
      deleted: deletedOnly,
    });
  }

  if (request.method === "PATCH") {
    const body = await readBody<{ userId?: unknown; axiScanner?: unknown; disabled?: unknown }>(request);
    const userId = String(body.userId || "").trim();
    if (!userId) return json({ ok: false, error: "userId is required" }, 400);
    const target = await env.frameanalytics_auth.prepare(`
      SELECT u.id, u.email, deleted.user_id AS deletedId
      FROM user u
      LEFT JOIN frameanalytics_deleted_account deleted ON deleted.user_id = u.id
      WHERE u.id = ?
    `).bind(userId).first<{ id: string; email: string; deletedId: string | null }>();
    if (!target) return json({ ok: false, error: "Account not found" }, 404);
    if (target.deletedId) return json({ ok: false, error: "Deleted accounts must be restored before access can be changed" }, 409);
    const targetIsOwner = target.email.trim().toLowerCase() === ownerEmail;
    const currentAccess = await env.frameanalytics_auth.prepare(`
      SELECT axi_scanner AS axiScanner
      FROM frameanalytics_access
      WHERE user_id = ?
    `).bind(userId).first<{ axiScanner: number }>();
    const currentState = await env.frameanalytics_auth.prepare(`
      SELECT disabled
      FROM frameanalytics_account_state
      WHERE user_id = ?
    `).bind(userId).first<{ disabled: number }>();
    const axiScanner = targetIsOwner
      ? true
      : typeof body.axiScanner === "boolean"
        ? body.axiScanner
        : Number(currentAccess?.axiScanner ?? 0) === 1;
    const disabled = targetIsOwner
      ? false
      : typeof body.disabled === "boolean"
        ? body.disabled
        : Number(currentState?.disabled ?? 0) === 1;
    await env.frameanalytics_auth.prepare(`
      INSERT INTO frameanalytics_access (user_id, role, axi_scanner, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        role = excluded.role,
        axi_scanner = excluded.axi_scanner,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).bind(userId, targetIsOwner ? "developer" : "user", axiScanner ? 1 : 0, nowMs(), guard.user.id).run();
    await env.frameanalytics_auth.prepare(`
      INSERT INTO frameanalytics_account_state (user_id, disabled, updated_at, updated_by)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        disabled = excluded.disabled,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `).bind(userId, disabled ? 1 : 0, nowMs(), guard.user.id).run();
    if (disabled) {
      await env.frameanalytics_auth.prepare(`DELETE FROM "session" WHERE userId = ?`).bind(userId).run();
    }
    return json({ ok: true, userId, developer: targetIsOwner, axiScanner, disabled });
  }

  if (request.method === "POST") {
    const body = await readBody<{ userId?: unknown; action?: unknown; name?: unknown; email?: unknown }>(request);
    const userId = String(body.userId || "").trim();
    const action = String(body.action || "").trim();
    if (!userId) return json({ ok: false, error: "userId is required" }, 400);
    if (!new Set(["revoke-sessions", "reset-smart-buy-limit", "soft-delete", "restore"]).has(action)) return json({ ok: false, error: "Unsupported account action" }, 400);
    const target = await env.frameanalytics_auth.prepare(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.emailVerified AS emailVerified,
        deleted.original_name AS originalName,
        deleted.original_email AS originalEmail,
        deleted.original_email_verified AS originalEmailVerified,
        deleted.deleted_at AS deletedAt
      FROM user u
      LEFT JOIN frameanalytics_deleted_account deleted ON deleted.user_id = u.id
      WHERE u.id = ?
    `).bind(userId).first<{
      id: string;
      name: string;
      email: string;
      emailVerified: number;
      originalName: string | null;
      originalEmail: string | null;
      originalEmailVerified: number | null;
      deletedAt: number | null;
    }>();
    if (!target) return json({ ok: false, error: "Account not found" }, 404);
    const targetIsOwner = [target.email, target.originalEmail].some((value) => String(value || "").trim().toLowerCase() === ownerEmail);

    if (action === "soft-delete") {
      if (targetIsOwner) return json({ ok: false, error: "The owner account cannot be deleted" }, 409);
      if (target.deletedAt) return json({ ok: true, userId, deleted: true, deletedAt: target.deletedAt });
      const deletedAt = nowMs();
      const tombstoneId = crypto.randomUUID().replace(/-/g, "");
      const tombstoneName = `deleted_${tombstoneId.slice(0, 16)}`;
      const tombstoneEmail = `deleted+${tombstoneId}@deleted.frameanalytics.invalid`;
      await env.frameanalytics_auth.batch([
        env.frameanalytics_auth.prepare(`
          INSERT INTO frameanalytics_deleted_account (
            user_id, original_name, original_email, original_email_verified, deleted_at, deleted_by
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).bind(userId, target.name, target.email, Number(target.emailVerified) === 1 ? 1 : 0, deletedAt, guard.user.id),
        env.frameanalytics_auth.prepare(`
          UPDATE user
          SET name = ?, email = ?, emailVerified = 0, updatedAt = ?
          WHERE id = ?
        `).bind(tombstoneName, tombstoneEmail, deletedAt, userId),
        env.frameanalytics_auth.prepare(`DELETE FROM frameanalytics_username WHERE user_id = ?`).bind(userId),
        env.frameanalytics_auth.prepare(`
          INSERT INTO frameanalytics_account_state (user_id, disabled, updated_at, updated_by)
          VALUES (?, 1, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET disabled = 1, updated_at = excluded.updated_at, updated_by = excluded.updated_by
        `).bind(userId, deletedAt, guard.user.id),
        env.frameanalytics_auth.prepare(`DELETE FROM "session" WHERE userId = ?`).bind(userId),
      ]);
      return json({ ok: true, userId, deleted: true, deletedAt });
    }

    if (action === "restore") {
      if (!target.deletedAt || !target.originalName || !target.originalEmail) {
        return json({ ok: false, error: "Account is not deleted" }, 409);
      }
      const name = String(body.name || target.originalName).trim();
      const usernameKey = name.toLowerCase();
      const email = String(body.email || target.originalEmail).trim().toLowerCase();
      if (!ACCOUNT_LOGIN_PATTERN.test(name)) return json({ ok: false, error: "Username must contain 3–24 Latin characters, digits or _ and begin with a letter" }, 400);
      if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) return json({ ok: false, error: "Invalid email" }, 400);
      const [emailConflict, nameConflict] = await Promise.all([
        env.frameanalytics_auth.prepare(`SELECT id FROM user WHERE LOWER(email) = ? AND id <> ? LIMIT 1`).bind(email, userId).first<{ id: string }>(),
        env.frameanalytics_auth.prepare(`
          SELECT u.id
          FROM user u
          LEFT JOIN frameanalytics_deleted_account deleted ON deleted.user_id = u.id
          WHERE deleted.user_id IS NULL AND u.id <> ? AND LOWER(TRIM(u.name)) = ?
          LIMIT 1
        `).bind(userId, usernameKey).first<{ id: string }>(),
      ]);
      if (emailConflict) return json({ ok: false, error: "An account with this email already exists" }, 409);
      if (nameConflict) return json({ ok: false, error: "This username is already taken" }, 409);
      try {
        await env.frameanalytics_auth.batch([
          env.frameanalytics_auth.prepare(`
            INSERT INTO frameanalytics_username (username_key, user_id, updated_at)
            VALUES (?, ?, ?)
          `).bind(usernameKey, userId, nowMs()),
          env.frameanalytics_auth.prepare(`
            UPDATE user
            SET name = ?, email = ?, emailVerified = 1, updatedAt = ?
            WHERE id = ?
          `).bind(name, email, nowMs(), userId),
          env.frameanalytics_auth.prepare(`DELETE FROM frameanalytics_deleted_account WHERE user_id = ?`).bind(userId),
          env.frameanalytics_auth.prepare(`
            INSERT INTO frameanalytics_account_state (user_id, disabled, updated_at, updated_by)
            VALUES (?, 0, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET disabled = 0, updated_at = excluded.updated_at, updated_by = excluded.updated_by
          `).bind(userId, nowMs(), guard.user.id),
        ]);
      } catch {
        return json({ ok: false, error: "The selected email or username is no longer available" }, 409);
      }
      return json({ ok: true, userId, deleted: false, name, email, emailVerified: true });
    }

    if (action === "reset-smart-buy-limit") {
      if (target.deletedAt) return json({ ok: false, error: "Deleted accounts cannot use limits" }, 409);
      const result = await env.frameanalytics_auth.prepare(`DELETE FROM frameanalytics_smart_buy_run WHERE user_id = ?`).bind(userId).run();
      return json({ ok: true, userId, restoredRuns: Number(result.meta?.changes ?? 0), smartBuy: await readSmartBuyUsage(env, userId) });
    }
    if (targetIsOwner) {
      return json({ ok: false, error: "Owner sessions cannot be revoked here" }, 409);
    }
    const result = await env.frameanalytics_auth.prepare(`DELETE FROM "session" WHERE userId = ?`).bind(userId).run();
    return json({ ok: true, userId, revokedSessions: Number(result.meta?.changes ?? 0) });
  }

  return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "GET, PATCH, POST" });
};

const handleDeveloperAccountStats = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
  userId: string,
) => {
  const guard = await requireDeveloper(request, env, auth);
  if (guard.response || !guard.user) return guard.response!;
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "GET" });
  }

  const account = await env.frameanalytics_auth.prepare(`
    SELECT
      u.id,
      COALESCE(deleted.original_name, u.name) AS name,
      COALESCE(deleted.original_email, u.email) AS email,
      COALESCE(deleted.original_email_verified, u.emailVerified) AS emailVerified,
      u.createdAt AS createdAt,
      u.updatedAt AS updatedAt,
      deleted.deleted_at AS deletedAt,
      COALESCE(a.axi_scanner, 0) AS axiScanner,
      a.updated_at AS accessUpdatedAt,
      COALESCE(state.disabled, 0) AS disabled,
      state.updated_at AS stateUpdatedAt,
      profile.wfm_profile AS wfmProfile,
      profile.created_at AS profileCreatedAt,
      profile.updated_at AS profileUpdatedAt
    FROM user u
    LEFT JOIN frameanalytics_deleted_account deleted ON deleted.user_id = u.id
    LEFT JOIN frameanalytics_access a ON a.user_id = u.id
    LEFT JOIN frameanalytics_account_state state ON state.user_id = u.id
    LEFT JOIN frameanalytics_profile profile ON profile.user_id = u.id
    WHERE u.id = ?
  `).bind(userId).first<{
    id: string;
    name: string;
    email: string;
    emailVerified: number;
    createdAt: string;
    updatedAt: string;
    deletedAt: number | null;
    axiScanner: number;
    accessUpdatedAt: number | null;
    disabled: number;
    stateUpdatedAt: number | null;
    wfmProfile: string | null;
    profileCreatedAt: number | null;
    profileUpdatedAt: number | null;
  }>();
  if (!account) return json({ ok: false, error: "Account not found" }, 404);

  const now = nowMs();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  const monthAgo = now - 30 * 24 * 60 * 60 * 1000;
  const [purchaseSummary, purchases, smartSummary, axiSummary, sessions] = await Promise.all([
    env.frameanalytics_auth.prepare(`
      SELECT
        COUNT(*) AS records,
        COALESCE(SUM(quantity), 0) AS units,
        COALESCE(SUM(purchase_price * quantity), 0) AS invested,
        COALESCE(SUM(purchase_price * quantity) / NULLIF(SUM(quantity), 0), 0) AS averageUnitPrice,
        MIN(purchase_date) AS firstPurchaseDate,
        MAX(purchase_date) AS lastPurchaseDate,
        MIN(created_at) AS firstRecordedAt,
        MAX(updated_at) AS lastUpdatedAt
      FROM frameanalytics_purchase
      WHERE user_id = ?
    `).bind(userId).first<{
      records: number; units: number; invested: number; averageUnitPrice: number;
      firstPurchaseDate: string | null; lastPurchaseDate: string | null;
      firstRecordedAt: string | null; lastUpdatedAt: number | null;
    }>(),
    env.frameanalytics_auth.prepare(`
      SELECT
        id,
        item_id AS itemId,
        slug,
        name,
        market_key AS marketKey,
        selected_mod_rank AS selectedModRank,
        purchase_price AS purchasePrice,
        quantity,
        purchase_date AS purchaseDate,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM frameanalytics_purchase
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT 100
    `).bind(userId).all(),
    env.frameanalytics_auth.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last24h,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last7d,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last30d,
        MIN(created_at) AS firstRunAt,
        MAX(created_at) AS lastRunAt
      FROM frameanalytics_smart_buy_run
      WHERE user_id = ?
    `).bind(dayAgo, weekAgo, monthAgo, userId).first(),
    env.frameanalytics_auth.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last24h,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last7d,
        SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS last30d,
        MIN(created_at) AS firstRunAt,
        MAX(created_at) AS lastRunAt
      FROM frameanalytics_axi_run
      WHERE requested_by = ?
    `).bind(dayAgo, weekAgo, monthAgo, userId).first(),
    env.frameanalytics_auth.prepare(`
      SELECT id, createdAt, updatedAt, expiresAt, userAgent
      FROM "session"
      WHERE userId = ? AND expiresAt > ?
      ORDER BY updatedAt DESC
      LIMIT 20
    `).bind(userId, now).all(),
  ]);

  const owner = !account.deletedAt && account.email.trim().toLowerCase() === developerEmail(env);
  const numberSummary = (value: Record<string, unknown> | null) => ({
    total: Number(value?.total ?? 0),
    last24h: Number(value?.last24h ?? 0),
    last7d: Number(value?.last7d ?? 0),
    last30d: Number(value?.last30d ?? 0),
    firstRunAt: Number(value?.firstRunAt ?? 0) || null,
    lastRunAt: Number(value?.lastRunAt ?? 0) || null,
  });
  return json({
    ok: true,
    account: {
      ...account,
      emailVerified: Boolean(account.emailVerified),
      developer: owner,
      deleted: Boolean(account.deletedAt),
      axiScanner: owner || Number(account.axiScanner) === 1,
      disabled: account.deletedAt ? true : owner ? false : Number(account.disabled) === 1,
    },
    portfolio: {
      records: Number(purchaseSummary?.records ?? 0),
      units: Number(purchaseSummary?.units ?? 0),
      invested: Number(purchaseSummary?.invested ?? 0),
      averageUnitPrice: Number(purchaseSummary?.averageUnitPrice ?? 0),
      firstPurchaseDate: purchaseSummary?.firstPurchaseDate ?? null,
      lastPurchaseDate: purchaseSummary?.lastPurchaseDate ?? null,
      firstRecordedAt: purchaseSummary?.firstRecordedAt ?? null,
      lastUpdatedAt: Number(purchaseSummary?.lastUpdatedAt ?? 0) || null,
      recent: purchases.results ?? [],
    },
    smartBuy: {
      ...numberSummary(smartSummary as Record<string, unknown> | null),
      current: await readSmartBuyUsage(env, userId),
    },
    axi: numberSummary(axiSummary as Record<string, unknown> | null),
    sessions: sessions.results ?? [],
  });
};

const handleDeveloperResaleScanner = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  const guard = await requireDeveloper(request, env, auth);
  if (guard.response || !guard.user) return guard.response!;
  if (request.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "GET" });
  if (!env.SMART_BUY_CONSUMER) return json({ ok: false, error: "SMART_BUY_CONSUMER binding is missing" }, 503);
  if (!env.SMART_BUY_START_SECRET) return json({ ok: false, error: "Private scanner service is not configured" }, 503);
  const upstream = await env.SMART_BUY_CONSUMER.fetch("https://frameanalytics-smartbuy.internal/resale-scanner-v1/result", {
    method: "GET",
    headers: {
      Accept: "application/json",
      [SMART_BUY_START_HEADER]: env.SMART_BUY_START_SECRET,
    },
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await upstream.text();
  return new Response(payload, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
};

const handleDeveloperWfmTelemetry = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  const guard = await requireDeveloper(request, env, auth);
  if (guard.response || !guard.user) return guard.response!;
  if (request.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "GET" });
  if (!env.WFM_GATEWAY) return json({ ok: false, error: "WFM_GATEWAY binding is missing" }, 503);
  if (!env.WFM_GATEWAY_TOKEN) return json({ ok: false, error: "WFM_GATEWAY_TOKEN is missing" }, 503);
  const upstream = await env.WFM_GATEWAY.fetch("https://frameanalytics-wfm-gateway.internal/metrics", {
    method: "GET",
    headers: {
      Accept: "application/json",
      [WFM_GATEWAY_HEADER]: env.WFM_GATEWAY_TOKEN,
    },
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
};

const handleDeveloperProcessQueues = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  const guard = await requireDeveloper(request, env, auth);
  if (guard.response || !guard.user) return guard.response!;
  if (request.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "GET" });
  if (!env.SMART_BUY_API) return json({ ok: false, error: "SMART_BUY_API binding is missing" }, 503);
  if (!env.SMART_BUY_START_SECRET) return json({ ok: false, error: "Private process metrics are not configured" }, 503);
  try {
    const upstream = await env.SMART_BUY_API.fetch("https://frameanalytics-api.internal/api/developer/process-queues", {
      method: "GET",
      headers: {
        Accept: "application/json",
        [SMART_BUY_START_HEADER]: env.SMART_BUY_START_SECRET,
      },
      signal: AbortSignal.timeout(12_000),
    });
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return json({ ok: false, error: `Process queue metrics failed: ${error instanceof Error ? error.message : String(error)}` }, 502);
  }
};

type DesktopNotification = {
  id: string;
  kind: "resale" | "axi";
  title: string;
  body: string;
  url: string;
  createdAt: string | null;
  data: Record<string, unknown>;
};

const handleDesktopNotificationFeed = async (request: Request, env: Env) => {
  if (request.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "GET" });
  if (!await desktopNotifyAuthorized(request, env)) return json({ ok: false, error: "Unauthorized" }, 401);
  const notifications: DesktopNotification[] = [];
  const diagnostics: string[] = [];

  if (env.SMART_BUY_CONSUMER && env.SMART_BUY_START_SECRET) {
    try {
      const upstream = await env.SMART_BUY_CONSUMER.fetch("https://frameanalytics-smartbuy.internal/resale-scanner-v1/result", {
        method: "GET",
        headers: {
          Accept: "application/json",
          [SMART_BUY_START_HEADER]: env.SMART_BUY_START_SECRET,
        },
      });
      const result = await upstream.json() as { scanId?: unknown; generatedAt?: unknown; alerts?: unknown[] };
      if (upstream.ok) {
        const scanId = String(result.scanId || "scan");
        const generatedAt = String(result.generatedAt || "") || null;
        for (const raw of Array.isArray(result.alerts) ? result.alerts : []) {
          const row = raw as Record<string, unknown>;
          const rowId = String(row.rowId || row.itemId || "").trim();
          if (!rowId) continue;
          const name = String(row.name || "Предмет");
          const minimum = Number(row.minimumOnlineSell);
          const profit = Number(row.theoreticalProfit);
          const fetchedAt = String(row.ordersFetchedAt || generatedAt || "");
          notifications.push({
            id: `resale:${scanId}:${rowId}`,
            kind: "resale",
            title: `Перепродажа: +${Number.isFinite(profit) ? profit : "?"}p`,
            body: `${name}: онлайн-ордер ${Number.isFinite(minimum) ? minimum : "?"}p`,
            url: String(row.wfmUrl || "https://frameanalytics.trade/profile"),
            createdAt: fetchedAt || generatedAt,
            data: row,
          });
        }
      } else diagnostics.push(`resale HTTP ${upstream.status}`);
    } catch (error) {
      diagnostics.push(`resale: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (env.SMART_BUY_API && developerEmail(env)) {
    try {
      const runs = await env.frameanalytics_auth.prepare(`
        SELECT r.job_id AS jobId
        FROM frameanalytics_axi_run r
        JOIN user u ON u.id = r.requested_by
        WHERE lower(u.email) = ?
        ORDER BY r.created_at DESC
        LIMIT 3
      `).bind(developerEmail(env)).all<{ jobId: string }>();
      for (const run of runs.results || []) {
        const target = new URL("https://frameanalytics-api.internal/api/axi-scanner-v1/result");
        target.searchParams.set("id", run.jobId);
        const upstream = await env.SMART_BUY_API.fetch(target.toString(), { method: "GET", headers: { Accept: "application/json" } });
        if (!upstream.ok) continue;
        const result = await upstream.json() as { rows?: unknown[]; updatedAt?: unknown; completedAt?: unknown };
        for (const raw of Array.isArray(result.rows) ? result.rows : []) {
          const row = raw as Record<string, any>;
          const ratio = Number(row.ratio);
          const matchesMarkup = row.matchesMarkup === true || (row.matchesMarkup == null && Number.isFinite(ratio) && ratio >= 10);
          if (!matchesMarkup) continue;
          const relationId = String(row.relationId || `${row.relic?.id || row.item?.id || "item"}:${row.reward?.id || "result"}`);
          const createdAt = String(row.fetchedAt || result.updatedAt || result.completedAt || "") || null;
          if (row.rowType === "prime-set") {
            const itemName = String(row.item?.name || row.item?.slug || "Prime Set");
            const profit = Number(row.possibleProfit);
            const percent = Number(row.markupPercent);
            notifications.push({
              id: `axi:${run.jobId}:${relationId}`,
              kind: "axi",
              title: `Prime Set: +${Number.isFinite(profit) ? profit : "?"}p`,
              body: `${itemName}${Number.isFinite(percent) ? ` · +${percent.toFixed(1)}%` : ""}`,
              url: "https://frameanalytics.trade/profile",
              createdAt,
              data: row,
            });
            continue;
          }
          const relicName = String(row.relic?.name || row.relic?.slug || "Axi relic");
          const rewardName = String(row.reward?.name || row.reward?.slug || "золотая награда");
          const profit = Number(row.possibleProfit ?? row.spread);
          const percent = Number(row.markupPercent);
          notifications.push({
            id: `axi:${run.jobId}:${relationId}`,
            kind: "axi",
            title: `Axi: +${Number.isFinite(profit) ? profit : "?"}p`,
            body: `${relicName} → ${rewardName}${Number.isFinite(percent) ? ` · +${percent.toFixed(1)}%` : Number.isFinite(ratio) ? ` · ${ratio.toFixed(2)}×` : ""}`,
            url: "https://frameanalytics.trade/profile",
            createdAt,
            data: row,
          });
        }
      }
    } catch (error) {
      diagnostics.push(`axi: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  notifications.sort((left, right) => Date.parse(right.createdAt || "") - Date.parse(left.createdAt || ""));
  return json({
    ok: true,
    serviceRevision: "developer-market-tools-2",
    generatedAt: new Date().toISOString(),
    pollAfterSeconds: 10,
    notifications: notifications.slice(0, 100),
    diagnostics,
  });
};

const requireAxiScannerAccess = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  const user = await requireSession(auth, request, env);
  if (!user) return { user: null, access: null, response: json({ ok: false, error: "Unauthorized" }, 401) };
  const access = await readAccountAccess(env, user);
  if (!access.axiScanner) return { user, access, response: json({ ok: false, error: "Axi scanner access is not enabled" }, 403) };
  return { user, access, response: null };
};

const handleAxiScanner = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
  action: "start" | "status" | "result" | "stop",
) => {
  const guard = await requireAxiScannerAccess(request, env, auth);
  if (guard.response || !guard.user) return guard.response!;
  if (!env.SMART_BUY_API) return json({ ok: false, error: "SMART_BUY_API binding is missing" }, 503);
  if (action === "start") {
    if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
    if (!env.SMART_BUY_START_SECRET) return json({ ok: false, error: "Axi scanner service is not configured" }, 503);
    const body = (await request.text()).trim() || "{}";
    try {
      const upstream = await env.SMART_BUY_API.fetch("https://frameanalytics-api.internal/api/axi-scanner-v1/start", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          [SMART_BUY_START_HEADER]: env.SMART_BUY_START_SECRET,
        },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      const payload = await upstream.json().catch(() => null) as SmartBuyJobStart | { error?: unknown } | null;
      if (!upstream.ok || !payload || !("jobId" in payload)) {
        return json({ ok: false, error: String(payload && "error" in payload ? payload.error : `Axi scanner start failed: HTTP ${upstream.status}`) }, upstream.status || 502);
      }
      const expiresAt = Date.parse(String(payload.expiresAt || ""));
      try {
        await env.frameanalytics_auth.prepare(`
          INSERT OR IGNORE INTO frameanalytics_axi_run (job_id, requested_by, created_at, expires_at)
          VALUES (?, ?, ?, ?)
        `).bind(payload.jobId, guard.user.id, nowMs(), Number.isFinite(expiresAt) ? expiresAt : null).run();
      } catch (error) {
        console.error("frameanalytics-axi-run-history-error", error);
      }
      return json(payload, 202);
    } catch (error) {
      return json({ ok: false, error: `Axi scanner start failed: ${error instanceof Error ? error.message : String(error)}` }, 502);
    }
  }

  if (action === "stop") {
    if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
    if (!env.SMART_BUY_START_SECRET) return json({ ok: false, error: "Axi scanner service is not configured" }, 503);
    const url = new URL(request.url);
    const jobId = String(url.searchParams.get("id") || url.searchParams.get("jobId") || "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(jobId)) return json({ ok: false, error: "Invalid Axi scanner job id" }, 400);
    const target = new URL("https://frameanalytics-api.internal/api/axi-scanner-v1/stop");
    target.searchParams.set("id", jobId);
    return env.SMART_BUY_API.fetch(new Request(target, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        [SMART_BUY_START_HEADER]: env.SMART_BUY_START_SECRET,
      },
      body: "{}",
    }));
  }

  if (request.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "GET" });
  const url = new URL(request.url);
  const jobId = String(url.searchParams.get("id") || url.searchParams.get("jobId") || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return json({ ok: false, error: "Invalid Axi scanner job id" }, 400);
  const target = new URL(`https://frameanalytics-api.internal/api/axi-scanner-v1/${action}`);
  target.searchParams.set("id", jobId);
  return env.SMART_BUY_API.fetch(new Request(target, { method: "GET", headers: { Accept: "application/json" } }));
};

const handleWfmProfile = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  const user = await requireSession(auth, request, env);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  if (request.method === "DELETE") {
    const time = nowMs();
    await env.frameanalytics_auth
      .prepare(`
        INSERT INTO frameanalytics_profile (user_id, wfm_profile, created_at, updated_at)
        VALUES (?, NULL, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          wfm_profile = NULL,
          updated_at = excluded.updated_at
      `)
      .bind(user.id, time, time)
      .run();

    return json({ ok: true, wfmProfile: null });
  }

  if (request.method !== "PATCH" && request.method !== "PUT") {
    return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "PATCH, PUT, DELETE" });
  }

  const body = await readBody<{ profile?: unknown }>(request);
  const slug = normalizeWfmProfile(body.profile);
  if (!slug) return json({ ok: false, error: "Invalid Warframe Market profile" }, 400);

  const time = nowMs();
  await env.frameanalytics_auth
    .prepare(`
      INSERT INTO frameanalytics_profile (user_id, wfm_profile, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        wfm_profile = excluded.wfm_profile,
        updated_at = excluded.updated_at
    `)
    .bind(user.id, slug, time, time)
    .run();

  return json({
    ok: true,
    wfmProfile: slug,
    profileUrl: `https://warframe.market/profile/${encodeURIComponent(slug)}`,
  });
};

type PurchaseInput = {
  id?: string;
  itemId?: string;
  slug?: string;
  name?: string;
  marketKey?: string;
  selectedModRank?: number | null;
  purchasePrice?: number;
  quantity?: number;
  purchaseDate?: string;
  createdAt?: string;
};

const validPurchase = (value: PurchaseInput) =>
  Boolean(
    value.itemId &&
    value.slug &&
    value.name &&
    value.marketKey &&
    Number.isFinite(Number(value.purchasePrice)) &&
    Number(value.purchasePrice) > 0 &&
    Number.isInteger(Number(value.quantity)) &&
    Number(value.quantity) > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(String(value.purchaseDate ?? "")),
  );

const handlePurchases = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  const user = await requireSession(auth, request, env);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  if (request.method === "GET") {
    const rows = await env.frameanalytics_auth
      .prepare(`
        SELECT
          id,
          item_id AS itemId,
          slug,
          name,
          market_key AS marketKey,
          selected_mod_rank AS selectedModRank,
          purchase_price AS purchasePrice,
          quantity,
          purchase_date AS purchaseDate,
          created_at AS createdAt
        FROM frameanalytics_purchase
        WHERE user_id = ?
        ORDER BY created_at ASC
      `)
      .bind(user.id)
      .all<{
        id: string;
        itemId: string;
        slug: string;
        name: string;
        marketKey: string;
        selectedModRank: number | null;
        purchasePrice: number;
        quantity: number;
        purchaseDate: string;
        createdAt: string;
      }>();

    return json({ ok: true, purchases: rows.results ?? [] });
  }

  if (request.method === "POST") {
    const body = await readBody<{ purchase?: PurchaseInput; purchases?: PurchaseInput[] }>(request);
    const incoming = Array.isArray(body.purchases)
      ? body.purchases
      : body.purchase
        ? [body.purchase]
        : [];

    if (!incoming.length || incoming.length > 500) {
      return json({ ok: false, error: "Expected 1-500 purchases" }, 400);
    }
    if (!incoming.every(validPurchase)) {
      return json({ ok: false, error: "Invalid purchase payload" }, 400);
    }

    const updatedAt = nowMs();
    for (const purchase of incoming) {
      const id = String(purchase.id || crypto.randomUUID());
      const createdAt = String(purchase.createdAt || new Date().toISOString());
      await env.frameanalytics_auth
        .prepare(`
          INSERT INTO frameanalytics_purchase (
            id, user_id, item_id, slug, name, market_key, selected_mod_rank,
            purchase_price, quantity, purchase_date, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            item_id = excluded.item_id,
            slug = excluded.slug,
            name = excluded.name,
            market_key = excluded.market_key,
            selected_mod_rank = excluded.selected_mod_rank,
            purchase_price = excluded.purchase_price,
            quantity = excluded.quantity,
            purchase_date = excluded.purchase_date,
            updated_at = excluded.updated_at
          WHERE frameanalytics_purchase.user_id = excluded.user_id
        `)
        .bind(
          id,
          user.id,
          String(purchase.itemId),
          String(purchase.slug),
          String(purchase.name),
          String(purchase.marketKey),
          purchase.selectedModRank == null ? null : Number(purchase.selectedModRank),
          Number(purchase.purchasePrice),
          Number(purchase.quantity),
          String(purchase.purchaseDate),
          createdAt,
          updatedAt,
        )
        .run();
    }

    return json({ ok: true, imported: incoming.length });
  }

  if (request.method === "DELETE") {
    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    if (!id) return json({ ok: false, error: "Missing id" }, 400);

    await env.frameanalytics_auth
      .prepare(`DELETE FROM frameanalytics_purchase WHERE id = ? AND user_id = ?`)
      .bind(id, user.id)
      .run();

    return json({ ok: true, id });
  }

  return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "GET, POST, DELETE" });
};

const handleSmartBuyStart = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
  analysis: "smart-buy" | "sell-advisor" = "smart-buy",
) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
  }

  const user = await requireSession(auth, request, env);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const profile = await env.frameanalytics_auth
    .prepare(`
      SELECT wfm_profile
      FROM frameanalytics_profile
      WHERE user_id = ?
    `)
    .bind(user.id)
    .first<{ wfm_profile: string | null }>();

  const profileSlug = normalizeWfmProfile(profile?.wfm_profile);
  if (!profileSlug) {
    return json({ ok: false, error: "Link a Warframe Market profile first" }, 409);
  }

  if (!env.SMART_BUY_START_SECRET) {
    return json({ ok: false, error: "Smart Buy service is not configured" }, 503);
  }
  if (!env.SMART_BUY_API) {
    return json({ ok: false, error: "SMART_BUY_API binding is missing" }, 503);
  }

  // Reserve first. A permitted launch counts immediately.
  const permitId = await reserveSmartBuyRun(env, user.id);
  if (!permitId) {
    const usage = await readSmartBuyUsage(env, user.id);
    return json(
      {
        ok: false,
        error: usage.remaining <= 0 ? "Daily Smart Buy limit reached" : "Smart Buy cooldown is active",
        smartBuy: usage,
      },
      429,
    );
  }

  let upstream: Response;
  try {
    const upstreamPath = analysis === "sell-advisor"
      ? "/api/sell-advisor-v1/start"
      : "/api/smart-buy-v2/start";
    const smartBuyUrl = `https://frameanalytics-api.internal${upstreamPath}`;

    upstream = await env.SMART_BUY_API.fetch(smartBuyUrl, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        [SMART_BUY_START_HEADER]: env.SMART_BUY_START_SECRET,
      },
      body: JSON.stringify({ profile: profileSlug }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    await releaseSmartBuyRun(env, user.id, permitId);
    return json(
      {
        ok: false,
        error: `Market analysis start failed: ${error instanceof Error ? error.message : String(error)}`,
        permitId,
        smartBuy: await readSmartBuyUsage(env, user.id),
      },
      502,
    );
  }

  let payload: unknown = null;
  try {
    payload = await upstream.json();
  } catch {
    // Keep a stable error shape if the producer returns a non-JSON response.
  }

  if (!upstream.ok) {
    await releaseSmartBuyRun(env, user.id, permitId);
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: unknown }).error || `HTTP ${upstream.status}`)
        : `HTTP ${upstream.status}`;

    return json(
      {
        ok: false,
        error: `Market analysis start failed: ${message}`,
        permitId,
        smartBuy: await readSmartBuyUsage(env, user.id),
      },
      upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502,
    );
  }

  const started = payload as SmartBuyJobStart;
  return json(
    {
      ...started,
      permitId,
      profileSlug,
      smartBuy: await readSmartBuyUsage(env, user.id),
    },
    202,
  );
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      if (url.pathname === "/api/health") {
        return json({
          ok: true,
          service: "frameanalytics-account",
          serviceRevision: "verified-registration-soft-delete-1",
          auth: "better-auth",
          database: "frameanalytics-auth",
          registration: "verify-before-create",
          emailDelivery: env.RESEND_API_KEY && env.AUTH_EMAIL_FROM ? "configured" : "unavailable",
          publicAnalytics: true,
          otpCooldownSeconds: EMAIL_CODE_COOLDOWN_MS / 1000,
          usernamePolicy: "latin-3-24",
          smartBuyStartProxy: true,
          sellAdvisorStartProxy: true,
          developerAccess: "email-owner+D1-permissions",
          axiScannerStartProxy: true,
          smartBuyTransport: env.SMART_BUY_API ? "service-binding" : "unavailable",
          wfmGatewayTelemetry: env.WFM_GATEWAY ? "service-binding" : "unavailable",
          desktopNotifications: env.DESKTOP_NOTIFY_TOKEN ? "token-feed" : "unavailable",
        });
      }

      if (url.pathname === "/api/smart-buy/permit") {
        return json(
          { ok: false, error: "Smart Buy permit endpoint is retired; use /api/smart-buy/start" },
          410,
        );
      }

      const auth = createAuth(env, request);
      await ensureSchema(auth, env);
      const authPath = url.pathname.replace(/\/$/, "");

      if (url.pathname === "/api/desktop-notifications/feed") {
        return handleDesktopNotificationFeed(request, env);
      }

      if (authPath === "/api/auth/registration/request") {
        return handleRegistrationRequest(request, env);
      }

      if (authPath === "/api/auth/registration/confirm") {
        return handleRegistrationConfirm(request, env, auth);
      }

      if (authPath === "/api/auth/sign-up/email") {
        return json({ ok: false, error: "Use the verified registration flow" }, 404);
      }

      if (url.pathname === "/api/auth/password-recovery/confirm") {
        return handlePasswordRecoveryConfirm(request, env, auth);
      }

      const codeSendPaths = new Set([
        "/api/auth/email-otp/send-verification-otp",
        "/api/auth/email-otp/request-password-reset",
      ]);
      if (codeSendPaths.has(authPath)) {
        try {
          assertEmailDeliveryConfigured(env);
        } catch {
          return json({ ok: false, error: "Email delivery is not configured" }, 503);
        }
        if (request.method === "POST") {
          const body = await readBody<{ email?: unknown; name?: unknown }>(request.clone());
          const email = String(body.email || "").trim().toLowerCase();
          const locale = authMailLocale(request);
          const copy = AUTH_MAIL_COPY[locale];
          if (!/^\S+@\S+\.\S+$/.test(email) || email.length > 254) {
            return json({ ok: false, error: "Invalid email" }, 400);
          }
          const cooldown = await claimEmailCodeCooldown(env, email);
          if (!cooldown.allowed) {
            return json({
              ok: false,
              error: copy.cooldown.replace("{seconds}", String(cooldown.retryAfterSeconds)),
              retryAfterSeconds: cooldown.retryAfterSeconds,
            }, 429, { "Retry-After": String(cooldown.retryAfterSeconds) });
          }
        }
      }

      if (authPath === "/api/auth/sign-in/email" && request.method === "POST") {
        const body = await readBody<{ email?: unknown }>(request.clone());
        if (await blockedAccountByEmail(env, String(body.email || ""))) {
          return json({ ok: false, error: AUTH_MAIL_COPY[authMailLocale(request)].blocked }, 403);
        }
      }

      if (/^\/api\/auth\/email-otp\/reset-password\/?$/.test(url.pathname)) {
        return json({ ok: false, error: "Use the password recovery confirmation endpoint" }, 404);
      }

      if (url.pathname.startsWith("/api/auth/")) {
        return auth.handler(request);
      }

      if (url.pathname === "/api/account") {
        return handleAccount(request, env, auth);
      }

      const accountStatsMatch = url.pathname.match(/^\/api\/developer\/accounts\/([^/]+)\/stats$/);
      if (accountStatsMatch) {
        return handleDeveloperAccountStats(request, env, auth, decodeURIComponent(accountStatsMatch[1]));
      }

      if (url.pathname === "/api/developer/accounts") {
        return handleDeveloperAccounts(request, env, auth);
      }

      if (url.pathname === "/api/developer/resale-scanner-v1") {
        return handleDeveloperResaleScanner(request, env, auth);
      }

      if (url.pathname === "/api/developer/wfm-telemetry") {
        return handleDeveloperWfmTelemetry(request, env, auth);
      }

      if (url.pathname === "/api/developer/process-queues") {
        return handleDeveloperProcessQueues(request, env, auth);
      }

      if (url.pathname === "/api/axi-scanner/start") {
        return handleAxiScanner(request, env, auth, "start");
      }

      if (url.pathname === "/api/axi-scanner/status") {
        return handleAxiScanner(request, env, auth, "status");
      }

      if (url.pathname === "/api/axi-scanner/result") {
        return handleAxiScanner(request, env, auth, "result");
      }

      if (url.pathname === "/api/axi-scanner/stop") {
        return handleAxiScanner(request, env, auth, "stop");
      }

      if (url.pathname === "/api/account/wfm-profile") {
        return handleWfmProfile(request, env, auth);
      }

      if (url.pathname === "/api/account/purchases") {
        return handlePurchases(request, env, auth);
      }

      if (url.pathname === "/api/smart-buy/start") {
        return handleSmartBuyStart(request, env, auth);
      }

      if (url.pathname === "/api/sell-advisor/start") {
        return handleSmartBuyStart(request, env, auth, "sell-advisor");
      }

      if (url.pathname === "/api/admin/manual-market-item-v1") {
        return handleManualMarketItem(request, env, auth);
      }

      if (
        ANALYTICS_READ_PATHS.has(url.pathname) ||
        Object.prototype.hasOwnProperty.call(ANALYTICS_STATUS_PATHS, url.pathname) ||
        url.pathname === "/api/internal/smart-buy-status"
      ) {
        return handleAnalyticsProxy(request, env, auth);
      }

      return json({ ok: false, error: "API route not found" }, 404);
    } catch (error) {
      console.error("frameanalytics-account-error", error);
      return json(
        {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    }
  },
};
