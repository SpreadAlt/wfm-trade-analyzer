import { useEffect, useMemo, useState } from 'react'
import { fetchSmartBuy } from './api'
import type { SmartBuyResponse, SmartBuySeller, SmartBuySellerOffer, SmartBuyWishlistRow } from './api'
import type { FrameAccountController } from './Account'
import { ItemIcon } from './MarketVisuals'
import type { CatalogItem } from './types'
import type { Locale } from './i18n'
import './smartBuy.css'

const ONLINE = new Set(['online', 'ingame'])
const CHAT_LIMIT = 300

type LimitValue = 'any' | '0' | '5' | '10' | '20' | '50'

const textFor = (locale: Locale) => locale === 'ru' ? {
  eyebrow: 'Warframe Market',
  title: 'Умная покупка',
  description: 'Привяжите профиль Warframe Market, затем запускайте Smart Buy вручную. FrameAnalytics найдёт продавцов, которые могут закрыть несколько нужных позиций.',
  profileLabel: 'Ссылка на профиль',
  profilePlaceholder: 'https://warframe.market/profile/имя',
  link: 'Привязать профиль',
  unlink: 'Отвязать',
  run: 'Запустить Smart Buy',
  loading: 'Собираем заявки и предложения продавцов…',
  noOrders: 'У этого профиля нет видимых заявок на покупку.',
  loadError: 'Не удалось собрать данные Smart Buy.',
  wishlist: 'Что вы хотите купить',
  sellers: 'Продавцы, которые закрывают ваши покупки',
  wanted: 'Нужно',
  myPrice: 'Моя цена',
  marketMin: 'Мин. рынка',
  onlineMin: 'Мин. онлайн',
  gap: 'Отклонение',
  sellerCount: 'Продавцы',
  myGapFilter: 'Моя цена от минимума',
  sellerPremiumFilter: 'Цена продавца от минимума',
  onlineOnly: 'Только онлайн',
  any: 'Любое',
  minimumOnly: 'Только минимум',
  upTo: (value: string) => `не более ${value}%`,
  positions: 'позиций',
  units: 'шт.',
  full: 'полностью',
  estimated: 'примерно',
  openProfile: 'Профиль продавца',
  canSell: 'может продать',
  of: 'из',
  requested: 'нужно',
  price: 'цена',
  premium: 'к минимуму',
  online: 'онлайн',
  ingame: 'в игре',
  offline: 'офлайн',
  updated: 'Обновлено',
  filteredEmpty: 'По выбранным фильтрам подходящих покупок нет.',
  sellersEmpty: 'По выбранным фильтрам подходящих продавцов нет.',
  multiHint: 'Выше находятся продавцы, которые могут закрыть больше разных позиций и нужного количества.',
  signedAbove: 'выше минимума',
  signedBelow: 'ниже минимума',
  exact: 'на уровне минимума',
  remaining: 'запусков осталось',
  cooldown: 'Повторный запуск через',
  seconds: 'сек.',
  signIn: 'Для Smart Buy нужен аккаунт FrameAnalytics.',
  linkFirst: 'Сначала привяжите профиль Warframe Market.',
  copy: 'Копировать сообщение',
  copied: 'Скопировано',
  chatHint: 'Сообщение всегда на английском, до 300 символов. Общая цена указана после списка предметов.'
} : {
  eyebrow: 'Warframe Market',
  title: 'Smart Buy',
  description: 'Link a Warframe Market profile, then start Smart Buy manually. FrameAnalytics finds sellers who can cover several wanted positions.',
  profileLabel: 'Profile link',
  profilePlaceholder: 'https://warframe.market/profile/name',
  link: 'Link profile',
  unlink: 'Unlink',
  run: 'Run Smart Buy',
  loading: 'Collecting wanted orders and seller offers…',
  noOrders: 'This profile has no visible buy orders.',
  loadError: 'Could not load Smart Buy data.',
  wishlist: 'What you want to buy',
  sellers: 'Sellers covering your purchases',
  wanted: 'Wanted',
  myPrice: 'My price',
  marketMin: 'Market min',
  onlineMin: 'Online min',
  gap: 'Difference',
  sellerCount: 'Sellers',
  myGapFilter: 'My price vs minimum',
  sellerPremiumFilter: 'Seller price vs minimum',
  onlineOnly: 'Online only',
  any: 'Any',
  minimumOnly: 'Minimum only',
  upTo: (value: string) => `up to ${value}%`,
  positions: 'positions',
  units: 'units',
  full: 'full',
  estimated: 'est.',
  openProfile: 'Seller profile',
  canSell: 'can sell',
  of: 'of',
  requested: 'wanted',
  price: 'price',
  premium: 'vs minimum',
  online: 'online',
  ingame: 'in game',
  offline: 'offline',
  updated: 'Updated',
  filteredEmpty: 'No wanted items match these filters.',
  sellersEmpty: 'No sellers match these filters.',
  multiHint: 'Sellers covering more distinct positions and requested quantity are ranked first.',
  signedAbove: 'above minimum',
  signedBelow: 'below minimum',
  exact: 'at minimum',
  remaining: 'runs remaining',
  cooldown: 'Available again in',
  seconds: 'sec.',
  signIn: 'A FrameAnalytics account is required for Smart Buy.',
  linkFirst: 'Link your Warframe Market profile first.',
  copy: 'Copy message',
  copied: 'Copied',
  chatHint: 'The message is always English, up to 300 characters. The total platinum price comes after the item list.'
}

