import { useEffect, useMemo, useRef, useState } from 'react'
import { waitForSmartBuy } from './api'
import type { SmartBuyJobStatus, SmartBuyResponse, SmartBuySeller, SmartBuySellerOffer, SmartBuyWishlistRow } from './api'
import type { FrameAccountController } from './Account'
import type { CatalogItem } from './types'
import type { Locale } from './i18n'
import './smartBuy.css'

const ONLINE = new Set(['online', 'ingame'])
const CHAT_LIMIT = 300
const TRADE_SLOT_LIMIT = 6

type LimitValue = 'any' | '0' | '5' | '10' | '20' | '50'
type PriceBasis = 'market-min' | 'average-24h'

const textFor = (locale: Locale) => locale === 'ru' ? {
  eyebrow: 'Warframe Market',
  title: 'Умная покупка',
  description: 'Найдите одного продавца сразу для нескольких ваших активных заявок на покупку.',
  profileLabel: 'Профиль Warframe Market',
  profilePlaceholder: 'Ссылка на профиль или имя пользователя',
  link: 'Привязать профиль',
  unlink: 'Отвязать',
  run: 'Запустить Smart Buy',
  rerun: 'Обновить Smart Buy',
  loading: 'Собираем продавцов и цены…',
  loadError: 'Не удалось собрать данные Smart Buy.',
  signIn: 'Для Smart Buy нужен аккаунт FrameAnalytics.',
  linkFirst: 'Сначала привяжите профиль Warframe Market.',
  remaining: 'запусков осталось',
  cooldown: 'Повторный запуск через',
  seconds: 'сек.',
  priceBasis: 'Сравнивать цену продавца с',
  marketMin: 'Мин. текущих ордеров продажи',
  average24h: 'Средняя продаж за 24ч',
  deviation: 'Допустимое удорожание',
  onlineOnly: 'Только онлайн / в игре',
  any: 'Без ограничения',
  minimumOnly: 'Не дороже базы',
  upTo: (value: string) => `до +${value}%`,
  wantedPositions: 'активных позиций',
  sellers: 'Подходящие продавцы',
  sellersEmpty: 'По выбранному фильтру продавцов нет.',
  positions: 'позиций',
  units: 'шт.',
  full: 'полностью',
  estimated: 'итого',
  canSell: 'может продать',
  of: 'из',
  price: 'цена',
  activeMin: 'Мин. текущих ордеров продажи',
  avg24: 'Средняя 24ч',
  perUnit: '/шт.',
  vsSelectedBasis: 'Переплата',
  savingVsSelectedBasis: 'Экономия',
  avgUnavailable: '24ч средняя недоступна',
  sellerProfile: 'Профиль продавца',
  message: 'Сообщение',
  copy: 'Копировать',
  copied: 'Скопировано',
  updated: 'Обновлено',
  queue: 'Очередь',
  profileLinked: 'Привязан',
  invalidProfile: 'Не удалось распознать ссылку на профиль Warframe Market.'
} : {
  eyebrow: 'Warframe Market',
  title: 'Smart Buy',
  description: 'Find one seller who can cover several of your active buy listings at once.',
  profileLabel: 'Warframe Market profile',
  profilePlaceholder: 'Profile URL or username',
  link: 'Link profile',
  unlink: 'Unlink',
  run: 'Run Smart Buy',
  rerun: 'Refresh Smart Buy',
  loading: 'Collecting sellers and prices…',
  loadError: 'Could not load Smart Buy data.',
  signIn: 'A FrameAnalytics account is required for Smart Buy.',
  linkFirst: 'Link your Warframe Market profile first.',
  remaining: 'runs remaining',
  cooldown: 'Available again in',
  seconds: 'sec.',
  priceBasis: 'Compare seller price with',
  marketMin: 'Current sell-order minimum',
  average24h: '24h sales average',
  deviation: 'Allowed premium',
  onlineOnly: 'Online / in-game only',
  any: 'No limit',
  minimumOnly: 'At or below baseline',
  upTo: (value: string) => `up to +${value}%`,
  wantedPositions: 'active positions',
  sellers: 'Matching sellers',
  sellersEmpty: 'No sellers match the selected filter.',
  positions: 'positions',
  units: 'units',
  full: 'full',
  estimated: 'est.',
  canSell: 'can sell',
  of: 'of',
  price: 'price',
  activeMin: 'Current sell-order min',
  avg24: '24h average',
  perUnit: '/unit',
  vsSelectedBasis: 'Premium',
  savingVsSelectedBasis: 'Saving',
  avgUnavailable: '24h average unavailable',
  sellerProfile: 'Seller profile',
  message: 'Message',
  copy: 'Copy',
  copied: 'Copied',
  updated: 'Updated',
  queue: 'Queue',
  profileLinked: 'Linked',
  invalidProfile: 'Could not recognize the Warframe Market profile URL.'
}

