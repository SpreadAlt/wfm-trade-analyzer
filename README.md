# FrameAnalytics v0.8.6

Frontend for the canonical Items v3 → Metrics v3 → Scanner v3 pipeline. The backend keeps its technical Scanner v3 name, while the user interface calls this section Statistics.

## Data

The statistics page uses `/api/scanner-v3`, item pages use `/api/item-v3` and `/api/metrics-v3`, and localized item names/icons use the cached `/api/catalog-v3` endpoint. Scalar and variant markets remain separate. Public item history covers up to 180 days. Item pages link to the matching Warframe Market item without presenting FrameAnalytics as an order interface.

Platform and crossplay are independent preferences. Crossplay defaults to enabled. Nintendo Switch always disables crossplay and is never included in the crossplay scope. The current daily v3 dataset remains platform-specific and never merges platform histories.

The former analysis-period selector has been removed. The initial scanner score uses the longest displayed daily range; clicking a 7d/30d/90d/180d table heading switches the server-side analytics and global sorting to that period. The trend arrow uses consensus across the displayed ranges. Every percentage-change cell also shows its absolute platinum change underneath. Page size defaults to 25 and remains configurable.

Category v4 derives consistent category/subcategory assignments from current WFM item tags and is applied as a read-time overlay. It fixes previously split groups such as Arcane Helmets, Focus Lenses, Ayatan Sculptures, and Simulacrum rooms without rewriting finalized historical shards.

Hourly v1 supplies independent 1h/4h/12h/24h series for the exact crossplay scanner market key. It also retains the `90days` daily series already returned by the same WFM request, so it adds no upstream requests. Item charts merge those fresh daily points over the immutable 180-day Items v3 history, deduplicate by calendar date, and keep the newest 180 points. Hourly Index v1 provides global sorting for every intraday and daily scanner column. Ranks and variants are independent rows: they are never grouped for sorting or pagination. The current price and intraday changes use the hourly response when available, including absolute platinum change. Nintendo Switch remains daily-only. Uncollected groups remain visibly unavailable instead of falling back to another rank or variant.

The Updated column uses the WFM fetch timestamp. The latest non-empty trade bucket remains a separate series timestamp and is not presented as the updater's last successful run.

Rank 0/no-rank is the default scanner view and all available hourly ranks can be expanded independently. Normalization v3.1 daily analytics still contain only the catalog maximum-rank mod market, so non-canonical ranks deliberately show hourly values only; their daily potential, score, and forecast remain empty rather than borrowing max-rank analytics.

`/profile` is a separate authenticated application page. Profile settings and manually entered purchases are synchronized through the account Worker. Registration uses a six-digit email OTP; password recovery verifies another OTP and emails a generated 12-character password. The legacy `/portfolio` route remains readable for old links. The profile requests purchased item IDs from the finalized Hourly Index/Scanner in batches, shows the statistics columns for the exact purchased market series, and calculates current value, possible profit and return as `(current price − purchase price) × quantity`. It never contacts WFM directly.

Events v1 observes Digital Extremes' first-party World State feed for Baro Ki'Teer and Prime Resurgence inventory. Because the official endpoint rejects some Cloudflare egress IPs, the repository includes an authenticated hourly GitHub Actions relay. The Worker validates the relayed JSON before storing it. It maps normalized game references to market items, expands a matched Prime Set to its tradeable components, adds contextual icons and graph markers, and applies a supply-event downward tendency to the arrow without silently changing the Scanner v3 score. Event history starts when Events v1 is deployed; older events are never fabricated.

Ranked market rows are not grouped during sorting or pagination. Every rank occupies its own global position according to the selected column; equal values may still appear next to one another as a normal sort tie.

## Build

```bash
npm install
npm run build
```

## Deploy

Deploy Worker file `FrameAnalytics_Worker_v1.1.0.js` first because the frontend expects fresh daily history in Hourly v1 responses, independent Scanner/Hourly Index pagination, server-side daily and hourly sorting, `ids=` batch filtering for the profile, localized names, and Events v1. Runtime 1.1.0 preserves the v1.0.7 rate controls and stops scheduling Nintendo Switch Hourly groups. Switch remains available through immutable daily v3 data; only its live 1h/4h/12h layer is disabled. Set the `frameanalytics-jobs` consumer maximum concurrency to 2. No raw, normalization, Items, Metrics, Scanner, Hourly plan, or Scanner rebuild is required. Hourly Index refreshes automatically using only the crossplay scope.

The project includes an explicit `wrangler.jsonc` for the existing `wfm-trade-analyzer` Worker. The `dist` directory is deployed as static assets with SPA fallback enabled.

```bash
npx wrangler deploy
```

### Transactional email

The account Worker sends verification and recovery messages through Resend. Verify the sender domain first, then configure a no-reply sender and the API key before deploying:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put AUTH_EMAIL_FROM
```

Use a sender value such as `FrameAnalytics <no-reply@example.com>`. The Worker refuses verification and password recovery requests when email delivery is not configured; it never falls back to logging OTP codes or generated passwords.
