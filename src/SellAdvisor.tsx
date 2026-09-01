import { useEffect, useMemo, useRef, useState } from 'react'
import { waitForSellAdvisor } from './api'
import type { SellAdvisorResponse, SellAdvisorRow, SellAdvisorTarget, SmartBuyJobStatus } from './api'
import type { FrameAccountController } from './Account'
import type { CatalogItem, Dimensions } from './types'
import type { Locale } from './i18n'
import { formatDimensions, ItemIcon } from './MarketVisuals'
import { AdSlot } from './AdSlot'
import './sellAdvisor.css'

type WindowHours = 24 | 48

const textFor = (locale: Locale) => locale === 'ru' ? {
  eyebrow: 'Warframe Market · закрытые сделки',
  title: 'Советник по продаже',
  description: 'Анализирует ваши активные ордера продажи и предлагает три цены по фактическим сделкам за последние 24 или 48 часов.',
  run: 'Проанализировать ордера', rerun: 'Обновить рекомендации', loading: 'Анализируем ордера и историю цен…',
  signIn: 'Для анализа нужен аккаунт FrameAnalytics.', linkFirst: 'Сначала привяжите профиль Warframe Market в профиле FrameAnalytics.',
  remaining: 'запусков осталось', cooldown: 'Повторный запуск через', seconds: 'сек.', queue: 'Очередь',
  window: 'Окно статистики', orders: 'Активные ордера', analyzed: 'Проанализировано', updated: 'Обновлено',
  item: 'Предмет', current: 'Текущий ордер', fast: 'Быстрая продажа', balanced: 'Баланс', profit: 'Большая прибыль', data: 'Данные',
  fastHint: 'Минимальная цена закрытых сделок. Вероятность быстрой продажи выше, прибыль обычно ниже.',
  balancedHint: 'Взвешенная медиана закрытых сделок. Компромисс между скоростью и ценой.',
  profitHint: 'Максимальная цена закрытых сделок. Потенциальная прибыль выше, ожидание может быть долгим.',
  noOrders: 'В привязанном профиле нет активных публичных sell-ордеров.', noData: 'Для этого точного рынка пока недостаточно почасовой истории.',
  truncated: 'Показаны самые недавно обновлённые ордера: достигнут безопасный лимит одного анализа.',
  unavailable: 'Почасовой анализ сейчас доступен только для рынка с включённым кроссплеем.',
  low: 'Низкая уверенность', medium: 'Средняя уверенность', high: 'Высокая уверенность',
  points: 'точек', sales: 'продаж', rank: 'Ранг', total: 'за ордер', each: 'за единицу', quantity: 'шт.',
  increase: 'повысить', decrease: 'снизить', keep: 'оставить', openWfm: 'Открыть на WFM',
  disclaimer: 'Это аналитическая рекомендация, а не гарантия продажи. FrameAnalytics не изменяет ваши ордера автоматически.',
  error: 'Не удалось построить рекомендации.'
} : {
  eyebrow: 'Warframe Market · closed trades', title: 'Sell Advisor',
  description: 'Analyzes your active sell listings and suggests three prices from actual trades over the last 24 or 48 hours.',
  run: 'Analyze sell orders', rerun: 'Refresh recommendations', loading: 'Analyzing orders and price history…',
  signIn: 'A FrameAnalytics account is required.', linkFirst: 'Link a Warframe Market profile in your FrameAnalytics profile first.',
  remaining: 'runs remaining', cooldown: 'Available again in', seconds: 'sec.', queue: 'Queue',
  window: 'Statistics window', orders: 'Active orders', analyzed: 'Analyzed', updated: 'Updated',
  item: 'Item', current: 'Current listing', fast: 'Fast sale', balanced: 'Balanced', profit: 'Higher profit', data: 'Data',
  fastHint: 'Minimum closed-trade price. Faster sale is more likely, usually with lower profit.',
  balancedHint: 'Volume-weighted median of closed trades. A compromise between speed and price.',
  profitHint: 'Maximum closed-trade price. Higher potential profit, but the wait may be long.',
  noOrders: 'The linked profile has no active public sell listings.', noData: 'There is not enough hourly history for this exact market.',
  truncated: 'The most recently updated listings are shown: the safe per-analysis limit was reached.',
  unavailable: 'Hourly analysis is currently available only for a crossplay-enabled market.',
  low: 'Low confidence', medium: 'Medium confidence', high: 'High confidence', points: 'points', sales: 'sales', rank: 'Rank',
  total: 'listing total', each: 'per unit', quantity: 'units', increase: 'increase', decrease: 'decrease', keep: 'keep',
  openWfm: 'Open on WFM', disclaimer: 'This is an analytical suggestion, not a sale guarantee. FrameAnalytics never changes your listings automatically.',
  error: 'Could not build recommendations.'
}

