import { useEffect, useMemo, useState } from 'react'
import { fetchSmartBuyAll } from './api'
import type { SmartBuyResponse, SmartBuySeller, SmartBuySellerOffer, SmartBuyWishlistRow } from './api'
import { ItemIcon } from './MarketVisuals'
import type { CatalogItem } from './types'
import type { Locale } from './i18n'
import './smartBuy.css'

const STORAGE_KEY = 'frameanalytics-wfm-profile-v1'
const ONLINE = new Set(['online', 'ingame'])
const WFM_LOCALES = new Set([
  'en', 'ru', 'de', 'fr', 'es', 'pt', 'pl', 'uk', 'tr', 'it',
  'sv', 'cs', 'ja', 'ko', 'zh-hans', 'zh-hant'
])

type PremiumLimit = 'any' | '0' | '5' | '10' | '20' | '50'
type SortBasis = 'minimum' | 'average24h'

const textFor = (locale: Locale) => locale === 'ru' ? {
  eyebrow: 'Warframe Market',
  title: 'Умная покупка',
  description: 'Привяжите публичный профиль Warframe Market. FrameAnalytics соберёт ваши видимые заявки на покупку, найдёт продавцов и предложит маршрут с меньшим числом сделок.',
  profileLabel: 'Ссылка на профиль',
  profilePlaceholder: 'https://warframe.market/profile/имя',
  link: 'Привязать и проверить',
  refresh: 'Обновить предложения',
  unlink: 'Отвязать',
  publicOnly: 'Используются только публичные видимые buy-ордера. Скрытые заявки без авторизации Warframe Market недоступны.',
  privacy: 'Ники продавцов в интерфейсе частично скрываются. Ссылка ведёт на настоящий профиль продавца.',
  loading: 'Собираем все заявки и предложения продавцов…',
  noOrders: 'У этого профиля нет видимых заявок на покупку.',
  loadError: 'Не удалось собрать данные умной покупки.',
  wishlist: 'Что вы хотите купить',
  sellers: 'Продавцы, которые закрывают ваши покупки',
  route: 'Умный маршрут',
  routeHint: 'Сначала выбираются продавцы, которые закрывают больше нужных позиций и количества; ценовой критерий при равенстве задаёт ползунок сортировки.',
  routeComplete: 'Список покрывается выбранным маршрутом.',
  routePartial: 'Часть списка не удалось покрыть с текущими фильтрами.',
  wanted: 'Нужно',
  myPrice: 'Моя цена',
  marketMin: 'Мин. активных лотов',
  onlineMin: 'Мин. онлайн',
  average24h: 'Средняя 24ч',
  sellerCount: 'Продавцы',
  sellerPremiumFilter: 'Макс. отклонение цены продавца',
  sortBasis: 'Ориентир сортировки',
  sortMinimum: 'Текущий минимум',
  sortAverage24h: 'Средняя 24ч',
  sortHintMinimum: 'База — минимальная цена среди видимых текущих sell-лотов той же exact-series. При равном покрытии выше продавцы с меньшей переплатой к этой цене.',
  sortHintAverage24h: 'При равном покрытии выше продавцы с меньшей ценой относительно средней цены сделок за последние 24 часа exact-series.',
  onlineOnly: 'Только онлайн',
  any: 'Любое',
  within5: '±5%',
  within10: '±10%',
  within20: '±20%',
  belowMarket: 'Ниже рынка',
  aboveMarket: 'Выше рынка',
  minimumOnly: 'Только по базе',
  upTo: (value: string) => `до +${value}% к базе`,
  positions: 'позиций',
  units: 'шт.',
  full: 'полностью',
  estimated: 'примерно',
  openProfile: 'Профиль продавца',
  openItem: 'Открыть предмет',
  canSell: 'может продать',
  of: 'из',
  price: 'цена',
  premium: 'К минимуму активных лотов',
  overpayTotal: 'Переплата',
  perUnit: '/шт.',
  total: 'всего',
  vs24h: 'К средней 24ч',
  online: 'онлайн',
  ingame: 'в игре',
  offline: 'офлайн',
  updated: 'Обновлено',
  processed: 'Рыночных серий',
  filteredEmpty: 'По выбранным фильтрам подходящих покупок нет.',
  sellersEmpty: 'По выбранным фильтрам подходящих продавцов нет.',
  multiHint: 'Выше находятся продавцы, которые могут закрыть больше разных позиций и нужного количества.',
  signedAbove: 'выше минимума',
  signedBelow: 'ниже минимума',
  exact: 'на уровне минимума',
  noOnline: 'Сейчас нет подходящего продавца онлайн.',
  cached: 'Рыночные ответы кратковременно кэшируются, чтобы не создавать лишнюю нагрузку на Warframe Market.',
  priceFilterHint: 'Фильтр и итоговая переплата считаются только относительно выбранной базы. В режиме минимума при включённом «Только онлайн» база — минимальная цена онлайн/в игре среди текущих sell-лотов exact-series; при выключенном — минимум среди всех видимых sell-лотов. Ваша buy-цена не используется.'
} : {
  eyebrow: 'Warframe Market',
  title: 'Smart Buy',
  description: 'Link a public Warframe Market profile. FrameAnalytics collects your visible buy orders, finds sellers, and suggests a route with fewer trades.',
  profileLabel: 'Profile link',
  profilePlaceholder: 'https://warframe.market/profile/name',
  link: 'Link and check',
  refresh: 'Refresh offers',
  unlink: 'Unlink',
  publicOnly: 'Only public visible buy orders are used. Hidden orders require Warframe Market authentication and are not available here.',
  privacy: 'Seller nicknames are partially masked in the interface. Links still open the real seller profile.',
  loading: 'Collecting all wanted orders and seller offers…',
  noOrders: 'This profile has no visible buy orders.',
  loadError: 'Could not load Smart Buy data.',
  wishlist: 'What you want to buy',
  sellers: 'Sellers covering your purchases',
  route: 'Smart route',
  routeHint: 'Sellers covering more wanted positions and units are picked first; the slider chooses the price tie-breaker.',
  routeComplete: 'The selected route covers the filtered list.',
  routePartial: 'Some items cannot be covered with the current filters.',
  wanted: 'Wanted',
  myPrice: 'My price',
  marketMin: 'Active listing min',
  onlineMin: 'Online min',
  average24h: '24h average',
  sellerCount: 'Sellers',
  sellerPremiumFilter: 'Max seller price deviation',
  sortBasis: 'Sorting reference',
  sortMinimum: 'Current minimum',
  sortAverage24h: '24h average',
  sortHintMinimum: 'The base is the lowest price among visible current sell listings of the exact same market series. Sellers with lower overpay to that base rank higher when coverage is equal.',
  sortHintAverage24h: 'When coverage is equal, sellers with the lowest price versus the exact-series 24h trade average rank higher.',
  onlineOnly: 'Online only',
  any: 'Any',
  within5: '±5%',
  within10: '±10%',
  within20: '±20%',
  belowMarket: 'Below market',
  aboveMarket: 'Above market',
  minimumOnly: 'Base price only',
  upTo: (value: string) => `up to +${value}% vs base`,
  positions: 'positions',
  units: 'units',
  full: 'full',
  estimated: 'est.',
  openProfile: 'Seller profile',
  openItem: 'Open item',
  canSell: 'can sell',
  of: 'of',
  price: 'price',
  premium: 'Vs active listing minimum',
  overpayTotal: 'Premium',
  perUnit: '/unit',
  total: 'total',
  vs24h: 'Vs 24h average',
  online: 'online',
  ingame: 'in game',
  offline: 'offline',
  updated: 'Updated',
  processed: 'Market series',
  filteredEmpty: 'No wanted items match these filters.',
  sellersEmpty: 'No sellers match these filters.',
  multiHint: 'Sellers covering more distinct positions and requested quantity are ranked first.',
  signedAbove: 'above minimum',
  signedBelow: 'below minimum',
  exact: 'at minimum',
  noOnline: 'No matching seller is online right now.',
  cached: 'Market responses are briefly cached to avoid unnecessary load on Warframe Market.',
  priceFilterHint: 'Filtering and overpay totals use only the selected base. In minimum mode, Online only uses the lowest online/in-game current sell listing for the exact series; otherwise it uses the lowest visible sell listing. Your buy price is not used.'
}

