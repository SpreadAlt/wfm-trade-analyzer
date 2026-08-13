import { useState } from 'react'
import type { Locale } from './i18n'
import type { CatalogItem, Dimensions, ScannerSignal } from './types'

export type CategoryId = 'prime' | 'mod' | 'relic' | 'weapon' | 'cosmetic' | 'arcane' | 'resource' | 'archwing' | 'companion' | 'necramech' | 'equipment' | 'collectible' | 'ayatan' | 'utility' | 'misc' | 'syndicate'

export const CATEGORY_IDS: CategoryId[] = ['prime', 'mod', 'relic', 'weapon', 'cosmetic', 'arcane', 'resource', 'archwing', 'companion', 'necramech', 'equipment', 'collectible', 'ayatan', 'utility', 'misc', 'syndicate']

const dimensionTranslations: Record<string, Record<string, string>> = {
  ru: {
    intact: 'Неповреждённая', exceptional: 'Исключительная', flawless: 'Безупречная', radiant: 'Сияющая',
    large: 'Большой', medium: 'Средний', small: 'Малый', revealed: 'Открытый', unrevealed: 'Завуалированный'
  }
}

const pretty = (value: string) => value.replace(/_/g, ' ').replace(/^./, (letter: string) => letter.toUpperCase())

export const formatDimensions = (dimensions: Dimensions | null | undefined, locale: Locale) => {
  if (!dimensions) return ''
  return Object.entries(dimensions)
    .map(([key, raw]) => {
      const value = String(raw ?? '')
      const localized = dimensionTranslations[locale]?.[value.toLowerCase()] || pretty(value)
      if (key === 'subtype') return localized
      if (key === 'charges') return `${locale === 'ru' ? 'Заряды' : 'Charges'}: ${localized}`
      if (key === 'amberStars') return `${locale === 'ru' ? 'Янтарные звёзды' : 'Amber stars'}: ${localized}`
      if (key === 'cyanStars') return `${locale === 'ru' ? 'Голубые звёзды' : 'Cyan stars'}: ${localized}`
      return `${pretty(key)}: ${localized}`
    })
    .join(' · ')
}

export const ItemIcon = ({ item, name, large = false }: { item?: CatalogItem; name: string; large?: boolean }) => {
  const [failed, setFailed] = useState(false)
  const source = item?.thumb || item?.icon
  const initials = name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()
  return <span className={large ? 'item-icon item-icon-large' : 'item-icon'} aria-hidden="true">
    {source && !failed ? <img src={source} alt="" loading="lazy" onError={() => setFailed(true)}/> : <b>{initials || '?'}</b>}
  </span>
}

const decisionTone = (decision: string) => {
  if (decision === 'BUY_STRONG') return 'buy-strong'
  if (decision === 'SELL_STRONG') return 'sell-strong'
  if (decision === 'BUY_PRICE_MAY_FALL' || decision === 'BUY_WATCH') return 'buy-watch'
  if (decision === 'SELL_PRICE_MAY_RISE' || decision === 'SELL_WATCH') return 'sell-watch'
  return 'low'
}

const ForecastGlyph = ({ strong }: { strong: boolean }) => <svg viewBox="0 0 24 24" aria-hidden="true">
  <circle cx="12" cy="12" r="7.5"/>
  <path d="M12 7.5v9M7.5 12h9"/>
  {strong ? <path d="M4 4l2 2M20 4l-2 2M4 20l2-2M20 20l-2-2"/> : null}
</svg>

const TrendGlyph = ({ direction }: { direction: 'up' | 'down' | 'flat' }) => <svg viewBox="0 0 24 24" aria-hidden="true">
  {direction === 'up' ? <path d="M5 16l6-6 4 4 4-5M14 9h5v5"/> : direction === 'down' ? <path d="M5 8l6 6 4-4 4 5M14 15h5v-5"/> : <path d="M5 12h14M16 9l3 3-3 3"/>}
</svg>

export const ForecastIndicator = ({ signal, fallbackChange, title, trendUp, trendDown, trendFlat, large = false }: {
  signal: ScannerSignal
  fallbackChange: number | null
  title: string
  trendUp: string
  trendDown: string
  trendFlat: string
  large?: boolean
}) => {
  const direction: 'up' | 'down' | 'flat' = signal.rising ? 'up' : signal.falling ? 'down' : (fallbackChange ?? 0) > 2 ? 'up' : (fallbackChange ?? 0) < -2 ? 'down' : 'flat'
  const trendTitle = direction === 'up' ? trendUp : direction === 'down' ? trendDown : trendFlat
  const strong = signal.decision === 'BUY_STRONG' || signal.decision === 'SELL_STRONG'
  const label = `${title}. ${trendTitle}`
  return <span className={`forecast-cluster ${large ? 'forecast-large' : ''}`} title={label} aria-label={label} role="img">
    <span className={`forecast-icon ${decisionTone(signal.decision)}`}><ForecastGlyph strong={strong}/></span>
    <span className={`trend-icon trend-${direction}`}><TrendGlyph direction={direction}/></span>
  </span>
}
