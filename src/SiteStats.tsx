import { useEffect, useMemo, useState } from 'react'
import {
  fetchSiteApiStatus,
  fetchSiteHourlyFreshness,
  fetchSiteHourlyIndexStatus,
  fetchSiteHourlyStatus,
  fetchSiteSmartBuyStatus
} from './api'
import type {
  SiteApiStatus,
  SiteHourlyFreshness,
  SiteHourlyIndexStatus,
  SiteHourlyStatus,
  SiteSmartBuyStatus
} from './api'
import type { Locale } from './i18n'
import './siteStats.css'

type Snapshot = {
  api: SiteApiStatus
  hourly: SiteHourlyStatus
  freshness: SiteHourlyFreshness
  index: SiteHourlyIndexStatus
  smartBuy: SiteSmartBuyStatus
}

const textFor = (locale: Locale) => locale === 'ru' ? {
  eyebrow: 'Внутренняя телеметрия',
  title: 'Статистика FrameAnalytics',
  description: 'Состояние сборщиков, свежесть данных, бюджеты запросов и внутренние лимиты. Страница намеренно не добавлена в навигацию сайта.',
  refresh: 'Обновить',
  loading: 'Собираем диагностику…',
  error: 'Не удалось загрузить статистику.',
  healthy: 'Норма',
  warning: 'Требует внимания',
  hourly: 'Hourly updater',
  freshness: 'Свежесть Hourly',
  index: 'Hourly Index',
  smartBuy: 'Smart Buy',
  versions: 'Версии и каталог',
  limits: 'Лимиты и бюджеты',
  runtime: 'Runtime',
  enabled: 'Включён',
  groups: 'Группы',
  backlog: 'Backlog',
  lastFetch: 'Последний сбор',
  cooldown: 'Cooldown WFM',
  requestsDay: 'WFM запросов/сутки',
  hourlyWfmLimit: 'Лимит Hourly WFM/сутки',
  hourlyQueueLimit: 'Лимит Hourly Queue/сутки',
  queueMessagesDay: 'Queue сообщений/сутки',
  queueOpsDay: 'Queue операций/сутки',
  queueBudget: 'Queue бюджет/сутки',
  combinedQueue: 'Hourly + Index операций/сутки',
  indexRefresh: 'Обновление Index',
  shards: 'Shards',
  generated: 'Публичный Index',
  fresh: 'Свежие',
  due: 'Due',
  stale: 'Просроченные',
  missing: 'Отсутствуют',
  oldest: 'Самая старая, мин',
  cache: 'R2-кэш Smart Buy',
  cacheEntries: 'Записей кэша',
  cacheBytes: 'Размер кэша',
  profileTtl: 'Профиль TTL',
  ordersTtl: 'Buy-ордера TTL',
  itemsTtl: 'Sell-ордера TTL',
  maxSeries: 'Серий за один запрос',
  maxSessionSeries: 'Макс. серий за frontend-сессию',
  wfmLimit: 'Публичный лимит WFM',
  smartBuyRate: 'Лимит FrameAnalytics Smart Buy',
  requestSpacing: 'Пауза между WFM-запросами',
  activeScopes: 'Активные рынки',
  catalog: 'Предметов в каталоге',
  noLink: 'Прямой URL; ссылки на эту страницу в основном интерфейсе нет.',
  seconds: 'с',
  minutes: 'мин',
  perSecond: 'запр./с',
  bytes: 'байт'
} : {
  eyebrow: 'Internal telemetry',
  title: 'FrameAnalytics statistics',
  description: 'Collector state, freshness, request budgets, and internal limits. This page is intentionally absent from site navigation.',
  refresh: 'Refresh',
  loading: 'Loading diagnostics…',
  error: 'Could not load statistics.',
  healthy: 'Healthy',
  warning: 'Needs attention',
  hourly: 'Hourly updater',
  freshness: 'Hourly freshness',
  index: 'Hourly Index',
  smartBuy: 'Smart Buy',
  versions: 'Versions and catalog',
  limits: 'Limits and budgets',
  runtime: 'Runtime', enabled: 'Enabled', groups: 'Groups', backlog: 'Backlog', lastFetch: 'Last fetch', cooldown: 'WFM cooldown',
  requestsDay: 'WFM requests/day', hourlyWfmLimit: 'Hourly WFM limit/day', hourlyQueueLimit: 'Hourly Queue limit/day', queueMessagesDay: 'Queue messages/day', queueOpsDay: 'Queue operations/day', queueBudget: 'Queue budget/day', combinedQueue: 'Hourly + Index ops/day',
  indexRefresh: 'Index refresh', shards: 'Shards', generated: 'Public Index', fresh: 'Fresh', due: 'Due', stale: 'Stale', missing: 'Missing', oldest: 'Oldest, min',
  cache: 'Smart Buy R2 cache', cacheEntries: 'Cache entries', cacheBytes: 'Cache size', profileTtl: 'Profile TTL', ordersTtl: 'Buy orders TTL', itemsTtl: 'Sell orders TTL',
  maxSeries: 'Series per request', maxSessionSeries: 'Max series per frontend session', wfmLimit: 'Public WFM limit', smartBuyRate: 'FrameAnalytics Smart Buy limit', requestSpacing: 'WFM request spacing',
  activeScopes: 'Active markets', catalog: 'Catalog items', noLink: 'Direct URL only; there is no link to this page in the main interface.', seconds: 's', minutes: 'min', perSecond: 'req/s', bytes: 'bytes'
}

