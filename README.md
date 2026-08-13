# FrameAnalytics v0.6.0

Frontend for the canonical Items v3 → Metrics v3 → Scanner v3 pipeline.

## Data

The scanner uses `/api/scanner-v3`, item pages use `/api/item-v3` and `/api/metrics-v3`, and localized item names/icons use the cached `/api/catalog-v3` endpoint. Scalar and variant markets remain separate. Public item history covers up to 180 days.

Platform and crossplay are independent preferences. Crossplay defaults to enabled, but the current daily v3 dataset remains platform-specific; the UI states this explicitly and never merges platform histories. Hourly 1h/4h/12h columns are present as unavailable placeholders until the planned 48-hour hourly updater is connected.

## Build

```bash
npm install
npm run build
```

## Deploy

Deploy the updated API Worker first because the frontend expects the read-only catalog endpoint and the v3 scanner extensions (`includeNoHistory`, numeric filters, and market-scope metadata). No pipeline prepare/enqueue/finalize action is required for this API-only change.

The project includes an explicit `wrangler.jsonc` for the existing `wfm-trade-analyzer` Worker. The `dist` directory is deployed as static assets with SPA fallback enabled.

```bash
npx wrangler deploy
```
