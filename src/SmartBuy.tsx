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
type GapFilter = 'any' | 'within5' | 'within10' | 'within20' | 'below' | 'above'

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
  routeHint: 'Сначала выбираются продавцы, которые закрывают больше нужных позиций и количества; при равенстве предпочтение отдаётся меньшей переплате.',
  routeComplete: 'Список покрывается выбранным маршрутом.',
  routePartial: 'Часть списка не удалось покрыть с текущими фильтрами.',
  wanted: 'Нужно',
  myPrice: 'Моя цена',
  marketMin: 'Мин. рынка',
  onlineMin: 'Мин. онлайн',
  gap: 'Моя цена к рынку',
  sellerCount: 'Продавцы',
  myGapFilter: 'Моя цена от минимума',
  sellerPremiumFilter: 'Цена продавца от минимума',
  onlineOnly: 'Только онлайн',
  any: 'Любое',
  within5: '±5%',
  within10: '±10%',
  within20: '±20%',
  belowMarket: 'Ниже рынка',
  aboveMarket: 'Выше рынка',
  minimumOnly: 'Только минимум',
  upTo: (value: string) => `не более +${value}%`,
  positions: 'позиций',
  units: 'шт.',
  full: 'полностью',
  estimated: 'примерно',
  openProfile: 'Профиль продавца',
  openItem: 'Открыть предмет',
  canSell: 'может продать',
  of: 'из',
  price: 'цена',
  premium: 'к минимуму',
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
  cached: 'Рыночные ответы кратковременно кэшируются, чтобы не создавать лишнюю нагрузку на Warframe Market.'
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
  routeHint: 'Sellers covering more wanted positions and units are picked first; lower premium breaks ties.',
  routeComplete: 'The selected route covers the filtered list.',
  routePartial: 'Some items cannot be covered with the current filters.',
  wanted: 'Wanted',
  myPrice: 'My price',
  marketMin: 'Market min',
  onlineMin: 'Online min',
  gap: 'My price vs market',
  sellerCount: 'Sellers',
  myGapFilter: 'My price vs minimum',
  sellerPremiumFilter: 'Seller price vs minimum',
  onlineOnly: 'Online only',
  any: 'Any',
  within5: '±5%',
  within10: '±10%',
  within20: '±20%',
  belowMarket: 'Below market',
  aboveMarket: 'Above market',
  minimumOnly: 'Minimum only',
  upTo: (value: string) => `up to +${value}%`,
  positions: 'positions',
  units: 'units',
  full: 'full',
  estimated: 'est.',
  openProfile: 'Seller profile',
  openItem: 'Open item',
  canSell: 'can sell',
  of: 'of',
  price: 'price',
  premium: 'vs minimum',
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
  cached: 'Market responses are briefly cached to avoid unnecessary load on Warframe Market.'
}

const numberText = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits).replace(/\.0$/, '')
const plat = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${numberText(value, 2)}p`
const percent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${numberText(value, 1)}%`
const limitNumber = (value: PremiumLimit): number | null => value === 'any' ? null : Number(value)
const statusClass = (status: string) => ONLINE.has(status) ? 'online' : 'offline'

