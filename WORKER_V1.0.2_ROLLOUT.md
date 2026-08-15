# Worker runtime 1.0.2 — безопасный deploy

Это API/runtime-обновление. Оно не меняет сохранённые Hourly group-файлы и не требует повторных `prepare`, `enqueue`, `finalize`, raw backfill или Normalization v3.1.

## 1. Deploy

Разверните `FrameAnalytics_Worker_v1.0.2.js` с прежними bindings:

- `HISTORY` → существующий R2 bucket;
- `JOBS` → существующая Queue producer/consumer;
- прежний `ADMIN_KEY`;
- Cron `*/15 * * * *`;
- Queue batch size `1`, concurrency `2`.

## 2. Проверка runtime

```powershell
$ApiBase = "https://frameanalytics-api-test.smurfack403.workers.dev"

Invoke-RestMethod "$ApiBase/" |
    Select-Object hourlyVersion,hourlyPlanRevision,hourlyIndexVersion,hourlyIndexRuntimeRevision,eventsVersion |
    Format-List
```

Ожидается `hourlyIndexRuntimeRevision = 1.0.2`, `eventsVersion = 1.0`.

## 3. Events v1

Можно просто дождаться следующего Cron. Для немедленного первого снимка допустим один защищённый вызов — это не Queue job:

```powershell
$AdminKey = (Read-Host "Введите ADMIN_KEY").Trim()
$AuthHeaders = @{ Authorization = "Bearer $AdminKey" }

Invoke-RestMethod -Method Post -Uri "$ApiBase/refresh-events-v1" -Headers $AuthHeaders |
    Select-Object eventsVersion,generatedAt,historyPolicy,matchedItems,unmatchedCount |
    Format-List

Invoke-RestMethod "$ApiBase/events-v1-status" | Format-List
```

История событий начинается с первого наблюдения. `unmatchedCount` диагностический: неизвестная ссылка World State не привязывается к предмету приблизительно и не влияет на прогноз.

## 4. Проверка глобальной сортировки

```powershell
$Top = Invoke-RestMethod "$ApiBase/api/hourly-index-v1?platform=pc&crossplay=true&rank=all&period=30&mode=buy&groupItems=true&includeDaily=true&sort=change1h&direction=desc&limit=25&lang=ru"

$Top | Select-Object groupedByItem,filteredItems,filteredRows,returned,returnedRows | Format-List
$Top.items | Select-Object displayName,marketKey,currentPrice,change1h,change1hPlatinum | Format-Table -AutoSize
```

`returned` — количество предметов страницы; `returnedRows` может быть больше из-за rank/variant строк. Строки одного `itemId` должны идти подряд.

## 5. После проверки

Обновите GitHub frontend. Cloudflare, подключённый к репозиторию, соберёт v0.8.0 автоматически. Никаких ручных Hourly Index jobs запускать не нужно.