const numberText = (value: number | null | undefined, digits = 1) =>
  value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits).replace(/\.0$/, '')

const plat = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : `${numberText(value, 2)}p`

const percent = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value) ? '—' : `${value > 0 ? '+' : ''}${numberText(value, 1)}%`

const compactPlat = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')

const limitNumber = (value: LimitValue): number | null => value === 'any' ? null : Number(value)
const statusClass = (status: string) => ONLINE.has(status) ? 'online' : 'offline'

const normalizeProfileInput = (input: string): string | null => {
  const raw = input.trim()
  if (!raw) return null

  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
    const host = url.hostname.toLowerCase()
    if (host === 'warframe.market' || host.endsWith('.warframe.market')) {
      const parts = url.pathname.split('/').filter(Boolean)
      const profileIndex = parts.findIndex(part => part.toLowerCase() === 'profile')
      if (profileIndex >= 0 && parts[profileIndex + 1]) {
        const slug = decodeURIComponent(parts[profileIndex + 1]).trim()
        return /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(slug) ? slug : null
      }
    }
  } catch {
    // A bare username is valid input too.
  }

  const slug = raw.replace(/^@/, '')
  return /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(slug) ? slug : null
}

type RankedSeller = {
  seller: SmartBuySeller
  offers: SmartBuySellerOffer[]
  positionsCovered: number
  fullPositions: number
  unitsCovered: number
  totalRequestedUnits: number
  estimatedCost: number
}

type ChatMessage = {
  text: string
  slots: number
  total: number
}