const numberText = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits).replace(/\.0$/, '')
const plat = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${numberText(value, 2)}p`
const signedPlat = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${numberText(value, 2)}p`
const percent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${numberText(value, 1)}%`
const limitNumber = (value: PremiumLimit): number | null => value === 'any' ? null : Number(value)
const statusClass = (status: string) => ONLINE.has(status) ? 'online' : 'offline'

const maskNickname = (value: string) => {
  const chars = Array.from(value || '')
  if (!chars.length) return '•••'
  if (chars.length === 1) return `${chars[0]}•`
  if (chars.length <= 4) return `${chars[0]}${'•'.repeat(Math.max(2, chars.length - 2))}${chars[chars.length - 1]}`
  const start = chars.length >= 10 ? 3 : 2
  const end = chars.length >= 8 ? 2 : 1
  const hidden = Math.max(3, Math.min(7, chars.length - start - end))
  return `${chars.slice(0, start).join('')}${'•'.repeat(hidden)}${chars.slice(-end).join('')}`
}

const wfmLocale = (locale: Locale) => WFM_LOCALES.has(locale) ? locale : 'en'
const wfmUrl = (locale: Locale, path: string) => `https://warframe.market/${wfmLocale(locale)}/${path.replace(/^\/+/, '')}`
const wfmProfileUrl = (locale: Locale, slug: string) => wfmUrl(locale, `profile/${encodeURIComponent(slug)}`)
const catalogSlug = (item: CatalogItem | undefined) => (item as (CatalogItem & { slug?: string }) | undefined)?.slug || null
const wfmItemUrl = (locale: Locale, item: CatalogItem | undefined) => {
  const slug = catalogSlug(item)
  return slug ? `${wfmUrl(locale, `items/${encodeURIComponent(slug)}`)}?type=sell` : null
}

