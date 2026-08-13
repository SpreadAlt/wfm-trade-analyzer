import type { CatalogResponse, ItemResponse, MetricsResponse, Platform, ScannerQuery, ScannerResponse } from './types'

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
    offset: String(query.offset),
    limit: String(query.limit),
    sort: query.sort,
    direction: query.direction
  })
  if (query.search?.trim()) params.set('search', query.search.trim())
  if (query.categories) params.set('categories', query.categories.length ? query.categories.join(',') : '__none__')
  if (query.minPrice && query.minPrice > 0) params.set('minPrice', String(query.minPrice))
  if (query.minPotential && query.minPotential > 0) params.set('minPotential', String(query.minPotential))
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
