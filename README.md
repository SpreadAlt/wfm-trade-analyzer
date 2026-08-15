# FrameAnalytics v0.8.0

Frontend for the canonical Items v3 → Metrics v3 → Scanner v3 pipeline.

## Data

The scanner uses `/api/scanner-v3`, item pages use `/api/item-v3` and `/api/metrics-v3`, and localized item names/icons use the cached `/api/catalog-v3` endpoint. Scalar and variant markets remain separate. Public item history covers up to 180 days.

Platform and crossplay are independent preferences. Crossplay defaults to enabled. Nintendo Switch always disables crossplay and is never included in the crossplay scope. The current daily v3 dataset remains platform-specific and never merges platform histories.

The former analysis-period selector has been removed. The initial scanner score uses the longest displayed daily range; clicking a 7d/30d/90d/180d table heading switches the server-side analytics and global sorting to that period. The trend arrow uses consensus across the displayed ranges. Every percentage-change cell also shows its absolute platinum change underneath. Page size defaults to 25 and remains configurable.

Category v4 derives consistent category/subcategory assignments from current WFM item tags and is applied as a read-time overlay. It fixes previously split groups such as Arcane Helmets, Focus Lenses, Ayatan Sculptures, and Simulacrum rooms without rewriting finalized historical shards.

Hourly v1 supplies independent 1h/4h/12h/24h series for the exact scanner market key. Hourly Index v1 provides global sorting for every intraday column and keeps all ranks/variants of one item together. The current price and intraday changes use the hourly response when available, including absolute platinum change. Uncollected groups remain visibly unavailable instead of falling back to another rank or variant.

The Updated column uses the WFM fetch timestamp. The latest non-empty trade bucket remains a separate series timestamp and is not presented as the updater's last successful run.

Rank 0/no-rank is the default scanner view and all available hourly ranks can be expanded independently. Normalization v3.1 daily analytics still contain only the catalog maximum-rank mod market, so non-canonical ranks deliberately show hourly values only; their daily potential, score, and forecast remain empty rather than borrowing max-rank analytics.

The test account is deliberately local-only. It stores manually entered purchases in browser `localStorage`; permanent authentication and server synchronization are not presented as available yet.

Events v1 observes Digital Extremes' first-party World State feed for Baro Ki'Teer and Prime Resurgence inventory. It maps exact game references to market items, adds contextual icons and graph markers, and applies a supply-event downward tendency to the arrow without silently changing the Scanner v3 score. Event history starts when Events v1 is deployed; older events are never fabricated.

## Build

```bash
npm install
npm run build
```

## Deploy

Deploy Worker runtime `1.0.2` first because the frontend expects grouped Scanner/Hourly Index pagination, localized server-side name sorting, daily enrichment of hourly rows, and Events v1. No raw, normalization, Items, Metrics, Scanner, Hourly, or Hourly Index rebuild is required for this API-only change.

The project includes an explicit `wrangler.jsonc` for the existing `wfm-trade-analyzer` Worker. The `dist` directory is deployed as static assets with SPA fallback enabled.

```bash
npx wrangler deploy
```
