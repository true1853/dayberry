FROM node:22-alpine

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .

# public OAuth client ids (inlined by next build)
ARG NEXT_PUBLIC_VK_CLIENT_ID
ENV NEXT_PUBLIC_VK_CLIENT_ID=$NEXT_PUBLIC_VK_CLIENT_ID
ARG NEXT_PUBLIC_YANDEX_CLIENT_ID
ENV NEXT_PUBLIC_YANDEX_CLIENT_ID=$NEXT_PUBLIC_YANDEX_CLIENT_ID

RUN npx prisma generate
RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

# Старт только поднимает сервер и ничего не меняет в данных.
#
# Раньше здесь была цепочка: mkdir uploads + `prisma db push` + миграция фото +
# миграция состава чатов + запуск. Каждая из них при рестарте молча трогала
# живую базу — в том числе меняла схему в обход истории миграций. Теперь схему
# двигает отдельный релизный шаг `npm run migrate:deploy`, а разовые миграции
# данных выполняются по runbook (docs/ESCROW_MIGRATION_RUNBOOK.md).
#
# Строка ниже — allowlist, а не рекомендация: тест сверяет её посимвольно и
# падает на любой обёртке, npm-алиасе, shell-цепочке или добавленной команде.
# Каталог /app/data/uploads создаётся релизным шагом до старта контейнера.
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "80"]
