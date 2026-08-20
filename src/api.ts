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
  marketMinFromOnline: boolean
  gapPct: number | null
  absoluteGapPct: number | null
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
  wishlist: SmartBuyWishlistRow[]
  sellers: SmartBuySeller[]
}
export const fetchSmartBuy = (profile: string, signal?: AbortSignal) => {
  const params = new URLSearchParams({ profile, t: String(Date.now()) })
  return fetchJson<SmartBuyResponse>(`/api/smart-buy-v1?${params}`, signal)
}
