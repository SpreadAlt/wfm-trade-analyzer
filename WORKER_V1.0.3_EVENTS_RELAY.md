# Worker v1.0.3 — Events v1 relay hotfix

Причина hotfix: `api.warframe.com` возвращает `403` некоторым исходящим IP Cloudflare Workers. Это не ошибка `ADMIN_KEY` и не проблема R2.

Hotfix сохраняет официальный World State источником данных, но доставляет его через подписанный GitHub Actions request:

`api.warframe.com → GitHub Actions → защищённый /refresh-events-v1 → R2`

Worker принимает не более 2 MB JSON, требует прежний `ADMIN_KEY` и проверяет наличие массивов `VoidTraders` и `PrimeVaultTraders`. Старые Items, Metrics, Scanner, Hourly и Hourly Index не перестраиваются.

## 1. Deploy Worker

Разверните `FrameAnalytics_Worker_v1.0.3.js` с прежними bindings, Queue consumer, Cron и `ADMIN_KEY`.

Проверка:

```powershell
$ApiBase = "https://frameanalytics-api-test.smurfack403.workers.dev"

Invoke-RestMethod "$ApiBase/" |
    Select-Object eventsVersion,eventsRuntimeRevision,hourlyIndexRuntimeRevision |
    Format-List
```

Ожидается `eventsVersion = 1.0`, `eventsRuntimeRevision = 1.0.1` и прежний `hourlyIndexRuntimeRevision = 1.0.2`.

## 2. Немедленный локальный тест

```powershell
$AdminKey = (Read-Host "Введите ADMIN_KEY").Trim()
$AuthHeaders = @{ Authorization = "Bearer $AdminKey" }

$WorldStateJson = (Invoke-WebRequest `
    -UseBasicParsing `
    -Uri "https://api.warframe.com/cdn/worldState.php").Content

Invoke-RestMethod `
    -Method Post `
    -Uri "$ApiBase/refresh-events-v1" `
    -Headers $AuthHeaders `
    -ContentType "application/json" `
    -Body $WorldStateJson |
    Select-Object eventsVersion,eventsRuntimeRevision,sourceTransport,generatedAt,matchedItems,unmatchedCount |
    Format-List

Invoke-RestMethod "$ApiBase/events-v1-status" | Format-List
```

Ожидается `sourceTransport = authenticated-relay` и `ready = True`.

## 3. Автоматизация GitHub

1. Добавьте файл `.github/workflows/refresh-warframe-events.yml` из hotfix в репозиторий.
2. Откройте GitHub: `Settings → Secrets and variables → Actions`.
3. Создайте repository secret `FRAMEANALYTICS_ADMIN_KEY` со значением текущего Cloudflare `ADMIN_KEY`.
4. Необязательно создайте variable `FRAMEANALYTICS_API_BASE`. Без неё workflow использует тестовый URL FrameAnalytics.
5. Откройте `Actions → Refresh Warframe event context → Run workflow` для первой проверки.

После проверки workflow запускается каждый час на 17-й минуте. Он не сохраняет World State в GitHub artifact и не печатает ключ.

## 4. Что не запускать

Не нужны:

- `prepare`;
- Queue enqueue;
- `force=true`;
- Items/Metrics/Scanner rebuild;
- Hourly/Hourly Index rebuild.

Существующий Cloudflare Cron продолжает Hourly pipeline. Если подписанный снимок Events свежее 90 минут, Worker не повторяет прямой запрос к заблокированному источнику.