const numberText = (value: number | null | undefined, digits = 1) =>
  value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits).replace(/\.0$/, '')
const plat = (value: number | null | undefined) => value == null ? '—' : `${numberText(value, 2)}p`
const delta = (value: number | null | undefined) => value == null ? '—' : `${value > 0 ? '+' : ''}${numberText(value, 2)}p`

const targetClass = (target: SellAdvisorTarget | null) => !target ? 'missing' : target.action

export const SellAdvisorPanel = ({ locale, catalog, auth }: {
  locale: Locale
  catalog: Map<string, CatalogItem>
  auth: FrameAccountController
}) => {
  const text = textFor(locale)
  const [windowHours, setWindowHours] = useState<WindowHours>(24)
  const [data, setData] = useState<SellAdvisorResponse | null>(null)
  const [status, setStatus] = useState<SmartBuyJobStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [clock, setClock] = useState(Date.now())
  const controllerRef = useRef<AbortController | null>(null)
  const linkedProfile = auth.account?.profile.wfmProfile || ''
  const lastRunMs = Date.parse(auth.account?.smartBuy.lastRunAt || '')
  const cooldown = Number.isFinite(lastRunMs)
    ? Math.max(0, Math.ceil((lastRunMs + (auth.account?.smartBuy.cooldownSeconds || 60) * 1000 - clock) / 1000))
    : 0

  useEffect(() => () => controllerRef.current?.abort(), [])
  useEffect(() => {
    if (!cooldown) return
    const timer = window.setInterval(() => setClock(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [cooldown])

  const canRun = Boolean(auth.account && linkedProfile && !loading && !auth.busy && auth.account.smartBuy.remaining > 0 && cooldown <= 0)
  const adAtBottom = !loading && Boolean(data || error)
  const rows = useMemo(() => [...(data?.rows || [])].sort((left, right) => {
    const leftName = catalog.get(left.itemId)?.name || left.itemId
    const rightName = catalog.get(right.itemId)?.name || right.itemId
    return leftName.localeCompare(rightName, locale)
  }), [catalog, data, locale])

  const run = async () => {
    if (!canRun) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setLoading(true); setError(null); setStatus(null); setData(null); setClock(Date.now())
    try {
      const started = await auth.startSellAdvisor()
      const result = await waitForSellAdvisor(started.jobId, setStatus, controller.signal)
      setData(result)
    } catch (value) {
      if (value instanceof DOMException && value.name === 'AbortError') return
      setError(value instanceof Error ? value.message : String(value))
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
      setLoading(false)
    }
  }

  const dimensionLabel = (row: SellAdvisorRow) => {
    const dimensions: Dimensions = {
      ...(row.dimensions || {}),
      ...(row.dimensions.rank != null ? { mod_rank: row.dimensions.rank } : {})
    }
    delete (dimensions as Record<string, unknown>).rank
    return formatDimensions(dimensions, locale)
  }

  const targetCell = (target: SellAdvisorTarget | null) => <div className={`sell-advisor-target ${targetClass(target)}`}>
    <strong>{plat(target?.orderPlatinum)}</strong>
    <span>{target ? `${text[target.action]} · ${delta(target.deltaPlatinum)}` : '—'}</span>
    {target?.unitPrice != null ? <small>{plat(target.unitPrice)} {text.each}</small> : null}
  </div>

  return <section className="panel sell-advisor-panel">
    <header className="sell-advisor-heading">
      <div><span className="eyebrow">{text.eyebrow}</span><h1>{text.title}</h1><p>{text.description}</p></div>
      {linkedProfile ? <a href={`https://warframe.market/profile/${encodeURIComponent(linkedProfile)}`} target="_blank" rel="noreferrer"><strong>{linkedProfile}</strong><small>warframe.market ↗</small></a> : null}
    </header>

    <div className="sell-advisor-strategies">
      <article className="fast"><span>{text.fast}</span><p>{text.fastHint}</p></article>
      <article className="balanced"><span>{text.balanced}</span><p>{text.balancedHint}</p></article>
      <article className="profit"><span>{text.profit}</span><p>{text.profitHint}</p></article>
    </div>

    {!auth.account ? <div className="sell-advisor-state"><strong>{text.signIn}</strong></div> : !linkedProfile ? <div className="sell-advisor-state"><strong>{text.linkFirst}</strong></div> : <div className="sell-advisor-controls">
      <div><span>{text.window}</span><div className="sell-advisor-window"><button className={windowHours === 24 ? 'active' : ''} onClick={() => setWindowHours(24)}>24ч</button><button className={windowHours === 48 ? 'active' : ''} onClick={() => setWindowHours(48)}>48ч</button></div></div>
      <button type="button" className="primary-action" disabled={!canRun} onClick={() => void run()}>{loading ? text.loading : data ? text.rerun : text.run}</button>
      <small>{auth.account.smartBuy.remaining}/{auth.account.smartBuy.limit} {text.remaining}{cooldown > 0 ? ` · ${text.cooldown} ${cooldown} ${text.seconds}` : ''}</small>
    </div>}

    {!adAtBottom ? <AdSlot placement="sell-advisor" orientation="horizontal" locale={locale}/> : null}

    {loading ? <div className="sell-advisor-state"><div className="spinner"/><strong>{text.loading}</strong>{status ? <small>{status.progress.stage} · {status.progress.percent}%{status.queue?.position ? ` · ${text.queue}: ${status.queue.position}` : ''}</small> : null}</div> : null}
    {error ? <div className="sell-advisor-state error-state"><strong>{text.error}</strong><small>{error}</small></div> : null}

    {data ? <>
      <div className="sell-advisor-summary"><span>{text.orders}: <strong>{data.visibleSellOrders}</strong></span><span>{text.analyzed}: <strong>{data.analyzedSellOrders}</strong></span><span>{text.updated}: <strong>{new Date(data.generatedAt).toLocaleString()}</strong></span></div>
      {data.truncated ? <div className="sell-advisor-state warning"><strong>{text.truncated}</strong></div> : null}
      {!data.hourlyAvailable ? <div className="sell-advisor-state warning"><strong>{text.unavailable}</strong></div> : !rows.length ? <div className="sell-advisor-state"><strong>{text.noOrders}</strong></div> : <div className="table-scroll"><table className="sell-advisor-table"><thead><tr><th>{text.item}</th><th>{text.current}</th><th>{text.fast}</th><th>{text.balanced}</th><th>{text.profit}</th><th>{text.data}</th></tr></thead><tbody>
        {rows.map(row => {
          const item = catalog.get(row.itemId)
          const name = item?.name || item?.englishName || row.itemId
          const stats = row.windows[`${windowHours}h`]
          const confidence = text[stats.confidence]
          return <tr key={row.orderId || `${row.itemId}:${row.marketKey}`}>
            <td><div className="sell-advisor-item"><ItemIcon item={item} name={name}/><span><strong title={name}>{name}</strong><small>{dimensionLabel(row) || row.marketKey} · {row.quantity} {text.quantity}</small><a href={item?.slug ? `https://warframe.market/items/${encodeURIComponent(item.slug)}` : `https://warframe.market/profile/${encodeURIComponent(linkedProfile)}`} target="_blank" rel="noreferrer">{text.openWfm} ↗</a></span></div></td>
            <td><div className="sell-advisor-current"><strong>{plat(row.currentOrderPlatinum)}</strong><span>{text.total}</span>{row.perTrade > 1 ? <small>{plat(row.currentUnitPrice)} {text.each}</small> : null}</div></td>
            <td>{targetCell(stats.recommendations.fast)}</td><td>{targetCell(stats.recommendations.balanced)}</td><td>{targetCell(stats.recommendations.profit)}</td>
            <td><div className={`sell-advisor-data ${row.statsState} confidence-${stats.confidence}`}><strong>{row.statsState === 'missing' || !stats.points ? text.noData : confidence}</strong><span>{stats.points} {text.points} · {numberText(stats.volume, 0)} {text.sales}</span><small>{row.statsFetchedAt ? new Date(row.statsFetchedAt).toLocaleString() : '—'}</small></div></td>
          </tr>
        })}
      </tbody></table></div>}
      <p className="sell-advisor-disclaimer">{text.disclaimer}</p>
    </> : null}
    {adAtBottom ? <AdSlot placement="sell-advisor" orientation="horizontal" locale={locale}/> : null}
  </section>
}
