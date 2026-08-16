# Worker v1.0.7 — global WFM rate control

The per-item 1.4 second delay applies inside one Queue invocation. With automatic Queue concurrency, Cloudflare may process several Hourly groups simultaneously, multiplying the actual upstream request rate and producing WFM `429` responses.

Runtime 1.0.7 keeps the conservative per-group delay and adds a 40 second start offset between scheduled groups. It does not increase the number of WFM requests or Queue messages. Runtime 1.0.6 daily fallback behavior is preserved.

## Required Queue setting

In Cloudflare open **Queues → frameanalytics-jobs → Settings → Edit consumer** and set:

- Maximum consumer invocations: `2`
- Maximum batch size: `1`

This caps the aggregate WFM rate while allowing two groups to make progress. Cloudflare documents fixed consumer concurrency specifically for upstream-limited workflows.

## Deployment

1. Change the Queue consumer settings above.
2. Deploy `FrameAnalytics_Worker_v1.0.7.js` with the existing bindings and Cron trigger.
3. Do not prepare, force or manually enqueue Hourly v1.
4. Existing backlog and checkpoints can finish normally.

Verify:

```powershell
$ApiBase = "https://frameanalytics-api-test.smurfack403.workers.dev"
$Status = Invoke-RestMethod -Method Get -Uri "$ApiBase/hourly-v1-status"
[PSCustomObject]@{
    runtimeRevision = $Status.runtimeRevision
    enabled = $Status.enabled
    backlog = $Status.queue.backlogCount
    lastFetchedAt = $Status.lastFetchedAt
    cooldownUntil = $Status.upstreamCooldown.until
    groupSpacing = $Status.runtimeThrottle.groupStartSpacingSeconds
    recommendedConcurrency = $Status.runtimeThrottle.recommendedConsumerMaxConcurrency
} | Format-List
```

Expected runtime values are `1.0.7`, `40`, and `2`. A historical `hourly-v1-last-error` object is not proof of a current failure; compare its timestamp with `lastFetchedAt` and monitor new errors after deployment.
