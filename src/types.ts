export type ScannerMode = 'buy' | 'sell'

export type HistoryPoint = {
  label: string
  min: number
  median: number
  max: number
  volume: number
}

export type MarketItem = {
  id: string
  name: string
  category: string
  current: number
  change1h: number
  change24h: number
  change7d: number
  sales24h: number
  buyPotential: number
  sellPotential: number
  buyScore: number
  sellScore: number
  buyDecision: string
  sellDecision: string
  updated: string
  history: HistoryPoint[]
}
