# ---------- build ----------
FROM node:22-alpine AS builder

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

# ---------- runtime ----------
FROM node:22-alpine AS runner

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# standalone-сборка тянет за собой только нужные модули; статику и public
# next start ожидает рядом по фиксированным путям.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# prisma CLI и схема нужны в рантайме для db push, движок — для запросов
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/scripts ./scripts
# скрипт миграции фото — обычный node-процесс вне бандла Next
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

EXPOSE 80
ENV PORT=80
ENV HOSTNAME=0.0.0.0

# db push (идемпотентен) + перенос base64-фото на диск (после первого
# прогона — no-op) + старт сервера
CMD ["sh", "-c", "mkdir -p /app/data/uploads && ./node_modules/.bin/prisma db push --skip-generate && node scripts/migrate-photos.mjs && node server.js"]
