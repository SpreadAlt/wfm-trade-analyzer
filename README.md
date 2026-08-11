# FrameAnalytics v0.5.0

Real-data test build for FrameAnalytics.trade.

## Data

The scanner and item detail views use the FrameAnalytics test API. Scanner data is loaded per platform and analysis period. Item detail includes up to 90 days of closed-sales history.

## Build

```bash
npm install
npm run build
```

Deploy the generated `dist` directory with Cloudflare Workers/Pages.
