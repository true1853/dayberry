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

# каталог загрузок на томе + db push (идемпотентен) + перенос base64-фото
# на диск (после первого прогона — no-op) + старт сервера
CMD ["sh", "-c", "mkdir -p /app/data/uploads && npx prisma db push --skip-generate && node scripts/migrate-photos.mjs && node node_modules/next/dist/bin/next start -p 80"]
