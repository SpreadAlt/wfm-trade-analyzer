# Worker v1.0.4 — independent ranks and portfolio batches

This is a read-only API update. It does not rewrite R2 data and does not call Warframe Market.

Changes:

- Scanner and Hourly Index rows are sorted and paginated independently (`groupItems=false`).
- Hourly Index can sort by the same daily fields as Scanner when a daily row exists.
- `/api/scanner-v3` and `/api/hourly-index-v1` accept `ids=id1,id2,...` (maximum 200 unique IDs).
- The `/portfolio` frontend uses this filter to load only purchased items in batches.

## Deploy

Deploy `FrameAnalytics_Worker_v1.0.4.js` to `frameanalytics-api-test` with the existing `HISTORY`, `JOBS`, Queue consumer, Cron and `ADMIN_KEY` configuration.

Do not run prepare, enqueue, finalize or force. The update is compatible with the currently finalized Items v3, Metrics v3, Scanner v3, Hourly v1 and Hourly Index v1 objects.

## Verify

```powershell
$ApiBase = "https://frameanalytics-api-test.smurfack403.workers.dev"
$ShellShockId = "54a74454e779892d5e515638"

$Root = Invoke-RestMethod "$ApiBase/"
$Root | Select-Object hourlyIndexRuntimeRevision | Format-List

$Rows = Invoke-RestMethod (
    "$ApiBase/api/hourly-index-v1" +
    "?platform=pc&crossplay=true&rank=all" +
    "&ids=$ShellShockId&includeDaily=true" +
    "&groupItems=false&sort=currentPrice&direction=asc&limit=200"
)

$Rows | Select-Object ok,groupedByItem,filteredItems,returned | Format-List
$Rows.items | Select-Object itemId,marketKey,selectedModRank,currentPrice | Format-Table -AutoSize
```

Expected:

- `hourlyIndexRuntimeRevision = 1.0.4`
- `groupedByItem = False`
- every returned row has the requested item ID
- rank rows are separate records and are not forced into one item group

After the Worker check, deploy the frontend normally through the connected GitHub repository. Open `/portfolio`, create the temporary local account, add a purchase from an item page and verify the current value and possible-profit columns.

## Daily history for non-maximum ranks

This release does not invent missing daily analytics for non-maximum ranks. The existing raw daily files do contain exact `closed` records with `mod_rank`; they require a new immutable Rank History derived pipeline. Until that pipeline is finalized, non-canonical ranks show their real Hourly v1 values and leave unavailable daily fields empty.
