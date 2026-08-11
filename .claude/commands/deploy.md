# Deploy to production

Deploy dayberry to server 185.180.251.60 via SSH (port 17236, user srvadm).

Strategy: push code to server, build Docker image there, restart container.

## Steps

1. **Build locally first** to catch errors early:
   ```bash
   npm run build
   ```
   If build fails — stop, report the error.

2. **Push latest commits** to GitHub (origin main):
   ```bash
   git push origin main
   ```

3. **SSH into server and deploy**:
   ```bash
   ssh -p 17236 srvadm@185.180.251.60 "
     set -e
     cd ~/apps/dayberry
     git pull origin main
     docker compose build --no-cache
     docker compose up -d
     echo 'Deploy complete'
   "
   ```

4. **Verify** — check container is running:
   ```bash
   ssh -p 17236 srvadm@185.180.251.60 "docker ps --filter name=dayberry --format '{{.Status}}'"
   ```

## Notes
- App runs on port 3010 inside npm_default network
- If `/opt/dayberry` doesn't exist yet, the script auto-clones it
- If `npm_default` network missing: `ssh -p 17236 srvadm@185.180.251.60 "docker network create npm_default"`

## ⚠️ Данные в продакшене — НЕ трогать
- Деплой **не выполняет** `deleteMany` / wipe / seed и не трогает `User`, `Lot`, `Deal`, `Chat`, `Message`, `Transaction`, `Review`, `Chain`, `ChainStep`.
- Единственная операция с БД при старте контейнера — `prisma db push` (создаёт недостающие таблицы/колонки, данные не удаляет).
- Никогда не запускай `deleteMany({})` на проде «для очистки» — это уничтожит аккаунты реальных пользователей.
- Для проверки серверных действий на проде создавай **отдельных тестовых пользователей** и после теста удаляй **только их** (по конкретным email/id), а не всю таблицу.
