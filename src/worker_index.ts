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
  BETTER_AUTH_SECRET: string;
  SMART_BUY_START_SECRET: string;
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

const SMART_BUY_START_HEADER = "X-FrameAnalytics-SmartBuy-Token";
const ANALYTICS_READ_PATHS = new Set([
  "/api/catalog-v3",
  "/api/scanner-v3",
  "/api/item-v3",
  "/api/metrics-v3",
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
  analysis?: "smart-buy" | "sell-advisor";
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

const requireSession = async (auth: ReturnType<typeof createAuth>, request: Request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  return session.user as SessionUser;
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

const handleBetaInvites = async (request: Request, env: Env) => {
  if (!(await betaAdminAuthorized(request, env))) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

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
      invite: { code, codeHash, label, maxUses, uses: 0, expiresAt, createdAt },
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

  return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "GET, POST, DELETE" });
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
  const user = await requireSession(auth, request);
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
  const user = await requireSession(auth, request);
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
  const since = now - 24 * 60 * 60 * 1000;
  const cooldownCutoff = now - 60 * 1000;

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
    ? Math.max(0, Math.ceil((lastRunAt + 60_000 - now) / 1000))
    : 0;

  return {
    limit: 30,
    windowHours: 24,
    used,
    remaining: Math.max(0, 30 - used),
    cooldownSeconds: 60,
    cooldownRemainingSeconds,
    canRun: used < 30 && (!lastRunAt || lastRunAt <= cooldownCutoff),
    lastRunAt: lastRunAt ? new Date(lastRunAt).toISOString() : null,
  };
};

const reserveSmartBuyRun = async (env: Env, userId: string) => {
  const now = nowMs();
  const id = crypto.randomUUID();
  const since = now - 24 * 60 * 60 * 1000;
  const cooldownCutoff = now - 60 * 1000;

  const result = await env.frameanalytics_auth
    .prepare(`
      INSERT INTO frameanalytics_smart_buy_run (id, user_id, created_at)
      SELECT ?, ?, ?
      WHERE
        (
          SELECT COUNT(*)
          FROM frameanalytics_smart_buy_run
          WHERE user_id = ? AND created_at > ?
        ) < 30
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
  const user = await requireSession(auth, request);
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

  return json({
    ok: true,
    user,
    profile: {
      wfmProfile: profile?.wfm_profile ?? null,
      updatedAt: profile?.updated_at ? new Date(profile.updated_at).toISOString() : null,
    },
    smartBuy: usage,
  });
};

const handleWfmProfile = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  const user = await requireSession(auth, request);
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
  const user = await requireSession(auth, request);
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

  const user = await requireSession(auth, request);
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
          serviceRevision: "admin-manual-items-1",
          auth: "better-auth",
          database: "frameanalytics-auth",
          closedBeta: true,
          registration: "invite-only",
          smartBuyStartProxy: true,
          sellAdvisorStartProxy: true,
          smartBuyTransport: env.SMART_BUY_API ? "service-binding" : "unavailable",
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
