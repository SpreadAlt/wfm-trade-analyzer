import type { CatalogResponse, EventsResponse, HourlyIndexQuery, HourlyIndexResponse, HourlyResponse, ItemResponse, MetricsResponse, Platform, ScannerQuery, ScannerResponse } from './types'

export const API_BASE = 'https://frameanalytics-api-test.smurfack403.workers.dev'

const fetchJson = async <T,>(path: string, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal
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

export type SiteApiStatus = {
  ok: boolean
  name: string
  stage: string
  publicItemVersion: string
  itemHistoryVersion: string
  normalizedVersion: string
  metricsVersion: string
  scannerVersion: string
  categoryVersion: string
  hourlyVersion: string
  hourlyPlanRevision: string
  eventsVersion: string
  hourlyIndexVersion: string
  hourlyIndexRuntimeRevision: string
  smartBuyVersion: string
  smartBuyRuntimeRevision: string
  catalogTotal: number
}

export type SiteHourlyStatus = {
  ok: boolean
  runtimeRevision: string
  planRevision: string
  prepared: boolean
  enabled: boolean
  activeScopes?: string[]
  disabledScopes?: string[]
  groups?: { stored: number; target: number; remaining: number }
  expectedWfmRequestsDay?: number
  expectedQueueMessagesDay?: number
  expectedQueueOperationsDay?: number
  runtimeLimits?: { maxWfmRequestsDay?: number; maxQueueOperationsDay?: number }
  checkpointedGroups?: number
  checkpointedItems?: number
  firstFetchedAt?: string | null
  lastFetchedAt?: string | null
  queue?: { backlogCount?: number }
  upstreamCooldown?: { until?: string | null; upstreamStatus?: number | null } | null
  runtimeThrottle?: {
    requestIntervalMs?: number
    pauseEvery?: number
    pauseMs?: number
    groupStartSpacingSeconds?: number
    recommendedConsumerMaxConcurrency?: number
    maxBacklog?: number
    bootstrapBatchGroups?: number
    scheduledBatchGroups?: number
  }
}

export type SiteFreshnessBucket = {
  scope: string
  tier: string
  groups: number
  fresh: number
  due: number
  stale: number
  missing: number
  checkpointed: number
  errorItems: number
  oldestAgeMinutes: number | null
  newestObservedAt: string | null
}

export type SiteHourlyFreshness = {
  ok: boolean
  generatedAt: string
  healthy: boolean
  totals: { groups: number; items: number; fresh: number; due: number; stale: number; missing: number; checkpointed: number; errorItems: number }
  buckets: SiteFreshnessBucket[]
  queue?: { backlogCount?: number }
  cooldown?: { active: boolean; until: string | null; upstreamStatus: number | null }
}

export type SiteHourlyIndexStatus = {
  ok: boolean
  hourlyIndexRuntimeRevision: string
  prepared: boolean
  sourceGroups?: number
  finalizedAt?: string | null
  globalManifestReady?: boolean
  shards?: { stored: number; target: number; remaining: number; bytes: number; complete: boolean }
  automation?: {
    enabled: boolean
    refreshMinutes: number
    latestPublicGeneratedAt: string | null
    nextRefreshAt: string | null
    due: boolean
    hourlyQueueOperationsDay: number
    combinedQueueOperationsDay: number
    freeQueueOperationsDay: number
    withinFreeQueueBudget: boolean
    budget?: { messagesPerDay?: number; operationsPerDay?: number; buildsPerDay?: number }
  }
  queue?: { backlogCount?: number }
}

export type SiteSmartBuyStatus = {
  ok: boolean
  smartBuyVersion: string
  smartBuyRuntimeRevision: string
  upstream: {
    baseUrl: string
    publicRateLimitRequestsPerSecond: number
    requestIntervalMs: number
    configuredRequestsPerSecond: number
    sharedHourlyCooldown: boolean
  }
  limits: {
    maxMarketSeriesPerRequest: number
    maxFrontendPages: number
    maxFrontendMarketSeries: number
  }
  cache: {
    prefix: string
    profileTtlSeconds: number
    userOrdersTtlSeconds: number
    itemOrdersTtlSeconds: number
    entries: number
    bytes: number
    profileEntries: number
    userOrderEntries: number
    itemOrderEntries: number
  }
}

const noncePath = (path: string) => `${path}${path.includes('?') ? '&' : '?'}t=${Date.now()}`
export const fetchSiteApiStatus = (signal?: AbortSignal) => fetchJson<SiteApiStatus>(noncePath('/'), signal)
export const fetchSiteHourlyStatus = (signal?: AbortSignal) => fetchJson<SiteHourlyStatus>(noncePath('/hourly-v1-status'), signal)
export const fetchSiteHourlyFreshness = (signal?: AbortSignal) => fetchJson<SiteHourlyFreshness>(noncePath('/hourly-v1-freshness?scope=all&limit=25'), signal)
export const fetchSiteHourlyIndexStatus = (signal?: AbortSignal) => fetchJson<SiteHourlyIndexStatus>(noncePath('/hourly-index-v1-status'), signal)
export const fetchSiteSmartBuyStatus = (signal?: AbortSignal) => fetchJson<SiteSmartBuyStatus>(noncePath('/smart-buy-v1-status'), signal)

export type SmartBuyDimensions = {
  rank?: number
  subtype?: string
  charges?: number
  amberStars?: number
  cyanStars?: number
}

export type SmartBuyProfile = {
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
  onlineMinUnitPrice: number | null
  average24hUnitPrice: number | null
  average24hFromAt: string | null
  average24hToAt: string | null
  average24hSales: number | null
  average24hPoints: number
  gapPct: number | null
  onlineGapPct: number | null
  absoluteGapPct: number | null
  sellers: number
  onlineSellers: number
  marketFetchedAt: string
  marketMinFromOnline?: boolean
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
  marketMinUnitPrice: number | null
  premiumPct: number | null
  premiumPlatinumPerUnit: number | null
  premiumPlatinumTotal: number | null
  average24hUnitPrice: number | null
  deviation24hPct: number | null
  deviation24hPlatinumPerUnit: number | null
  deviation24hPlatinumTotal: number | null
  updatedAt: string | null
}

export type SmartBuySeller = {
  user: SmartBuyProfile
  offers: SmartBuySellerOffer[]
  marketSeriesCovered: number
  unitsCovered: number
  fullSeriesCovered: number
  estimatedCost: number
}

export type SmartBuyResponse = {
  ok: boolean
  smartBuyVersion: string
  smartBuyRuntimeRevision: string
  generatedAt: string
  publicOnly: boolean
  hiddenOrdersAvailable: boolean
  profile: SmartBuyProfile
  marketScope: { platform: string; crossplay: boolean }
  publicOrders: number
  visibleBuyOrders: number
  marketSeriesRequested: number
  marketSeriesProcessed: number
  marketSeriesOffset: number
  marketSeriesLimit: number
  nextOffset: number | null
  hasMore: boolean
  truncated: boolean
  maxMarketSeries: number
  cache?: Record<string, unknown>
  wishlist: SmartBuyWishlistRow[]
  sellers: SmartBuySeller[]
}

export const fetchSmartBuy = (
  profile: string,
  signal?: AbortSignal,
  offset = 0,
  limit = 40
) => {
  const params = new URLSearchParams({
    profile,
    offset: String(Math.max(0, offset)),
    limit: String(Math.max(1, Math.min(40, limit))),
    t: String(Date.now())
  })
  return fetchJson<SmartBuyResponse>(`/api/smart-buy-v1?${params}`, signal)
}

const smartBuySellerKey = (seller: SmartBuySeller) =>
  seller.user.id || seller.user.slug.toLowerCase()

const mergeSmartBuyPages = (pages: SmartBuyResponse[]): SmartBuyResponse => {
  if (!pages.length) throw new Error('Smart Buy returned no pages')

  const base = pages[0]
  const wishlist = new Map<string, SmartBuyWishlistRow>()
  const sellers = new Map<string, SmartBuySeller>()

  for (const page of pages) {
    for (const row of page.wishlist || []) wishlist.set(row.demandKey, row)

    for (const nextSeller of page.sellers || []) {
      const key = smartBuySellerKey(nextSeller)
      const existing = sellers.get(key)
      if (!existing) {
        sellers.set(key, {
          ...nextSeller,
          offers: [...nextSeller.offers]
        })
        continue
      }

      const offers = new Map(existing.offers.map(offer => [offer.demandKey, offer]))
      for (const nextOffer of nextSeller.offers) {
        const previous = offers.get(nextOffer.demandKey)
        if (
          !previous ||
          nextOffer.fillableQuantity > previous.fillableQuantity ||
          (
            nextOffer.fillableQuantity === previous.fillableQuantity &&
            nextOffer.unitPrice < previous.unitPrice
          )
        ) {
          offers.set(nextOffer.demandKey, nextOffer)
        }
      }
      existing.offers = [...offers.values()]
      existing.marketSeriesCovered = existing.offers.length
      existing.unitsCovered = existing.offers.reduce((sum, offer) => sum + Math.max(0, offer.fillableQuantity || 0), 0)
      existing.fullSeriesCovered = existing.offers.filter(offer => offer.fullQuantity).length
      existing.estimatedCost = existing.offers.reduce((sum, offer) => sum + Math.max(0, offer.estimatedCost || 0), 0)
    }
  }

  const sellerRows = [...sellers.values()].sort((left, right) =>
    right.marketSeriesCovered - left.marketSeriesCovered ||
    right.fullSeriesCovered - left.fullSeriesCovered ||
    right.unitsCovered - left.unitsCovered ||
    left.estimatedCost - right.estimatedCost ||
    left.user.ingameName.localeCompare(right.user.ingameName)
  )

  const generatedAtValues = pages
    .map(page => page.generatedAt)
    .filter(Boolean)
    .sort()
  const latestGeneratedAt = generatedAtValues[generatedAtValues.length - 1] || base.generatedAt

  return {
    ...base,
    generatedAt: latestGeneratedAt,
    marketSeriesProcessed: wishlist.size,
    marketSeriesOffset: 0,
    marketSeriesLimit: Math.max(...pages.map(page => page.marketSeriesLimit || 0)),
    nextOffset: null,
    hasMore: false,
    truncated: false,
    wishlist: [...wishlist.values()],
    sellers: sellerRows
  }
}

export const fetchSmartBuyAll = async (profile: string, signal?: AbortSignal) => {
  const pages: SmartBuyResponse[] = []
  let offset = 0

  for (let pageIndex = 0; pageIndex < 25; pageIndex++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const page = await fetchSmartBuy(profile, signal, offset, 40)
    pages.push(page)

    if (!page.hasMore || page.nextOffset == null) return mergeSmartBuyPages(pages)
    if (page.nextOffset <= offset) throw new Error('Smart Buy pagination did not advance')
    offset = page.nextOffset
  }

  throw new Error('Smart Buy pagination exceeded the safety limit')
}

