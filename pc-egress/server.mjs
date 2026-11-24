// FrameAnalytics Windows PC Egress v1.0.0
// Start with WFM_EGRESS_TOKEN in environment. Requires Node.js 20+.
import http from 'node:http'
import { createHash, timingSafeEqual } from 'node:crypto'

const HOST = '127.0.0.1'
const PORT = 8787
const REVISION = 'windows-pc-egress-v1'
const TOKEN = String(process.env.WFM_EGRESS_TOKEN || '').trim()
if (TOKEN.length < 32) {
  console.error('WFM_EGRESS_TOKEN is required and must contain at least 32 characters.')
  process.exit(1)
}
const expectedHash = createHash('sha256').update(TOKEN).digest()
const INPUT_HEADERS = new Set(['accept', 'language', 'platform', 'crossplay'])
const OUTPUT_HEADERS = [
  'content-type', 'retry-after', 'location', 'cf-ray', 'server',
  'ratelimit-limit', 'ratelimit-remaining', 'ratelimit-reset',
  'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset'
]
const MAX_REQUEST_BODY = 16 * 1024
const MAX_RESPONSE_BODY = 16 * 1024 * 1024
const MIN_START_GAP_MS = 500 // 2 WFM starts per second, under 3/s limit
let startTail = Promise.resolve()
let nextStart = 0

function sendJson(res, code, data, extra = {}) {
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-frameanalytics-egress': REVISION,
    ...extra
  })
  res.end(JSON.stringify(data))
}

function authorized(value) {
  if (typeof value !== 'string' || value.length > 1024) return false
  const actualHash = createHash('sha256').update(value).digest()
  return timingSafeEqual(expectedHash, actualHash)
}

async function waitForSlot() {
  let release
  const mine = new Promise(resolve => { release = resolve })
  const previous = startTail
  startTail = mine
  await previous
  try {
    const delay = Math.max(0, nextStart - Date.now())
    if (delay > 0) await new Promise(resolve => setTimeout(resolve, delay))
    nextStart = Date.now() + MIN_START_GAP_MS
  } finally {
    release()
  }
}

async function receiveJson(req) {
  let length = 0
  const parts = []
  for await (const part of req) {
    length += part.length
    if (length > MAX_REQUEST_BODY) {
      const error = new Error('Request body too large')
      error.status = 413
      throw error
    }
    parts.push(part)
  }
  try {
    return JSON.parse(Buffer.concat(parts).toString('utf8'))
  } catch {
    const error = new Error('Invalid JSON')
    error.status = 400
    throw error
  }
}

function approvedTarget(raw) {
  if (typeof raw !== 'string' || raw.length > 2048) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' ||
        url.hostname !== 'api.warframe.market' ||
        url.port !== '' || url.username || url.password || url.hash) return null
    if (!/^\/v[12]\/(?:items|orders|user)(?:\/|$)/.test(url.pathname)) return null
    return url
  } catch {
    return null
  }
}

async function handle(req, res) {
  const pathname = new URL(req.url || '/', 'http://localhost').pathname
  if (pathname === '/health' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true, service: 'frameanalytics-pc-egress',
      revision: REVISION, target: 'api.warframe.market', maxStartsPerSecond: 2
    })
  }
  if (pathname !== '/proxy' || req.method !== 'POST')
    return sendJson(res, 404, { ok: false, error: 'Not found' })
  if (!authorized(req.headers['x-frameanalytics-egress-token'])) {
    return sendJson(res, 401, { ok: false, error: 'Unauthorized' })
  }

  let payload
  try {
    payload = await receiveJson(req)
  } catch (error) {
    return sendJson(res, error.status || 400, { ok: false, error: error.message })
  }
  const target = approvedTarget(payload?.url)
  const method = String(payload?.method || 'GET').toUpperCase()
  if (!target || !['GET', 'HEAD'].includes(method)) {
    return sendJson(res, 403, { ok: false, error: 'Target or method not allowed' })
  }
  const forwarded = {
    Accept: 'application/json',
    'User-Agent': 'FrameAnalytics/1.0 (+https://frameanalytics.trade; PC Egress)'
  }
  if (payload.headers && typeof payload.headers === 'object' &&
      !Array.isArray(payload.headers)) {
    for (const [name, value] of Object.entries(payload.headers)) {
      if (INPUT_HEADERS.has(name.toLowerCase()) && typeof value === 'string' &&
          value.length < 256 && !/[\r\n]/.test(value)) {
        forwarded[name] = value
      }
    }
  }

  try {
    await waitForSlot()
    const response = await fetch(target, {
      method, headers: forwarded, redirect: 'manual',
      signal: AbortSignal.timeout(25000)
    })
    const headers = {
      'cache-control': 'no-store',
      'x-frameanalytics-egress': REVISION
    }
    for (const key of OUTPUT_HEADERS) {
      const value = response.headers.get(key)
      if (value !== null) headers[key] = value
    }
    let bytes = Buffer.alloc(0)
    if (method !== 'HEAD' && response.body) {
      const reader = response.body.getReader()
      const chunks = []
      let count = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          count += value.byteLength
          if (count > MAX_RESPONSE_BODY) {
            await reader.cancel()
            return sendJson(res, 502, { ok: false, error: 'Upstream body too large' })
          }
          chunks.push(Buffer.from(value))
        }
      } finally {
        reader.releaseLock()
      }
      bytes = Buffer.concat(chunks, count)
    }
    res.writeHead(response.status, headers)
    res.end(bytes)
  } catch (error) {
    console.error('Upstream failure:', error?.name || 'Error')
    sendJson(res, 502, { ok: false, error: 'Upstream request failed or timed out' })
  }
}

const server = http.createServer((req, res) => {
  void handle(req, res).catch(() => {
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Internal error' })
    else res.end()
  })
})
server.requestTimeout = 30000
server.headersTimeout = 10000
server.listen(PORT, HOST, () => {
  console.log('FrameAnalytics PC Egress ' + REVISION + ' ready on http://' + HOST + ':' + PORT)
  console.log('Local-only. Expose via Cloudflare Tunnel, not a router port forward.')
})
