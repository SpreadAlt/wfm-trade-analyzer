import { useEffect, useMemo, useState } from 'react'
import type { Locale } from './i18n'
import type { CatalogItem, Dimensions, MarketEvent, ScannerSignal } from './types'

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
  const sources = useMemo(() => [...new Set([item?.thumb, item?.icon].filter((value): value is string => Boolean(value)))], [item?.thumb, item?.icon])
  const sourceKey = sources.join('|')
  const [sourceIndex, setSourceIndex] = useState(0)
  useEffect(() => setSourceIndex(0), [sourceKey])
  const source = sources[sourceIndex]
  const initials = name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase()
  return <span className={large ? 'item-icon item-icon-large' : 'item-icon'} aria-hidden="true">
    {source ? <img src={source} alt="" loading="lazy" onError={() => setSourceIndex(index => index + 1)}/> : <b>{initials || '?'}</b>}
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

export const ForecastIndicator = ({ signal, fallbackChange, direction, title, trendUp, trendDown, trendFlat, large = false }: {
  signal: ScannerSignal
  fallbackChange: number | null
  direction?: 'up' | 'down' | 'flat'
  title: string
  trendUp: string
  trendDown: string
  trendFlat: string
  large?: boolean
}) => {
  const resolvedDirection: 'up' | 'down' | 'flat' = direction || (signal.rising ? 'up' : signal.falling ? 'down' : (fallbackChange ?? 0) > 2 ? 'up' : (fallbackChange ?? 0) < -2 ? 'down' : 'flat')
  const trendTitle = resolvedDirection === 'up' ? trendUp : resolvedDirection === 'down' ? trendDown : trendFlat
  const strong = signal.decision === 'BUY_STRONG' || signal.decision === 'SELL_STRONG'
  const label = `${title}. ${trendTitle}`
  return <span className={`forecast-cluster ${large ? 'forecast-large' : ''}`} title={label} aria-label={label} role="img">
    <span className={`forecast-icon ${decisionTone(signal.decision)}`}><ForecastGlyph strong={strong}/></span>
    <span className={`trend-icon trend-${resolvedDirection}`}><TrendGlyph direction={resolvedDirection}/></span>
  </span>
}

