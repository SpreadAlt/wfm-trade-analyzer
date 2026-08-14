# API Worker v0.9.0: Hourly v1 plan revision 1.5

Deploy the complete `FrameAnalytics_Items_v3_Metrics_v3_Scanner_v3_secured_worker.js` file supplied with this release. It preserves every existing Items v3, Metrics v3, Scanner v3, catalog, diagnostic, and Queue route and adds Hourly v1.

Deploying this file does not enqueue hourly work. The control object is created with `enabled=false` during prepare.

Plan revision 1.5 prioritizes the shared PC/PlayStation/Xbox crossplay market and gives the lower-volume Nintendo Switch market a lighter schedule. Crossplay refreshes the top 40% hourly, the next 25% every two hours, remaining active items every six hours, and dormant items daily. Switch refreshes high items every four hours, medium items every eight hours, and all low/dormant items daily. Separate non-crossplay PC/PS/Xbox hourly requests remain intentionally omitted.

Worker v0.8.1 immediately acknowledges Queue messages whose `planId` is obsolete instead of retrying them. No WFM request is made for these stale messages. Preparing a fresh plan also clears diagnostics inherited from the previous plan lifecycle.

Worker v0.8.2 reduces the active request burst to one item every 700 ms with a six-second pause after each 20 items. A WFM 429 or 509 creates a shared upstream cooldown, so other Queue groups are delayed without sending more upstream requests. The plan is rejected above 100,000 estimated WFM item requests or 8,000 Queue operations per day.

Worker v0.8.3 keeps the conservative request throttle and reduces scheduled volume to a sustainable target below 70,000 WFM item requests and 5,500 Queue operations per day. Cron ticks do not enqueue while a shared WFM cooldown is active, and a backlog of 40 or more messages activates the backlog guard.

Worker v0.9.0 adds resumable group checkpoints. If a group receives a transient upstream failure after some items have completed, its successful item payloads are written to a work checkpoint and the retry resumes at the failed item instead of repeating the whole group. A newer scheduled run supersedes an older checkpoint safely. Status exposes `checkpointedGroups`. The v0.9.0 throttle is 750 ms per request with a six-second pause after 20 requests; two Queue consumers have a theoretical aggregate ceiling of about 2.67 requests/second before request latency and pauses.

## Required bindings and trigger settings

- R2 bucket `frameanalytics-history` as `HISTORY`.
- Queue `frameanalytics-jobs` as producer binding `JOBS` and as this Worker's consumer.
- Secret `ADMIN_KEY`.
- Queue consumer: batch size `1`, timeout `1`, retries `5`, concurrency `2`.
- Cron `*/15 * * * *`, added only after the single-item and single-group checks pass.

Equivalent Wrangler fragment:

```jsonc
{
  "r2_buckets": [
    { "binding": "HISTORY", "bucket_name": "frameanalytics-history" }
  ],
  "queues": {
    "producers": [
      { "binding": "JOBS", "queue": "frameanalytics-jobs" }
    ],
    "consumers": [
      {
        "queue": "frameanalytics-jobs",
        "max_batch_size": 1,
        "max_batch_timeout": 1,
        "max_retries": 5,
        "max_concurrency": 2
      }
    ]
  },
  "triggers": {
    "crons": ["*/15 * * * *"]
  }
}
```

## New routes

Public/read-only:

- `GET /hourly-v1-status`
- `GET /hourly-v1-last-error`
- `GET /api/hourly-v1?platform=pc&crossplay=true&id={itemId}&rank=base`

Admin-only POST:

- `/prepare-category-v4`
- `/prepare-hourly-v1`
- `/hourly-v1-diagnostic?platform=pc&crossplay=true&slug=shell_shock`
- `/enqueue-hourly-v1-group?scope=crossplay&id={itemId}` for exactly one guarded Queue group while Hourly v1 is paused
- `/hourly-v1-control?action=enable`
- `/hourly-v1-control?action=pause`
- `/enqueue-hourly-v1` for a manual scheduled-slot test after enabling

`rank=base` returns no-rank series plus exact rank 0. `rank=all` returns every rank independently. No ranks or variants are aggregated.

## PowerShell rollout

```powershell
$ApiBase = "https://frameanalytics-api-test.smurfack403.workers.dev"
$Headers = @{ Authorization = "Bearer YOUR_ADMIN_KEY" }

# 1. Read-only: code should be present but not prepared/enabled yet.
curl.exe "$ApiBase/hourly-v1-status"

# 2. Rebuilds only the small category overlay from current WFM tags.
Invoke-RestMethod -Method Post -Uri "$ApiBase/prepare-category-v4" -Headers $Headers
Invoke-RestMethod -Method Get -Uri "$ApiBase/category-v4-status"

# 3. Builds the hourly plan only. No WFM crawl is enqueued.
Invoke-RestMethod -Method Post -Uri "$ApiBase/prepare-hourly-v1" -Headers $Headers

# 4. Check plan budgets and confirm enabled=false and backlogCount=0.
Invoke-RestMethod -Method Get -Uri "$ApiBase/hourly-v1-status"

# 5. One live upstream read, no R2 history write.
Invoke-RestMethod -Method Post -Uri "$ApiBase/hourly-v1-diagnostic?platform=pc&crossplay=true&slug=shell_shock" -Headers $Headers

# 6. Queue exactly one group containing Shell Shock while global collection is still paused.
$ShellShockId = "54a74454e779892d5e515638"
Invoke-RestMethod -Method Post -Uri "$ApiBase/enqueue-hourly-v1-group?scope=crossplay&id=$ShellShockId" -Headers $Headers

# Wait for backlogCount=0, then verify one stored group and the saved rank-separated result.
Invoke-RestMethod -Method Get -Uri "$ApiBase/hourly-v1-status" | ConvertTo-Json -Depth 10
Invoke-RestMethod -Method Get -Uri "$ApiBase/api/hourly-v1?platform=pc&crossplay=true&id=$ShellShockId&rank=all" | ConvertTo-Json -Depth 20
Invoke-RestMethod -Method Get -Uri "$ApiBase/hourly-v1-last-error" | ConvertTo-Json -Depth 10
```

Expected Shell Shock diagnostic keys include both `mod_rank=0` and `mod_rank=3`. Stop if they do not.

The category overlay corrects 73 catalog items: 26 top-level category fields and 66 subcategory fields, including all Arcane Helmets, Focus Lenses, Ayatan Sculptures, and Simulacrum rooms. It does not rewrite stored Items/Metrics/Scanner shards; their read APIs apply the overlay.

Do not enable during the first verification. First send the single-group status, saved Shell Shock response, and last-error output for review. The existing raw, Normalization v3.1, Items v3, Metrics v3, and Scanner v3 data are not rebuilt by these steps.
