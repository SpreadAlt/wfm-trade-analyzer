export type ScannerMode = 'buy' | 'sell'
export type Platform = 'pc' | 'ps4' | 'xbox' | 'switch'
export type AnalysisPeriod = 7 | 30 | 90 | 180
export type TimeRange = '1h' | '4h' | '12h' | '24h' | '7d' | '30d' | '90d' | '180d'
export type HourlyRange = '1h' | '4h' | '12h' | '24h'
export type MarketMode = 'scalar' | 'variant' | 'variants' | 'none'
export type Dimensions = Record<string, string | number | null>

export type HistoryPoint = { date: string; min: number | null; median: number | null; max: number | null; sales: number }
export type SignalBreakdown = { potential: number; channelPosition: number; coverage: number; liquidity: number; stability: number }

export type ScannerSignal = {
  score: number | null
  decision: string
  eligible: boolean
  target: number | null
  potential: number | null
  potentialPct: number | null
  regimeGapPct: number | null
  falling: boolean
  rising: boolean
  regimeShift: boolean
  liquidEnough: boolean
  enoughCoverage: boolean
  meaningful: boolean
  breakdown: SignalBreakdown
  flags: string[]
}

export type ScannerItem = {
  rowId: string
  itemId: string
  id: string
  name: string
  displayName: string
  slug: string
  category: string
  subcategory: string
  defaultEnabled: boolean
  marketMode: MarketMode
  marketKey: string
  variantKey: string | null
  dimensions: Dimensions | null
  selectedModRank: number | null
  period: AnalysisPeriod
  hasHistory: boolean
  hasCurrentDay: boolean
  currentPrice: number | null
  change1h: number | null
  change24h: number | null
  change7d: number | null
  changePeriod: number | null
  sales24h: number | null
  averageVolume7d: number | null
  channelPosition: number | null
  coveragePct: number | null
  volatility: number | null
  updatedDate: string | null
  buy: ScannerSignal
  sell: ScannerSignal
  buyPotential: number | null
  buyPotentialPct: number | null
  buyScore: number | null
  buyDecision: string
  sellPotential: number | null
  sellPotentialPct: number | null
  sellScore: number | null
  sellDecision: string
}

export type ScannerSort = 'name' | 'decision' | 'score' | 'potential' | 'potentialPct' | 'currentPrice' | 'change1h' | 'change4h' | 'change12h' | 'change24h' | 'change7d' | 'changePeriod' | 'sales24h' | 'averageVolume7d' | 'coveragePct' | 'volatility' | 'updatedDate'
export type SortDirection = 'asc' | 'desc'

export type ScannerQuery = {
  platform: Platform
  period: AnalysisPeriod
  mode: ScannerMode
  crossplay: boolean
  ids?: string[]
  search?: string
  categories?: string[]
  minPrice?: number
  minPotential?: number
  offset: number
  limit: number
  sort: ScannerSort
  direction: SortDirection
  language?: string
}

export type ScannerResponse = {
  ok: true
  scannerVersion: string
  rulesVersion: string
  metricsVersion: string
  metricsRulesVersion: string
  buildId: string
  generatedAt: string
  platform: Platform
  period: AnalysisPeriod
  mode: ScannerMode
  latestDate: string
  referenceDate: string
  totalItems: number
  catalogTotal?: number
  marketSeries?: number
  noHistoryRows?: number
  defaultEnabledCount: number
  filteredItems: number
  filteredRows?: number
  offset: number
  limit: number
  returned: number
  returnedRows?: number
  hasMore: boolean
  groupedByItem?: boolean
  crossplayRequested?: boolean
  crossplaySupported?: boolean
  marketScope?: 'platform' | 'crossplay'
  items: ScannerItem[]
}

export type PeriodSignal = { target: number | null; potential: number | null; potentialPct: number | null; score?: number | null; decision?: string }
export type PeriodAnalytics = {
  periodDays: AnalysisPeriod
  referenceDate: string | null
  referencePrice: number | null
  referenceCount: number
  availableDays: number
  coveragePct: number
  currentPrice: number | null
  changePeriod: number | null
  sales24h: number | null
  averageVolume7d: number | null
  channelPosition: number | null
  baseline: number | null
  q25: number | null
  q75: number | null
  volatility: number | null
  buy: PeriodSignal
  sell: PeriodSignal
}

export type ItemSeries = {
  dimensions?: Dimensions | null
  selectedModRank?: number | null
  hasHistory: boolean
  hasCurrentDay: boolean
  historyPoints: number
  firstTradeDate: string | null
  lastTradeDate: string | null
  staleDays: number | null
  currentPrice: number | null
  change1h: number | null
  change24h: number | null
  change7d: number | null
  sales24h: number | null
  updatedDate: string | null
  history: HistoryPoint[]
}

