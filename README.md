# FrameAnalytics v0.6.1

Frontend for the canonical Items v3 → Metrics v3 → Scanner v3 pipeline.

## Data

The scanner uses `/api/scanner-v3`, item pages use `/api/item-v3` and `/api/metrics-v3`, and localized item names/icons use the cached `/api/catalog-v3` endpoint. Scalar and variant markets remain separate. Public item history covers up to 180 days.

Platform and crossplay are independent preferences. Crossplay defaults to enabled. Nintendo Switch always disables crossplay and is never included in the crossplay scope. The current daily v3 dataset remains platform-specific and never merges platform histories.

The former analysis-period selector has been removed. The scanner score uses the longest displayed daily range, while the trend arrow uses consensus across the displayed ranges. Every percentage-change cell also shows its absolute platinum change underneath. Page size defaults to 25 and remains configurable.

Category v4 derives consistent category/subcategory assignments from current WFM item tags and is applied as a read-time overlay. It fixes previously split groups such as Arcane Helmets, Focus Lenses, Ayatan Sculptures, and Simulacrum rooms without rewriting finalized historical shards.

Hourly 1h/4h/12h columns remain unavailable until Hourly v1 has completed its guarded rollout. Rank filters must not be exposed against Normalization v3.1 because that layer intentionally retained only catalog maximum-rank mod markets; rank 0 and all-rank browsing require independent rank series in the next derived namespace.

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
