# FrameAnalytics v0.5.3

Real-data test build for FrameAnalytics.trade.

## Data

The scanner and item detail views use the FrameAnalytics test API. Scanner data is loaded per platform and analysis period. Item detail includes up to 90 days of closed-sales history.

## Build

```bash
npm install
npm run build
```

## Deploy

The project includes an explicit `wrangler.jsonc` for the existing `wfm-trade-analyzer` Worker. The `dist` directory is deployed as static assets with SPA fallback enabled.

```bash
npx wrangler deploy
```