const dimensionText = (row: SmartBuyWishlistRow, locale: Locale) => {
  const d = row.dimensions || {}
  const parts: string[] = []
  if (d.rank != null) parts.push(locale === 'ru' ? `Ранг ${d.rank}` : `Rank ${d.rank}`)
  if (d.subtype != null) parts.push(String(d.subtype))
  if (d.charges != null) parts.push(locale === 'ru' ? `Заряды ${d.charges}` : `Charges ${d.charges}`)
  if (d.amberStars != null) parts.push(locale === 'ru' ? `Янтарные ${d.amberStars}` : `Amber ${d.amberStars}`)
  if (d.cyanStars != null) parts.push(locale === 'ru' ? `Голубые ${d.cyanStars}` : `Cyan ${d.cyanStars}`)
  return parts.join(' · ')
}

const profileFromStorage = () => {
  try { return localStorage.getItem(STORAGE_KEY) || '' } catch { return '' }
}

const offerForDemand = (offers: SmartBuySellerOffer[], demandKey: string) => offers.find(offer => offer.demandKey === demandKey) || null

const metricTone = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? 'neutral' : value > 0 ? 'negative' : value < 0 ? 'positive' : 'neutral'

type RankedSeller = {
  seller: SmartBuySeller
  offers: SmartBuySellerOffer[]
  positionsCovered: number
  fullPositions: number
  unitsCovered: number
  totalRequestedUnits: number
  estimatedCost: number
  totalPremiumPlatinum: number
  averagePremium: number | null
  averageSortMetric: number | null
}

type RouteStep = RankedSeller & {
  step: number
  newlyCoveredPositions: number
  newlyCoveredUnits: number
  stepCost: number
}