const numberText = (value: number | null | undefined, digits = 1) => value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits).replace(/\.0$/, '')
const plat = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${numberText(value, 2)}p`
const percent = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${numberText(value, 1)}%`
const limitNumber = (value: LimitValue): number | null => value === 'any' ? null : Number(value)
const statusClass = (status: string) => ONLINE.has(status) ? 'online' : 'offline'

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

const offerForDemand = (offers: SmartBuySellerOffer[], demandKey: string) => offers.find(offer => offer.demandKey === demandKey) || null

type RankedSeller = {
  seller: SmartBuySeller
  offers: SmartBuySellerOffer[]
  positionsCovered: number
  fullPositions: number
  unitsCovered: number
  totalRequestedUnits: number
  estimatedCost: number
}

const compactPlat = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')

export const SmartBuyPanel = ({ locale, catalog, auth }: {
  locale: Locale
  catalog: Map<string, CatalogItem>
  auth: FrameAccountController
}) => {
  const text = textFor(locale)
  const linkedProfile = auth.account?.profile.wfmProfile || ''
  const [profileInput, setProfileInput] = useState(linkedProfile)
  const [data, setData] = useState<SmartBuyResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [profileBusy, setProfileBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [myGap, setMyGap] = useState<LimitValue>('any')
  const [sellerPremium, setSellerPremium] = useState<LimitValue>('10')
  const [onlineOnly, setOnlineOnly] = useState(true)
  const [clock, setClock] = useState(Date.now())
  const [copiedSeller, setCopiedSeller] = useState<string | null>(null)

  useEffect(() => { setProfileInput(linkedProfile) }, [linkedProfile])

  const lastRunMs = Date.parse(auth.account?.smartBuy.lastRunAt || '')
  const cooldownRemaining = Number.isFinite(lastRunMs)
    ? Math.max(0, Math.ceil((lastRunMs + (auth.account?.smartBuy.cooldownSeconds || 60) * 1000 - clock) / 1000))
    : 0

  useEffect(() => {
    if (!cooldownRemaining) return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [cooldownRemaining])

  const canRun = Boolean(auth.account && linkedProfile && !loading && !auth.busy && (auth.account.smartBuy.remaining > 0) && cooldownRemaining <= 0)

  const filteredWishlist = useMemo(() => {
    const maxGap = limitNumber(myGap)
    return (data?.wishlist || []).filter(row => maxGap == null || (row.absoluteGapPct != null && row.absoluteGapPct <= maxGap))
  }, [data, myGap])

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
      for (const wishlist of filteredWishlist) {
        totalRequestedUnits += wishlist.quantity
        const offer = offerForDemand(offers, wishlist.demandKey)
        if (!offer) continue
        unitsCovered += Math.min(wishlist.quantity, offer.fillableQuantity)
        if (offer.fillableQuantity >= wishlist.quantity) fullPositions++
        estimatedCost += offer.estimatedCost || 0
      }
      return [{ seller, offers, positionsCovered: offers.length, fullPositions, unitsCovered, totalRequestedUnits, estimatedCost }]
    }).sort((left, right) =>
      right.positionsCovered - left.positionsCovered ||
      right.fullPositions - left.fullPositions ||
      right.unitsCovered - left.unitsCovered ||
      left.estimatedCost - right.estimatedCost ||
      left.seller.user.ingameName.localeCompare(right.seller.user.ingameName)
    )
  }, [data, filteredWishlist, onlineOnly, sellerPremium])

  const itemFor = (itemId: string) => catalog.get(itemId)
  const itemName = (itemId: string) => itemFor(itemId)?.name || itemFor(itemId)?.englishName || itemId
  const englishItemName = (itemId: string) => itemFor(itemId)?.englishName || itemFor(itemId)?.name || itemId
  const gapTitle = (value: number | null) => value == null ? '' : value > 0 ? text.signedAbove : value < 0 ? text.signedBelow : text.exact
  const statusLabel = (status: string) => status === 'ingame' ? text.ingame : status === 'online' ? text.online : text.offline

  const saveProfile = async () => {
    const value = profileInput.trim()
    if (!value || !auth.account) return
    setProfileBusy(true)
    setError(null)
    try {
      await auth.linkWfmProfile(value)
      setData(null)
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    } finally {
      setProfileBusy(false)
    }
  }

  const unlink = async () => {
    if (!auth.account) return
    setProfileBusy(true)
    setError(null)
    try {
      await auth.unlinkWfmProfile()
      setProfileInput('')
      setData(null)
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    } finally {
      setProfileBusy(false)
    }
  }

  const runSmartBuy = async () => {
    if (!canRun || !linkedProfile) return
    setLoading(true)
    setError(null)
    setClock(Date.now())
    const controller = new AbortController()
    try {
      await auth.reserveSmartBuy()
      setClock(Date.now())
      const result = await fetchSmartBuy(linkedProfile, controller.signal)
      setData(result)
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    } finally {
      setLoading(false)
    }
  }

  const buildChatMessage = (seller: SmartBuySeller, offers: SmartBuySellerOffer[]) => {
    const prefix = `/w ${seller.user.ingameName} Hi! I want to buy `
    const suffix = (total: number) => ` for ${compactPlat(total)}p total.`
    const parts: string[] = []
    let total = 0

    for (const offer of offers) {
      const qty = Math.max(1, offer.fillableQuantity || 1)
      const part = `${qty}x [${englishItemName(offer.itemId)}]`
      const nextTotal = total + Math.max(0, offer.estimatedCost || 0)
      const candidate = `${prefix}${[...parts, part].join(', ')}${suffix(nextTotal)}`
      if (candidate.length > CHAT_LIMIT) break
      parts.push(part)
      total = nextTotal
    }

    if (!parts.length && offers.length) {
      const offer = offers[0]
      const qty = Math.max(1, offer.fillableQuantity || 1)
      const totalCost = Math.max(0, offer.estimatedCost || 0)
      const rawName = englishItemName(offer.itemId)
      const reserved = prefix.length + `${qty}x []${suffix(totalCost)}`.length
      const maxName = Math.max(8, CHAT_LIMIT - reserved)
      parts.push(`${qty}x [${rawName.slice(0, maxName)}]`)
      total = totalCost
    }

    return `${prefix}${parts.join(', ')}${suffix(total)}`.slice(0, CHAT_LIMIT)
  }

  const copySellerMessage = async (seller: SmartBuySeller, offers: SmartBuySellerOffer[]) => {
    const message = buildChatMessage(seller, offers)
    await navigator.clipboard.writeText(message)
    const key = seller.user.id || seller.user.slug
    setCopiedSeller(key)
    window.setTimeout(() => setCopiedSeller(current => current === key ? null : current), 1600)
  }

  return <section className="panel smart-buy-panel">
    <div className="smart-buy-heading">
      <div><span className="eyebrow">{text.eyebrow}</span><h2>{text.title}</h2><p>{text.description}</p></div>
      {data?.profile ? <a className="smart-buy-profile-chip" href={data.profile.profileUrl} target="_blank" rel="noreferrer"><i className={statusClass(data.profile.status)}/><span><strong>{data.profile.ingameName}</strong><small>{data.profile.platform}{data.profile.crossplay ? ' · crossplay' : ''} · {statusLabel(data.profile.status)}</small></span></a> : linkedProfile ? <a className="smart-buy-profile-chip" href={`https://warframe.market/profile/${encodeURIComponent(linkedProfile)}`} target="_blank" rel="noreferrer"><span><strong>{linkedProfile}</strong><small>warframe.market</small></span></a> : null}
    </div>

    {!auth.account ? <div className="smart-buy-state compact"><strong>{text.signIn}</strong></div> : <>
      <div className="smart-buy-link-row">
        <label><span>{text.profileLabel}</span><input type="url" value={profileInput} placeholder={text.profilePlaceholder} onChange={event => setProfileInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void saveProfile() } }}/></label>
        {!linkedProfile || profileInput.trim() !== linkedProfile ? <button type="button" className="primary-action" disabled={!profileInput.trim() || profileBusy || auth.busy} onClick={() => void saveProfile()}>{text.link}</button> : null}
        {linkedProfile ? <button type="button" className="smart-buy-secondary danger" onClick={() => void unlink()} disabled={profileBusy || loading}>{text.unlink}</button> : null}
      </div>

      <div className="smart-buy-runbar">
        <button type="button" className="primary-action smart-buy-run" disabled={!canRun} onClick={() => void runSmartBuy()}>{loading ? text.loading : text.run}</button>
        <div className="smart-buy-quota">
          <strong>{auth.account.smartBuy.remaining}/{auth.account.smartBuy.limit}</strong>
          <span>{text.remaining}</span>
          {cooldownRemaining > 0 ? <small>{text.cooldown} {cooldownRemaining} {text.seconds}</small> : null}
        </div>
      </div>
      {!linkedProfile ? <div className="smart-buy-state compact"><strong>{text.linkFirst}</strong></div> : null}
    </>}

    {loading ? <div className="smart-buy-state"><div className="spinner"/><strong>{text.loading}</strong></div> : error ? <div className="smart-buy-state error-state"><strong>{text.loadError}</strong><small>{error}</small></div> : data ? <>
      <div className="smart-buy-filters">
        <label><span>{text.myGapFilter}</span><select value={myGap} onChange={event => setMyGap(event.target.value as LimitValue)}><option value="any">{text.any}</option><option value="5">{text.upTo('5')}</option><option value="10">{text.upTo('10')}</option><option value="20">{text.upTo('20')}</option><option value="50">{text.upTo('50')}</option></select></label>
        <label><span>{text.sellerPremiumFilter}</span><select value={sellerPremium} onChange={event => setSellerPremium(event.target.value as LimitValue)}><option value="0">{text.minimumOnly}</option><option value="5">+{text.upTo('5')}</option><option value="10">+{text.upTo('10')}</option><option value="20">+{text.upTo('20')}</option><option value="50">+{text.upTo('50')}</option><option value="any">{text.any}</option></select></label>
        <label className="smart-buy-check"><input type="checkbox" checked={onlineOnly} onChange={event => setOnlineOnly(event.target.checked)}/><span>{text.onlineOnly}</span></label>
        <div className="smart-buy-generated"><span>{text.updated}</span><strong>{new Date(data.generatedAt).toLocaleString()}</strong></div>
      </div>

      {!data.wishlist.length ? <div className="smart-buy-state"><strong>{text.noOrders}</strong></div> : <>
        <div className="smart-buy-subheading"><div><span className="eyebrow">{text.wishlist}</span><strong>{filteredWishlist.length}/{data.wishlist.length}</strong></div></div>
        {!filteredWishlist.length ? <div className="smart-buy-state compact"><strong>{text.filteredEmpty}</strong></div> : <div className="smart-buy-wishlist-grid">{filteredWishlist.map(row => {
          const item = itemFor(row.itemId)
          const dims = dimensionText(row, locale)
          const onlineMin = (row as SmartBuyWishlistRow & { onlineMinUnitPrice?: number | null }).onlineMinUnitPrice
          return <article key={row.demandKey} className="smart-buy-wanted-card">
            <div className="smart-buy-item"><ItemIcon item={item} name={itemName(row.itemId)}/><div><strong>{itemName(row.itemId)}</strong><small>{dims || row.itemId}</small></div></div>
            <div className="smart-buy-values"><span><small>{text.wanted}</small><strong>{row.quantity}</strong></span><span><small>{text.myPrice}</small><strong>{plat(row.wantedUnitPrice)}</strong></span><span><small>{text.marketMin}</small><strong>{plat(row.marketMinUnitPrice)}</strong></span>{onlineMin != null ? <span><small>{text.onlineMin}</small><strong>{plat(onlineMin)}</strong></span> : null}<span title={gapTitle(row.gapPct)} className={row.gapPct == null ? 'neutral' : row.gapPct > 0 ? 'negative' : row.gapPct < 0 ? 'positive' : 'neutral'}><small>{text.gap}</small><strong>{percent(row.gapPct)}</strong></span><span><small>{text.sellerCount}</small><strong>{row.onlineSellers}/{row.sellers}</strong></span></div>
          </article>
        })}</div>}

        <div className="smart-buy-subheading seller-heading"><div><span className="eyebrow">{text.sellers}</span><strong>{rankedSellers.length}</strong></div><p>{text.multiHint}</p></div>
        {!rankedSellers.length ? <div className="smart-buy-state compact"><strong>{text.sellersEmpty}</strong></div> : <div className="smart-buy-sellers">{rankedSellers.slice(0, 30).map(({ seller, offers, positionsCovered, fullPositions, unitsCovered, totalRequestedUnits, estimatedCost }) => {
          const sellerKey = seller.user.id || seller.user.slug
          return <article className={`smart-buy-seller ${positionsCovered > 1 ? 'multi' : ''}`} key={sellerKey}>
            <header><a href={seller.user.profileUrl} target="_blank" rel="noreferrer"><i className={statusClass(seller.user.status)}/><span><strong>{seller.user.ingameName}</strong><small>{statusLabel(seller.user.status)} · rep {seller.user.reputation}</small></span></a><div className="smart-buy-coverage"><strong>{positionsCovered}/{filteredWishlist.length}</strong><span>{text.positions}</span><small>{fullPositions} {text.full} · {unitsCovered}/{totalRequestedUnits} {text.units}</small></div><div className="smart-buy-cost"><small>{text.estimated}</small><strong>{plat(estimatedCost)}</strong></div></header>
            <div className="smart-buy-offers">{offers.map(offer => { const wanted = filteredWishlist.find(row => row.demandKey === offer.demandKey); return <div className="smart-buy-offer" key={`${seller.user.slug}:${offer.demandKey}`}><span className="smart-buy-offer-name">{itemName(offer.itemId)}</span><span>{text.canSell} <strong>{offer.fillableQuantity}</strong> {text.of} {wanted?.quantity ?? offer.requestedQuantity}</span><span>{text.price} <strong>{plat(offer.unitPrice)}</strong></span><span className={offer.premiumPct != null && offer.premiumPct <= 0 ? 'positive' : offer.premiumPct != null && offer.premiumPct > 10 ? 'negative' : 'neutral'}>{percent(offer.premiumPct)} {text.premium}</span></div> })}</div>
            <div className="smart-buy-seller-actions">
              <button type="button" className="primary-action smart-buy-copy" onClick={() => void copySellerMessage(seller, offers)}>{copiedSeller === sellerKey ? text.copied : text.copy}</button>
              <a className="smart-buy-open" href={seller.user.profileUrl} target="_blank" rel="noreferrer">{text.openProfile} ↗</a>
            </div>
            <small className="smart-buy-chat-hint">{text.chatHint}</small>
          </article>
        } )}</div>}
      </>}
    </> : null}
  </section>
}
