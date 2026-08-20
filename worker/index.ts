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
  BETTER_AUTH_SECRET: string;
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

const normalizeWfmProfile = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (!text) return null;

  try {
    const url = new URL(text.includes("://") ? text : `https://warframe.market/profile/${text}`);
    const match = url.pathname.match(/^\/profile\/([^/?#]+)\/?$/i);
    if (!match) return null;
    return decodeURIComponent(match[1]).trim() || null;
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

const handleSmartBuyPermit = async (
  request: Request,
  env: Env,
  auth: ReturnType<typeof createAuth>,
) => {
  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405, { Allow: "POST" });
  }

  const user = await requireSession(auth, request);
  if (!user) return json({ ok: false, error: "Unauthorized" }, 401);

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

  return json({
    ok: true,
    permitId,
    smartBuy: await readSmartBuyUsage(env, user.id),
  });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    const auth = createAuth(env, request);

    try {
      await ensureSchema(auth, env);

      if (url.pathname.startsWith("/api/auth/")) {
        return auth.handler(request);
      }

      if (url.pathname === "/api/health") {
        return json({
          ok: true,
          service: "frameanalytics-account",
          auth: "better-auth",
          database: "frameanalytics-auth",
        });
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

      if (url.pathname === "/api/smart-buy/permit") {
        return handleSmartBuyPermit(request, env, auth);
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
