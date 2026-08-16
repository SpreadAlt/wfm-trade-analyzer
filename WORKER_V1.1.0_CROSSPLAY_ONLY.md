# Worker v1.1.0 — crossplay-only Hourly updater

Nintendo Switch is removed from Hourly v1 scheduling because its low activity does not justify the recurring upstream and Queue cost. The immutable daily v3 Switch data remains available in the platform selector and is not deleted.

## Budget effect

Using the stored v1.5 tier counts and cadence:

- previous WFM requests/day: `64,916`;
- crossplay-only WFM requests/day: `51,484`;
- removed Switch requests/day: `13,432` (`20.7%`);
- previous Hourly Queue messages/day: `1,643`;
- crossplay-only Hourly Queue messages/day: `1,303`;
- removed messages/day: `340` (`20.7%`);
- crossplay-only Hourly Queue operations/day: about `3,909`, before the small Hourly Index budget.

The same processing capacity therefore has about `26%` more headroom for the remaining crossplay work. The high tier keeps its 60 minute target; this change improves the probability of meeting it but does not make the target shorter than 60 minutes.

## Rollout

1. In `frameanalytics-jobs` consumer settings use maximum concurrency `2` and maximum batch size `1`.
2. Deploy `FrameAnalytics_Worker_v1.1.0.js`.
3. Deploy frontend v0.8.6.
4. Do not pause, prepare, force or manually enqueue Hourly v1.
5. Existing queued Switch jobs are acknowledged as `scope-disabled`; existing R2 objects are retained.
6. The next automatic Hourly Index build contains only crossplay shards.

Verify without mutation:

```powershell
$ApiBase = "https://frameanalytics-api-test.smurfack403.workers.dev"
$Status = Invoke-RestMethod -Method Get -Uri "$ApiBase/hourly-v1-status"
[PSCustomObject]@{
    runtimeRevision = $Status.runtimeRevision
    enabled = $Status.enabled
    activeScopes = $Status.activeScopes -join ","
    disabledScopes = $Status.disabledScopes -join ","
    groups = $Status.groups.target
    requestsDay = $Status.expectedWfmRequestsDay
    queueMessagesDay = $Status.expectedQueueMessagesDay
    queueOperationsDay = $Status.expectedQueueOperationsDay
    backlog = $Status.queue.backlogCount
    lastFetchedAt = $Status.lastFetchedAt
} | Format-List
```

Expected core values:

```text
runtimeRevision   1.1.0
activeScopes      crossplay
disabledScopes    switch
groups            97
requestsDay       51484
queueMessagesDay  1303
queueOperationsDay 3909
```
