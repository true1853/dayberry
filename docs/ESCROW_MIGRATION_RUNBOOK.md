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

### 1. Снять снимок без остановки приложения

Репетиция не требует окна: `VACUUM INTO` даёт консистентный файл на работающей
базе — ради этого он и выбран. Останавливать приложение нужно только в части B.

На сервере (пока боевой образ содержит старую версию скрипта, путь передаётся
позиционным аргументом; после выката нового образа — флагами `--source`,
`--target`, `--evidence`):

```bash
docker exec dayberry rm -f /tmp/rehearsal.db
docker exec dayberry node /app/scripts/backup-snapshot.mjs /tmp/rehearsal.db
docker cp dayberry:/tmp/rehearsal.db /home/srvadm/rehearsal.db
docker exec dayberry rm -f /tmp/rehearsal.db
sha256sum /home/srvadm/rehearsal.db
```

Забрать к себе и сверить хеш, затем удалить копию с сервера:

```powershell
scp -P 17236 srvadm@185.180.251.60:/home/srvadm/rehearsal.db $env:ESCROW_PRE_SNAPSHOT
Get-FileHash $env:ESCROW_PRE_SNAPSHOT -Algorithm SHA256
```

### 2. Проверить снимок

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

Живая база лежит в docker-томе на сервере и из PowerShell недоступна. Поэтому
все команды, которые обязаны работать **с ней**, выполняются одноразовым
контейнером из образа-кандидата, смонтированным на тот же том, пока приложение
остановлено. Одноразовый контейнер и есть единственный писатель.

Общая форма такой команды:

```bash
docker run --rm \
  -v dayberry_dayberry-data:/app/data \
  -e DATABASE_URL=file:/app/data/dayberry.db \
  dayberry-dayberry:candidate <команда>
```

### 11. Подготовка до окна (приложение ещё работает)

**11.1. Обновить скрипт бэкапа (BK-01).** Обязательно до сборки нового образа:
после выката старый позиционный вызов перестанет работать, и ночной бэкап молча
исчезнет.

В `/home/srvadm/backups/dayberry/backup_dayberry.sh` заменить строку снимка на:

```bash
if ! docker exec dayberry sh -c 'rm -f /tmp/dayberry-backup.db /tmp/dayberry-backup.json && node /app/scripts/backup-snapshot.mjs --source /app/data/dayberry.db --target /tmp/dayberry-backup.db --evidence /tmp/dayberry-backup.json' >/dev/null; then
  echo "$(date +%F_%T) ОШИБКА: снимок базы не сделан"
  exit 1
fi
```

`rm -f` обязателен: новый снимок пишется с правами только на чтение и
отказывается перезаписывать существующий файл.

**11.2. Собрать образ-кандидат, не запуская его:**

```bash
cd /home/srvadm/apps/dayberry
git pull
docker compose build
docker tag dayberry-dayberry dayberry-dayberry:candidate
docker image inspect dayberry-dayberry:candidate --format '{{.Id}}'
```

**11.3. Сохранить артефакт отката.** Откат на текущий боевой образ запрещён — в
нём живёт `latest-held`. Артефактом отката служит тот же кандидат под отдельным
тегом: он содержит исправленное ядро и читает расширенную схему.

```bash
docker tag dayberry-dayberry:candidate dayberry-dayberry:rollback
docker image inspect dayberry-dayberry:rollback --format '{{.Id}}'
```

**11.4. Снять боевой пред-снимок** (приложение ещё работает, окна нет):
команды шага 1, но целевой файл — `$env:ESCROW_PRE_SNAPSHOT`. Забрать к себе,
сверить хеш, проаудировать по шагу 3, зафиксировать:

```powershell
$env:ESCROW_PRE_SNAPSHOT_SHA256 = (Get-FileHash $env:ESCROW_PRE_SNAPSHOT -Algorithm SHA256).Hash.ToLower()
$env:ESCROW_PRE_AUDIT_SHA256    = (Get-FileHash "$env:ESCROW_EVIDENCE_DIR\pre-audit.json" -Algorithm SHA256).Hash.ToLower()
```

Манифест и решения берутся из репетиции: их хеши уже проверены. Если пред-снимок
отличается от репетиционного составом строк — репетицию повторить, а не
подгонять решения.

### 12. Авторизация (PF-06)

Канонический объект авторизации версии 1 содержит точный путь живой базы **внутри
контейнера** (`/app/data/dayberry.db` — именно он резолвится при применении) и
шесть неизменяемых SHA-256: пред-снимка, пред-аудита, одобренного манифеста,
образа-кандидата, образа отката и доказательства единственного писателя.
Одноразовый токен — SHA-256 канонического объекта.

Доказательство единственного писателя — файл с выводом `docker ps` после
остановки, показывающий, что контейнер `dayberry` не запущен.

Подтверждение оператора: `approve-production-apply <authorization-sha256> <one-time-token>`.

