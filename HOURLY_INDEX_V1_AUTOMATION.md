# Hourly Index v1 runtime 1.0.2 — автоматическое обновление и frontend API

Runtime `1.0.2` сохраняет автоматизацию `1.0.1` и добавляет безопасные read-only возможности для frontend. Версии источников не меняются:

- Hourly version: `1.0`
- Hourly runtime: `1.0.4`
- Hourly plan revision: `1.5`
- Hourly Index version: `1.0`
- Hourly Index runtime: `1.0.2`

Дополнительно runtime `1.0.2`:

- сортирует `1h/4h/12h/24h` глобально, а не внутри текущей страницы;
- при `groupItems=true` держит ранги и variants одного `itemId` рядом и считает pagination по предметам;
- при `includeDaily=true` прикладывает точную daily Scanner v3 строку без смешивания market dimensions;
- сортирует названия по выбранной локализации через `lang`;
- добавляет forward-only Events v1 для Baro и Prime Resurgence.

Повторный prepare Hourly v1, новый plan и backfill не требуются.

## Поведение

Cron продолжает срабатывать каждые 15 минут.

1. Если публичному Hourly Index меньше 60 минут, выполняется обычный Hourly v1 tick.
2. Если индексу 60 минут или больше и Queue свободна, Cron создаёт новый Hourly Index build.
3. В Queue ставятся 8 shard jobs и один finalizer.
4. Старый публичный индекс остаётся доступным на протяжении всего build.
5. Finalizer публикует новый индекс только после появления всех восьми shards.
6. Если finalizer был доставлен раньше shards, он повторяется через 30 секунд.
7. После успешного finalize удаляются work-shards предыдущего build. Текущий build остаётся для status и diagnostics.
8. Если незавершённый build остался без Queue backlog, следующий Cron продолжает его, а не создаёт ещё один build.

Автоматический индекс не выполняет запросы к Warframe Market. Он читает только уже сохранённые `public/hourly-v1/` файлы.

## Расчёт бесплатного Queue budget

При текущем плане:

- Hourly updater: приблизительно `4929` Queue operations/day.
- Hourly Index: `8 shards + 1 finalizer = 9 messages/hour`.
- Индекс: `9 × 24 × 3 = 648 operations/day`.
- Всего: приблизительно `5577 operations/day`.
- Cloudflare Workers Free включает `10000 Queue operations/day`.

## Deploy

Разверните полный `FrameAnalytics_Worker_v1.0.2.js` поверх существующего API Worker.

Не меняйте:

- `HISTORY` R2 binding;
- `JOBS` Queue binding;
- Queue consumer `max_batch_size = 1`;
- Queue consumer `max_concurrency = 2`;
- Cron `*/15 * * * *`;
- `ADMIN_KEY`.

Деплой не требует паузы Hourly updater: новый runtime совместим с текущими Hourly v1 Queue jobs.

## Проверка после deploy

```powershell
$ApiBase = "https://frameanalytics-api-test.smurfack403.workers.dev"

Invoke-RestMethod "$ApiBase/" |
    Select-Object `
        hourlyVersion,
        hourlyPlanRevision,
        hourlyIndexVersion,
        hourlyIndexRuntimeRevision |
    Format-List
```

Ожидается:

```text
hourlyVersion              : 1.0
hourlyPlanRevision         : 1.5
hourlyIndexVersion         : 1.0
hourlyIndexRuntimeRevision : 1.0.2
```

## Status автоматизации

```powershell
$IndexStatus = Invoke-RestMethod "$ApiBase/hourly-index-v1-status"

$IndexStatus | Select-Object `
    hourlyIndexVersion,
    hourlyIndexRuntimeRevision,
    buildId,
    finalizedAt,
    globalManifestReady,
    @{Name="backlog"; Expression={$_.queue.backlogCount}} |
    Format-List

$IndexStatus.automation | Format-List
```

Ожидаемая policy:

```text
enabled                    : True
refreshMinutes             : 60
combinedQueueOperationsDay : 5577
freeQueueOperationsDay     : 10000
withinFreeQueueBudget      : True
retention                  : keep-current-work-build
```

`nextRefreshAt` хранится в UTC. Frontend преобразует `fetchedAt` и другие даты в локальное время браузера.

## Наблюдение первого автоматического build

Ручные `prepare`, `enqueue` и `finalize` не нужны.

```powershell
for ($i = 1; $i -le 40; $i++) {
    $IndexStatus = Invoke-RestMethod "$ApiBase/hourly-index-v1-status"

    Write-Host `
        "runtime=$($IndexStatus.hourlyIndexRuntimeRevision)" `
        "build=$($IndexStatus.buildId)" `
        "stored=$($IndexStatus.shards.stored)/$($IndexStatus.shards.target)" `
        "remaining=$($IndexStatus.shards.remaining)" `
        "manifest=$($IndexStatus.globalManifestReady)" `
        "backlog=$($IndexStatus.queue.backlogCount)" `
        "next=$($IndexStatus.automation.nextRefreshAt)"

    Start-Sleep -Seconds 30
}
```

Во время нового build допустимо временно увидеть:

- новый `buildId`;
- `globalManifestReady = False`;
- `stored < 8`;
- Queue backlog больше нуля.

Публичный API в этот момент продолжает обслуживать предыдущий finalized index. Успешный результат нового цикла:

- `stored = 8`;
- `remaining = 0`;
- `globalManifestReady = True`;
- `backlog = 0`;
- новый `finalizedAt`;
- `totalErrorItems = 0` в manifest/diagnostics.

## Ошибки

```powershell
Invoke-RestMethod "$ApiBase/hourly-index-v1-last-error" |
    ConvertTo-Json -Depth 20

Invoke-RestMethod "$ApiBase/hourly-v1-last-error" |
    ConvertTo-Json -Depth 20
```

Не используйте force и не повторяйте ручной enqueue, пока Queue backlog больше нуля.
