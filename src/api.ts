import type { CatalogResponse, EventsResponse, HourlyIndexQuery, HourlyIndexResponse, HourlyResponse, ItemResponse, MetricsResponse, Platform, ScannerQuery, ScannerResponse } from './types'

export const API_BASE = 'https://frameanalytics-api-test.smurfack403.workers.dev'

const requestJson = async <T,>(
  path: string,
  options: RequestInit = {}
): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  })
  if (!response.ok) {
    let detail = ''
    try {
      const payload = await response.json() as { error?: string }
      detail = payload.error ? `: ${payload.error}` : ''
    } catch {
      // Keep the HTTP status when the response is not JSON.
    }
    throw new Error(`HTTP ${response.status}${detail}`)
  }

  return response.json() as Promise<T>
}

const fetchJson = <T,>(path: string, signal?: AbortSignal) =>
  requestJson<T>(path, { method: 'GET', signal })
export const fetchScanner = (query: ScannerQuery, signal?: AbortSignal) => {
  const params = new URLSearchParams({
    platform: query.platform,
    period: String(query.period),
    mode: query.mode,
    crossplay: String(query.crossplay),
    includeLow: 'true',
    includeNoHistory: 'true',
    groupItems: 'false',
    offset: String(query.offset),
    limit: String(query.limit),
    sort: query.sort,
    direction: query.direction
  })
  if (query.ids?.length) params.set('ids', query.ids.join(','))
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.categories) params.set('categories', query.categories.length ? query.categories.join(',') : '__none__')
  if (query.minPrice && query.minPrice > 0) params.set('minPrice', String(query.minPrice))
  if (query.minPotential && query.minPotential > 0) params.set('minPotential', String(query.minPotential))
  if (query.language) params.set('lang', query.language)
  return fetchJson<ScannerResponse>(`/api/scanner-v3?${params}`, signal)
}
export const fetchItem = (platform: Platform, id: string, signal?: AbortSignal) => {
  const params = new URLSearchParams({ platform, id })
  return fetchJson<ItemResponse>(`/api/item-v3?${params}`, signal)
}

export const fetchMetrics = (platform: Platform, id: string, signal?: AbortSignal) => {
  const params = new URLSearchParams({ platform, id })
  return fetchJson<MetricsResponse>(`/api/metrics-v3?${params}`, signal)
}
export const fetchCatalog = (language: string, signal?: AbortSignal) => {
  const params = new URLSearchParams({ lang: language })
  return fetchJson<CatalogResponse>(`/api/catalog-v3?${params}`, signal)
}

export const fetchHourly = (platform: Platform, crossplay: boolean, id: string, signal?: AbortSignal) => {
  const params = new URLSearchParams({ platform, crossplay: String(crossplay), id, rank: 'all' })
  return fetchJson<HourlyResponse>(`/api/hourly-v1?${params}`, signal)
}
export const fetchHourlyIndex = (query: HourlyIndexQuery, signal?: AbortSignal) => {
  const params = new URLSearchParams({
    platform: query.platform,
    crossplay: String(query.crossplay),
    rank: query.rank,
    period: String(query.period),
    mode: query.mode,
    groupItems: 'false',
    includeDaily: 'true',
    offset: String(query.offset),
    limit: String(query.limit),
    sort: query.sort,
    direction: query.direction
  })
  if (query.ids?.length) params.set('ids', query.ids.join(','))
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.categories) params.set('categories', query.categories.length ? query.categories.join(',') : '__none__')
  if (query.minPrice && query.minPrice > 0) params.set('minPrice', String(query.minPrice))
  if (query.minPotential && query.minPotential > 0) params.set('minPotential', String(query.minPotential))
  if (query.language) params.set('lang', query.language)
  params.set('t', String(Date.now()))
  return fetchJson<HourlyIndexResponse>(`/api/hourly-index-v1?${params}`, signal)
}
export const fetchEvents = (signal?: AbortSignal) => fetchJson<EventsResponse>('/api/events-v1', signal)

