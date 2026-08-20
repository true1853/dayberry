# Runbook: перенос эскроу прямых сделок на точную связь

Исполняется оператором выпуска в PowerShell. Все команды снимают доказательства
в файлы; шаг без доказательства считается невыполненным.

**Единственный принцип, из которого следует всё остальное:** живую базу открывает
на запись ровно одна команда во всём процессе — `--production-apply` на шаге 12.
Аудит, проверка снимка, репетиция и бэкфилл-репетиция обязаны отказаться, если
путь разрешается в живую базу.

Владельцы (проект одного оператора, план 01-03): выпуск, инфраструктура, runtime,
резервные копии и проверка финансовых данных — Андрей.

## 0. Переменные окружения

```powershell
$env:ESCROW_LIVE_DB       = "\\wsl$\...\dayberry.db"   # точный путь к живой базе, полученный из инвентаря
$env:ESCROW_RESTORED_DB   = "E:\Projects\dayberry-rehearsal\restored.db"
$env:ESCROW_EVIDENCE_DIR  = "E:\Projects\dayberry-rehearsal\evidence"
$env:ESCROW_PRE_SNAPSHOT  = "$env:ESCROW_EVIDENCE_DIR\pre-apply-snapshot.db"
$env:ESCROW_POST_SNAPSHOT = "$env:ESCROW_EVIDENCE_DIR\post-apply-snapshot.db"

foreach ($n in 'ESCROW_LIVE_DB','ESCROW_RESTORED_DB','ESCROW_EVIDENCE_DIR','ESCROW_PRE_SNAPSHOT','ESCROW_POST_SNAPSHOT') {
  if (-not (Get-Item "env:$n" -ErrorAction SilentlyContinue).Value.Trim()) { throw "не задано: $n" }
}
if ($env:ESCROW_RESTORED_DB -eq $env:ESCROW_LIVE_DB) { throw "восстановленная копия совпадает с живой базой" }
New-Item -ItemType Directory -Force $env:ESCROW_EVIDENCE_DIR | Out-Null
```

Запрещено на всех шагах: угаданные пути, `prisma/dev.db`, `prisma db push`,
`npm run db:push`, голый `--apply`, любые изменения логики завершения цепочек.

## Контрольные точки

| PF | Что | Владелец | Доказательство | Стоп |
|----|-----|----------|----------------|------|
| PF-01 | Точный путь живой базы и отдельный путь копии | выпуск | `preflight-inventory.json` | пустой, относительный или совпадающий путь |
| PF-02 | Решение по каждой неоднозначной строке | проверка финансовых данных | `dispositions.json` + хеш аудита | строка без решения или изменившийся набор |
| PF-03 | Runtime кандидата | runtime | `sqlite_version`, PRAGMA из образа-кандидата | версия неизвестна |
| PF-04 | Топология и окно единственного писателя | инфраструктура | `single-writer.json` | писателей больше одного |
| PF-05 | Политика резервных копий | резервные копии | политика + успешное восстановление | нет проверенного восстановления |
| PF-06 | Дайджесты кандидата и артефакта отката | выпуск | `final-preflight-index.json` | откат без исправленного ядра |
| PF-07 | Пост-снимок и сверка дельт | выпуск | `post-apply-snapshot.json`, `post-audit.json` | HIGH или необъяснённая дельта |

PF-02, PF-03 и PF-06 закрываются в плане 01-06, когда артефакты существуют.

## Часть A. Репетиция на восстановленной копии

### 1. Остановить запись

```powershell
ssh -p 17236 srvadm@185.180.251.60 "docker stop dayberry"
```

Окно — 10–20 минут. Только остановленный процесс доказывает отсутствие писателей;
закрытие трафика на прокси такого доказательства не даёт.

### 2. Создать неизменяемый пред-снимок

```powershell
npm run escrow:backup -- --source $env:ESCROW_LIVE_DB --target $env:ESCROW_PRE_SNAPSHOT --evidence "$env:ESCROW_EVIDENCE_DIR\pre-apply-snapshot.json"
```

Снимок создаётся через `VACUUM INTO`, получает права только на чтение и не
перезаписывается. Повторный запуск обязан упасть.

### 3. Аудит только снимка

