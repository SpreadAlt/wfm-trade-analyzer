export type ScannerMode = 'buy' | 'sell'
export type Platform = 'pc' | 'ps4' | 'xbox' | 'switch'
export type AnalysisPeriod = 7 | 30 | 90

export type HistoryPoint = {
  date: string
  min: number | null
  median: number | null
  max: number | null
  sales: number
}

export type ScannerItem = {
  id: string
  name: string
  slug: string
  category: string
  subcategory: string
  defaultEnabled: boolean
  currentPrice: number | null
  change1h: number | null
  change24h: number | null
  change7d: number | null
  sales24h: number
  updatedDate: string | null
  buyPotential: number | null
  buyPotentialPct: number | null
  buyScore: number | null
  buyDecision: string
  sellPotential: number | null
  sellPotentialPct: number | null
  sellScore: number | null
  sellDecision: string
}

export type ScannerResponse = {
  publicVersion: string
  rulesVersion: string
  metricsVersion: string | null
  generatedAt: string
  platform: Platform
  period: AnalysisPeriod
  latestDate: string
  totalItems: number
  defaultEnabledCount: number
  items: ScannerItem[]
}

export type PeriodSignal = {
  target: number | null
  potential: number | null
  potentialPct: number | null
  score: number | null
  decision: string
}

export type PeriodAnalytics = {
  referenceCount: number
  availableDays: number
  coveragePct: number
  baseline: number | null
  q25: number | null
  q75: number | null
  volatility: number | null
  buy: PeriodSignal
  sell: PeriodSignal
}

export type ItemDetail = {
  id: string
  name: string
  slug: string
  category: string
  subcategory: string
  defaultEnabled: boolean
  currentPrice: number | null
  change1h: number | null
  change24h: number | null
  change7d: number | null
  sales24h: number
  updatedDate: string | null
  analytics: PeriodAnalytics | null
  periods: Record<'7' | '30' | '90', PeriodAnalytics | null>
  history: HistoryPoint[]
}

export type ItemResponse = {
  ok: true
  itemVersion: string
  publicVersion: string
  rulesVersion: string
  metricsVersion: string | null
  platform: Platform
  period: AnalysisPeriod
  latestDate: string
  item: ItemDetail
}
