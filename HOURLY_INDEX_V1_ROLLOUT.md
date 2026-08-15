# Hourly Index v1 — безопасный rollout

Hourly Index v1 — отдельный производный слой над уже сохранёнными файлами `public/hourly-v1/`.

- Он не обращается к Warframe Market.
- Он не меняет Hourly v1 plan `1.5`, cadence, tiers или updater.
- Он не объединяет `mod_rank`, `subtype`, `charges`, `amberStars` и `cyanStars`.
- Crossplay использует отдельный scope `crossplay`; Switch всегда использует scope `switch` и не входит в crossplay.
- В базовом rank-фильтре остаются rank 0 и предметы без rank dimension.
- Если для базового рынка нет hourly-серии, предмет остаётся в каталоге с `null`, а не заменяется другим rank.

## Что добавлено

Публичные и диагностические endpoints:

- `GET /hourly-index-v1-status`
- `GET /hourly-index-v1-diagnostic?platform=pc&crossplay=true&id={itemId}`
- `GET /hourly-index-v1-last-error`
- `GET /api/hourly-index-v1?...`

Административные endpoints:

- `POST /prepare-hourly-index-v1`
- `POST /enqueue-hourly-index-v1-shards`
- `POST /finalize-hourly-index-v1`

Новые R2 namespaces:

- `work/hourly-index-v1/`
- `public/hourly-index-v1/`
- `manifests/hourly-index-v1.json`
- `diagnostics/hourly-index-v1-last-error.json`

## Ограничение Queue consumer

Для общей Queue должен оставаться `max_batch_size = 1`. Один индексный shard читает максимум 32 Hourly group-файла и укладывается в лимит subrequests Worker Free. Не увеличивайте batch size перед rollout.

## 1. Предварительная диагностика

```powershell
$ApiBase = "https://frameanalytics-api-test.smurfack403.workers.dev"

$Status = Invoke-RestMethod -Method Get -Uri "$ApiBase/hourly-v1-status"
$Nonce = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$Fresh = Invoke-RestMethod -Method Get -Uri "$ApiBase/hourly-v1-freshness?scope=all&limit=25&t=$Nonce"

[PSCustomObject]@{
    enabled   = $Status.enabled
    backlog   = $Status.queue.backlogCount
    stored    = $Status.groups.stored
    remaining = $Status.groups.remaining
    fresh     = $Fresh.totals.fresh
    due       = $Fresh.totals.due
    stale     = $Fresh.totals.stale
    missing   = $Fresh.totals.missing
} | Format-List
```

Перед enqueue индекса обязательны:

- `stored = 194`
- `remaining = 0`
- `missing = 0`
- `backlog = 0`

`due` и небольшое количество `stale` не разрушают индекс: каждая строка сохраняет собственный `fetchedAt`. Но лучше дождаться устойчивого состояния updater.

## 2. Административный заголовок

```powershell
$AdminKey = (Read-Host "Введите ADMIN_KEY").Trim()
$AuthHeaders = @{ Authorization = "Bearer $AdminKey" }
```

Не вставляйте ключ в команду вместе с Markdown-символами или обратными кавычками.

## 3. Prepare

Для первого production build лучше создать короткое стабильное окно: поставить новые Hourly ticks на паузу и дождаться завершения уже поставленных сообщений. Существующие Queue jobs продолжат работу; plan и сохранённые group-файлы не удаляются.

```powershell
Invoke-RestMethod `
    -Method Post `
    -Uri "$ApiBase/hourly-v1-control?action=pause&reason=hourly-index-v1-rollout" `
    -Headers $AuthHeaders

do {
    $HourlyStatus = Invoke-RestMethod "$ApiBase/hourly-v1-status"
    Write-Host "backlog=$($HourlyStatus.queue.backlogCount) checkpointed=$($HourlyStatus.checkpointedGroups)"
    if ($HourlyStatus.queue.backlogCount -gt 0 -or $HourlyStatus.checkpointedGroups -gt 0) {
        Start-Sleep -Seconds 5
    }
} while ($HourlyStatus.queue.backlogCount -gt 0 -or $HourlyStatus.checkpointedGroups -gt 0)
```

После этого prepare:

```powershell
$Prepare = Invoke-RestMethod `
    -Method Post `
    -Uri "$ApiBase/prepare-hourly-index-v1" `
    -Headers $AuthHeaders

$Prepare | ConvertTo-Json -Depth 10
```

