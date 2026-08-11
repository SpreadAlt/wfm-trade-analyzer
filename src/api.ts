import type { AnalysisPeriod, ItemResponse, Platform, ScannerResponse } from './types'

const API_BASE = 'https://frameanalytics-api-test.smurfack403.workers.dev'

const fetchJson = async <T,>(path: string, signal?: AbortSignal): Promise<T> => {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    signal
  })

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return response.json() as Promise<T>
}

export const fetchScanner = (platform: Platform, period: AnalysisPeriod, signal?: AbortSignal) =>
  fetchJson<ScannerResponse>(`/api/scanner?platform=${encodeURIComponent(platform)}&period=${period}`, signal)

export const fetchItem = (platform: Platform, period: AnalysisPeriod, id: string, signal?: AbortSignal) =>
  fetchJson<ItemResponse>(`/api/item?platform=${encodeURIComponent(platform)}&period=${period}&id=${encodeURIComponent(id)}`, signal)
