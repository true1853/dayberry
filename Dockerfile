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

# db push (idempotent) + start server
CMD ["sh", "-c", "npx prisma db push --skip-generate && node node_modules/next/dist/bin/next start -p 80"]
