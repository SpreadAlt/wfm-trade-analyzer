import type { HistoryPoint, MarketItem } from './types'

const makeHistory = (base: number, trend: number, swing: number, volume: number): HistoryPoint[] => {
  const rows: HistoryPoint[] = []
  for (let i = 0; i < 48; i += 1) {
    const wave = Math.sin(i / 4.2) * swing + Math.cos(i / 7.4) * swing * 0.45
    const median = Math.max(1, base + trend * (i - 47) + wave)
    const spread = Math.max(1.2, median * 0.055 + Math.sin(i / 5) * 1.2)
    const min = Math.max(1, median - spread)
    const max = median + spread * 1.25
    const hour = (10 + i) % 24
    const day = i < 14 ? '09.08' : i < 38 ? '10.08' : '11.08'
    rows.push({
      label: `${day} ${String(hour).padStart(2, '0')}:00`,
      min: Number(min.toFixed(1)),
      median: Number(median.toFixed(1)),
      max: Number(max.toFixed(1)),
      volume: Math.max(1, Math.round(volume + Math.sin(i / 3.1) * volume * 0.35 + (i % 5) * 2))
    })
  }
  return rows
}

export const items: MarketItem[] = [
  {
    id: 'acceltra-prime-set',
    name: 'Acceltra Prime Set',
    category: 'Prime Weapon',
    current: 72,
    change1h: 2.1,
    change24h: -8.4,
    change7d: -14.2,
    sales24h: 188,
    buyPotential: 18,
    sellPotential: 0,
    buyScore: 82,
    sellScore: 34,
    buyDecision: '🟢 ВЫГОДНО ПОКУПАТЬ',
    sellDecision: '⚪ НИЗКИЙ ПРИОРИТЕТ',
    updated: '11.08 09:42',
    history: makeHistory(72, -0.22, 4.6, 17)
  },
  {
    id: 'glaive-prime-set',
    name: 'Glaive Prime Set',
    category: 'Prime Weapon',
    current: 318,
    change1h: 0.8,
    change24h: -4.2,
    change7d: -9.8,
    sales24h: 94,
    buyPotential: 34,
    sellPotential: 0,
    buyScore: 91,
    sellScore: 28,
    buyDecision: '🟢 ВЫГОДНО ПОКУПАТЬ',
    sellDecision: '⚪ НИЗКИЙ ПРИОРИТЕТ',
    updated: '11.08 09:43',
    history: makeHistory(318, -0.78, 11.5, 10)
  },
  {
    id: 'revenant-prime-set',
    name: 'Revenant Prime Set',
    category: 'Prime Warframe',
    current: 58,
    change1h: -1.3,
    change24h: -6.7,
    change7d: -11.5,
    sales24h: 302,
    buyPotential: 11,
    sellPotential: 0,
    buyScore: 76,
    sellScore: 22,
    buyDecision: '🟡 ЦЕНА МОЖЕТ УПАСТЬ',
    sellDecision: '⚪ НИЗКИЙ ПРИОРИТЕТ',
    updated: '11.08 09:41',
    history: makeHistory(58, -0.16, 3.5, 26)
  },
  {
    id: 'volt-prime-set',
    name: 'Volt Prime Set',
    category: 'Prime Warframe',
    current: 116,
    change1h: 1.8,
    change24h: 7.1,
    change7d: 18.6,
    sales24h: 141,
    buyPotential: 0,
    sellPotential: 24,
    buyScore: 28,
    sellScore: 88,
    buyDecision: '⚪ НИЗКИЙ ПРИОРИТЕТ',
    sellDecision: '🔴 ВЫГОДНО ПРОДАВАТЬ',
    updated: '11.08 09:45',
    history: makeHistory(116, 0.47, 5.2, 14)
  },
  {
    id: 'ember-prime-set',
    name: 'Ember Prime Set',
    category: 'Prime Warframe',
    current: 104,
    change1h: 0.5,
    change24h: 3.8,
    change7d: 12.4,
    sales24h: 122,
    buyPotential: 0,
    sellPotential: 16,
    buyScore: 31,
    sellScore: 79,
    buyDecision: '⚪ НИЗКИЙ ПРИОРИТЕТ',
    sellDecision: '🟠 ЦЕНА МОЖЕТ ВЫРАСТИ',
    updated: '11.08 09:40',
    history: makeHistory(104, 0.3, 4.4, 12)
  },
  {
    id: 'primed-continuity',
    name: 'Primed Continuity',
    category: 'Primed Mod',
    current: 71,
    change1h: -0.3,
    change24h: 2.4,
    change7d: 9.1,
    sales24h: 219,
    buyPotential: 0,
    sellPotential: 8,
    buyScore: 39,
    sellScore: 71,
    buyDecision: '⚪ НИЗКИЙ ПРИОРИТЕТ',
    sellDecision: '🟠 СЛЕДИТЬ ЗА ПРОДАЖЕЙ',
    updated: '11.08 09:44',
    history: makeHistory(71, 0.13, 2.7, 19)
  },
  {
    id: 'latron-prime-set',
    name: 'Latron Prime Set',
    category: 'Prime Weapon',
    current: 62,
    change1h: -0.7,
    change24h: -3.9,
    change7d: -8.7,
    sales24h: 86,
    buyPotential: 9,
    sellPotential: 0,
    buyScore: 69,
    sellScore: 25,
    buyDecision: '🟡 СЛЕДИТЬ ЗА ПОКУПКОЙ',
    sellDecision: '⚪ НИЗКИЙ ПРИОРИТЕТ',
    updated: '11.08 09:39',
    history: makeHistory(62, -0.1, 3.1, 9)
  },
  {
    id: 'saryn-prime-set',
    name: 'Saryn Prime Set',
    category: 'Prime Warframe',
    current: 132,
    change1h: 1.1,
    change24h: 5.9,
    change7d: 14.8,
    sales24h: 176,
    buyPotential: 0,
    sellPotential: 21,
    buyScore: 24,
    sellScore: 84,
    buyDecision: '⚪ НИЗКИЙ ПРИОРИТЕТ',
    sellDecision: '🔴 ВЫГОДНО ПРОДАВАТЬ',
    updated: '11.08 09:46',
    history: makeHistory(132, 0.42, 6.4, 16)
  },
  {
    id: 'prisma-skana',
    name: 'Prisma Skana',
    category: 'Baro Weapon',
    current: 48,
    change1h: -1.1,
    change24h: -5.8,
    change7d: -10.3,
    sales24h: 64,
    buyPotential: 7,
    sellPotential: 0,
    buyScore: 65,
    sellScore: 21,
    buyDecision: '🟡 СЛЕДИТЬ ЗА ПОКУПКОЙ',
    sellDecision: '⚪ НИЗКИЙ ПРИОРИТЕТ',
    updated: '11.08 09:38',
    history: makeHistory(48, -0.08, 2.8, 7)
  },
  {
    id: 'mesa-prime-set',
    name: 'Mesa Prime Set',
    category: 'Prime Warframe',
    current: 91,
    change1h: 0.2,
    change24h: 1.7,
    change7d: 6.2,
    sales24h: 247,
    buyPotential: 0,
    sellPotential: 6,
    buyScore: 42,
    sellScore: 64,
    buyDecision: '⚪ НИЗКИЙ ПРИОРИТЕТ',
    sellDecision: '🟠 СЛЕДИТЬ ЗА ПРОДАЖЕЙ',
    updated: '11.08 09:47',
    history: makeHistory(91, 0.11, 3.9, 22)
  }
]
