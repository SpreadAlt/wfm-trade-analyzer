import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";

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
  BETA_ADMIN_KEY?: string;
  ADMIN_KEY?: string;
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
const SMART_BUY_DAILY_LIMIT = 30;
const SMART_BUY_WINDOW_MS = 24 * 60 * 60 * 1000;
const SMART_BUY_COOLDOWN_MS = 60 * 1000;

const SMART_BUY_START_HEADER = "X-FrameAnalytics-SmartBuy-Token";
const WFM_GATEWAY_HEADER = "X-FrameAnalytics-Gateway-Token";
const ANALYTICS_READ_PATHS = new Set([
  "/api/catalog-v3",
  "/api/scanner-v3",
  "/api/item-v3",
  "/api/metrics-v3",
  "/api/metrics-v3/batch",
  "/api/hourly-v1",
  "/api/hourly-index-v1",
  "/api/events-v1",
  "/api/smart-buy-v2/status",
  "/api/smart-buy-v2/result",
]);
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

const createAuth = (env: Env, request: Request) => {
  const origin = new URL(request.url).origin;
  return betterAuth({
    database: env.frameanalytics_auth as any,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: origin,
    trustedOrigins: [origin],
    emailAndPassword: {
      enabled: true,
    },
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
        `CREATE TABLE IF NOT EXISTS frameanalytics_beta_invite (
          code_hash TEXT PRIMARY KEY NOT NULL,
          code_prefix TEXT NOT NULL,
          label TEXT,
          max_uses INTEGER NOT NULL DEFAULT 1,
          uses INTEGER NOT NULL DEFAULT 0,
          expires_at INTEGER,
          disabled INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS idx_frameanalytics_beta_invite_created
          ON frameanalytics_beta_invite(created_at DESC)`,
        `CREATE TABLE IF NOT EXISTS frameanalytics_beta_access (
          user_id TEXT PRIMARY KEY NOT NULL,
          code_hash TEXT,
          joined_at INTEGER NOT NULL,
          FOREIGN KEY (user_id) REFERENCES user(id) ON DELETE CASCADE
        )`,
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

const normalizeInviteCode = (value: unknown) =>
  String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 64);

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const betaAdminAuthorized = async (request: Request, env: Env) => {
  const expected = String(env.BETA_ADMIN_KEY || env.ADMIN_KEY || "").trim();
  const authorization = String(request.headers.get("Authorization") || "");
  const provided = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : String(request.headers.get("X-Admin-Key") || "").trim();
  if (!expected || !provided) return false;
  return (await sha256(expected)) === (await sha256(provided));
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

const createInviteCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  const body = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
  return `FA-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
};

const reserveBetaInvite = async (env: Env, inviteCode: unknown) => {
  const normalized = normalizeInviteCode(inviteCode);
  if (normalized.length < 10) return null;
  const codeHash = await sha256(normalized);
  const result = await env.frameanalytics_auth
    .prepare(`
      UPDATE frameanalytics_beta_invite
      SET uses = uses + 1
      WHERE code_hash = ?
        AND disabled = 0
        AND uses < max_uses
        AND (expires_at IS NULL OR expires_at > ?)
    `)
    .bind(codeHash, nowMs())
    .run();
  return Number(result.meta?.changes ?? 0) > 0 ? codeHash : null;
};

const releaseBetaInvite = async (env: Env, codeHash: string) => {
  try {
    await env.frameanalytics_auth
      .prepare(`UPDATE frameanalytics_beta_invite SET uses = MAX(0, uses - 1) WHERE code_hash = ?`)
      .bind(codeHash)
      .run();
  } catch (error) {
    console.error("frameanalytics-beta-invite-release-error", error);
  }
};

const handleBetaInviteOperations = async (request: Request, env: Env) => {
  if (request.method === "GET") {
    const rows = await env.frameanalytics_auth.prepare(`
      SELECT
        code_hash AS codeHash,
        code_prefix AS codePrefix,
        label,
        max_uses AS maxUses,
        uses,
        expires_at AS expiresAt,
        disabled,
        created_at AS createdAt
      FROM frameanalytics_beta_invite
      ORDER BY created_at DESC
      LIMIT 250
    `).all();
    return json({ ok: true, closedBeta: true, invites: rows.results ?? [] });
  }

  if (request.method === "POST") {
    const body = await readBody<{ label?: unknown; maxUses?: unknown; expiresInDays?: unknown }>(request);
    const label = String(body.label ?? "").trim().slice(0, 100) || null;
    const maxUses = Math.max(1, Math.min(100, Math.floor(Number(body.maxUses) || 1)));
    const expiresInDays = Math.max(1, Math.min(365, Math.floor(Number(body.expiresInDays) || 30)));
    const code = createInviteCode();
    const normalized = normalizeInviteCode(code);
    const codeHash = await sha256(normalized);
    const createdAt = nowMs();
    const expiresAt = createdAt + expiresInDays * 24 * 60 * 60 * 1000;
    await env.frameanalytics_auth.prepare(`
      INSERT INTO frameanalytics_beta_invite (
        code_hash, code_prefix, label, max_uses, uses, expires_at, disabled, created_at
      ) VALUES (?, ?, ?, ?, 0, ?, 0, ?)
    `).bind(codeHash, code.slice(0, 7), label, maxUses, expiresAt, createdAt).run();
    return json({
      ok: true,
      closedBeta: true,
      invite: {
        code,
        codeHash,
        codePrefix: code.slice(0, 7),
        label,
        maxUses,
        uses: 0,
        expiresAt,
        disabled: false,
        createdAt,
      },
      warning: "The raw invite code is returned only once"
    }, 201);
  }

  if (request.method === "DELETE") {
    const codeHash = String(new URL(request.url).searchParams.get("hash") || "").trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(codeHash)) return json({ ok: false, error: "Invalid invite hash" }, 400);
    const result = await env.frameanalytics_auth
      .prepare(`UPDATE frameanalytics_beta_invite SET disabled = 1 WHERE code_hash = ?`)
      .bind(codeHash)
      .run();
    return json({ ok: true, disabled: Number(result.meta?.changes ?? 0) > 0, codeHash });
  }

  if (request.method === "PATCH") {
    const body = await readBody<{ codeHash?: unknown; disabled?: unknown }>(request);
    const codeHash = String(body.codeHash || "").trim().toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(codeHash)) return json({ ok: false, error: "Invalid invite hash" }, 400);
    const disabled = body.disabled === true;
    const result = await env.frameanalytics_auth
      .prepare(`UPDATE frameanalytics_beta_invite SET disabled = ? WHERE code_hash = ?`)
      .bind(disabled ? 1 : 0, codeHash)
      .run();
    return json({ ok: true, updated: Number(result.meta?.changes ?? 0) > 0, disabled, codeHash });
  }

  return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "GET, POST, PATCH, DELETE" });
};

const handleBetaInvites = async (request: Request, env: Env) => {
  if (!(await betaAdminAuthorized(request, env))) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }
  return handleBetaInviteOperations(request, env);
};

const handleDeveloperBetaInvites = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  const guard = await requireDeveloper(request, env, auth);
  if (guard.response || !guard.user) return guard.response!;
  return handleBetaInviteOperations(request, env);
};

const handleBetaSignUp = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
  }
  const body = await readBody<{ name?: unknown; email?: unknown; password?: unknown; inviteCode?: unknown }>(request);
  const codeHash = await reserveBetaInvite(env, body.inviteCode);
  if (!codeHash) return json({ ok: false, error: "Invite code is invalid, expired, disabled, or already used" }, 403);

  try {
    const headers = new Headers(request.headers);
    headers.set("Content-Type", "application/json");
    headers.delete("Content-Length");
    const authRequest = new Request(`${new URL(request.url).origin}/api/auth/sign-up/email`, {
      method: "POST",
      headers,
      body: JSON.stringify({ name: body.name, email: body.email, password: body.password })
    });
    const authResponse = await auth.handler(authRequest);
    if (!authResponse.ok) {
      await releaseBetaInvite(env, codeHash);
      return authResponse;
    }
    try {
      const payload = await authResponse.clone().json() as { user?: { id?: unknown } };
      const userId = String(payload?.user?.id || "").trim();
      if (userId) {
        await env.frameanalytics_auth.prepare(`
          INSERT OR REPLACE INTO frameanalytics_beta_access (user_id, code_hash, joined_at)
          VALUES (?, ?, ?)
        `).bind(userId, codeHash, nowMs()).run();
      }
    } catch (error) {
      console.error("frameanalytics-beta-access-audit-error", error);
    }
    return authResponse;
  } catch (error) {
    await releaseBetaInvite(env, codeHash);
    throw error;
  }
};

const handleAnalyticsProxy = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  if (request.method !== "GET") {
    return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "GET" });
  }
  const user = await requireSession(auth, request, env);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

  const sourceUrl = new URL(request.url);
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
    const limit = Math.max(1, Math.min(250, Math.floor(Number(url.searchParams.get("limit")) || 100)));
    const pattern = `%${search}%`;
    const rows = await env.frameanalytics_auth.prepare(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.emailVerified AS emailVerified,
        u.createdAt AS createdAt,
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
        axi.axiLastRunAt AS axiLastRunAt,
        beta.joined_at AS betaJoinedAt,
        invite.code_prefix AS inviteCodePrefix,
        invite.label AS inviteLabel
      FROM user u
      LEFT JOIN frameanalytics_access a ON a.user_id = u.id
      LEFT JOIN frameanalytics_account_state s ON s.user_id = u.id
      LEFT JOIN frameanalytics_profile profile ON profile.user_id = u.id
      LEFT JOIN frameanalytics_beta_access beta ON beta.user_id = u.id
      LEFT JOIN frameanalytics_beta_invite invite ON invite.code_hash = beta.code_hash
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
      WHERE (? = '' OR LOWER(u.email) LIKE ? OR LOWER(u.name) LIKE ?)
      ORDER BY CASE WHEN LOWER(u.email) = ? THEN 0 ELSE 1 END, u.createdAt DESC
      LIMIT ?
    `).bind(nowMs() - SMART_BUY_WINDOW_MS, nowMs(), search, pattern, pattern, ownerEmail, limit).all<{
      id: string;
      name: string;
      email: string;
      emailVerified: number;
      createdAt: string;
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
      betaJoinedAt: number | null;
      inviteCodePrefix: string | null;
      inviteLabel: string | null;
    }>();
    return json({
      ok: true,
      accounts: (rows.results ?? []).map((row) => ({
        ...row,
        emailVerified: Boolean(row.emailVerified),
        developer: row.email.trim().toLowerCase() === ownerEmail,
        axiScanner: row.email.trim().toLowerCase() === ownerEmail || Number(row.axiScanner) === 1,
        disabled: row.email.trim().toLowerCase() === ownerEmail ? false : Number(row.disabled) === 1,
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
    });
  }

  if (request.method === "PATCH") {
    const body = await readBody<{ userId?: unknown; axiScanner?: unknown; disabled?: unknown }>(request);
    const userId = String(body.userId || "").trim();
    if (!userId) return json({ ok: false, error: "userId is required" }, 400);
    const target = await env.frameanalytics_auth.prepare(`SELECT id, email FROM user WHERE id = ?`).bind(userId).first<{ id: string; email: string }>();
    if (!target) return json({ ok: false, error: "Account not found" }, 404);
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
    const body = await readBody<{ userId?: unknown; action?: unknown }>(request);
    const userId = String(body.userId || "").trim();
    const action = String(body.action || "").trim();
    if (!userId) return json({ ok: false, error: "userId is required" }, 400);
    if (!new Set(["revoke-sessions", "reset-smart-buy-limit"]).has(action)) return json({ ok: false, error: "Unsupported account action" }, 400);
    const target = await env.frameanalytics_auth.prepare(`SELECT id, email FROM user WHERE id = ?`).bind(userId).first<{ id: string; email: string }>();
    if (!target) return json({ ok: false, error: "Account not found" }, 404);
    if (action === "reset-smart-buy-limit") {
      const result = await env.frameanalytics_auth.prepare(`DELETE FROM frameanalytics_smart_buy_run WHERE user_id = ?`).bind(userId).run();
      return json({ ok: true, userId, restoredRuns: Number(result.meta?.changes ?? 0), smartBuy: await readSmartBuyUsage(env, userId) });
    }
    if (target.email.trim().toLowerCase() === ownerEmail) {
      return json({ ok: false, error: "Owner sessions cannot be revoked here" }, 409);
    }
    const result = await env.frameanalytics_auth.prepare(`DELETE FROM "session" WHERE userId = ?`).bind(userId).run();
    return json({ ok: true, userId, revokedSessions: Number(result.meta?.changes ?? 0) });
  }

  return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "GET, PATCH, POST" });
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
          serviceRevision: "developer-wfm-safety-tray-1",
          auth: "better-auth",
          database: "frameanalytics-auth",
          closedBeta: true,
          registration: "invite-only",
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

      if (url.pathname === "/api/desktop-notifications/feed") {
        return handleDesktopNotificationFeed(request, env);
      }

      if (url.pathname === "/api/beta/status") {
        if (request.method !== "GET") return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "GET" });
        return json({ ok: true, closedBeta: true, registration: "invite-only", existingAccountsAllowed: true });
      }

      if (url.pathname === "/api/beta/invites") {
        return handleBetaInvites(request, env);
      }

      if (url.pathname === "/api/beta/sign-up") {
        return handleBetaSignUp(request, env, auth);
      }

      if (/^\/api\/auth\/sign-up\/email\/?$/.test(url.pathname)) {
        return json({ ok: false, error: "Closed beta: an invite code is required" }, 403);
      }

      if (url.pathname.startsWith("/api/auth/")) {
        return auth.handler(request);
      }

      if (url.pathname === "/api/account") {
        return handleAccount(request, env, auth);
      }

      if (url.pathname === "/api/developer/accounts") {
        return handleDeveloperAccounts(request, env, auth);
      }

      if (url.pathname === "/api/developer/beta-invites") {
        return handleDeveloperBetaInvites(request, env, auth);
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
