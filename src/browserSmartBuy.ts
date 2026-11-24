import type {
  SmartBuyDimensions, SmartBuyResponse, SmartBuySeller, SmartBuySellerOffer,
  SmartBuyUser, SmartBuyWishlistRow
} from './api'

// Fallback for browsers that can read the public Warframe Market API.
// Never use no-cors: an opaque response cannot be validated and must not create recommendations.
// Custom Platform/Crossplay headers remain mandatory for non-default markets.
type MarketUser = {
  id?: string
  slug?: string
  ingameName?: string
  reputation?: number
  platform?: string
  crossplay?: boolean
  locale?: string
  status?: string
  lastSeen?: string
}
type MarketOrder = {
  id?: string
  itemId?: string
  type?: string
  visible?: boolean
  platinum?: number
  quantity?: number
  perTrade?: number
  rank?: number
  subtype?: string
  charges?: number
  amberStars?: number
  cyanStars?: number
  updatedAt?: string
  createdAt?: string
  user?: MarketUser
}
type Envelope<T> = { data?: T; error?: unknown }
export type PreparedBrowserSmartBuy = {
  profile: SmartBuyUser
  publicOrders: MarketOrder[]
  headers?: Record<string, string>
  firstItemId?: string
  firstItemOrders?: MarketOrder[]
}

const MIN_REQUEST_INTERVAL_MS = 1100
const MAX_MARKET_SERIES = 80
let nextRequestAt = 0

const wait = (delay: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'))
  const timer = window.setTimeout(done, Math.max(0, delay))
  function done() {
    signal?.removeEventListener('abort', abort)
    resolve()
  }
  function abort() {
    window.clearTimeout(timer)
    reject(new DOMException('Aborted', 'AbortError'))
  }
  signal?.addEventListener('abort', abort, { once: true })
})

const integer = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isInteger(number) ? number : null
}
const positive = (value: unknown): number | null => {
  const number = Number(value)
  return value != null && Number.isFinite(number) && number > 0 ? number : null
}
const round2 = (value: number) => Math.round(value * 100) / 100
const round1 = (value: number) => Math.round(value * 10) / 10
const normalized = (value: unknown) => typeof value === 'string' ? value.trim() : ''

const dimensions = (order: MarketOrder): SmartBuyDimensions => {
  const value: SmartBuyDimensions = {}
  for (const field of ['rank', 'charges', 'amberStars', 'cyanStars'] as const) {
    const number = integer(order[field])
    if (number !== null) value[field] = number
  }
  if (normalized(order.subtype)) value.subtype = normalized(order.subtype)
  return value
}
const dimensionsKey = (d: SmartBuyDimensions) => [
  d.rank === undefined ? 'rank=-' : 'rank=' + d.rank,
  d.subtype === undefined ? 'subtype=-' : 'subtype=' + encodeURIComponent(d.subtype),
  d.charges === undefined ? 'charges=-' : 'charges=' + d.charges,
  d.amberStars === undefined ? 'amberStars=-' : 'amberStars=' + d.amberStars,
  d.cyanStars === undefined ? 'cyanStars=-' : 'cyanStars=' + d.cyanStars
].join('|')
const tradeSize = (order: MarketOrder) => Math.max(1, integer(order.perTrade) || 1)
const available = (order: MarketOrder) =>
  Math.floor(Math.max(0, integer(order.quantity) || 0) / tradeSize(order)) * tradeSize(order)
const unitPrice = (order: MarketOrder) => {
  const p = positive(order.platinum)
  return p === null ? null : round2(p / tradeSize(order))
}
const userSummary = (user?: MarketUser): SmartBuyUser | null => {
  if (!user || !normalized(user.slug)) return null
  const slug = normalized(user.slug)
  return {
    id: normalized(user.id) || null,
    slug,
    ingameName: normalized(user.ingameName) || slug,
    reputation: integer(user.reputation) || 0,
    platform: normalized(user.platform) || null,
    crossplay: user.crossplay === true,
    locale: normalized(user.locale) || null,
    status: normalized(user.status).toLowerCase() || 'offline',
    lastSeen: normalized(user.lastSeen) || null,
    profileUrl: 'https://warframe.market/profile/' + encodeURIComponent(slug)
  }
}

const BRIDGE_CHANNEL = 'frameanalytics-wfm-bridge-v1'
let bridgeAvailability: Promise<boolean> | null = null