### 13. Окно: остановка и применение

```bash
docker stop dayberry
docker ps --format '{{.Names}}' > /home/srvadm/single-writer.txt   # доказательство PF-04
```

С этого момента и до шага 15 сайт недоступен. Дальше — строго по порядку:

**13.1. Миграция схемы:**

```bash
docker run --rm -v dayberry_dayberry-data:/app/data -e DATABASE_URL=file:/app/data/dayberry.db \
  dayberry-dayberry:candidate npx prisma migrate resolve --applied 20260814170000_baseline
docker run --rm -v dayberry_dayberry-data:/app/data -e DATABASE_URL=file:/app/data/dayberry.db \
  dayberry-dayberry:candidate npx prisma migrate deploy
```

`resolve` выполняется один раз и только если гейт эквивалентности из шага 5 дал
`No difference detected`.

**13.2. Гейты перед записью денег.** Убедиться, что колонки
`Deal.escrowTransactionId`, `Deal.createCommandKey` и `Transaction.businessKey`
существуют, `integrity_check` = `ok`, `foreign_key_check` пуст, а счётчики строк
совпадают с манифестом. Любое расхождение — стоп без бэкфилла.

**13.3. Единственная запись в живые деньги.** Каталог доказательств монтируется
внутрь контейнера, чтобы манифест, решения и квитанция токена были доступны:

```bash
docker run --rm \
  -v dayberry_dayberry-data:/app/data \
  -v /home/srvadm/escrow-evidence:/evidence \
  -e DATABASE_URL=file:/app/data/dayberry.db \
  dayberry-dayberry:candidate node scripts/backfill-deal-escrow.mjs --production-apply \
    --database /app/data/dayberry.db \
    --live-path /app/data/dayberry.db \
    --confirm-live-path /app/data/dayberry.db \
    --audit /evidence/pre-audit.json \
    --manifest /evidence/manifest.json \
    --manifest-sha256 "$ESCROW_MANIFEST_SHA256" \
    --dispositions /evidence/dispositions.json \
    --pre-snapshot-sha256 "$ESCROW_PRE_SNAPSHOT_SHA256" \
    --pre-audit-sha256 "$ESCROW_PRE_AUDIT_SHA256" \
    --candidate-sha256 "$ESCROW_CANDIDATE_SHA256" \
    --rollback-sha256 "$ESCROW_ROLLBACK_SHA256" \
    --single-writer-sha256 "$ESCROW_SINGLE_WRITER_SHA256" \
    --approval-token "$ESCROW_APPROVAL_TOKEN" \
    --ledger /evidence/token-receipt.json
```

Квитанция токена создаётся до открытия базы, поэтому повтор отклоняется раньше
любой записи. Повторять применение нельзя: идемпотентность уже доказана
репетицией, а не повторной попыткой на живых данных.

### 14. Поднять новое приложение

```bash
cd /home/srvadm/apps/dayberry
docker compose up -d
docker compose logs --tail 50 dayberry
```

Старт больше не создаёт каталог загрузок и не выполняет миграций. Если каталога
нет, создать его до старта:

```bash
docker run --rm -v dayberry_dayberry-data:/app/data alpine mkdir -p /app/data/uploads
```

Флаг чтения остаётся выключенным: приложение работает на исправленном ядре, но
отвечает в прежней форме.

### 15. Пост-снимок и сверка (PF-07)

```bash
docker exec dayberry sh -c 'rm -f /tmp/post.db /tmp/post.json && node /app/scripts/backup-snapshot.mjs --source /app/data/dayberry.db --target /tmp/post.db --evidence /tmp/post.json'
docker cp dayberry:/tmp/post.db /home/srvadm/post-apply-snapshot.db
docker exec dayberry rm -f /tmp/post.db /tmp/post.json
sha256sum /home/srvadm/post-apply-snapshot.db
```

Забрать к себе как `$env:ESCROW_POST_SNAPSHOT` и проаудировать со сверкой по
манифесту:

```powershell
npm run escrow:audit -- --database $env:ESCROW_POST_SNAPSHOT --live-path $env:ESCROW_LIVE_DB --manifest "$env:ESCROW_EVIDENCE_DIR\manifest.json" --output "$env:ESCROW_EVIDENCE_DIR\post-audit.json"
```

Пред- и пост-аудит используют два разных неизменяемых снимка; живая база не
аудируется напрямую ни на одном шаге. Сверить: связано ровно столько пар,
сколько в манифесте; неразрешённые строки не изменились; сумма балансов не
изменилась ни на балл; `integrity_check` = `ok`; `foreign_key_check` пуст.

### 16. Включить расширенное чтение (отдельно и позже)

Только после окна наблюдения без ошибок:

```bash
cd /home/srvadm/apps/dayberry
DEAL_ESCROW_EXPANDED_READS=1 docker compose up -d
```

Выключение флага возвращает прежнюю форму ответа и не влияет на деньги.

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