export type SmartBuyUser = {
  id: string | null
  slug: string
  ingameName: string
  reputation: number
  platform: string | null
  crossplay: boolean
  locale: string | null
  status: string
  lastSeen: string | null
  profileUrl: string
}
export type SmartBuyDimensions = {
  rank?: number
  subtype?: string
  charges?: number
  amberStars?: number
  cyanStars?: number
}
export type SmartBuyWishlistRow = {
  demandKey: string
  itemId: string
  dimensions: SmartBuyDimensions
  orderIds: string[]
  quantity: number
  perTrade: number
  wantedPlatinum: number
  wantedUnitPrice: number
  updatedAt: string | null
  createdAt: string | null
  marketMinUnitPrice: number | null
  onlineMinUnitPrice?: number | null
  marketMinFromOnline: boolean
  gapPct: number | null
  onlineGapPct?: number | null
  absoluteGapPct: number | null
  average24hUnitPrice?: number | null
  average24hVolume?: number | null
  average24hLatestAt?: string | null
  average24hPoints?: number
  sellers: number
  onlineSellers: number
  marketFetchedAt: string
}
export type SmartBuySellerOffer = {
  demandKey: string
  itemId: string
  orderId: string | null
  dimensions: SmartBuyDimensions
  platinum: number | null
  perTrade: number
  unitPrice: number
  availableQuantity: number
  fillableQuantity: number
  requestedQuantity: number
  fullQuantity: boolean
  estimatedCost: number | null
  premiumPct: number | null
  vs24hAveragePct?: number | null
  vs24hAveragePlatinum?: number | null
  updatedAt: string | null
}
export type SmartBuySeller = {
  user: SmartBuyUser
  offers: SmartBuySellerOffer[]
  marketSeriesCovered: number
  unitsCovered: number
  fullSeriesCovered: number
  estimatedCost: number
}
export type SmartBuyResponse = {
  ok: true
  smartBuyVersion: string
  smartBuyRuntimeRevision: string
  generatedAt: string
  publicOnly: true
  hiddenOrdersAvailable: false
  profile: SmartBuyUser
  marketScope: { platform: string; crossplay: boolean }
  publicOrders: number
  visibleBuyOrders: number
  marketSeriesRequested: number
  marketSeriesProcessed: number
  truncated: boolean
  maxMarketSeries: number
  cache: { profile: boolean; userOrders: boolean; itemHits: number; itemMisses: number; itemTtlSeconds: number }
  throttle?: {
    activityKey: string
    fastIntervalMs: number
    hourlyBusyIntervalMs: number
    fastRequests: number
    hourlyBusyRequests: number
    failSafeRequests: number
  }
  wishlist: SmartBuyWishlistRow[]
  sellers: SmartBuySeller[]
}
export type SmartBuyJobProgress = {
  stage: 'queued' | 'profile' | 'user-orders' | 'market-orders' | 'finalizing' | 'retrying' | 'completed' | 'failed' | string
  processed: number
  total: number | null
  percent: number
  currentItemId: string | null
}
export type SmartBuyQueueInfo = {
  position: number | null
  waitingAhead: number | null
  queuedJobs: number | null
  estimated: boolean
}
export type SmartBuyJobStatus = {
  ok: true
  smartBuyVersion: string
  smartBuyRuntimeRevision: string
  jobId: string
  profileSlug: string
  state: 'queued' | 'running' | 'retrying' | 'completed' | 'failed'
  queuedAt: string
  startedAt: string | null
  completedAt: string | null
  updatedAt: string
  attempts: number
  progress: SmartBuyJobProgress
  batch?: { size: number; slot: number }
  queue: SmartBuyQueueInfo
  resultReady: boolean
  error: string | null
}
export type SmartBuyJobStart = {
  ok: true
  smartBuyVersion: string
  smartBuyRuntimeRevision: string
  jobId: string
  state: 'queued'
  queuedAt: string
}

export const startSmartBuy = (profile: string, signal?: AbortSignal) =>
  requestJson<SmartBuyJobStart>('/api/smart-buy-v2/start', {
    method: 'POST',
    signal,
    body: JSON.stringify({ profile })
  })

export const fetchSmartBuyStatus = (jobId: string, signal?: AbortSignal) => {
  const params = new URLSearchParams({ id: jobId, t: String(Date.now()) })
  return fetchJson<SmartBuyJobStatus>(`/api/smart-buy-v2/status?${params}`, signal)
}

export const fetchSmartBuyResult = (jobId: string, signal?: AbortSignal) => {
  const params = new URLSearchParams({ id: jobId, t: String(Date.now()) })
  return fetchJson<SmartBuyResponse>(`/api/smart-buy-v2/result?${params}`, signal)
}