export const SmartBuyPanel = ({ locale, catalog }: { locale: Locale; catalog: Map<string, CatalogItem> }) => {
  const text = textFor(locale)
  const [profileInput, setProfileInput] = useState(profileFromStorage)
  const [linkedProfile, setLinkedProfile] = useState(profileFromStorage)
  const [data, setData] = useState<SmartBuyResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [sellerPremium, setSellerPremium] = useState<PremiumLimit>('10')
  const [sortBasis, setSortBasis] = useState<SortBasis>('minimum')
  const [onlineOnly, setOnlineOnly] = useState(true)

  useEffect(() => {
    if (!linkedProfile) { setData(null); setError(null); return }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetchSmartBuyAll(linkedProfile, controller.signal)
      .then(setData)
      .catch(value => { if (!controller.signal.aborted) setError(value instanceof Error ? value.message : String(value)) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [linkedProfile, reload])

  const filteredWishlist = useMemo(() => data?.wishlist || [], [data])
  const wishlistByDemand = useMemo(() => new Map(filteredWishlist.map(row => [row.demandKey, row])), [filteredWishlist])
  const currentMinimumForOffer = (offer: SmartBuySellerOffer) => {
    const row = wishlistByDemand.get(offer.demandKey)
    if (!row) return offer.marketMinUnitPrice
    return onlineOnly ? (row.onlineMinUnitPrice ?? row.marketMinUnitPrice) : row.marketMinUnitPrice
  }
  const pctAgainst = (price: number, base: number | null | undefined) => base != null && base > 0 ? ((price - base) / base) * 100 : null
  const deltaAgainst = (price: number, base: number | null | undefined) => base != null ? price - base : null
  const currentMinimumMetric = (offer: SmartBuySellerOffer) => pctAgainst(offer.unitPrice, currentMinimumForOffer(offer))
  const currentMinimumDeltaPerUnit = (offer: SmartBuySellerOffer) => deltaAgainst(offer.unitPrice, currentMinimumForOffer(offer))
  const currentMinimumDeltaTotal = (offer: SmartBuySellerOffer) => {
    const delta = currentMinimumDeltaPerUnit(offer)
    return delta == null ? null : delta * offer.fillableQuantity
  }
  const activeMetric = (offer: SmartBuySellerOffer) => sortBasis === 'average24h' ? offer.deviation24hPct : currentMinimumMetric(offer)
  const activeDeltaPerUnit = (offer: SmartBuySellerOffer) => sortBasis === 'average24h' ? offer.deviation24hPlatinumPerUnit : currentMinimumDeltaPerUnit(offer)
  const activeDeltaTotal = (offer: SmartBuySellerOffer) => sortBasis === 'average24h' ? offer.deviation24hPlatinumTotal : currentMinimumDeltaTotal(offer)
  const secondaryMetric = (offer: SmartBuySellerOffer) => sortBasis === 'average24h' ? currentMinimumMetric(offer) : offer.deviation24hPct
  const secondaryDeltaPerUnit = (offer: SmartBuySellerOffer) => sortBasis === 'average24h' ? currentMinimumDeltaPerUnit(offer) : offer.deviation24hPlatinumPerUnit
  const secondaryDeltaTotal = (offer: SmartBuySellerOffer) => sortBasis === 'average24h' ? currentMinimumDeltaTotal(offer) : offer.deviation24hPlatinumTotal
  const primaryMetricLabel = sortBasis === 'average24h' ? text.vs24h : text.premium
  const secondaryMetricLabel = sortBasis === 'average24h' ? text.premium : text.vs24h
  const activeReferenceText = (offer: SmartBuySellerOffer) => sortBasis === 'average24h'
    ? `${text.average24h}: ${plat(offer.average24hUnitPrice)}`
    : `${text.marketMin}: ${plat(currentMinimumForOffer(offer))}`
  const secondaryReferenceText = (offer: SmartBuySellerOffer) => sortBasis === 'average24h'
    ? `${text.marketMin}: ${plat(currentMinimumForOffer(offer))}`
    : `${text.average24h}: ${plat(offer.average24hUnitPrice)}`
  const sellerFilterLabel = sortBasis === 'average24h'
    ? (locale === 'ru' ? 'Макс. отклонение продавца к средней 24ч' : 'Max seller deviation vs 24h average')
    : (locale === 'ru' ? 'Макс. переплата продавцу к текущему минимуму' : 'Max seller overpay vs current minimum')

  const rankedSellers = useMemo<RankedSeller[]>(() => {
    if (!data || !filteredWishlist.length) return []
    const allowed = wishlistByDemand
    const maxPremium = limitNumber(sellerPremium)
    const sortMetric = (offer: SmartBuySellerOffer) => activeMetric(offer)
    return data.sellers.flatMap(seller => {
      if (onlineOnly && !ONLINE.has(seller.user.status)) return []
      const offers = seller.offers.filter(offer => {
        if (!allowed.has(offer.demandKey)) return false
        if (maxPremium == null) return true
        const metric = activeMetric(offer)
        return metric != null && Number.isFinite(metric) && metric <= maxPremium + 0.0001
      }).sort((left, right) =>
        (sortMetric(left) ?? Number.POSITIVE_INFINITY) - (sortMetric(right) ?? Number.POSITIVE_INFINITY) ||
        left.unitPrice - right.unitPrice ||
        left.itemId.localeCompare(right.itemId)
      )
      if (!offers.length) return []
      let unitsCovered = 0
      let totalRequestedUnits = 0
      let fullPositions = 0
      let estimatedCost = 0
      let totalPremiumPlatinum = 0
      const premiums: number[] = []
      const sortMetrics: number[] = []
      for (const wishlist of filteredWishlist) {
        totalRequestedUnits += wishlist.quantity
        const offer = offerForDemand(offers, wishlist.demandKey)
        if (!offer) continue
        unitsCovered += Math.min(wishlist.quantity, offer.fillableQuantity)
        if (offer.fillableQuantity >= wishlist.quantity) fullPositions++
        estimatedCost += offer.estimatedCost || 0
        const totalDelta = activeDeltaTotal(offer)
        if (totalDelta != null && Number.isFinite(totalDelta)) totalPremiumPlatinum += totalDelta
        const premiumMetric = activeMetric(offer)
        if (premiumMetric != null && Number.isFinite(premiumMetric)) premiums.push(premiumMetric)
        const metric = sortMetric(offer)
        if (metric != null && Number.isFinite(metric)) sortMetrics.push(metric)
      }
      const averagePremium = premiums.length ? premiums.reduce((sum, value) => sum + value, 0) / premiums.length : null
      const averageSortMetric = sortMetrics.length ? sortMetrics.reduce((sum, value) => sum + value, 0) / sortMetrics.length : null
      return [{ seller, offers, positionsCovered: offers.length, fullPositions, unitsCovered, totalRequestedUnits, estimatedCost, totalPremiumPlatinum, averagePremium, averageSortMetric }]
    }).sort((left, right) =>
      right.positionsCovered - left.positionsCovered ||
      right.fullPositions - left.fullPositions ||
      right.unitsCovered - left.unitsCovered ||
      (left.averageSortMetric ?? Number.POSITIVE_INFINITY) - (right.averageSortMetric ?? Number.POSITIVE_INFINITY) ||
      left.estimatedCost - right.estimatedCost ||
      left.seller.user.ingameName.localeCompare(right.seller.user.ingameName)
    )
  }, [data, filteredWishlist, wishlistByDemand, onlineOnly, sellerPremium, sortBasis])

  const smartRoute = useMemo(() => {
    const remaining = new Map(filteredWishlist.map(row => [row.demandKey, row.quantity]))
    const chosen: RouteStep[] = []
    const available = [...rankedSellers]

    while ([...remaining.values()].some(value => value > 0) && available.length && chosen.length < 12) {
      const scored = available.map(candidate => {
        let newPositions = 0
        let fullRemainingPositions = 0
        let newUnits = 0
        let stepCost = 0
        const sortMetrics: number[] = []

        for (const offer of candidate.offers) {
          const needed = remaining.get(offer.demandKey) || 0
          if (needed <= 0) continue
          const fill = Math.min(needed, offer.fillableQuantity)
          if (fill <= 0) continue
          newPositions++
          if (fill >= needed) fullRemainingPositions++
          newUnits += fill
          stepCost += fill * offer.unitPrice
          const metric = activeMetric(offer)
          if (metric != null && Number.isFinite(metric)) sortMetrics.push(metric)
        }

        return {
          candidate,
          newPositions,
          fullRemainingPositions,
          newUnits,
          stepCost,
          averageSortMetric: sortMetrics.length ? sortMetrics.reduce((sum, value) => sum + value, 0) / sortMetrics.length : Number.POSITIVE_INFINITY
        }
      }).filter(value => value.newUnits > 0)
        .sort((left, right) =>
          right.fullRemainingPositions - left.fullRemainingPositions ||
          right.newPositions - left.newPositions ||
          right.newUnits - left.newUnits ||
          left.averageSortMetric - right.averageSortMetric ||
          left.stepCost - right.stepCost
        )

      const best = scored[0]
      if (!best) break
      chosen.push({
        ...best.candidate,
        step: chosen.length + 1,
        newlyCoveredPositions: best.newPositions,
        newlyCoveredUnits: best.newUnits,
        stepCost: best.stepCost
      })

      for (const offer of best.candidate.offers) {
        const needed = remaining.get(offer.demandKey) || 0
        if (needed <= 0) continue
        remaining.set(offer.demandKey, Math.max(0, needed - Math.min(needed, offer.fillableQuantity)))
      }

      const index = available.indexOf(best.candidate)
      if (index >= 0) available.splice(index, 1)
    }

    const uncoveredUnits = [...remaining.values()].reduce((sum, value) => sum + Math.max(0, value), 0)
    const uncoveredPositions = [...remaining.values()].filter(value => value > 0).length
    return { chosen, uncoveredUnits, uncoveredPositions }
  }, [filteredWishlist, rankedSellers, sortBasis])

  const saveProfile = () => {
    const value = profileInput.trim()
    if (!value) return
    localStorage.setItem(STORAGE_KEY, value)
    setLinkedProfile(value)
    setReload(value => value + 1)
  }
  const unlink = () => {
    localStorage.removeItem(STORAGE_KEY)
    setProfileInput('')
    setLinkedProfile('')
    setData(null)
    setError(null)
  }

  const statusLabel = (status: string) => status === 'ingame' ? text.ingame : status === 'online' ? text.online : text.offline
  const itemFor = (itemId: string) => catalog.get(itemId)
  const itemName = (itemId: string) => itemFor(itemId)?.name || itemFor(itemId)?.englishName || itemId

  return <section className="panel smart-buy-panel">
    <div className="smart-buy-heading">
      <div><span className="eyebrow">{text.eyebrow}</span><h2>{text.title}</h2><p>{text.description}</p></div>
      {data?.profile ? <a className="smart-buy-profile-chip" href={wfmProfileUrl(locale, data.profile.slug)} target="_blank" rel="noreferrer"><i className={statusClass(data.profile.status)}/><span><strong>{data.profile.ingameName}</strong><small>{data.profile.platform}{data.profile.crossplay ? ' · crossplay' : ''} · {statusLabel(data.profile.status)}</small></span></a> : null}
    </div>

    <div className="smart-buy-link-row">
      <label><span>{text.profileLabel}</span><input type="url" value={profileInput} placeholder={text.profilePlaceholder} onChange={event => setProfileInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); saveProfile() } }}/></label>
      <button type="button" className="primary-action" disabled={!profileInput.trim() || loading} onClick={saveProfile}>{linkedProfile ? text.refresh : text.link}</button>
      {linkedProfile ? <button type="button" className="smart-buy-secondary" onClick={() => setReload(value => value + 1)} disabled={loading}>{text.refresh}</button> : null}
      {linkedProfile ? <button type="button" className="smart-buy-secondary danger" onClick={unlink}>{text.unlink}</button> : null}
    </div>
    <p className="smart-buy-note">{text.publicOnly} {text.cached}</p>
    <p className="smart-buy-note privacy-note">{text.privacy}</p>

    {loading ? <div className="smart-buy-state"><div className="spinner"/><strong>{text.loading}</strong></div> : error ? <div className="smart-buy-state error-state"><strong>{text.loadError}</strong><small>{error}</small><button type="button" className="retry-button" onClick={() => setReload(value => value + 1)}>{text.refresh}</button></div> : data ? <>
      <div className="smart-buy-filters">
        <div className="smart-buy-sort-control">
          <span>{text.sortBasis}</span>
          <div className="smart-buy-sort-toggle">
            <b className={sortBasis === 'minimum' ? 'active' : ''}>{text.sortMinimum}</b>
            <label className="smart-buy-slider">
              <input type="checkbox" checked={sortBasis === 'average24h'} onChange={event => setSortBasis(event.target.checked ? 'average24h' : 'minimum')} aria-label={text.sortBasis}/>
              <i/>
            </label>
            <b className={sortBasis === 'average24h' ? 'active' : ''}>{text.sortAverage24h}</b>
          </div>
          <small>{sortBasis === 'average24h' ? text.sortHintAverage24h : text.sortHintMinimum}</small>
        </div>
        <label><span>{sellerFilterLabel}</span><select value={sellerPremium} onChange={event => setSellerPremium(event.target.value as PremiumLimit)}><option value="0">{text.minimumOnly}</option><option value="5">{text.upTo('5')}</option><option value="10">{text.upTo('10')}</option><option value="20">{text.upTo('20')}</option><option value="50">{text.upTo('50')}</option><option value="any">{text.any}</option></select></label>
        <label className="smart-buy-check"><input type="checkbox" checked={onlineOnly} onChange={event => setOnlineOnly(event.target.checked)}/><span>{text.onlineOnly}</span></label>
        <div className="smart-buy-generated"><span>{text.updated}</span><strong>{new Date(data.generatedAt).toLocaleString()}</strong><small>{text.processed}: {data.marketSeriesProcessed}/{data.marketSeriesRequested}</small></div>
      </div>
      <p className="smart-buy-note">{text.priceFilterHint}</p>

      {!data.wishlist.length ? <div className="smart-buy-state"><strong>{text.noOrders}</strong></div> : <>
        <div className="smart-buy-subheading"><div><span className="eyebrow">{text.wishlist}</span><strong>{filteredWishlist.length}/{data.wishlist.length}</strong></div></div>
        {!filteredWishlist.length ? <div className="smart-buy-state compact"><strong>{text.filteredEmpty}</strong></div> : <div className="smart-buy-wishlist-grid">{filteredWishlist.map(row => {
          const item = itemFor(row.itemId)
          const dims = dimensionText(row, locale)
          const itemUrl = wfmItemUrl(locale, item)
          return <article key={row.demandKey} className="smart-buy-wanted-card">
            <div className="smart-buy-item"><ItemIcon item={item} name={itemName(row.itemId)}/><div>{itemUrl ? <a className="smart-buy-item-name" href={itemUrl} target="_blank" rel="noreferrer" title={text.openItem}>{itemName(row.itemId)} ↗</a> : <strong>{itemName(row.itemId)}</strong>}<small>{dims || row.itemId}</small></div></div>
            <div className="smart-buy-values"><span><small>{text.wanted}</small><strong>{row.quantity}</strong></span><span><small>{text.myPrice}</small><strong>{plat(row.wantedUnitPrice)}</strong></span><span><small>{text.marketMin}</small><strong>{plat(row.marketMinUnitPrice)}</strong></span><span><small>{text.onlineMin}</small><strong>{plat(row.onlineMinUnitPrice)}</strong></span><span><small>{text.average24h}</small><strong>{plat(row.average24hUnitPrice)}</strong></span><span><small>{text.sellerCount}</small><strong>{row.onlineSellers}/{row.sellers}</strong></span></div>
            {row.onlineMinUnitPrice == null && row.marketMinUnitPrice != null ? <small className="smart-buy-fallback">{text.noOnline}</small> : null}
          </article>
        })}</div>}

        {filteredWishlist.length ? <section className="smart-buy-route">
          <div className="smart-buy-subheading seller-heading"><div><span className="eyebrow">{text.route}</span><strong>{smartRoute.chosen.length}</strong></div><p>{text.routeHint}</p></div>
          <div className={`smart-buy-route-status ${smartRoute.uncoveredUnits ? 'partial' : 'complete'}`}><strong>{smartRoute.uncoveredUnits ? text.routePartial : text.routeComplete}</strong>{smartRoute.uncoveredUnits ? <small>{smartRoute.uncoveredPositions} {text.positions} · {smartRoute.uncoveredUnits} {text.units}</small> : null}</div>
          {smartRoute.chosen.length ? <div className="smart-buy-route-steps">{smartRoute.chosen.map(step => <a key={step.seller.user.id || step.seller.user.slug} href={wfmProfileUrl(locale, step.seller.user.slug)} target="_blank" rel="noreferrer" className="smart-buy-route-step"><b>{step.step}</b><span><strong>{maskNickname(step.seller.user.ingameName)}</strong><small>{step.newlyCoveredPositions} {text.positions} · {step.newlyCoveredUnits} {text.units}</small></span><em>{plat(step.stepCost)}</em></a>)}</div> : null}
        </section> : null}

        <div className="smart-buy-subheading seller-heading"><div><span className="eyebrow">{text.sellers}</span><strong>{rankedSellers.length}</strong></div><p>{text.multiHint}</p></div>
        {!rankedSellers.length ? <div className="smart-buy-state compact"><strong>{text.sellersEmpty}</strong></div> : <div className="smart-buy-sellers">{rankedSellers.slice(0, 40).map(({ seller, offers, positionsCovered, fullPositions, unitsCovered, totalRequestedUnits, estimatedCost, totalPremiumPlatinum }) => <article className={`smart-buy-seller ${positionsCovered > 1 ? 'multi' : ''}`} key={seller.user.id || seller.user.slug}>
          <header><a href={wfmProfileUrl(locale, seller.user.slug)} target="_blank" rel="noreferrer" title={text.openProfile}><i className={statusClass(seller.user.status)}/><span><strong>{maskNickname(seller.user.ingameName)}</strong><small>{statusLabel(seller.user.status)} · rep {seller.user.reputation}</small></span></a><div className="smart-buy-coverage"><strong>{positionsCovered}/{filteredWishlist.length}</strong><span>{text.positions}</span><small>{fullPositions} {text.full} · {unitsCovered}/{totalRequestedUnits} {text.units}</small></div><div className="smart-buy-cost"><small>{text.estimated}</small><strong>{plat(estimatedCost)}</strong><small className={metricTone(totalPremiumPlatinum)}>{primaryMetricLabel}: {signedPlat(totalPremiumPlatinum)}</small></div></header>
          <div className="smart-buy-offers">{offers.map(offer => {
            const wanted = filteredWishlist.find(row => row.demandKey === offer.demandKey)
            const item = itemFor(offer.itemId)
            const itemUrl = wfmItemUrl(locale, item)
            return <div className="smart-buy-offer" key={`${seller.user.slug}:${offer.demandKey}`}>
              {itemUrl ? <a className="smart-buy-offer-name" href={itemUrl} target="_blank" rel="noreferrer" title={text.openItem}>{itemName(offer.itemId)} ↗</a> : <span className="smart-buy-offer-name">{itemName(offer.itemId)}</span>}
              <span>{text.canSell} <strong>{offer.fillableQuantity}</strong> {text.of} {wanted?.quantity ?? offer.requestedQuantity}</span>
              <span>{text.price} <strong>{plat(offer.unitPrice)}</strong></span>
<span className={`smart-buy-offer-metric primary ${metricTone(activeMetric(offer))}`}><small>{primaryMetricLabel}</small><strong>{percent(activeMetric(offer))}</strong><span className="smart-buy-metric-line">{signedPlat(activeDeltaPerUnit(offer))} {text.perUnit}</span><em>{activeReferenceText(offer)} · {signedPlat(activeDeltaTotal(offer))} {text.total}</em></span>
              <span className={`smart-buy-offer-metric secondary ${metricTone(secondaryMetric(offer))}`}><small>{secondaryMetricLabel}</small><strong>{percent(secondaryMetric(offer))}</strong><span className="smart-buy-metric-line">{signedPlat(secondaryDeltaPerUnit(offer))} {text.perUnit}</span><em>{secondaryReferenceText(offer)}</em></span>
            </div>
          })}</div>
          <a className="smart-buy-open" href={wfmProfileUrl(locale, seller.user.slug)} target="_blank" rel="noreferrer">{text.openProfile} ↗</a>
        </article>)}</div>}
      </>}
    </> : null}
  </section>
}