const marketEventText: Record<Locale, { baro: string; resurgence: string; baroTitle: string; resurgenceTitle: string }> = {
  en: { baro: "Baro Ki'Teer", resurgence: 'Prime Resurgence', baroTitle: "Item in Baro Ki'Teer's current or upcoming inventory", resurgenceTitle: 'Item in the current or upcoming Prime Resurgence rotation' },
  ru: { baro: 'Баро Ки’Тиир', resurgence: 'Возрождение Прайм', baroTitle: 'Товар в текущем или предстоящем ассортименте Баро Ки’Тиира', resurgenceTitle: 'Предмет в текущей или предстоящей ротации Возрождения Прайм' },
  de: { baro: "Baro Ki'Teer", resurgence: 'Prime-Wiederkehr', baroTitle: "Gegenstand im aktuellen oder kommenden Angebot von Baro Ki'Teer", resurgenceTitle: 'Gegenstand in der aktuellen oder kommenden Prime-Wiederkehr' },
  fr: { baro: "Baro Ki'Teer", resurgence: 'Résurgence Prime', baroTitle: "Objet de l'inventaire actuel ou à venir de Baro Ki'Teer", resurgenceTitle: 'Objet de la rotation actuelle ou à venir de Résurgence Prime' },
  es: { baro: "Baro Ki'Teer", resurgence: 'Resurgimiento Prime', baroTitle: "Objeto del inventario actual o próximo de Baro Ki'Teer", resurgenceTitle: 'Objeto de la rotación actual o próxima de Resurgimiento Prime' },
  pt: { baro: "Baro Ki'Teer", resurgence: 'Ressurgência Prime', baroTitle: "Item no inventário atual ou futuro de Baro Ki'Teer", resurgenceTitle: 'Item na rotação atual ou futura da Ressurgência Prime' },
  pl: { baro: "Baro Ki'Teer", resurgence: 'Odrodzenie Prime', baroTitle: "Przedmiot w bieżącym lub nadchodzącym asortymencie Baro Ki'Teera", resurgenceTitle: 'Przedmiot w bieżącej lub nadchodzącej rotacji Odrodzenia Prime' },
  uk: { baro: 'Баро Кі’Тір', resurgence: 'Відродження Прайм', baroTitle: 'Предмет у поточному або майбутньому асортименті Баро Кі’Тіра', resurgenceTitle: 'Предмет у поточній або майбутній ротації Відродження Прайм' },
  tr: { baro: "Baro Ki'Teer", resurgence: 'Prime Dirilişi', baroTitle: "Baro Ki'Teer'in güncel veya yaklaşan envanterindeki eşya", resurgenceTitle: 'Güncel veya yaklaşan Prime Dirilişi rotasyonundaki eşya' },
  it: { baro: "Baro Ki'Teer", resurgence: 'Rinascita Prime', baroTitle: "Oggetto nell'inventario attuale o prossimo di Baro Ki'Teer", resurgenceTitle: 'Oggetto nella rotazione attuale o prossima di Rinascita Prime' },
  sv: { baro: "Baro Ki'Teer", resurgence: 'Prime Resurgence', baroTitle: "Föremål i Baro Ki'Teers aktuella eller kommande sortiment", resurgenceTitle: 'Föremål i aktuell eller kommande Prime Resurgence-rotation' },
  cs: { baro: "Baro Ki'Teer", resurgence: 'Prime Resurgence', baroTitle: "Předmět v aktuální nebo nadcházející nabídce Baro Ki'Teera", resurgenceTitle: 'Předmět v aktuální nebo nadcházející rotaci Prime Resurgence' },
  ja: { baro: "Baro Ki'Teer", resurgence: 'Prime Resurgence', baroTitle: "Baro Ki'Teer の現在または次回の商品", resurgenceTitle: '現在または次回の Prime Resurgence 対象アイテム' },
  ko: { baro: "Baro Ki'Teer", resurgence: '프라임 리서전스', baroTitle: "Baro Ki'Teer의 현재 또는 예정 상품", resurgenceTitle: '현재 또는 예정된 프라임 리서전스 로테이션 아이템' },
  'zh-hans': { baro: "Baro Ki'Teer", resurgence: 'Prime 重生', baroTitle: "Baro Ki'Teer 当前或即将上架的物品", resurgenceTitle: '当前或即将进入 Prime 重生轮换的物品' },
  'zh-hant': { baro: "Baro Ki'Teer", resurgence: 'Prime 復甦', baroTitle: "Baro Ki'Teer 目前或即將上架的物品", resurgenceTitle: '目前或即將進入 Prime 復甦輪替的物品' },
}

export const marketEventName = (eventType: MarketEvent['eventType'], locale: Locale) => eventType === 'baro' ? marketEventText[locale].baro : marketEventText[locale].resurgence

export const RegalAyaGlyph = ({ x, y, size, className }: { x?: number; y?: number; size?: number; className?: string }) => <svg
  x={x} y={y} width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true"
>
  <path d="M12 2.7c1.5 2.1 3.4 4.2 3.4 7.5 0 4.3-2 8.4-3.4 11.1-1.4-2.7-3.4-6.8-3.4-11.1 0-3.3 1.9-5.4 3.4-7.5Z"/>
  <path d="M12 5.8v12.5M9.5 7.2c1.2 1.1 1.6 2.4 1.6 4.1 0 2.2-.7 4.2-1.5 5.8M14.5 7.2c-1.2 1.1-1.6 2.4-1.6 4.1 0 2.2.7 4.2 1.5 5.8M8.9 8.2 5.6 6.7M8.5 11.8 4.3 12M9.2 15.5l-3.4 1.8M15.1 8.2l3.3-1.5M15.5 11.8l4.2.2M14.8 15.5l3.4 1.8"/>
</svg>

export const MarketEventBadge = ({ event, locale, compact = false }: { event: MarketEvent; locale: Locale; compact?: boolean }) => {
  const baro = event.eventType === 'baro'
  const title = baro ? marketEventText[locale].baroTitle : marketEventText[locale].resurgenceTitle
  return <span className={`market-event-badge ${baro ? 'baro-event' : 'resurgence-event'} ${compact ? 'compact' : ''}`} title={title} aria-label={title} role="img">
    {baro ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 18h12M8 18l1-8h6l1 8M10 10V7h4v3M7 6l2 1M17 6l-2 1"/></svg> : <RegalAyaGlyph/>}
  </span>
}