const smartBuyDelay = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }

    const timeout = window.setTimeout(() => {
      signal?.removeEventListener('abort', abort)
      resolve()
    }, ms)

    const abort = () => {
      window.clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
      reject(new DOMException('Aborted', 'AbortError'))
    }

    signal?.addEventListener('abort', abort, { once: true })
  })

export const waitForSmartBuy = async (
  profile: string,
  onStatus: (status: SmartBuyJobStatus) => void,
  signal?: AbortSignal
): Promise<SmartBuyResponse> => {
  const started = await startSmartBuy(profile, signal)

  while (!signal?.aborted) {
    const status = await fetchSmartBuyStatus(started.jobId, signal)
    onStatus(status)

    if (status.state === 'completed') {
      return fetchSmartBuyResult(started.jobId, signal)
    }
    if (status.state === 'failed') {
      throw new Error(status.error || 'Smart Buy job failed')
    }

    await smartBuyDelay(1500, signal)
  }

  throw new DOMException('Aborted', 'AbortError')
}

// Compatibility exports for the existing SiteStats.tsx.
// These readers intentionally use only public/read-only endpoints.
export type SiteApiStatus = {
  ok?: boolean
  name?: string
  stage?: string
  role?: string
  catalogTotal?: number
  smartBuyVersion?: string
  smartBuyRuntimeRevision?: string
  smartBuyAsyncVersion?: string
  smartBuyAsyncRuntimeRevision?: string
  [key: string]: any
}

export type SiteHourlyStatus = {
  ok?: boolean
  runtimeRevision?: string
  enabled?: boolean
  lastFetchedAt?: string | null
  queue?: {
    backlogCount?: number
    backlogBytes?: number
    [key: string]: any
  }
  groups?: {
    target?: number
    [key: string]: any
  }
  upstreamCooldown?: {
    until?: string | null
    [key: string]: any
  }
  [key: string]: any
}

export type SiteHourlyFreshnessBucket = {
  scope: string
  tier: string
  groups: number
  fresh: number
  due: number
  stale: number
  missing: number
  checkpointed?: number
  errorItems?: number
  oldestAgeMinutes: number | null
  [key: string]: any
}

export type SiteHourlyFreshnessTotals = {
  groups: number
  items: number
  fresh: number
  due: number
  stale: number
  missing: number
  checkpointed: number
  errorItems: number
  [key: string]: any
}

export type SiteHourlyFreshness = {
  ok?: boolean
  totals: SiteHourlyFreshnessTotals
  buckets: SiteHourlyFreshnessBucket[]
  [key: string]: any
}

export type SiteHourlyIndexStatus = {
  ok?: boolean
  hourlyIndexVersion?: string
  hourlyIndexRuntimeRevision?: string
  generatedAt?: string | null
  finalizedAt?: string | null
  totalRows?: number
  totalItems?: number
  totalMarketSeries?: number
  [key: string]: any
}

export type SiteSmartBuyStatus = {
  ok?: boolean
  smartBuyVersion?: string
  smartBuyRuntimeRevision?: string
  smartBuyAsyncVersion?: string
  smartBuyAsyncRuntimeRevision?: string
  role?: string
  [key: string]: any
}

const siteNoncePath = (path: string) => {
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}t=${Date.now()}`
}

export const fetchSiteApiStatus = (signal?: AbortSignal) =>
  fetchJson<SiteApiStatus>(siteNoncePath('/'), signal)

export const fetchSiteHourlyStatus = (signal?: AbortSignal) =>
  fetchJson<SiteHourlyStatus>(siteNoncePath('/hourly-v1-status'), signal)

export const fetchSiteHourlyFreshness = (signal?: AbortSignal) =>
  fetchJson<SiteHourlyFreshness>(siteNoncePath('/hourly-v1-freshness?scope=all&limit=25'), signal)

export const fetchSiteHourlyIndexStatus = (signal?: AbortSignal) =>
  fetchJson<SiteHourlyIndexStatus>(siteNoncePath('/hourly-index-v1-status'), signal)

const SMART_BUY_WORKER_BASE = 'https://frameanalytics-smartbuy-test.smurfack403.workers.dev'

export const fetchSiteSmartBuyStatus = async (signal?: AbortSignal): Promise<SiteSmartBuyStatus> => {
  const response = await fetch(`${SMART_BUY_WORKER_BASE}/?t=${Date.now()}`, {
    method: 'GET',
    signal,
    headers: { Accept: 'application/json' }
  })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.json() as Promise<SiteSmartBuyStatus>
}