export type ItemDetail = ItemSeries & {
  id: string
  name: string
  slug: string
  category: string
  subcategory: string
  defaultEnabled: boolean
  marketMode: MarketMode
  selectedModRank: number | null
  variants: Record<string, ItemSeries>
}

export type ItemResponse = { ok: true; publicItemVersion: string; itemHistoryVersion: string; normalizedVersion: string; platform: Platform; latestDate: string; catalogTotal: number; item: ItemDetail }

export type MetricSeries = { dimensions?: Dimensions | null; periods: Partial<Record<'7' | '30' | '90' | '180', PeriodAnalytics | null>> }
export type MetricsItem = MetricSeries & {
  id: string
  name: string
  slug: string
  category: string
  subcategory: string
  defaultEnabled: boolean
  marketMode: MarketMode
  selectedModRank: number | null
  variants: Record<string, MetricSeries>
}
export type MetricsResponse = { ok: true; metricsVersion: string; rulesVersion: string; platform: Platform; latestDate: string; referenceDate: string; period: null; item: MetricsItem }

export type CatalogItem = { id: string; slug: string; name: string; englishName: string; category: string; subcategory: string; defaultEnabled: boolean; thumb: string | null; icon: string | null }
export type CatalogResponse = { ok: true; catalogVersion: string; language: string; generatedAt: string; catalogTotal: number; upstreamAvailable: boolean; matchedMarketItems: number; items: CatalogItem[] }

export type HourlyHistoryPoint = {
  timestamp: string
  volume: number
  min: number | null
  median: number | null
  max: number | null
  average: number | null
  weightedAverage: number | null
  open: number | null
  close: number | null
}

export type HourlyChange = {
  percent: number | null
  platinum: number | null
  referenceAt: string | null
}

export type HourlySeries = {
  marketKey: string
  dimensions: Dimensions
  currentPrice: number | null
  latestAt: string | null
  changes: Record<HourlyRange, HourlyChange>
  history: HourlyHistoryPoint[]
  dailyLatestDate: string | null
  dailyHistory: HistoryPoint[]
}

export type HourlyResponse = {
  ok: true
  hourlyVersion: string
  planId: string
  scope: 'crossplay' | 'switch'
  platform: 'pc' | 'switch'
  crossplay: boolean
  switchIncluded: false
  rank: 'base' | 'all'
  itemId: string
  fetchedAt: string
  cadenceMinutes: number
  series: HourlySeries[]
}

export type HourlyIndexRow = {
  rowId: string
  itemId: string
  id: string
  slug: string
  name: string
  displayName: string
  category: string
  subcategory: string
  defaultEnabled: boolean
  marketKey: string
  dimensions: Dimensions
  selectedModRank: number | null
  hasHourlyHistory: boolean
  hourlyState: 'available' | 'missing' | 'error' | string
  currentPrice: number | null
  latestAt: string | null
  fetchedAt: string | null
  change1h: number | null
  change1hPlatinum: number | null
  change4h: number | null
  change4hPlatinum: number | null
  change12h: number | null
  change12hPlatinum: number | null
  change24h: number | null
  change24hPlatinum: number | null
  daily: ScannerItem | null
}

export type HourlyIndexResponse = {
  ok: true
  hourlyIndexVersion: string
  hourlyIndexRuntimeRevision: string
  buildId: string
  generatedAt: string
  scope: 'crossplay' | 'switch'
  platform: Platform
  crossplay: boolean
  switchIncluded: false
  catalogTotal: number
  totalRows: number
  marketSeries: number
  filteredItems: number
  filteredRows: number
  offset: number
  limit: number
  returned: number
  returnedRows: number
  hasMore: boolean
  groupedByItem: boolean
  rank: 'base' | 'all' | string
  items: HourlyIndexRow[]
}

export type HourlyIndexQuery = {
  platform: Platform
  crossplay: boolean
  rank: 'base' | 'all'
  period: AnalysisPeriod
  mode: ScannerMode
  ids?: string[]
  search?: string
  categories?: string[]
  minPrice?: number
  minPotential?: number
  offset: number
  limit: number
  sort: ScannerSort
  direction: SortDirection
  language?: string
}

export type MarketEvent = {
  fingerprint: string
  itemId: string
  slug: string
  name: string
  eventType: 'baro' | 'prime_resurgence'
  status: 'upcoming' | 'active' | 'ended'
  startAt: string | null
  endAt: string | null
  observedAt: string
  sourceRef: string
}

export type EventsResponse = {
  ok: true
  eventsVersion: string
  generatedAt: string
  source: string
  historyPolicy: 'forward-only-observed-world-state'
  events: MarketEvent[]
  current: MarketEvent[]
  matchedItems: number
  unmatchedCount: number
}
