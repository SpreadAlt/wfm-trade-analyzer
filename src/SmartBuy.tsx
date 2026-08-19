import { useEffect, useMemo, useState } from 'react'
import { waitForSmartBuy } from './api'
import type { SmartBuyJobStatus, SmartBuyResponse, SmartBuySeller, SmartBuySellerOffer, SmartBuyWishlistRow } from './api'
import { ItemIcon } from './MarketVisuals'
import type { CatalogItem } from './types'
import type { Locale } from './i18n'
import './smartBuy.css'

const STORAGE_KEY = 'frameanalytics-wfm-profile-v1'
const ONLINE = new Set(['online', 'ingame'])
const CHAT_SAFE_LIMIT = 180
const CHAT_DISCLAIMER = '(warframe.market via FrameAnalytics)'
const CHAT_PART_RESERVE = 8

type LimitValue = 'any' | '0' | '5' | '10' | '20' | '50'

const textFor = (locale: Locale) => locale === 'ru' ? {
  eyebrow: 'Warframe Market',
  title: 'Умная покупка',
  description: 'Привяжите публичный профиль Warframe Market. FrameAnalytics найдёт ваши видимые заявки на покупку и продавцов, которые могут закрыть сразу несколько позиций.',
  profileLabel: 'Ссылка на профиль',
  profilePlaceholder: 'https://warframe.market/profile/имя',
  link: 'Привязать и проверить',
  refresh: 'Обновить предложения',
  unlink: 'Отвязать',
  publicOnly: 'Используются только публичные видимые buy-ордера. Скрытые заявки без авторизации Warframe Market недоступны.',
  loading: 'Собираем заявки и предложения продавцов…',
  queued: 'Запрос поставлен в очередь',
  queuePosition: (value: number) => `Позиция в очереди: ${value}`,
  queueNext: 'Следующий запрос в очереди',
  processing: 'Ищем продавцов',
  progress: (done: number, total: number) => `Обработано ${done} из ${total} предметов`,
  batch: (slot: number, size: number) => `Пакет: ${slot} из ${size}`,
  retrying: 'Warframe Market временно занят — повторяем запрос',
  noOrders: 'У этого профиля нет видимых заявок на покупку.',
  loadError: 'Не удалось собрать данные умной покупки.',
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
  chatMessage: 'Сообщение в игровой чат',
  hideChatMessage: 'Скрыть сообщение',
  copyMessage: 'Копировать',
  copiedMessage: 'Скопировано',
  chatPart: (part: number, total: number) => `Сообщение ${part}/${total}`,
  chatHint: 'FrameAnalytics только формирует текст. Вставьте и отправьте его в игре вручную.',
  chatDisclaimer: 'В конце каждого сообщения автоматически добавляется пометка warframe.market via FrameAnalytics.',
  chatLimit: (length: number) => `${length}/${CHAT_SAFE_LIMIT} символов`,
  canSell: 'может продать',
  of: 'из',
  requested: 'нужно',
  price: 'цена',
  premium: 'к минимуму',
  online: 'онлайн',
  ingame: 'в игре',
  offline: 'офлайн',
  updated: 'Обновлено',
  truncated: 'Для одного запуска обработаны первые 100 рыночных серий.',
  filteredEmpty: 'По выбранным фильтрам подходящих покупок нет.',
  sellersEmpty: 'По выбранным фильтрам подходящих продавцов нет.',
  multiHint: 'Выше находятся продавцы, которые могут закрыть больше разных позиций и нужного количества.',
  signedAbove: 'выше минимума',
  signedBelow: 'ниже минимума',
  exact: 'на уровне минимума',
  cached: 'Рыночные ответы кратковременно кэшируются, чтобы не создавать лишнюю нагрузку на Warframe Market.'
} : {
  eyebrow: 'Warframe Market',
  title: 'Smart Buy',
  description: 'Link a public Warframe Market profile. FrameAnalytics finds your visible buy orders and sellers who can cover several wanted positions at once.',
  profileLabel: 'Profile link',
  profilePlaceholder: 'https://warframe.market/profile/name',
  link: 'Link and check',
  refresh: 'Refresh offers',
  unlink: 'Unlink',
  publicOnly: 'Only public visible buy orders are used. Hidden orders require Warframe Market authentication and are not available here.',
  loading: 'Collecting wanted orders and seller offers…',
  queued: 'Request is queued',
  queuePosition: (value: number) => `Queue position: ${value}`,
  queueNext: 'Next request in queue',
  processing: 'Finding sellers',
  progress: (done: number, total: number) => `Processed ${done} of ${total} items`,
  batch: (slot: number, size: number) => `Batch: ${slot} of ${size}`,
  retrying: 'Warframe Market is temporarily busy — retrying',
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
  chatMessage: 'In-game chat message',
  hideChatMessage: 'Hide message',
  copyMessage: 'Copy',
  copiedMessage: 'Copied',
  chatPart: (part: number, total: number) => `Message ${part}/${total}`,
  chatHint: 'FrameAnalytics only generates the text. Paste and send it manually in game.',
  chatDisclaimer: 'Each message automatically ends with the warframe.market via FrameAnalytics disclosure.',
  chatLimit: (length: number) => `${length}/${CHAT_SAFE_LIMIT} characters`,
  canSell: 'can sell',
  of: 'of',
  requested: 'wanted',
  price: 'price',
  premium: 'vs minimum',
  online: 'online',
  ingame: 'in game',
  offline: 'offline',
  updated: 'Updated',
  truncated: 'Only the first 100 market series were processed for this run.',
  filteredEmpty: 'No wanted items match these filters.',
  sellersEmpty: 'No sellers match these filters.',
  multiHint: 'Sellers covering more distinct positions and requested quantity are ranked first.',
  signedAbove: 'above minimum',
  signedBelow: 'below minimum',
  exact: 'at minimum',
  cached: 'Market responses are briefly cached to avoid unnecessary load on Warframe Market.'
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

const compactDimensions = (offer: SmartBuySellerOffer) => {
  const d = offer.dimensions || {}
  const parts: string[] = []
  if (d.rank != null) parts.push(`r${d.rank}`)
  if (d.subtype != null) parts.push(String(d.subtype))
  if (d.charges != null) parts.push(`ch${d.charges}`)
  if (d.amberStars != null) parts.push(`A${d.amberStars}`)
  if (d.cyanStars != null) parts.push(`C${d.cyanStars}`)
  return parts.length ? ` (${parts.join('/')})` : ''
}

const chatOfferText = (offer: SmartBuySellerOffer, itemName: (itemId: string) => string) => {
  const quantity = Math.max(1, offer.fillableQuantity || 1)
  const unitPrice = numberText(offer.unitPrice, 2)
  return `${quantity}x [${itemName(offer.itemId)}]${compactDimensions(offer)} @${unitPrice}p`
}

const buildChatMessages = (sellerName: string, offers: SmartBuySellerOffer[], itemName: (itemId: string) => string) => {
  const prefix = `/w ${sellerName} Hi! I want to buy `
  const suffix = ` ${CHAT_DISCLAIMER}`
  const payloadLimit = CHAT_SAFE_LIMIT - CHAT_PART_RESERVE
  const parts: string[][] = []
  let current: string[] = []

  for (const offer of offers) {
    const piece = chatOfferText(offer, itemName)
    const candidate = `${prefix}${[...current, piece].join(', ')}${suffix}`
    if (current.length && candidate.length > payloadLimit) {
      parts.push(current)
      current = [piece]
    } else {
      current.push(piece)
    }
  }
  if (current.length) parts.push(current)

  const total = parts.length
  return parts.map((part, index) => {
    const marker = total > 1 ? ` [${index + 1}/${total}]` : ''
    let message = `${prefix}${part.join(', ')}${marker}${suffix}`
    // A single exceptionally long item name should never make an invalid copy.
    // Fall back to a compact non-linked name while preserving seller, price and disclosure.
    if (message.length > CHAT_SAFE_LIMIT && part.length === 1) {
      const offer = offers.find(value => chatOfferText(value, itemName) === part[0])
      if (offer) {
        const quantity = Math.max(1, offer.fillableQuantity || 1)
        const dimensions = compactDimensions(offer)
        const price = ` @${numberText(offer.unitPrice, 2)}p`
        const fixedLength = prefix.length + `${quantity}x `.length + dimensions.length + price.length + marker.length + suffix.length
        const nameLimit = Math.max(8, CHAT_SAFE_LIMIT - fixedLength)
        const sourceName = itemName(offer.itemId)
        const compactName = sourceName.length > nameLimit ? `${sourceName.slice(0, Math.max(1, nameLimit - 1))}…` : sourceName
        message = `${prefix}${quantity}x ${compactName}${dimensions}${price}${marker}${suffix}`
      }
    }
    return message
  })
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
}

export const SmartBuyPanel = ({ locale, catalog }: { locale: Locale; catalog: Map<string, CatalogItem> }) => {
  const text = textFor(locale)
  const [profileInput, setProfileInput] = useState(profileFromStorage)
  const [linkedProfile, setLinkedProfile] = useState(profileFromStorage)
  const [data, setData] = useState<SmartBuyResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [jobStatus, setJobStatus] = useState<SmartBuyJobStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [myGap, setMyGap] = useState<LimitValue>('any')
  const [sellerPremium, setSellerPremium] = useState<LimitValue>('10')
  const [onlineOnly, setOnlineOnly] = useState(true)
  const [openChatSeller, setOpenChatSeller] = useState<string | null>(null)
  const [copiedChatKey, setCopiedChatKey] = useState<string | null>(null)

  useEffect(() => {
    if (!linkedProfile) {
      setData(null)
      setJobStatus(null)
      setError(null)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setData(null)
    setJobStatus(null)
    setError(null)

    waitForSmartBuy(linkedProfile, setJobStatus, controller.signal)
      .then(setData)
      .catch(value => {
        if (!controller.signal.aborted) {
          setError(value instanceof Error ? value.message : String(value))
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [linkedProfile, reload])


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
    setJobStatus(null)
    setError(null)
  }

  const statusLabel = (status: string) => status === 'ingame' ? text.ingame : status === 'online' ? text.online : text.offline
  const itemFor = (itemId: string) => catalog.get(itemId)
  const itemName = (itemId: string) => itemFor(itemId)?.name || itemFor(itemId)?.englishName || itemId
  const gapTitle = (value: number | null) => value == null ? '' : value > 0 ? text.signedAbove : value < 0 ? text.signedBelow : text.exact
  const copyChatMessage = async (message: string, key: string) => {
    try {
      await navigator.clipboard.writeText(message)
      setCopiedChatKey(key)
      window.setTimeout(() => setCopiedChatKey(current => current === key ? null : current), 1600)
    } catch {
      const area = document.createElement('textarea')
      area.value = message
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      area.remove()
      setCopiedChatKey(key)
      window.setTimeout(() => setCopiedChatKey(current => current === key ? null : current), 1600)
    }
  }

  return <section className="panel smart-buy-panel">
    <div className="smart-buy-heading">
      <div><span className="eyebrow">{text.eyebrow}</span><h2>{text.title}</h2><p>{text.description}</p></div>
      {data?.profile ? <a className="smart-buy-profile-chip" href={data.profile.profileUrl} target="_blank" rel="noreferrer"><i className={statusClass(data.profile.status)}/><span><strong>{data.profile.ingameName}</strong><small>{data.profile.platform}{data.profile.crossplay ? ' · crossplay' : ''} · {statusLabel(data.profile.status)}</small></span></a> : null}
    </div>

    <div className="smart-buy-link-row">
      <label><span>{text.profileLabel}</span><input type="url" value={profileInput} placeholder={text.profilePlaceholder} onChange={event => setProfileInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); saveProfile() } }}/></label>
      <button type="button" className="primary-action" disabled={!profileInput.trim() || loading} onClick={saveProfile}>{linkedProfile ? text.refresh : text.link}</button>
      {linkedProfile ? <button type="button" className="smart-buy-secondary" onClick={() => setReload(value => value + 1)} disabled={loading}>{text.refresh}</button> : null}
      {linkedProfile ? <button type="button" className="smart-buy-secondary danger" onClick={unlink}>{text.unlink}</button> : null}
    </div>
    <p className="smart-buy-note">{text.publicOnly} {text.cached}</p>

    {loading ? <div className="smart-buy-state smart-buy-queue-state">
      <div className="spinner"/>
      <strong>
        {jobStatus?.state === 'queued'
          ? text.queued
          : jobStatus?.state === 'retrying'
            ? text.retrying
            : text.processing}
      </strong>
      {jobStatus?.state === 'queued' ? <div className="smart-buy-position">
        <b>{jobStatus.queue.position === 1 ? text.queueNext : jobStatus.queue.position ? text.queuePosition(jobStatus.queue.position) : text.queued}</b>
        {jobStatus.queue.waitingAhead != null ? <small>{jobStatus.queue.waitingAhead} {locale === 'ru' ? 'запросов впереди' : 'requests ahead'}</small> : null}
      </div> : null}
      {jobStatus?.progress.total != null ? <div className="smart-buy-progress-wrap">
        <div className="smart-buy-progress"><i style={{ width: `${Math.max(0, Math.min(100, jobStatus.progress.percent || 0))}%` }}/></div>
        <small>{text.progress(jobStatus.progress.processed, jobStatus.progress.total)}</small>
      </div> : <small>{text.loading}</small>}
      {jobStatus?.batch ? <small>{text.batch(jobStatus.batch.slot, jobStatus.batch.size)}</small> : null}
    </div> : error ? <div className="smart-buy-state error-state"><strong>{text.loadError}</strong><small>{error}</small><button type="button" className="retry-button" onClick={() => setReload(value => value + 1)}>{text.refresh}</button></div> : data ? <>
      <div className="smart-buy-filters">
        <label><span>{text.myGapFilter}</span><select value={myGap} onChange={event => setMyGap(event.target.value as LimitValue)}><option value="any">{text.any}</option><option value="5">{text.upTo('5')}</option><option value="10">{text.upTo('10')}</option><option value="20">{text.upTo('20')}</option><option value="50">{text.upTo('50')}</option></select></label>
        <label><span>{text.sellerPremiumFilter}</span><select value={sellerPremium} onChange={event => setSellerPremium(event.target.value as LimitValue)}><option value="0">{text.minimumOnly}</option><option value="5">+{text.upTo('5')}</option><option value="10">+{text.upTo('10')}</option><option value="20">+{text.upTo('20')}</option><option value="50">+{text.upTo('50')}</option><option value="any">{text.any}</option></select></label>
        <label className="smart-buy-check"><input type="checkbox" checked={onlineOnly} onChange={event => setOnlineOnly(event.target.checked)}/><span>{text.onlineOnly}</span></label>
        <div className="smart-buy-generated"><span>{text.updated}</span><strong>{new Date(data.generatedAt).toLocaleString()}</strong></div>
      </div>

      {data.truncated ? <div className="smart-buy-warning">{text.truncated}</div> : null}
      {!data.wishlist.length ? <div className="smart-buy-state"><strong>{text.noOrders}</strong></div> : <>
        <div className="smart-buy-subheading"><div><span className="eyebrow">{text.wishlist}</span><strong>{filteredWishlist.length}/{data.wishlist.length}</strong></div></div>
        {!filteredWishlist.length ? <div className="smart-buy-state compact"><strong>{text.filteredEmpty}</strong></div> : <div className="smart-buy-wishlist-grid">{filteredWishlist.map(row => {
          const item = itemFor(row.itemId)
          const dims = dimensionText(row, locale)
          return <article key={row.demandKey} className="smart-buy-wanted-card">
            <div className="smart-buy-item"><ItemIcon item={item} name={itemName(row.itemId)}/><div><strong>{itemName(row.itemId)}</strong><small>{dims || row.itemId}</small></div></div>
            <div className="smart-buy-values"><span><small>{text.wanted}</small><strong>{row.quantity}</strong></span><span><small>{text.myPrice}</small><strong>{plat(row.wantedUnitPrice)}</strong></span><span><small>{text.marketMin}</small><strong>{plat(row.marketMinUnitPrice)}</strong></span><span><small>{text.onlineMin}</small><strong>{plat(row.onlineMinUnitPrice)}</strong></span><span title={gapTitle(row.gapPct)} className={row.gapPct == null ? 'neutral' : row.gapPct > 0 ? 'negative' : row.gapPct < 0 ? 'positive' : 'neutral'}><small>{text.gap}</small><strong>{percent(row.gapPct)}</strong></span><span><small>{text.sellerCount}</small><strong>{row.onlineSellers}/{row.sellers}</strong></span></div>
          </article>
        })}</div>}

        <div className="smart-buy-subheading seller-heading"><div><span className="eyebrow">{text.sellers}</span><strong>{rankedSellers.length}</strong></div><p>{text.multiHint}</p></div>
        {!rankedSellers.length ? <div className="smart-buy-state compact"><strong>{text.sellersEmpty}</strong></div> : <div className="smart-buy-sellers">{rankedSellers.slice(0, 30).map(({ seller, offers, positionsCovered, fullPositions, unitsCovered, totalRequestedUnits, estimatedCost }) => {
          const sellerKey = seller.user.id || seller.user.slug
          const chatMessages = buildChatMessages(seller.user.ingameName, offers, itemName)
          const chatOpen = openChatSeller === sellerKey
          return <article className={`smart-buy-seller ${positionsCovered > 1 ? 'multi' : ''}`} key={sellerKey}>
            <header><a href={seller.user.profileUrl} target="_blank" rel="noreferrer"><i className={statusClass(seller.user.status)}/><span><strong>{seller.user.ingameName}</strong><small>{statusLabel(seller.user.status)} · rep {seller.user.reputation}</small></span></a><div className="smart-buy-coverage"><strong>{positionsCovered}/{filteredWishlist.length}</strong><span>{text.positions}</span><small>{fullPositions} {text.full} · {unitsCovered}/{totalRequestedUnits} {text.units}</small></div><div className="smart-buy-cost"><small>{text.estimated}</small><strong>{plat(estimatedCost)}</strong></div></header>
            <div className="smart-buy-offers">{offers.map(offer => { const wanted = filteredWishlist.find(row => row.demandKey === offer.demandKey); return <div className="smart-buy-offer" key={`${seller.user.slug}:${offer.demandKey}`}><span className="smart-buy-offer-name">{itemName(offer.itemId)}</span><span>{text.canSell} <strong>{offer.fillableQuantity}</strong> {text.of} {wanted?.quantity ?? offer.requestedQuantity}</span><span>{text.price} <strong>{plat(offer.unitPrice)}</strong></span><span className={offer.premiumPct != null && offer.premiumPct <= 0 ? 'positive' : offer.premiumPct != null && offer.premiumPct > 10 ? 'negative' : 'neutral'}>{percent(offer.premiumPct)} {text.premium}</span></div> })}</div>
            <div className="smart-buy-seller-actions"><a className="smart-buy-open" href={seller.user.profileUrl} target="_blank" rel="noreferrer">{text.openProfile} ↗</a><button type="button" className="smart-buy-chat-toggle" onClick={() => setOpenChatSeller(current => current === sellerKey ? null : sellerKey)}>{chatOpen ? text.hideChatMessage : `${text.chatMessage}${chatMessages.length > 1 ? ` (${chatMessages.length})` : ''}`}</button></div>
            {chatOpen ? <div className="smart-buy-chat-box"><div className="smart-buy-chat-note"><span>{text.chatHint}</span><small>{text.chatDisclaimer}</small></div>{chatMessages.map((message, index) => { const key = `${sellerKey}:${index}`; return <div className="smart-buy-chat-part" key={key}><div><strong>{text.chatPart(index + 1, chatMessages.length)}</strong><small>{text.chatLimit(message.length)}</small></div><code>{message}</code><button type="button" onClick={() => copyChatMessage(message, key)}>{copiedChatKey === key ? text.copiedMessage : text.copyMessage}</button></div> })}</div> : null}
          </article>
        })}</div>}
      </>}
    </> : null}
  </section>
}