Первый запуск выполняется без `force=true`. Ожидается 8 shards: по 4 для `crossplay` и `switch` при текущих 97 группах на scope.

## 4. Enqueue shards

Сначала повторно проверьте, что Queue пустая:

```powershell
(Invoke-RestMethod "$ApiBase/hourly-v1-status").queue
```

Затем:

```powershell
$Enqueue = Invoke-RestMethod `
    -Method Post `
    -Uri "$ApiBase/enqueue-hourly-index-v1-shards" `
    -Headers $AuthHeaders

$Enqueue | ConvertTo-Json -Depth 10
```

Endpoint идемпотентен: уже существующие shard keys не ставятся повторно.

## 5. Ожидание

```powershell
do {
    $IndexStatus = Invoke-RestMethod "$ApiBase/hourly-index-v1-status"

    Write-Host `
        "stored=$($IndexStatus.shards.stored)/$($IndexStatus.shards.target)" `
        "remaining=$($IndexStatus.shards.remaining)" `
        "backlog=$($IndexStatus.queue.backlogCount)"

    if ($IndexStatus.shards.remaining -gt 0 -or $IndexStatus.queue.backlogCount -gt 0) {
        Start-Sleep -Seconds 5
    }
} while ($IndexStatus.shards.remaining -gt 0 -or $IndexStatus.queue.backlogCount -gt 0)
```

При `backlog = 0`, но `remaining > 0`, сначала проверьте:

```powershell
Invoke-RestMethod "$ApiBase/hourly-index-v1-last-error" | ConvertTo-Json -Depth 20
```

Не повторяйте prepare с force без диагностики.

## 6. Finalize

```powershell
$Finalize = Invoke-RestMethod `
    -Method Post `
    -Uri "$ApiBase/finalize-hourly-index-v1" `
    -Headers $AuthHeaders

$Finalize | ConvertTo-Json -Depth 10
```

Finalize проверяет полное покрытие каталога для каждого scope. При текущем плане ожидается `itemCount = 3837` отдельно для `crossplay` и `switch`.

## 7. Контрольные запросы

```powershell
$ShellShockId = "54a74454e779892d5e515638"

Invoke-RestMethod `
    -Method Get `
    -Uri "$ApiBase/hourly-index-v1-diagnostic?platform=pc&crossplay=true&id=$ShellShockId" |
    ConvertTo-Json -Depth 20

$Top = Invoke-RestMethod `
    -Method Get `
    -Uri "$ApiBase/api/hourly-index-v1?platform=pc&crossplay=true&rank=all&sort=change1h&direction=desc&limit=25"

$Top.items | Select-Object `
    name,marketKey,currentPrice,change1h,change1hPlatinum,fetchedAt |
    Format-Table -AutoSize
```

Проверка базового rank-фильтра:

```powershell
$Base = Invoke-RestMethod `
    -Method Get `
    -Uri "$ApiBase/api/hourly-index-v1?platform=pc&crossplay=true&rank=base&sort=change24h&direction=desc&limit=25"

$Base | Select-Object scope,crossplay,switchIncluded,catalogTotal,marketSeries,filteredItems,returned | Format-List
```

После успешных finalize и diagnostic снова включите Hourly updater:

```powershell
Invoke-RestMethod `
    -Method Post `
    -Uri "$ApiBase/hourly-v1-control?action=enable&reason=hourly-index-v1-rollout-complete" `
    -Headers $AuthHeaders
```

## Параметры API

- `platform=pc|ps4|xbox|switch`
- `crossplay=true|false` — для `pc`, `ps4`, `xbox`; Switch всё равно остаётся отдельным
- `rank=base|all|{number}`
- `sort=name|currentPrice|change1h|change4h|change12h|change24h|latestAt|updated`
- `direction=asc|desc`
- `search=...`
- `category=...` или `categories=a,b`
- `subcategory=...`
- `defaultOnly=true|false`
- `minPrice=...`
- `offset=0`
- `limit=1..200`, по умолчанию `25`

Проценты и абсолютное изменение в platinum возвращаются парами, например `change4h` и `change4hPlatinum`.

## Force — только после диагностики

Если подготовленный build действительно нужно заменить:

```powershell
$ForceUri = "$ApiBase/prepare-hourly-index-v1?force=true&confirm=FORCE_HOURLY_INDEX_V1"
Invoke-RestMethod -Method Post -Uri $ForceUri -Headers $AuthHeaders
```

Старый публичный индекс остаётся доступен до успешного нового finalize.
