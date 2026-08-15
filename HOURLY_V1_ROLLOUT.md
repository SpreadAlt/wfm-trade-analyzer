# Hourly v1 guarded rollout

Hourly collection must be deployed disabled. Deploying code must never start a full catalog crawl by itself.

## Upstream rules

- Endpoint: `GET https://api.warframe.market/v1/items/{slug}/statistics` until an equivalent documented v2 statistics route is available.
- Read only `payload.statistics_closed["48hours"]`.
- Send a descriptive `User-Agent`, `Platform`, `Crossplay`, `Language: en`, and `Accept: application/json`.
- Hard ceiling: below 3 requests/second.
- Runtime throttle: one request every 1,400 ms per consumer, plus a 6-second pause after each 20 requests.
- Respect `Retry-After`; retry 429, 509, and transient 5xx responses with backoff.
- Maximum two Queue consumer invocations at a time. Their theoretical aggregate ceiling is about 1.43 requests/second before request latency and pauses.

## Scopes and cadence

| Scope | High liquidity | Medium | Low | Dormant |
|---|---:|---:|---:|---:|
| Crossplay (PC request with Crossplay header; no Switch request) | 1h | 2h | 6h | 24h |
| Nintendo Switch | 4h | 8h | 24h | 24h |

For the current 3,837-item catalog (including 748 dormant items), this produces an estimated 64,916 WFM requests, 1,643 Queue messages, and 4,929 Queue operations per day. These are plan estimates; the Worker still pauses scheduling during a shared upstream cooldown and when backlog reaches the configured guard.

Before all group snapshots exist, the scheduler runs in bootstrap mode instead of mixing first-fill and recurring work. It waits for an empty Queue, selects up to six missing groups with high-liquidity crossplay groups first, and resumes any saved checkpoint even when the retry belongs to a later scheduled slot. Once all groups are present, normal cadence scheduling begins. Runtime revision `1.0.2` also exposes already-fetched checkpoint items through the read API, so one later 429 in the same group does not hide completed items. Cron does not add another scheduled batch until the previous Queue backlog reaches zero; this prevents overlapping hourly batches during WFM cooldowns.

Runtime revision `1.0.3` adds `GET /hourly-v1-freshness`. It classifies each current-plan group as `fresh`, `due`, `stale`, or `missing` from R2 custom metadata, summarizes every scope/tier, reports item-level group errors and checkpoints, and returns the most overdue groups. The response is cached for 60 seconds and does not read the large group bodies. Newly completed groups store first/last item fetch timestamps so updater freshness is independent from the latest non-empty trade bucket.

Runtime revision `1.0.4` replaces strict phase-only recurring selection with freshness scheduling. When Queue backlog is zero, each 15-minute tick selects at most 18 groups whose age has reached their cadence, ordered by `age / cadence`. A group skipped while another batch is running therefore remains due and is selected at the next empty-Queue tick instead of waiting for its next original phase. The 18-group ceiling corresponds to the plan's average of roughly 17.1 group messages per 15-minute slot and keeps the existing Queue operation estimate within the guarded daily budget.

PC, PlayStation, and Xbox with crossplay enabled all consume the same crossplay snapshot; the scheduler must not fetch that same shared market three times. Nintendo Switch stays separate and uses a lower-volume cadence based on observed demand. Separate non-crossplay PC/PS/Xbox hourly scopes are omitted to keep the free-tier budget focused on the markets users actually select; their existing daily v3 histories remain available.

Tier assignment is quota-based and deterministic. Items are ranked by `max(sales24h/25, averageVolume7d/20)` using the current Scanner v3 snapshot. Items with both values equal to zero become `dormant`. Up to 40% of the whole catalog is high, up to the next 25% is medium, remaining active items are low, and zero-liquidity items are dormant. Exact totals are emitted by `prepare-hourly-v1`; the Worker rejects plans above 70,000 item requests or 5,500 Queue operations per day.

## Cloudflare configuration

The Queue consumer must use:

```jsonc
{
  "max_batch_size": 1,
  "max_batch_timeout": 1,
  "max_retries": 5,
  "max_concurrency": 2
}
```

One Queue message contains at most 40 WFM item requests. `max_batch_size=1` keeps an invocation under the Workers Free external-subrequest limit of 50. Group snapshots are written as one R2 object per message, rather than one object per item, to keep R2 Class A writes low.

Add a Cron Trigger only after diagnostics pass:

```text
*/15 * * * *
```

## Safe order

1. Deploy the Worker with Hourly v1 disabled.
2. Confirm `/hourly-v1-status` reports `enabled=false` and Queue backlog 0.
3. POST `/prepare-hourly-v1` with the admin key. Do not use force on the first run.
4. Inspect plan totals, tier counts, expected WFM requests/day, and expected Queue operations/day.
5. Run the single-item diagnostic endpoint for Shell Shock and verify independent `mod_rank=0` and `mod_rank=3` series.
6. While global collection is paused, POST `/enqueue-hourly-v1-group?scope=crossplay&id=54a74454e779892d5e515638`; inspect its stored R2 object and last-error endpoint.
7. Configure Queue concurrency/batch settings and the 15-minute Cron Trigger.
8. Enable collection explicitly.
9. Watch backlog, 429/509 counts, stale groups, and daily operation estimates for at least one full cadence before connecting hourly columns to the frontend.

Pause Hourly v1 and wait for backlog 0 before any Items/Metrics/Scanner rebuild that uses the same Queue.