const browserBridgeReady = (): Promise<boolean> => {
  if (bridgeAvailability) return bridgeAvailability
  bridgeAvailability = new Promise<boolean>(resolve => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      resolve(false)
    }, 350)
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin || event.source !== window ||
        event.data?.channel !== BRIDGE_CHANNEL || event.data?.kind !== 'ready') return
      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      resolve(true)
    }
    window.addEventListener('message', onMessage)
    window.postMessage({ channel: BRIDGE_CHANNEL, kind: 'ping' }, location.origin)
  })
  return bridgeAvailability
}

const browserBridgeGet = (
  path: string, headers: Record<string, string> | undefined, signal?: AbortSignal
): Promise<{ status: number; contentType: string; body: string }> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const id = crypto.randomUUID()
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('WFM bridge response timeout'))
    }, 25000)
    function cleanup() {
      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      signal?.removeEventListener('abort', onAbort)
    }
    function onAbort() {
      cleanup()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    function onMessage(event: MessageEvent) {
      if (event.origin !== location.origin || event.source !== window ||
        event.data?.channel !== BRIDGE_CHANNEL || event.data?.kind !== 'response' ||
        event.data?.id !== id) return
      cleanup()
      if (event.data.error) reject(new Error(String(event.data.error)))
      else resolve({
        status: Number(event.data.status),
        contentType: String(event.data.contentType || ''),
        body: String(event.data.body || '')
      })
    }
    window.addEventListener('message', onMessage)
    signal?.addEventListener('abort', onAbort, { once: true })
    window.postMessage({ channel: BRIDGE_CHANNEL, kind: 'request', id, path, headers }, location.origin)
  })

async function marketGet<T>(
  path: string,
  signal?: AbortSignal,
  headers?: Record<string, string>
): Promise<T> {
  const pause = nextRequestAt - Date.now()
  if (pause > 0) await wait(pause, signal)
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  nextRequestAt = Date.now() + MIN_REQUEST_INTERVAL_MS

  let status: number
  let contentType: string
  let envelope: Envelope<T>
  if (await browserBridgeReady()) {
    const result = await browserBridgeGet('/v2' + path, headers, signal)
    status = result.status
    contentType = result.contentType
    try {
      envelope = JSON.parse(result.body) as Envelope<T>
    } catch {
      throw new Error('Warframe Market вернул не JSON через браузерный мост.')
    }
  } else {
    let response: Response
    try {
      response = await fetch('https://api.warframe.market/v2' + path, {
        method: 'GET', mode: 'cors', credentials: 'omit', signal,
        ...(headers ? { headers } : {})
      })
    } catch (error) {
      if (signal?.aborted) throw error
      throw new Error(
        'Браузер не может прочитать ответ Warframe Market (CORS). ' +
        'Для Crossplay установите FrameAnalytics WFM Bridge через Tampermonkey. ' +
        'Не отключайте защиту CORS глобально.'
      )
    }
    status = response.status
    contentType = response.headers.get('content-type') || ''
    if (!contentType.toLowerCase().includes('json')) {
      throw new Error('Warframe Market вернул не JSON; поиск остановлен.')
    }
    envelope = await response.json() as Envelope<T>
  }
  if (status < 200 || status >= 300) {
    throw new Error('Warframe Market HTTP ' + status +
      (status === 429 ? ' (лимит запросов; остановлено)' : ''))
  }
  if (!contentType.toLowerCase().includes('json')) {
    throw new Error('Warframe Market вернул не JSON; поиск остановлен.')
  }
  if (envelope.error || envelope.data === undefined || envelope.data === null) {
    throw new Error('Warframe Market вернул ошибку API или пустой ответ.')
  }
  return envelope.data
}

const groupedDemands = (orders: MarketOrder[]) => {
  const grouped = new Map<string, SmartBuyWishlistRow>()
  for (const order of orders) {
    if (order.type !== 'buy' || order.visible === false) continue
    const itemId = normalized(order.itemId)
    const quantity = Math.max(0, integer(order.quantity) || 0)
    const price = unitPrice(order)
    const platinum = positive(order.platinum)
    if (!itemId || !quantity || price === null || platinum === null) continue
    const d = dimensions(order)
    const key = itemId + '::' + dimensionsKey(d)
    const current = grouped.get(key)
    if (current) {
      current.quantity += quantity
      if (order.id) current.orderIds.push(order.id)
      if (price > current.wantedUnitPrice) {
        current.wantedUnitPrice = price
        current.wantedPlatinum = platinum
        current.perTrade = tradeSize(order)
      }
      if (Date.parse(order.updatedAt || '') > Date.parse(current.updatedAt || '')) {
        current.updatedAt = order.updatedAt || null
      }
      continue
    }
    grouped.set(key, {
      demandKey: key, itemId, dimensions: d,
      orderIds: order.id ? [order.id] : [],
      quantity, perTrade: tradeSize(order), wantedPlatinum: platinum, wantedUnitPrice: price,
      updatedAt: order.updatedAt || null, createdAt: order.createdAt || null,
      marketMinUnitPrice: null, onlineMinUnitPrice: null, marketMinFromOnline: false,
      gapPct: null, onlineGapPct: null, absoluteGapPct: null,
      average24hUnitPrice: null, average24hVolume: null, average24hLatestAt: null,
      average24hPoints: 0, sellers: 0, onlineSellers: 0, marketFetchedAt: ''
    })
  }
  return Array.from(grouped.values()).sort((a, b) =>
    (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0) ||
    a.itemId.localeCompare(b.itemId) || a.demandKey.localeCompare(b.demandKey))
}

