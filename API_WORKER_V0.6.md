# API Worker v0.6 companion change

Deploy the complete `FrameAnalytics_Items_v3_Metrics_v3_Scanner_v3_secured_worker.js` Worker before deploying this frontend.

This is a read/API-only change. It does **not** require `prepare`, Queue enqueue, `force=true`, or finalization, and it does not rewrite Items v3, Metrics v3, Scanner v3, normalized v3.1, or raw history.

## Added public behavior

- `GET /api/catalog-v3?lang=ru`
  - returns exactly the finalized 3,837 catalog IDs;
  - enriches them with a cached WFM v2 localized name and image when available;
  - falls back to the finalized Items v3 identity catalog if the upstream catalog is temporarily unavailable.
- `GET /api/scanner-v3`
  - accepts `includeNoHistory=true` so catalog items without a market series still appear;
  - accepts `minPrice` and `minPotential`;
  - accepts the independent `crossplay` preference and explicitly returns `crossplaySupported: false` and `marketScope: "platform"` while daily history remains platform-specific.

## Required bindings

- R2 bucket: `HISTORY`
- Queue producer and consumer: `JOBS`
- Secret used by mutating pipeline endpoints: `ADMIN_KEY`

Keep the `queue(batch, env)` handler in the deployed Worker. Replacing it with a read-only fetch handler would break the registered Queue consumer.

## Safe verification

After deployment, use read-only GET requests:

```powershell
$ApiBase = "https://frameanalytics-api-test.smurfack403.workers.dev"
curl.exe "$ApiBase/api/catalog-v3?lang=ru"
curl.exe "$ApiBase/api/scanner-v3?platform=pc&period=30&mode=buy&includeLow=true&includeNoHistory=true&limit=25&crossplay=true"
```

Expected checks:

- catalog response: `catalogTotal = 3837`;
- scanner response: `catalogTotal = 3837`;
- `crossplayRequested = true`;
- `crossplaySupported = false` until a real crossplay-aware source is connected;
- Queue backlog remains unchanged because these are GET endpoints.