```powershell
npm run escrow:audit -- --database $env:ESCROW_PRE_SNAPSHOT --live-path $env:ESCROW_LIVE_DB --output "$env:ESCROW_EVIDENCE_DIR\pre-audit.json"
```

Живую базу аудит не открывает никогда. Код возврата 2 означает блокирующие
находки — они разбираются, а не игнорируются.

### 4. Восстановить копию и доказать восстановимость

```powershell
Copy-Item $env:ESCROW_PRE_SNAPSHOT $env:ESCROW_RESTORED_DB
npm run escrow:verify-restore -- --database $env:ESCROW_RESTORED_DB --live-path $env:ESCROW_LIVE_DB --evidence-dir $env:ESCROW_EVIDENCE_DIR
```

Это же и есть проверка резервного восстановления по PF-05: до этого шага копии
никогда не восстанавливались.

### 5. Эквивалентность схемы и baseline

```powershell
$env:DATABASE_URL = "file:$($env:ESCROW_RESTORED_DB -replace '\\','/')"
npx prisma migrate diff --from-url $env:DATABASE_URL --to-migrations prisma\migrations --shadow-database-url "file:./prisma/shadow-check.db" --exit-code
npx prisma migrate resolve --applied 20260814170000_baseline
```

`resolve` разрешён только при пустом diff относительно baseline. Непустой diff —
стоп: схема прода разошлась с историей миграций.

### 6. Применить миграцию на копии

```powershell
npm run migrate:deploy
```

Только `migrate deploy`. Никакого `db push`.

### 7. Манифест бэкфилла

```powershell
npm run escrow:audit -- --database $env:ESCROW_RESTORED_DB --live-path $env:ESCROW_LIVE_DB --output "$env:ESCROW_EVIDENCE_DIR\restored-audit.json"
npm run escrow:manifest -- --database $env:ESCROW_RESTORED_DB --live-path $env:ESCROW_LIVE_DB --audit "$env:ESCROW_EVIDENCE_DIR\restored-audit.json" --manifest "$env:ESCROW_EVIDENCE_DIR\manifest.json"
```

Команда печатает `manifest-sha256`. Сохранить его в `$env:ESCROW_MANIFEST_SHA256`.

### 8. Решения по неразрешённым строкам (PF-02)

Если в манифесте непустой `unresolved`, создать `dispositions.json` с решением по
каждой строке: `bucket`, `id`, `decision`, `note`. Набор ключей сверяется точно —
пропуск или лишняя запись останавливают применение. Решение не разрешает менять
строку: оно фиксирует, что оператор её видел.

### 9. Репетиция применения дважды

```powershell
npm run escrow:backfill:rehearse -- --database $env:ESCROW_RESTORED_DB --live-path $env:ESCROW_LIVE_DB --audit "$env:ESCROW_EVIDENCE_DIR\restored-audit.json" --manifest "$env:ESCROW_EVIDENCE_DIR\manifest.json" --manifest-sha256 $env:ESCROW_MANIFEST_SHA256 --dispositions "$env:ESCROW_EVIDENCE_DIR\dispositions.json"
```

Первый запуск даёт `mutations` больше нуля, второй — ровно `"mutations":0`.
Ненулевой второй запуск означает неидемпотентность и останавливает выпуск.

### 10. Смоук обоих режимов флага

```powershell
$env:DEAL_ESCROW_EXPANDED_READS = "0"; npm run test:compat
$env:DEAL_ESCROW_EXPANDED_READS = "1"; npm run test:compat
npm test
npm run build
```

## Часть B. Продакшен

### 11. Авторизация (PF-06, план 01-06)

Канонический объект авторизации версии 1 содержит точный путь живой базы и шесть
неизменяемых SHA-256: пред-снимка, пред-аудита, одобренного манифеста, артефакта
кандидата, артефакта отката с исправленным ядром и доказательства единственного
писателя. Одноразовый токен — SHA-256 канонического объекта.

Артефакт отката обязан содержать исправленное ядро эскроу и читать расширенную
схему. Откат на до-интеграционный артефакт запрещён: он вернёт поиск «последнего
held».

Подтверждение: `approve-production-apply <authorization-sha256> <one-time-token>`.

### 12. Единственное применение к живой базе

Порядок обязателен и не переставляется:

