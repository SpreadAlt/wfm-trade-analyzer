import type { HistoryPoint, MarketItem } from './types'

const history = (base: number, phase: number): HistoryPoint[] =>
  Array.from({ length: 48 }, (_, i) => {
    const wave = Math.sin((i + phase) / 5) * base * 0.055
    const drift = (i - 24) * -0.22
    const median = Math.max(6, base + wave + drift)
    return {
      label: `${String(9 + Math.floor(i / 24)).padStart(2, '0')}.08 ${String((10 + i) % 24).padStart(2, '0')}:00`,
      min: median - 14 - Math.sin(i / 3) * 3,
      median,
      max: median + 24 + Math.cos(i / 4) * 5,
      volume: Math.max(1, Math.round(8 + Math.sin(i / 2.8) * 5 + (i % 7)))
    }
  })

export const items: MarketItem[] = [
  { id:'glaive', name:'Glaive Prime Set', category:'Prime Weapon', current:318, change1h:0.8, change24h:-4.2, change7d:-9.8, sales24h:94, buyPotential:34, sellPotential:5, buyScore:91, sellScore:27, buyDecision:'ВЫГОДНО ПОКУПАТЬ', sellDecision:'НИЗКИЙ ПРИОРИТЕТ', updated:'11.08 09:43', history:history(352,0) },
  { id:'acceltra', name:'Acceltra Prime Set', category:'Prime Weapon', current:72, change1h:2.1, change24h:-8.4, change7d:-14.2, sales24h:188, buyPotential:18, sellPotential:3, buyScore:82, sellScore:21, buyDecision:'ВЫГОДНО ПОКУПАТЬ', sellDecision:'НИЗКИЙ ПРИОРИТЕТ', updated:'11.08 09:42', history:history(88,4) },
  { id:'revenant', name:'Revenant Prime Set', category:'Prime Warframe', current:58, change1h:-1.3, change24h:-6.7, change7d:-11.5, sales24h:302, buyPotential:11, sellPotential:2, buyScore:76, sellScore:30, buyDecision:'ЦЕНА МОЖЕТ УПАСТЬ', sellDecision:'НИЗКИЙ ПРИОРИТЕТ', updated:'11.08 09:41', history:history(67,9) },
  { id:'latron', name:'Latron Prime Set', category:'Prime Weapon', current:62, change1h:-0.7, change24h:-3.9, change7d:-8.7, sales24h:86, buyPotential:9, sellPotential:4, buyScore:69, sellScore:40, buyDecision:'СЛЕДИТЬ ЗА ПОКУПКОЙ', sellDecision:'НИЗКИЙ ПРИОРИТЕТ', updated:'11.08 09:39', history:history(70,2) },
  { id:'skana', name:'Prisma Skana', category:'Baro Weapon', current:48, change1h:-1.1, change24h:-5.8, change7d:-10.3, sales24h:64, buyPotential:7, sellPotential:3, buyScore:65, sellScore:34, buyDecision:'СЛЕДИТЬ ЗА ПОКУПКОЙ', sellDecision:'НИЗКИЙ ПРИОРИТЕТ', updated:'11.08 09:38', history:history(54,12) },
  { id:'volt', name:'Volt Prime Set', category:'Prime Warframe', current:116, change1h:1.8, change24h:7.1, change7d:18.6, sales24h:141, buyPotential:0, sellPotential:23, buyScore:28, sellScore:88, buyDecision:'НИЗКИЙ ПРИОРИТЕТ', sellDecision:'ВЫГОДНО ПРОДАВАТЬ', updated:'11.08 09:45', history:history(102,15) },
  { id:'ember', name:'Ember Prime Set', category:'Prime Warframe', current:104, change1h:0.5, change24h:3.8, change7d:12.4, sales24h:122, buyPotential:0, sellPotential:14, buyScore:31, sellScore:77, buyDecision:'НИЗКИЙ ПРИОРИТЕТ', sellDecision:'ЦЕНА МОЖЕТ ВЫРАСТИ', updated:'11.08 09:40', history:history(93,7) },
  { id:'continuity', name:'Primed Continuity', category:'Primed Mod', current:71, change1h:-0.3, change24h:2.4, change7d:9.1, sales24h:219, buyPotential:0, sellPotential:8, buyScore:39, sellScore:66, buyDecision:'НИЗКИЙ ПРИОРИТЕТ', sellDecision:'СЛЕДИТЬ ЗА ПРОДАЖЕЙ', updated:'11.08 09:44', history:history(66,5) },
  { id:'saryn', name:'Saryn Prime Set', category:'Prime Warframe', current:132, change1h:1.1, change24h:5.9, change7d:14.8, sales24h:176, buyPotential:0, sellPotential:19, buyScore:24, sellScore:81, buyDecision:'НИЗКИЙ ПРИОРИТЕТ', sellDecision:'ВЫГОДНО ПРОДАВАТЬ', updated:'11.08 09:46', history:history(119,10) },
  { id:'mesa', name:'Mesa Prime Set', category:'Prime Warframe', current:91, change1h:0.2, change24h:1.7, change7d:6.2, sales24h:247, buyPotential:0, sellPotential:6, buyScore:42, sellScore:62, buyDecision:'НИЗКИЙ ПРИОРИТЕТ', sellDecision:'СЛЕДИТЬ ЗА ПРОДАЖЕЙ', updated:'11.08 09:47', history:history(87,13) }
]