const maskNickname = (value: string) => {
  const chars = Array.from(value || '')
  if (!chars.length) return '•••'
  if (chars.length === 1) return `${chars[0]}•`
  if (chars.length <= 4) return `${chars[0]}${'•'.repeat(Math.max(2, chars.length - 2))}${chars.at(-1)}`
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

type RankedSeller = {
  seller: SmartBuySeller
  offers: SmartBuySellerOffer[]
  positionsCovered: number
  fullPositions: number
  unitsCovered: number
  totalRequestedUnits: number
  estimatedCost: number
  averagePremium: number | null
}

type RouteStep = RankedSeller & {
  step: number
  newlyCoveredPositions: number
  newlyCoveredUnits: number
  stepCost: number
}

const gapMatches = (row: SmartBuyWishlistRow, filter: GapFilter) => {
  const gap = row.gapPct
  if (filter === 'any') return true
  if (gap == null || !Number.isFinite(gap)) return false
  if (filter === 'below') return gap < 0
  if (filter === 'above') return gap > 0
  const limit = filter === 'within5' ? 5 : filter === 'within10' ? 10 : 20
  return Math.abs(gap) <= limit
}

export const SmartBuyPanel = ({ locale, catalog }: { locale: Locale; catalog: Map<string, CatalogItem> }) => {
  const text = textFor(locale)
  const [profileInput, setProfileInput] = useState(profileFromStorage)
  const [linkedProfile, setLinkedProfile] = useState(profileFromStorage)
  const [data, setData] = useState<SmartBuyResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [myGap, setMyGap] = useState<GapFilter>('any')
  const [sellerPremium, setSellerPremium] = useState<PremiumLimit>('10')
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

  const filteredWishlist = useMemo(
    () => (data?.wishlist || []).filter(row => gapMatches(row, myGap)),
    [data, myGap]
  )

  const rankedSellers = useMemo<RankedSeller[]>(() => {
    if (!data || !filteredWishlist.length) return []
    const allowed = new Map(filteredWishlist.map(row => [row.demandKey, row]))
    const maxPremium = limitNumber(sellerPremium)
    return data.sellers.flatMap(seller => {
      if (onlineOnly && !ONLINE.has(seller.user.status)) return []
      const offers = seller.offers.filter(offer => {
        if (!allowed.has(offer.demandKey)) return false
        if (maxPremium == null) return true
        return offer.premiumPct != null && offer.premiumPct <= maxPremium + 0.0001
      })
      if (!offers.length) return []
      let unitsCovered = 0
      let totalRequestedUnits = 0
      let fullPositions = 0
      let estimatedCost = 0
      const premiums: number[] = []
      for (const wishlist of filteredWishlist) {
        totalRequestedUnits += wishlist.quantity
        const offer = offerForDemand(offers, wishlist.demandKey)
        if (!offer) continue
        unitsCovered += Math.min(wishlist.quantity, offer.fillableQuantity)
        if (offer.fillableQuantity >= wishlist.quantity) fullPositions++
        estimatedCost += offer.estimatedCost || 0
        if (offer.premiumPct != null && Number.isFinite(offer.premiumPct)) premiums.push(offer.premiumPct)
      }
      const averagePremium = premiums.length ? premiums.reduce((sum, value) => sum + value, 0) / premiums.length : null
      return [{ seller, offers, positionsCovered: offers.length, fullPositions, unitsCovered, totalRequestedUnits, estimatedCost, averagePremium }]
    }).sort((left, right) =>
      right.positionsCovered - left.positionsCovered ||
      right.fullPositions - left.fullPositions ||
      right.unitsCovered - left.unitsCovered ||
      (left.averagePremium ?? Number.POSITIVE_INFINITY) - (right.averagePremium ?? Number.POSITIVE_INFINITY) ||
      left.estimatedCost - right.estimatedCost ||
      left.seller.user.ingameName.localeCompare(right.seller.user.ingameName)
    )
  }, [data, filteredWishlist, onlineOnly, sellerPremium])

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
        const premiums: number[] = []

        for (const offer of candidate.offers) {
          const needed = remaining.get(offer.demandKey) || 0
          if (needed <= 0) continue
          const fill = Math.min(needed, offer.fillableQuantity)
          if (fill <= 0) continue
          newPositions++
          if (fill >= needed) fullRemainingPositions++
          newUnits += fill
          stepCost += fill * offer.unitPrice
          if (offer.premiumPct != null && Number.isFinite(offer.premiumPct)) premiums.push(offer.premiumPct)
        }

        return {
          candidate,
          newPositions,
          fullRemainingPositions,
          newUnits,
          stepCost,
          averagePremium: premiums.length ? premiums.reduce((sum, value) => sum + value, 0) / premiums.length : Number.POSITIVE_INFINITY
        }
      }).filter(value => value.newUnits > 0)
        .sort((left, right) =>
          right.fullRemainingPositions - left.fullRemainingPositions ||
          right.newPositions - left.newPositions ||
          right.newUnits - left.newUnits ||
          left.averagePremium - right.averagePremium ||
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
  }, [filteredWishlist, rankedSellers])

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
  const gapTitle = (value: number | null) => value == null ? '' : value > 0 ? text.signedAbove : value < 0 ? text.signedBelow : text.exact

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
        <label><span>{text.myGapFilter}</span><select value={myGap} onChange={event => setMyGap(event.target.value as GapFilter)}><option value="any">{text.any}</option><option value="within5">{text.within5}</option><option value="within10">{text.within10}</option><option value="within20">{text.within20}</option><option value="below">{text.belowMarket}</option><option value="above">{text.aboveMarket}</option></select></label>
        <label><span>{text.sellerPremiumFilter}</span><select value={sellerPremium} onChange={event => setSellerPremium(event.target.value as PremiumLimit)}><option value="0">{text.minimumOnly}</option><option value="5">{text.upTo('5')}</option><option value="10">{text.upTo('10')}</option><option value="20">{text.upTo('20')}</option><option value="50">{text.upTo('50')}</option><option value="any">{text.any}</option></select></label>
        <label className="smart-buy-check"><input type="checkbox" checked={onlineOnly} onChange={event => setOnlineOnly(event.target.checked)}/><span>{text.onlineOnly}</span></label>
        <div className="smart-buy-generated"><span>{text.updated}</span><strong>{new Date(data.generatedAt).toLocaleString()}</strong><small>{text.processed}: {data.marketSeriesProcessed}/{data.marketSeriesRequested}</small></div>
      </div>

      {!data.wishlist.length ? <div className="smart-buy-state"><strong>{text.noOrders}</strong></div> : <>
        <div className="smart-buy-subheading"><div><span className="eyebrow">{text.wishlist}</span><strong>{filteredWishlist.length}/{data.wishlist.length}</strong></div></div>
        {!filteredWishlist.length ? <div className="smart-buy-state compact"><strong>{text.filteredEmpty}</strong></div> : <div className="smart-buy-wishlist-grid">{filteredWishlist.map(row => {
          const item = itemFor(row.itemId)
          const dims = dimensionText(row, locale)
          const itemUrl = wfmItemUrl(locale, item)
          return <article key={row.demandKey} className="smart-buy-wanted-card">
            <div className="smart-buy-item"><ItemIcon item={item} name={itemName(row.itemId)}/><div>{itemUrl ? <a className="smart-buy-item-name" href={itemUrl} target="_blank" rel="noreferrer" title={text.openItem}>{itemName(row.itemId)} ↗</a> : <strong>{itemName(row.itemId)}</strong>}<small>{dims || row.itemId}</small></div></div>
            <div className="smart-buy-values"><span><small>{text.wanted}</small><strong>{row.quantity}</strong></span><span><small>{text.myPrice}</small><strong>{plat(row.wantedUnitPrice)}</strong></span><span><small>{text.marketMin}</small><strong>{plat(row.marketMinUnitPrice)}</strong></span><span><small>{text.onlineMin}</small><strong>{plat(row.onlineMinUnitPrice)}</strong></span><span title={gapTitle(row.gapPct)} className={row.gapPct == null ? 'neutral' : row.gapPct > 0 ? 'negative' : row.gapPct < 0 ? 'positive' : 'neutral'}><small>{text.gap}</small><strong>{percent(row.gapPct)}</strong></span><span><small>{text.sellerCount}</small><strong>{row.onlineSellers}/{row.sellers}</strong></span></div>
            {row.onlineMinUnitPrice == null && row.marketMinUnitPrice != null ? <small className="smart-buy-fallback">{text.noOnline}</small> : null}
          </article>
        })}</div>}

        {filteredWishlist.length ? <section className="smart-buy-route">
          <div className="smart-buy-subheading seller-heading"><div><span className="eyebrow">{text.route}</span><strong>{smartRoute.chosen.length}</strong></div><p>{text.routeHint}</p></div>
          <div className={`smart-buy-route-status ${smartRoute.uncoveredUnits ? 'partial' : 'complete'}`}><strong>{smartRoute.uncoveredUnits ? text.routePartial : text.routeComplete}</strong>{smartRoute.uncoveredUnits ? <small>{smartRoute.uncoveredPositions} {text.positions} · {smartRoute.uncoveredUnits} {text.units}</small> : null}</div>
          {smartRoute.chosen.length ? <div className="smart-buy-route-steps">{smartRoute.chosen.map(step => <a key={step.seller.user.id || step.seller.user.slug} href={wfmProfileUrl(locale, step.seller.user.slug)} target="_blank" rel="noreferrer" className="smart-buy-route-step"><b>{step.step}</b><span><strong>{maskNickname(step.seller.user.ingameName)}</strong><small>{step.newlyCoveredPositions} {text.positions} · {step.newlyCoveredUnits} {text.units}</small></span><em>{plat(step.stepCost)}</em></a>)}</div> : null}
        </section> : null}

        <div className="smart-buy-subheading seller-heading"><div><span className="eyebrow">{text.sellers}</span><strong>{rankedSellers.length}</strong></div><p>{text.multiHint}</p></div>
        {!rankedSellers.length ? <div className="smart-buy-state compact"><strong>{text.sellersEmpty}</strong></div> : <div className="smart-buy-sellers">{rankedSellers.slice(0, 40).map(({ seller, offers, positionsCovered, fullPositions, unitsCovered, totalRequestedUnits, estimatedCost }) => <article className={`smart-buy-seller ${positionsCovered > 1 ? 'multi' : ''}`} key={seller.user.id || seller.user.slug}>
          <header><a href={wfmProfileUrl(locale, seller.user.slug)} target="_blank" rel="noreferrer" title={text.openProfile}><i className={statusClass(seller.user.status)}/><span><strong>{maskNickname(seller.user.ingameName)}</strong><small>{statusLabel(seller.user.status)} · rep {seller.user.reputation}</small></span></a><div className="smart-buy-coverage"><strong>{positionsCovered}/{filteredWishlist.length}</strong><span>{text.positions}</span><small>{fullPositions} {text.full} · {unitsCovered}/{totalRequestedUnits} {text.units}</small></div><div className="smart-buy-cost"><small>{text.estimated}</small><strong>{plat(estimatedCost)}</strong></div></header>
          <div className="smart-buy-offers">{offers.map(offer => {
            const wanted = filteredWishlist.find(row => row.demandKey === offer.demandKey)
            const item = itemFor(offer.itemId)
            const itemUrl = wfmItemUrl(locale, item)
            return <div className="smart-buy-offer" key={`${seller.user.slug}:${offer.demandKey}`}>{itemUrl ? <a className="smart-buy-offer-name" href={itemUrl} target="_blank" rel="noreferrer" title={text.openItem}>{itemName(offer.itemId)} ↗</a> : <span className="smart-buy-offer-name">{itemName(offer.itemId)}</span>}<span>{text.canSell} <strong>{offer.fillableQuantity}</strong> {text.of} {wanted?.quantity ?? offer.requestedQuantity}</span><span>{text.price} <strong>{plat(offer.unitPrice)}</strong></span><span className={offer.premiumPct != null && offer.premiumPct <= 0 ? 'positive' : offer.premiumPct != null && offer.premiumPct > 10 ? 'negative' : 'neutral'}>{percent(offer.premiumPct)} {text.premium}</span></div>
          })}</div>
          <a className="smart-buy-open" href={wfmProfileUrl(locale, seller.user.slug)} target="_blank" rel="noreferrer">{text.openProfile} ↗</a>
        </article>)}</div>}
      </>}
    </> : null}
  </section>
}