1. запись остановлена (шаг 1) и доказательство пересчитано;
2. токен и шесть хешей проверены, но не израсходованы;
3. `npm run migrate:deploy` против точного `$env:ESCROW_LIVE_DB`;
4. проверить, что колонки `Deal.escrowTransactionId` и `Transaction.businessKey`
   существуют, `integrity_check` = `ok`, `foreign_key_check` пуст, счётчики
   совпадают с манифестом;
5. только теперь:

```powershell
npm run escrow:backfill:production -- --database $env:ESCROW_LIVE_DB --live-path $env:ESCROW_LIVE_DB --confirm-live-path $env:ESCROW_LIVE_DB --audit "$env:ESCROW_EVIDENCE_DIR\pre-audit.json" --manifest "$env:ESCROW_EVIDENCE_DIR\manifest.json" --manifest-sha256 $env:ESCROW_MANIFEST_SHA256 --dispositions "$env:ESCROW_EVIDENCE_DIR\dispositions.json" --pre-snapshot-sha256 $env:ESCROW_PRE_SNAPSHOT_SHA256 --pre-audit-sha256 $env:ESCROW_PRE_AUDIT_SHA256 --candidate-sha256 $env:ESCROW_CANDIDATE_SHA256 --rollback-sha256 $env:ESCROW_ROLLBACK_SHA256 --single-writer-sha256 $env:ESCROW_SINGLE_WRITER_SHA256 --approval-token $env:ESCROW_APPROVAL_TOKEN --ledger "$env:ESCROW_EVIDENCE_DIR\token-receipt.json"
```

Квитанция токена создаётся до открытия базы. Повтор невозможен: применение
выполняется один раз, повторные попытки отклоняются до любой записи.

### 13. Пост-снимок и сверка (PF-07)

```powershell
npm run escrow:backup -- --source $env:ESCROW_LIVE_DB --target $env:ESCROW_POST_SNAPSHOT --evidence "$env:ESCROW_EVIDENCE_DIR\post-apply-snapshot.json"
npm run escrow:audit -- --database $env:ESCROW_POST_SNAPSHOT --live-path $env:ESCROW_LIVE_DB --manifest "$env:ESCROW_EVIDENCE_DIR\manifest.json" --output "$env:ESCROW_EVIDENCE_DIR\post-audit.json"
```

Пред- и пост-аудит используют два разных неизменяемых снимка. Живая база не
аудируется напрямую ни на одном шаге. Сверить дельты строк, балансов,
замороженных сумм и счётчиков с манифестом.

### 14. Развернуть новый образ и вернуть запись

```powershell
ssh -p 17236 srvadm@185.180.251.60 "cd /home/srvadm/apps/dayberry && docker compose up -d --build"
```

**Обновить серверный скрипт бэкапа до первого запуска нового образа** (BK-01):
`backup-snapshot.mjs` больше не принимает позиционный путь.

```bash
docker exec dayberry sh -c 'rm -f /tmp/dayberry-backup.db /tmp/dayberry-backup.json && node /app/scripts/backup-snapshot.mjs --source /app/data/dayberry.db --target /tmp/dayberry-backup.db --evidence /tmp/dayberry-backup.json'
```

Старт контейнера больше не создаёт каталог загрузок и не выполняет миграции:
`mkdir -p /app/data/uploads` и разовые `migrate:photos` / `migrate:chains`
выполняются релизным шагом до старта, если они нужны.

Флаг чтения включается отдельно и позже:

```powershell
ssh -p 17236 srvadm@185.180.251.60 "cd /home/srvadm/apps/dayberry && DEAL_ESCROW_EXPANDED_READS=1 docker compose up -d"
```

## Откат

Откат — это подмена артефакта приложения на версию **с исправленным ядром**, а не
возврат схемы и не восстановление базы. Колонки не удаляются, связи не стираются.

Восстановление базы из копии (`reconciliation`) допустимо только если: запись
остановлена, все записи, сделанные после пост-снимка, выявлены и объяснены, и
владелец финансовых данных подтвердил, что их потеря приемлема. Во всех остальных
случаях чинить нужно вперёд, а не откатом.

Немедленный стоп при: ошибке миграции, непустом `foreign_key_check`, необъяснённой
дельте баланса, новой неоднозначной строке, дублирующем бизнес-ключе, повторном
финансовом эффекте или израсходованном токене.