const fmt = (value: number | null | undefined, digits = 0) => value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value)
const fmtDate = (value: string | null | undefined) => {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}
const fmtBytes = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return '—'
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${Math.round(value)} B`
}
const pct = (value: number, max: number) => max > 0 ? Math.max(0, Math.min(100, value / max * 100)) : 0

export const SiteStatsPage = ({ locale }: { locale: Locale }) => {
  const text = textFor(locale)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const robots = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null
    const previous = robots?.content
    const meta = robots || document.head.appendChild(document.createElement('meta'))
    meta.name = 'robots'
    meta.content = 'noindex,nofollow,noarchive'
    return () => {
      if (robots && previous != null) robots.content = previous
      else if (!robots) meta.remove()
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    Promise.all([
      fetchSiteApiStatus(controller.signal),
      fetchSiteHourlyStatus(controller.signal),
      fetchSiteHourlyFreshness(controller.signal),
      fetchSiteHourlyIndexStatus(controller.signal),
      fetchSiteSmartBuyStatus(controller.signal)
    ]).then(([api, hourly, freshness, index, smartBuy]) => {
      if (!controller.signal.aborted) setSnapshot({ api, hourly, freshness, index, smartBuy })
    }).catch(value => {
      if (!controller.signal.aborted) setError(value instanceof Error ? value.message : String(value))
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    const timer = setInterval(() => setReload(value => value + 1), 60_000)
    return () => clearInterval(timer)
  }, [])

  const queueUse = snapshot?.index.automation?.combinedQueueOperationsDay || 0
  const queueLimit = snapshot?.index.automation?.freeQueueOperationsDay || 0
  const freshnessTotal = snapshot?.freshness.totals.groups || 0
  const freshnessHealthy = snapshot ? snapshot.freshness.healthy && (snapshot.hourly.queue?.backlogCount || 0) <= (snapshot.hourly.runtimeThrottle?.maxBacklog || 10) : false
  const cacheSummary = useMemo(() => snapshot?.smartBuy.cache, [snapshot])
  const smartBuyRequestInterval = snapshot?.smartBuy.requestIntervalsMs?.fast ?? snapshot?.smartBuy.upstream?.requestIntervalMs
  const smartBuyConfiguredRate = snapshot?.smartBuy.upstream?.configuredRequestsPerSecond ?? (smartBuyRequestInterval ? 1000 / smartBuyRequestInterval : null)
  const smartBuyMaxSeries = snapshot?.smartBuy.maxMarketSeries ?? snapshot?.smartBuy.limits?.maxMarketSeriesPerRequest
  const smartBuyMaxSessionSeries = snapshot?.smartBuy.limits?.maxFrontendMarketSeries ?? smartBuyMaxSeries
  const smartBuyItemTtl = cacheSummary?.itemOrdersTtlSeconds ?? snapshot?.smartBuy.itemOrdersCacheSeconds

  return <main className="app-shell site-stats-shell">
    <div className="site-stats-topbar">
      <a className="brand-plate detail-brand" href="/" aria-label="FrameAnalytics — home"><img src="/assets/frameanalytics-logo.webp" alt="FrameAnalytics"/></a>
      <button type="button" className="retry-button" onClick={() => setReload(value => value + 1)} disabled={loading}>{text.refresh}</button>
    </div>

    <section className="panel site-stats-hero">
      <div><span className="eyebrow">{text.eyebrow}</span><h1>{text.title}</h1><p>{text.description}</p><small>{text.noLink}</small></div>
      <span className={`site-health ${freshnessHealthy ? 'ok' : 'warn'}`}>{freshnessHealthy ? text.healthy : text.warning}</span>
    </section>

    {loading && !snapshot ? <section className="panel site-stats-state"><div className="spinner"/><strong>{text.loading}</strong></section> : error && !snapshot ? <section className="panel site-stats-state error-state"><strong>{text.error}</strong><small>{error}</small></section> : snapshot ? <>
      <section className="site-stats-grid">
        <article className="panel site-stat-card"><span>{text.hourly}</span><strong>{snapshot.hourly.enabled ? text.healthy : text.warning}</strong><dl><div><dt>{text.runtime}</dt><dd>{snapshot.hourly.runtimeRevision}</dd></div><div><dt>{text.groups}</dt><dd>{snapshot.hourly.groups ? `${snapshot.hourly.groups.stored}/${snapshot.hourly.groups.target}` : '—'}</dd></div><div><dt>{text.backlog}</dt><dd>{fmt(snapshot.hourly.queue?.backlogCount)}</dd></div><div><dt>{text.lastFetch}</dt><dd>{fmtDate(snapshot.hourly.lastFetchedAt)}</dd></div><div><dt>{text.activeScopes}</dt><dd>{snapshot.hourly.activeScopes?.join(', ') || '—'}</dd></div></dl></article>
        <article className="panel site-stat-card"><span>{text.freshness}</span><strong>{snapshot.freshness.healthy ? text.healthy : text.warning}</strong><div className="freshness-strip"><i className="fresh" style={{ width: `${pct(snapshot.freshness.totals.fresh, freshnessTotal)}%` }}/><i className="due" style={{ width: `${pct(snapshot.freshness.totals.due, freshnessTotal)}%` }}/><i className="stale" style={{ width: `${pct(snapshot.freshness.totals.stale + snapshot.freshness.totals.missing, freshnessTotal)}%` }}/></div><dl><div><dt>{text.fresh}</dt><dd>{snapshot.freshness.totals.fresh}</dd></div><div><dt>{text.due}</dt><dd>{snapshot.freshness.totals.due}</dd></div><div><dt>{text.stale}</dt><dd>{snapshot.freshness.totals.stale}</dd></div><div><dt>{text.missing}</dt><dd>{snapshot.freshness.totals.missing}</dd></div></dl></article>
        <article className="panel site-stat-card"><span>{text.index}</span><strong>{snapshot.index.globalManifestReady ? text.healthy : text.warning}</strong><dl><div><dt>{text.runtime}</dt><dd>{snapshot.index.hourlyIndexRuntimeRevision}</dd></div><div><dt>{text.indexRefresh}</dt><dd>{fmt(snapshot.index.automation?.refreshMinutes)} {text.minutes}</dd></div><div><dt>{text.shards}</dt><dd>{snapshot.index.shards ? `${snapshot.index.shards.stored}/${snapshot.index.shards.target}` : '—'}</dd></div><div><dt>{text.generated}</dt><dd>{fmtDate(snapshot.index.automation?.latestPublicGeneratedAt)}</dd></div></dl></article>
        <article className="panel site-stat-card"><span>{text.smartBuy}</span><strong>v{snapshot.smartBuy.smartBuyRuntimeRevision}</strong><dl><div><dt>{text.wfmLimit}</dt><dd>{fmt(snapshot.smartBuy.upstream?.publicRateLimitRequestsPerSecond, 2)} {text.perSecond}</dd></div><div><dt>{text.smartBuyRate}</dt><dd>{fmt(smartBuyConfiguredRate, 2)} {text.perSecond}</dd></div><div><dt>{text.maxSeries}</dt><dd>{fmt(smartBuyMaxSeries)}</dd></div><div><dt>{text.cacheEntries}</dt><dd>{fmt(cacheSummary?.entries)}</dd></div></dl></article>
      </section>

      <section className="panel site-stats-limits">
        <div className="site-section-heading"><span className="eyebrow">{text.limits}</span><strong>{fmt(queueUse)}/{fmt(queueLimit)}</strong></div>
        <div className="limit-meter"><i style={{ width: `${pct(queueUse, queueLimit)}%` }}/></div>
        <div className="site-limit-grid">
          <div><span>{text.requestsDay}</span><strong>{fmt(snapshot.hourly.expectedWfmRequestsDay)}</strong></div>
          <div><span>{text.hourlyWfmLimit}</span><strong>{fmt(snapshot.hourly.runtimeLimits?.maxWfmRequestsDay)}</strong></div>
          <div><span>{text.queueMessagesDay}</span><strong>{fmt(snapshot.hourly.expectedQueueMessagesDay)}</strong></div>
          <div><span>{text.queueOpsDay}</span><strong>{fmt(snapshot.hourly.expectedQueueOperationsDay)}</strong></div>
          <div><span>{text.hourlyQueueLimit}</span><strong>{fmt(snapshot.hourly.runtimeLimits?.maxQueueOperationsDay)}</strong></div>
          <div><span>{text.combinedQueue}</span><strong>{fmt(queueUse)}</strong></div>
          <div><span>{text.queueBudget}</span><strong>{fmt(queueLimit)}</strong></div>
          <div><span>{text.requestSpacing}</span><strong>{fmt(smartBuyRequestInterval)} ms</strong></div>
          <div><span>{text.maxSessionSeries}</span><strong>{fmt(smartBuyMaxSessionSeries)}</strong></div>
          <div><span>{text.cooldown}</span><strong>{snapshot.freshness.cooldown?.active ? fmtDate(snapshot.freshness.cooldown.until) : '—'}</strong></div>
        </div>
      </section>

      <section className="panel site-stats-cache">
        <div className="site-section-heading"><span className="eyebrow">{text.cache}</span><strong>{fmtBytes(cacheSummary?.bytes)}</strong></div>
        <div className="site-limit-grid">
          <div><span>{text.cacheEntries}</span><strong>{fmt(cacheSummary?.entries)}</strong><small>{fmt(cacheSummary?.profileEntries)} profile · {fmt(cacheSummary?.userOrderEntries)} user orders · {fmt(cacheSummary?.itemOrderEntries)} item orders</small></div>
          <div><span>{text.profileTtl}</span><strong>{fmt(cacheSummary?.profileTtlSeconds)} {text.seconds}</strong></div>
          <div><span>{text.ordersTtl}</span><strong>{fmt(cacheSummary?.userOrdersTtlSeconds)} {text.seconds}</strong></div>
          <div><span>{text.itemsTtl}</span><strong>{fmt(smartBuyItemTtl)} {text.seconds}</strong></div>
        </div>
      </section>

      <section className="panel site-stats-buckets">
        <div className="site-section-heading"><span className="eyebrow">{text.freshness}</span><strong>{fmtDate(snapshot.freshness.generatedAt)}</strong></div>
        <div className="table-scroll"><table><thead><tr><th>Scope</th><th>Tier</th><th>{text.groups}</th><th>{text.fresh}</th><th>{text.due}</th><th>{text.stale}</th><th>{text.missing}</th><th>{text.oldest}</th></tr></thead><tbody>{snapshot.freshness.buckets.map(bucket => <tr key={`${bucket.scope}:${bucket.tier}`}><td>{bucket.scope}</td><td>{bucket.tier}</td><td>{bucket.groups}</td><td>{bucket.fresh}</td><td>{bucket.due}</td><td>{bucket.stale}</td><td>{bucket.missing}</td><td>{fmt(bucket.oldestAgeMinutes, 1)}</td></tr>)}</tbody></table></div>
      </section>

      <section className="panel site-stats-versions">
        <div className="site-section-heading"><span className="eyebrow">{text.versions}</span><strong>{text.catalog}: {snapshot.api.catalogTotal}</strong></div>
        <div className="version-chips"><span>Items {snapshot.api.publicItemVersion}</span><span>Normalized {snapshot.api.normalizedVersion}</span><span>Metrics {snapshot.api.metricsVersion}</span><span>Scanner {snapshot.api.scannerVersion}</span><span>Hourly {snapshot.hourly.runtimeRevision}</span><span>Index {snapshot.index.hourlyIndexRuntimeRevision}</span><span>Smart Buy {snapshot.smartBuy.smartBuyRuntimeRevision}</span><span>Events {snapshot.api.eventsVersion}</span></div>
      </section>
    </> : null}
  </main>
}
