# Worker v1.0.5 — rolling daily history

This runtime keeps the `statistics_closed["90days"]` records that WFM already returns with every existing Hourly v1 request. It does not add WFM requests or Queue messages.

## Semantics

- `48hours` remains the source for 1h/4h/12h/24h.
- `90days` becomes the rolling daily overlay for item charts.
- Every `mod_rank`, `subtype`, `charges`, `amberStars`, and `cyanStars` series stays independent.
- The frontend overlays a matching live daily series on Items v3 history by date and retains at most 180 dates.
- Missing dates remain missing; no price is fabricated or forward-filled.
- Items/Metrics/Scanner v3 are not rebuilt by this rollout. Potential, score, and quartile analytics remain v3 until a later Metrics rolling layer is introduced.

## Deploy

Deploy `FrameAnalytics_Worker_v1.0.5.js` with the existing `HISTORY`, `JOBS`, Queue consumer, cron trigger, and `ADMIN_KEY` configuration. Do not prepare or force the Hourly plan again.

After deployment, verify the runtime:

```powershell
$ApiBase = "https://frameanalytics-api-test.smurfack403.workers.dev"
Invoke-RestMethod "$ApiBase/" | Select-Object hourlyVersion,hourlyPlanRevision
Invoke-RestMethod "$ApiBase/hourly-v1-status" | Select-Object runtimeRevision,enabled,@{Name="backlog";Expression={$_.queue.backlogCount}}
```

Verify the upstream daily payload without enqueuing anything:

```powershell
$Diagnostic = Invoke-RestMethod "$ApiBase/hourly-v1-diagnostic?platform=pc&crossplay=true&slug=shell_shock"
$Diagnostic | Select-Object upstreamRecords,upstreamDailyRecords,dailyMarketKeys
$Diagnostic.dailySeriesSummary | Format-Table marketKey,points,firstDate,latestDate -AutoSize
```

Existing group objects receive `dailyHistory` during their next scheduled refresh. Check Shell Shock afterwards:

```powershell
$ShellShockId = "54a74454e779892d5e515638"
$Hourly = Invoke-RestMethod "$ApiBase/api/hourly-v1?platform=pc&crossplay=true&id=$ShellShockId&rank=all"
$Hourly.series | Select-Object marketKey,dailyLatestDate,@{Name="dailyPoints";Expression={$_.dailyHistory.Count}} | Format-Table -AutoSize
```

No `force`, manual enqueue, or pipeline rebuild is part of this rollout.