// This preflight happens before the D1 quota reservation.
// A CORS failure or an unconfigured market scope must not consume a paid/limited run.
export async function prepareBrowserSmartBuy(
  profileSlug: string,
  signal?: AbortSignal
): Promise<PreparedBrowserSmartBuy> {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(profileSlug)) {
    throw new Error('Некорректное имя профиля Warframe Market.')
  }
  const raw = await marketGet<MarketUser>('/user/' + encodeURIComponent(profileSlug), signal)
  const profile = userSummary(raw)
  if (!profile) throw new Error('Профиль Warframe Market не найден.')
  const platform = (profile.platform || 'pc').toLowerCase()
  if (!['pc', 'ps4', 'xbox', 'switch', 'mobile'].includes(platform)) {
    throw new Error('Неизвестная платформа Warframe Market.')
  }
  const crossplay = platform !== 'switch' && profile.crossplay
  const headers = platform === 'pc' && !crossplay ? undefined : {
    Platform: platform, Crossplay: String(crossplay)
  }
  const publicOrders = await marketGet<MarketOrder[]>(
    '/orders/user/' + encodeURIComponent(profileSlug), signal)
  if (!Array.isArray(publicOrders)) throw new Error('Неверный список заявок профиля.')

  const demands = groupedDemands(publicOrders)
  const firstItemId = demands[0]?.itemId
  // Verify the actual market scope before charging a run. In particular, crossplay
  // must NEVER silently fall back to the default PC/non-crossplay order book.
  const firstItemOrders = firstItemId
    ? await marketGet<MarketOrder[]>('/orders/itemId/' + encodeURIComponent(firstItemId), signal, headers)
    : undefined
  if (firstItemOrders && !Array.isArray(firstItemOrders)) {
    throw new Error('Неверный формат предложений продавцов.')
  }
  return { profile: { ...profile, platform, crossplay }, publicOrders, headers, firstItemId, firstItemOrders }
}

