# Worker v1.0.6 — Hourly continuity hotfix

Worker v1.0.5 treated both WFM statistics arrays as mandatory. A temporary response without `statistics_closed["90days"]` could therefore interrupt the entire Queue group even when `48hours` was valid.

Runtime 1.0.6 changes that behavior:

- `48hours` remains required for an Hourly fetch;
- a missing `90days` array no longer stops the Queue group;
- the last stored daily overlay is preserved when `90days` is temporarily unavailable;
- the next successful response replaces the preserved overlay normally;
- the Hourly plan, Items, Metrics, Scanner and Hourly Index are not rebuilt.

## Deploy

Deploy `FrameAnalytics_Worker_v1.0.6.js` with the existing `HISTORY`, `JOBS`, Queue consumer, Cron trigger and `ADMIN_KEY` configuration.

Do not call prepare, force or bulk enqueue. Verify the current state first:

```powershell
$ApiBase = "https://frameanalytics-api-test.smurfack403.workers.dev"
$Status = Invoke-RestMethod -Method Get -Uri "$ApiBase/hourly-v1-status"
[PSCustomObject]@{
    runtimeRevision = $Status.runtimeRevision
    enabled = $Status.enabled
    backlog = $Status.queue.backlogCount
    checkpointedGroups = $Status.checkpointedGroups
    checkpointedItems = $Status.checkpointedItems
    lastFetchedAt = $Status.lastFetchedAt
    cooldownUntil = $Status.upstreamCooldown.until
} | Format-List
Invoke-RestMethod -Method Get -Uri "$ApiBase/hourly-v1-last-error" | ConvertTo-Json -Depth 20
```

After deployment, `runtimeRevision` must be `1.0.6`. Existing scheduled updates continue from the saved plan and checkpoints.