export const SmartBuyPanel = ({ locale, catalog, auth, standalone = false }: {
  locale: Locale
  catalog: Map<string, CatalogItem>
  auth: FrameAccountController
  standalone?: boolean
}) => {
  const text = textFor(locale)
  const linkedProfile = auth.account?.profile.wfmProfile || ''
  const [profileInput, setProfileInput] = useState(linkedProfile)
  const [data, setData] = useState<SmartBuyResponse | null>(null)
  const [jobStatus, setJobStatus] = useState<SmartBuyJobStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [profileBusy, setProfileBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [priceBasis, setPriceBasis] = useState<PriceBasis>('market-min')
  const [deviation, setDeviation] = useState<LimitValue>('10')
  const [onlineOnly, setOnlineOnly] = useState(true)
  const [clock, setClock] = useState(Date.now())
  const [copiedMessage, setCopiedMessage] = useState<string | null>(null)
  const runController = useRef<AbortController | null>(null)

  useEffect(() => { setProfileInput(linkedProfile) }, [linkedProfile])
  useEffect(() => () => runController.current?.abort(), [])

  const lastRunMs = Date.parse(auth.account?.smartBuy.lastRunAt || '')
  const cooldownRemaining = Number.isFinite(lastRunMs)
    ? Math.max(0, Math.ceil((lastRunMs + (auth.account?.smartBuy.cooldownSeconds || 60) * 1000 - clock) / 1000))
    : 0

  useEffect(() => {
    if (!cooldownRemaining) return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [cooldownRemaining])

  const canRun = Boolean(
    auth.account &&
    linkedProfile &&
    !loading &&
    !auth.busy &&
    auth.account.smartBuy.remaining > 0 &&
    cooldownRemaining <= 0
  )

  const itemFor = (itemId: string) => catalog.get(itemId)
  const itemName = (itemId: string) => itemFor(itemId)?.name || itemFor(itemId)?.englishName || itemId
  const englishItemName = (itemId: string) => itemFor(itemId)?.englishName || itemFor(itemId)?.name || itemId

  const wishlistByDemand = useMemo(
    () => new Map((data?.wishlist || []).map(row => [row.demandKey, row])),
    [data]
  )

  const offerDeviation = (offer: SmartBuySellerOffer) => {
    const wishlist = wishlistByDemand.get(offer.demandKey)
    const baseline = priceBasis === 'market-min'
      ? wishlist?.marketMinUnitPrice
      : wishlist?.average24hUnitPrice

    if (baseline == null || !Number.isFinite(baseline) || baseline <= 0) return null
    return (offer.unitPrice - baseline) / baseline * 100
  }

  const rankedSellers = useMemo<RankedSeller[]>(() => {
    if (!data?.wishlist.length) return []
    const maxDeviation = limitNumber(deviation)
    const totalRequestedUnits = data.wishlist.reduce((sum, row) => sum + Math.max(0, row.quantity || 0), 0)

    return data.sellers.flatMap(seller => {
      if (onlineOnly && !ONLINE.has(seller.user.status)) return []

      const offers = seller.offers.filter(offer => {
        if (!wishlistByDemand.has(offer.demandKey)) return false
        if (maxDeviation == null) return true
        const value = offerDeviation(offer)
        // Negative deviation is always accepted: cheaper than the chosen baseline is never filtered out.
        return value != null && value <= maxDeviation + 0.0001
      })

      if (!offers.length) return []

      let unitsCovered = 0
      let fullPositions = 0
      let estimatedCost = 0

      for (const offer of offers) {
        const wanted = wishlistByDemand.get(offer.demandKey)
        if (!wanted) continue
        unitsCovered += Math.min(wanted.quantity, offer.fillableQuantity)
        if (offer.fillableQuantity >= wanted.quantity) fullPositions++
        estimatedCost += Math.max(0, offer.estimatedCost || offer.unitPrice * offer.fillableQuantity)
      }

      return [{
        seller,
        offers,
        positionsCovered: offers.length,
        fullPositions,
        unitsCovered,
        totalRequestedUnits,
        estimatedCost
      }]
    }).sort((left, right) =>
      right.positionsCovered - left.positionsCovered ||
      right.fullPositions - left.fullPositions ||
      right.unitsCovered - left.unitsCovered ||
      left.estimatedCost - right.estimatedCost ||
      left.seller.user.ingameName.localeCompare(right.seller.user.ingameName)
    )
  }, [data, deviation, onlineOnly, priceBasis, wishlistByDemand])

  const saveProfile = async () => {
    if (!auth.account) return
    const slug = normalizeProfileInput(profileInput)
    if (!slug) {
      setError(text.invalidProfile)
      return
    }

    setProfileBusy(true)
    setError(null)
    try {
      await auth.linkWfmProfile(slug)
      setProfileInput(slug)
      setData(null)
      setJobStatus(null)
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
      setJobStatus(null)
    } catch (value) {
      setError(value instanceof Error ? value.message : String(value))
    } finally {
      setProfileBusy(false)
    }
  }

  const runSmartBuy = async () => {
    if (!canRun || !linkedProfile) return

    runController.current?.abort()
    const controller = new AbortController()
    runController.current = controller

    setLoading(true)
    setError(null)
    setJobStatus(null)
    setData(null)
    setClock(Date.now())

    try {
      const started = await auth.startSmartBuy()
      setClock(Date.now())

      const result = await waitForSmartBuy(
        started.jobId,
        status => setJobStatus(status),
        controller.signal
      )
      setData(result)
    } catch (value) {
      if (value instanceof DOMException && value.name === 'AbortError') return
      setError(value instanceof Error ? value.message : String(value))
    } finally {
      if (runController.current === controller) runController.current = null
      setLoading(false)
    }
  }

  const comparison = (offer: SmartBuySellerOffer, row: SmartBuyWishlistRow, basis: PriceBasis) => {
    const baseline = basis === 'market-min' ? row.marketMinUnitPrice : row.average24hUnitPrice
    if (baseline == null || !Number.isFinite(baseline) || baseline <= 0) {
      return { baseline: null, percent: null, platinum: null, total: null }
    }
    const platinum = offer.unitPrice - baseline
    return {
      baseline,
      percent: platinum / baseline * 100,
      platinum,
      total: platinum * offer.fillableQuantity
    }
  }

  const comparisonClass = (value: number | null) =>
    value == null || Math.abs(value) < 0.0001 ? 'neutral' : value < 0 ? 'positive' : 'negative'

  const sellerBasisDelta = (offers: SmartBuySellerOffer[]) => {
    let delta = 0
    for (const offer of offers) {
      const wanted = wishlistByDemand.get(offer.demandKey)
      if (!wanted) return null
      const current = comparison(offer, wanted, priceBasis)
      if (current.total == null || !Number.isFinite(current.total)) return null
      delta += current.total
    }
    return delta
  }

  const buildChatMessages = (seller: SmartBuySeller, offers: SmartBuySellerOffer[]): ChatMessage[] => {
    const prefix = `/w ${seller.user.ingameName} Hi! I want to buy `
    const attribution = ' (warframe.market via frameanalytics)'
    const suffix = (total: number) => ` for ${compactPlat(total)}p total.${attribution}`
    const messages: ChatMessage[] = []

    let parts: string[] = []
    let total = 0
    let slots = 0

    const flush = () => {
      if (!parts.length) return
      messages.push({
        text: `${prefix}${parts.join(', ')}${suffix(total)}`.slice(0, CHAT_LIMIT),
        slots,
        total
      })
      parts = []
      total = 0
      slots = 0
    }

    for (const offer of offers) {
      let remaining = Math.max(0, Math.floor(offer.fillableQuantity || 0))
      const tradeSize = Math.max(1, Math.floor(offer.perTrade || 1))
      const name = englishItemName(offer.itemId)

      while (remaining > 0) {
        let availableSlots = TRADE_SLOT_LIMIT - slots
        if (availableSlots < tradeSize && parts.length) {
          flush()
          availableSlots = TRADE_SLOT_LIMIT
        }

        let qty = Math.floor(Math.min(remaining, availableSlots) / tradeSize) * tradeSize
        if (qty <= 0) {
          // Defensive fallback for unusual perTrade values.
          if (parts.length) {
            flush()
            continue
          }
          qty = Math.min(remaining, TRADE_SLOT_LIMIT)
        }

        const cost = Math.max(0, offer.unitPrice * qty)
        let part = `${qty}x [${name}]`
        let candidate = `${prefix}${[...parts, part].join(', ')}${suffix(total + cost)}`

        if (candidate.length > CHAT_LIMIT && parts.length) {
          flush()
          continue
        }

        if (candidate.length > CHAT_LIMIT) {
          const reserved = prefix.length + `${qty}x []`.length + suffix(cost).length
          const maxName = Math.max(1, CHAT_LIMIT - reserved)
          part = `${qty}x [${name.slice(0, maxName)}]`
          candidate = `${prefix}${part}${suffix(cost)}`
        }

        parts.push(part)
        total += cost
        slots += qty
        remaining -= qty

        if (slots >= TRADE_SLOT_LIMIT || candidate.length >= CHAT_LIMIT) flush()
      }
    }

    flush()
    return messages
  }

  const statusLabel = (status: string) =>
    status === 'ingame'
      ? (locale === 'ru' ? 'в игре' : 'in game')
      : status === 'online'
        ? (locale === 'ru' ? 'онлайн' : 'online')
        : (locale === 'ru' ? 'офлайн' : 'offline')

  return <section className={`panel smart-buy-panel ${standalone ? 'standalone' : ''}`}>
    <div className="smart-buy-heading">
      <div>
        <span className="eyebrow">{text.eyebrow}</span>
        <h1>{text.title}</h1>
        <p>{text.description}</p>
      </div>

      {linkedProfile ? <a className="smart-buy-profile-chip" href={`https://warframe.market/profile/${encodeURIComponent(linkedProfile)}`} target="_blank" rel="noreferrer">
        <span><strong>{linkedProfile}</strong><small>{text.profileLinked} · warframe.market</small></span>
      </a> : null}
    </div>

    {!auth.account ? <div className="smart-buy-state compact"><strong>{text.signIn}</strong></div> : <>
      <div className="smart-buy-control-grid">
        <div className="smart-buy-link-row">
          <label>
            <span>{text.profileLabel}</span>
            <input
              type="text"
              value={profileInput}
              placeholder={text.profilePlaceholder}
              onChange={event => setProfileInput(event.target.value)}
              onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); void saveProfile() } }}
            />
          </label>
          <button type="button" className="smart-buy-secondary" disabled={!profileInput.trim() || profileBusy || auth.busy} onClick={() => void saveProfile()}>{text.link}</button>
          {linkedProfile ? <button type="button" className="smart-buy-secondary danger" disabled={profileBusy || loading} onClick={() => void unlink()}>{text.unlink}</button> : null}
        </div>

        <div className="smart-buy-runbar">
          <button type="button" className="primary-action smart-buy-run" disabled={!canRun} onClick={() => void runSmartBuy()}>
            {loading ? text.loading : data ? text.rerun : text.run}
          </button>
          <div className="smart-buy-quota">
            <strong>{auth.account.smartBuy.remaining}/{auth.account.smartBuy.limit}</strong>
            <span>{text.remaining}</span>
            {cooldownRemaining > 0 ? <small>{text.cooldown} {cooldownRemaining} {text.seconds}</small> : null}
          </div>
        </div>
      </div>

      {!linkedProfile ? <div className="smart-buy-state compact"><strong>{text.linkFirst}</strong></div> : null}
    </>}

    {loading ? <div className="smart-buy-progress">
      <div className="spinner"/>
      <div>
        <strong>{text.loading}</strong>
        {jobStatus ? <small>{jobStatus.progress.stage} · {jobStatus.progress.percent}%{jobStatus.queue?.position ? ` · ${text.queue}: ${jobStatus.queue.position}` : ''}</small> : null}
      </div>
    </div> : null}

    {error ? <div className="smart-buy-state error-state"><strong>{text.loadError}</strong><small>{error}</small></div> : null}

    {data ? <>
      <div className="smart-buy-toolbar">
        <div className="smart-buy-basis">
          <span>{text.priceBasis}</span>
          <div className="smart-buy-segmented">
            <button type="button" className={priceBasis === 'market-min' ? 'active' : ''} onClick={() => setPriceBasis('market-min')}>{text.marketMin}</button>
            <button type="button" className={priceBasis === 'average-24h' ? 'active' : ''} onClick={() => setPriceBasis('average-24h')}>{text.average24h}</button>
          </div>
        </div>

        <label className="smart-buy-filter-field">
          <span>{text.deviation}</span>
          <select value={deviation} onChange={event => setDeviation(event.target.value as LimitValue)}>
            <option value="0">{text.minimumOnly}</option>
            <option value="5">{text.upTo('5')}</option>
            <option value="10">{text.upTo('10')}</option>
            <option value="20">{text.upTo('20')}</option>
            <option value="50">{text.upTo('50')}</option>
            <option value="any">{text.any}</option>
          </select>
        </label>

        <label className="smart-buy-check">
          <input type="checkbox" checked={onlineOnly} onChange={event => setOnlineOnly(event.target.checked)}/>
          <span>{text.onlineOnly}</span>
        </label>

        <div className="smart-buy-generated">
          <span>{data.wishlist.length} {text.wantedPositions}</span>
          <strong>{text.updated}: {new Date(data.generatedAt).toLocaleString()}</strong>
        </div>
      </div>

      <div className="smart-buy-section-title">
        <div><span className="eyebrow">{text.sellers}</span><strong>{rankedSellers.length}</strong></div>
      </div>

      {!rankedSellers.length ? <div className="smart-buy-state compact"><strong>{text.sellersEmpty}</strong></div> :
        <div className="smart-buy-sellers">
          {rankedSellers.slice(0, 30).map(({ seller, offers, positionsCovered, fullPositions, unitsCovered, totalRequestedUnits, estimatedCost }) => {
            const sellerKey = seller.user.id || seller.user.slug
            const messages = buildChatMessages(seller, offers)
            const selectedBasisDelta = sellerBasisDelta(offers)

            return <article className={`smart-buy-seller ${positionsCovered > 1 ? 'multi' : ''}`} key={sellerKey}>
              <header>
                <a href={seller.user.profileUrl} target="_blank" rel="noreferrer" className="smart-buy-seller-identity">
                  <i className={statusClass(seller.user.status)}/>
                  <span><strong>{seller.user.ingameName}</strong><small>{statusLabel(seller.user.status)} · rep {seller.user.reputation}</small></span>
                </a>

                <div className="smart-buy-coverage">
                  <strong>{positionsCovered}/{data.wishlist.length}</strong>
                  <span>{text.positions}</span>
                  <small>{fullPositions} {text.full} · {unitsCovered}/{totalRequestedUnits} {text.units}</small>
                </div>

                <div className="smart-buy-cost">
                  <small>{text.estimated}</small>
                  <strong>{plat(estimatedCost)}</strong>
                  <span className={`smart-buy-cost-delta ${comparisonClass(selectedBasisDelta)}`}>
                    {selectedBasisDelta == null
                      ? '—'
                      : `${selectedBasisDelta > 0 ? text.vsSelectedBasis : selectedBasisDelta < 0 ? text.savingVsSelectedBasis : text.vsSelectedBasis}: ${selectedBasisDelta > 0 ? '+' : ''}${numberText(selectedBasisDelta, 2)}p`}
                  </span>
                </div>
              </header>

              <div className="smart-buy-offers">
                {offers.map(offer => {
                  const wanted = wishlistByDemand.get(offer.demandKey)
                  if (!wanted) return null

                  const market = comparison(offer, wanted, 'market-min')
                  const avg = comparison(offer, wanted, 'average-24h')
                  const item = itemFor(offer.itemId)
                  const itemHref = item?.slug ? `https://warframe.market/items/${encodeURIComponent(item.slug)}` : null

                  return <div className="smart-buy-offer" key={`${sellerKey}:${offer.demandKey}`}>
                    <div className="smart-buy-offer-main">
                      {itemHref ? <a href={itemHref} target="_blank" rel="noreferrer" className="smart-buy-offer-name">{itemName(offer.itemId)} ↗</a> : <strong className="smart-buy-offer-name">{itemName(offer.itemId)}</strong>}
                      <span>{text.canSell} <strong>{offer.fillableQuantity}</strong> {text.of} {wanted.quantity}</span>
                      <span>{text.price} <strong>{plat(offer.unitPrice)}</strong></span>
                    </div>

                    <div className={`smart-buy-comparison ${comparisonClass(market.percent)}`}>
                      <small>{text.activeMin}</small>
                      <strong>{percent(market.percent)}</strong>
                      <b>{market.platinum == null ? '—' : `${market.platinum > 0 ? '+' : ''}${numberText(market.platinum, 2)}p${text.perUnit}`}</b>
                      <span>{market.baseline == null ? '—' : `${text.activeMin}: ${plat(market.baseline)}${market.total == null ? '' : ` · ${market.total > 0 ? '+' : ''}${numberText(market.total, 2)}p`}`}</span>
                    </div>

                    <div className={`smart-buy-comparison ${comparisonClass(avg.percent)}`}>
                      <small>{text.avg24}</small>
                      <strong>{percent(avg.percent)}</strong>
                      <b>{avg.platinum == null ? '—' : `${avg.platinum > 0 ? '+' : ''}${numberText(avg.platinum, 2)}p${text.perUnit}`}</b>
                      <span>{avg.baseline == null ? text.avgUnavailable : `${text.avg24}: ${plat(avg.baseline)}`}</span>
                    </div>
                  </div>
                })}
              </div>

              <div className="smart-buy-message-list">
                {messages.map((message, index) => {
                  const copyKey = `${sellerKey}:${index}`
                  return <div className="smart-buy-message-row" key={copyKey}>
                    <span>{text.message} {index + 1}/{messages.length} · {message.slots}/{TRADE_SLOT_LIMIT}</span>
                    <input readOnly value={message.text} aria-label={`${text.message} ${index + 1}`}/>
                    <button type="button" className="smart-buy-secondary" onClick={async () => {
                      await navigator.clipboard.writeText(message.text)
                      setCopiedMessage(copyKey)
                      window.setTimeout(() => setCopiedMessage(current => current === copyKey ? null : current), 1600)
                    }}>{copiedMessage === copyKey ? text.copied : text.copy}</button>
                  </div>
                })}
              </div>

              <a className="smart-buy-open" href={seller.user.profileUrl} target="_blank" rel="noreferrer">{text.sellerProfile} ↗</a>
            </article>
          })}
        </div>}
    </> : null}
  </section>
}