export async function scanBrowserSmartBuy(
  prepared: PreparedBrowserSmartBuy,
  onProgress: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<SmartBuyResponse> {
  const allDemands = groupedDemands(prepared.publicOrders)
  const demands = allDemands.slice(0, MAX_MARKET_SERIES)
  const sellers = new Map<string, SmartBuySeller>()
  const byItem = new Map<string, MarketOrder[]>()
  if (prepared.firstItemId && prepared.firstItemOrders) {
    byItem.set(prepared.firstItemId, prepared.firstItemOrders)
  }
  const online = new Set(['online', 'ingame'])
  let done = 0
  onProgress(0, demands.length)
  for (const demand of demands) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    let orders = byItem.get(demand.itemId)
    if (!orders) {
      orders = await marketGet<MarketOrder[]>(
        '/orders/itemId/' + encodeURIComponent(demand.itemId),
        signal, prepared.headers)
      if (!Array.isArray(orders)) throw new Error('Неверный формат предложений продавцов.')
      byItem.set(demand.itemId, orders)
    }
    const matching = orders.filter(order =>
      order.type === 'sell' && order.visible !== false &&
      dimensionsKey(dimensions(order)) === dimensionsKey(demand.dimensions) &&
      available(order) > 0 && positive(order.platinum) !== null &&
      Boolean(userSummary(order.user)) &&
      (!prepared.profile.id || order.user?.id !== prepared.profile.id))
    const onlineMatching = matching.filter(o => online.has((o.user?.status || '').toLowerCase()))
    const prices = matching.map(unitPrice).filter((v): v is number => v !== null)
    const onlinePrices = onlineMatching.map(unitPrice).filter((v): v is number => v !== null)
    const marketMin = prices.length ? Math.min(...prices) : null
    const onlineMin = onlinePrices.length ? Math.min(...onlinePrices) : null
    demand.marketMinUnitPrice = marketMin
    demand.onlineMinUnitPrice = onlineMin
    demand.marketMinFromOnline = false
    demand.gapPct = marketMin ? round1((demand.wantedUnitPrice - marketMin) / marketMin * 100) : null
    demand.onlineGapPct = onlineMin ? round1((demand.wantedUnitPrice - onlineMin) / onlineMin * 100) : null
    demand.absoluteGapPct = demand.gapPct === null ? null : Math.abs(demand.gapPct)
    demand.sellers = matching.length
    demand.onlineSellers = onlineMatching.length
    demand.marketFetchedAt = new Date().toISOString()

    for (const order of matching) {
      const user = userSummary(order.user)
      const platinum = positive(order.platinum)
      const price = unitPrice(order)
      if (!user || platinum === null || price === null) continue
      const trade = tradeSize(order)
      const availableQuantity = available(order)
      const fillableQuantity = Math.floor(Math.min(demand.quantity, availableQuantity) / trade) * trade
      if (fillableQuantity <= 0) continue
      const offer: SmartBuySellerOffer = {
        demandKey: demand.demandKey, itemId: demand.itemId, orderId: order.id || null,
        dimensions: demand.dimensions, platinum, perTrade: trade, unitPrice: price,
        availableQuantity, fillableQuantity, requestedQuantity: demand.quantity,
        fullQuantity: fillableQuantity >= demand.quantity,
        estimatedCost: round2(fillableQuantity / trade * platinum),
        premiumPct: marketMin ? round1((price - marketMin) / marketMin * 100) : null,
        vs24hAveragePct: null, vs24hAveragePlatinum: null, updatedAt: order.updatedAt || null
      }
      const key = user.id || user.slug.toLowerCase()
      const entry: SmartBuySeller = sellers.get(key) || {
        user, offers: [], marketSeriesCovered: 0,
        unitsCovered: 0, fullSeriesCovered: 0, estimatedCost: 0
      }
      const index = entry.offers.findIndex(old => old.demandKey === offer.demandKey)
      if (index === -1) {
        entry.offers.push(offer)
      } else {
        const old = entry.offers[index]
        if (offer.fillableQuantity > old.fillableQuantity ||
          (offer.fillableQuantity === old.fillableQuantity && offer.unitPrice < old.unitPrice)) {
          entry.offers[index] = offer
        }
      }
      sellers.set(key, entry)
    }
    done++
    onProgress(done, demands.length)
  }
  const sellerRows = Array.from(sellers.values()).map(entry => {
    entry.offers.sort((a, b) => Number(b.fullQuantity) - Number(a.fullQuantity) ||
      (a.premiumPct ?? Infinity) - (b.premiumPct ?? Infinity) || a.itemId.localeCompare(b.itemId))
    entry.marketSeriesCovered = entry.offers.length
    entry.unitsCovered = entry.offers.reduce((sum, o) => sum + o.fillableQuantity, 0)
    entry.fullSeriesCovered = entry.offers.filter(o => o.fullQuantity).length
    entry.estimatedCost = round2(entry.offers.reduce((sum, o) => sum + (o.estimatedCost || 0), 0))
    return entry
  }).sort((a, b) => b.unitsCovered - a.unitsCovered ||
    b.marketSeriesCovered - a.marketSeriesCovered ||
    b.fullSeriesCovered - a.fullSeriesCovered ||
    a.estimatedCost - b.estimatedCost || a.user.ingameName.localeCompare(b.user.ingameName))
  return {
    ok: true, smartBuyVersion: '2.0', smartBuyRuntimeRevision: 'browser-v1',
    generatedAt: new Date().toISOString(), publicOnly: true,
    hiddenOrdersAvailable: false, profile: prepared.profile,
    marketScope: {
      platform: prepared.profile.platform || 'pc',
      crossplay: prepared.profile.crossplay
    },
    publicOrders: prepared.publicOrders.length,
    visibleBuyOrders: prepared.publicOrders.filter(o => o.type === 'buy' && o.visible !== false).length,
    marketSeriesRequested: allDemands.length, marketSeriesProcessed: demands.length,
    truncated: allDemands.length > demands.length, maxMarketSeries: MAX_MARKET_SERIES,
    cache: { profile: false, userOrders: false, itemHits: 0,
      itemMisses: byItem.size, itemTtlSeconds: 0 },
    throttle: { activityKey: 'browser-direct', fastIntervalMs: MIN_REQUEST_INTERVAL_MS,
      hourlyBusyIntervalMs: MIN_REQUEST_INTERVAL_MS,
      fastRequests: byItem.size + 2, hourlyBusyRequests: 0, failSafeRequests: 0 },
    wishlist: demands, sellers: sellerRows
  }
}
