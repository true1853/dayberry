# External Integrations

**Analysis Date:** 2026-08-14

## APIs & External Services

**AI inference:**
- OpenAI-compatible Chat Completions and Embeddings API - drafts listing metadata, estimates values, and produces semantic vectors used by matching in `lib/ai.js`.
  - SDK/Client: native `fetch`; requests target `${AI_BASE_URL}/chat/completions` and `${AI_BASE_URL}/embeddings`.
  - Auth: `AI_API_KEY` bearer token.
  - Configuration: `AI_BASE_URL`, `AI_MODEL`, and `AI_EMBED_MODEL`; code defaults to the OpenAI base URL while `docker-compose.yml` supplies deployment defaults for an OpenAI-compatible router.
  - Resilience: deterministic category/value heuristics and token-overlap matching run when the key is absent, the provider fails, or the provider times out in `lib/ai.js`; successful payloads are cached in the `AiCache` table from `prisma/schema.prisma`.

**Social identity:**
- VK ID OAuth 2.1 - social sign-in with PKCE, email scope, token exchange, and user profile retrieval in `lib/oauth.js` and `app/callback/[provider]/route.js`.
  - SDK/Client: native `fetch` against `https://id.vk.ru/authorize`, `/oauth2/auth`, and `/oauth2/user_info`.
  - Auth: `NEXT_PUBLIC_VK_CLIENT_ID` plus `VK_SERVICE_TOKEN` or `VK_CLIENT_SECRET`.
  - Callback: `/callback/vk`, implemented by `app/callback/[provider]/route.js`.
- Yandex ID OAuth 2.0 - social sign-in, token exchange, and profile retrieval in `lib/oauth.js` and `app/callback/[provider]/route.js`.
  - SDK/Client: native `fetch` against `https://oauth.yandex.ru/authorize`, `https://oauth.yandex.ru/token`, and `https://login.yandex.ru/info`.
  - Auth: `NEXT_PUBLIC_YANDEX_CLIENT_ID` and `YANDEX_CLIENT_SECRET`.
  - Callback: `/callback/yandex`, implemented by `app/callback/[provider]/route.js`.

**Browser push:**
- Standards-based Web Push - sends exchange, chat, chain, and account notifications to each subscribed browser endpoint in `lib/push.js`.
  - SDK/Client: `web-push` 3.6.7 on the server; browser Service Worker and Push APIs in `src/pwa.jsx` and `public/sw.js`.
  - Auth: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT`.
  - Subscription storage: `PushSubscription` rows in `prisma/schema.prisma`, managed by `savePushSubscriptionAction` and `deletePushSubscriptionAction` in `src/server/actions.js`.
  - Delivery behavior: dead endpoints returning 404/410 are deleted; push failure never rolls back the source application action in `lib/push.js` and `lib/notify.js`.

**Analytics:**
- Yandex Metrika - production-only page views, Webvisor, click maps, link tracking, ecommerce data layer support, and conversion goals in `app/metrika.jsx`.
  - SDK/Client: browser-loaded script from `https://mc.yandex.ru/metrika/tag.js`; no npm SDK.
  - Auth: hard-coded public counter ID in `app/metrika.jsx`, activated only for `dayberry.ru` hostnames.
  - SPA navigation: manual hash-change hits; conversion goals are emitted from `src/App.jsx` for authentication, listing creation, deal creation, and deal completion.
  - Privacy boundary: sensitive chat and sign-in UI is marked for Webvisor suppression by classes referenced in `app/metrika.jsx`, `src/screen-chat.jsx`, and `src/screen-auth.jsx`.

**Remote media and links:**
- Unsplash - onboarding examples load fixed remote image URLs directly from `images.unsplash.com` in `src/screen-onboarding.jsx`; there is no API key or server-side client.
- Prismatica agency - external attribution links only in `src/screen-profile.jsx` and `src/web-app.jsx`; this is not an application data integration.

## Data Storage

**Databases:**
- SQLite through Prisma.
  - Connection: `DATABASE_URL` from `prisma/schema.prisma`; `docker-compose.yml` points it at the persistent `/app/data/dayberry.db` file.
  - Client: `@prisma/client`, instantiated as a development-safe global singleton in `lib/prisma.js`.
  - Runtime tuning: WAL journal mode, 5-second busy timeout, and `synchronous = NORMAL` are applied in `lib/prisma.js`.
  - Schema: users, listings, media references, deals, escrow-like transactions, chats, chains, moderation reports, password-reset requests, notifications, push subscriptions, and AI cache in `prisma/schema.prisma`.
  - Backups: `scripts/backup-snapshot.mjs` uses SQLite `VACUUM INTO` to create a consistent snapshot while WAL mode is active; the scheduling system itself is outside this repository.

**File Storage:**
- Local persistent filesystem only.
  - Location: `UPLOAD_DIR` or the default `data/uploads` path defined in `lib/storage.js`; production uses the `/app/data` Docker volume established by `Dockerfile` and `docker-compose.yml`.
  - Processing: `sharp` strips metadata, applies EXIF orientation, resizes, creates WebP originals and thumbnails, and names files by SHA-256 content hash in `lib/storage.js`.
  - Serving: `app/uploads/[file]/route.js` streams allowlisted filenames with immutable cache headers; database rows store `/uploads/...` paths rather than image bytes.
  - Migration: `scripts/migrate-photos.mjs` moves legacy base64 and JPEG/PNG media into the filesystem format.

**Caching:**
- Database AI cache: `AiCache` in `prisma/schema.prisma`, read and written by `lib/ai.js` for inference and embedding reuse.
- HTTP media cache: immutable one-year browser caching for content-hashed uploads in `app/uploads/[file]/route.js` and static asset headers in `next.config.mjs`.
- PWA cache: `public/sw.js` caches only the offline shell, icon, and manifest; server-action data is deliberately network-only.
- No Redis, Memcached, CDN SDK, or managed cache integration is detected.

## Authentication & Identity

**Auth Provider:**
- Custom first-party authentication with optional VK ID and Yandex ID login.
  - Implementation: passwords are hashed with `bcryptjs`; `jose` signs 30-day HS256 JWTs stored in the HTTP-only, SameSite=Lax `dayberry_session` cookie in `lib/auth.js`.
  - Secret: `AUTH_SECRET` is mandatory in production; `lib/auth.js` rejects the built-in development secret in production runtime.
  - Local credential flow: registration, login, logout, password-reset request, and per-process login rate limiting are implemented in `src/server/actions.js`, `lib/auth.js`, and `lib/rate-limit.js`.
  - Social flow: `src/server/actions.js` creates OAuth state data, `lib/oauth.js` performs provider exchanges, and `app/callback/[provider]/route.js` upserts a local `User` then issues the same first-party session cookie.
  - Authorization: administrator access is an application-level email allowlist from `ADMIN_EMAILS` in `src/server/actions.js`; no external IAM/RBAC provider is used.

## Monitoring & Observability

**Error Tracking:**
- None detected. There is no Sentry, Datadog, New Relic, OpenTelemetry, or equivalent dependency/configuration in `package.json`, `app/`, `lib/`, or `src/`.

**Logs:**
- Structured-enough console prefixes are used for operational failures: `[db]` in `lib/prisma.js`, `[ai]` in `lib/ai.js`, `[oauth]` in `app/callback/[provider]/route.js`, `[push]` in `lib/push.js`, `[notify]` in `lib/notify.js`, and `[storage]` in `lib/storage.js`.
- Application analytics is Yandex Metrika in `app/metrika.jsx`; this is behavioral analytics, not server error tracking.
- Docker/container log collection is not configured in the repository; stdout/stderr is the observable server output.

## CI/CD & Deployment

**Hosting:**
- Dockerized self-hosting is the only detected deployment target: `Dockerfile` builds a Node 22 Alpine image and `docker-compose.yml` runs the `dayberry` service with persistent data.
- A TLS-terminating reverse proxy is expected in front of the container because OAuth callback origin construction consumes `X-Forwarded-Proto` in `app/callback/[provider]/route.js`; the proxy product/configuration is not present.
- No Vercel, Netlify, Fly.io, Render, Railway, AWS, GCP, Azure, or managed database configuration is detected.

**CI Pipeline:**
- None detected. No tracked `.github/workflows/`, GitLab CI, or other pipeline configuration is present.
- Build and startup automation lives in `package.json`, `Dockerfile`, and `docker-compose.yml`; database schema push and data backfills occur during container startup.

## Environment Configuration

**Required env vars:**
- `DATABASE_URL` - Prisma SQLite connection in `prisma/schema.prisma`; supplied explicitly by `docker-compose.yml` in production.
- `AUTH_SECRET` - production JWT signing secret, enforced by `lib/auth.js` and required by `docker-compose.yml`.
- `AI_API_KEY` - required only to enable external AI; `lib/ai.js` remains functional via deterministic fallback without it.
- `AI_BASE_URL`, `AI_MODEL`, `AI_EMBED_MODEL` - optional OpenAI-compatible provider and model overrides in `lib/ai.js` and `docker-compose.yml`.
- `APP_URL` - canonical base URL used for OAuth redirect URIs when a request-derived base is unavailable in `lib/oauth.js` and `src/server/actions.js`.
- `NEXT_PUBLIC_VK_CLIENT_ID` plus `VK_SERVICE_TOKEN` or `VK_CLIENT_SECRET` - required only for VK ID in `lib/oauth.js`; the public client ID is also passed as a Docker build argument in `Dockerfile`.
- `NEXT_PUBLIC_YANDEX_CLIENT_ID` and `YANDEX_CLIENT_SECRET` - required only for Yandex ID in `lib/oauth.js`; the public client ID is also passed as a Docker build argument in `Dockerfile`.
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` - required only for Web Push in `lib/push.js`.
- `ADMIN_EMAILS` - optional comma-separated administrator allowlist in `src/server/actions.js`.
- `UPLOAD_DIR` - optional filesystem override in `lib/storage.js`; production normally relies on its `/app/data/uploads` default.

**Secrets location:**
- `.env` is present and ignored by `.gitignore`; its contents were not read. Store local secret values there and never commit it.
- `docker-compose.yml` interpolates sensitive values from the deployment environment rather than embedding production values; `AUTH_SECRET` is fail-fast required and other integrations are optional.
- Public OAuth client IDs are intentionally exposed at build/runtime as `NEXT_PUBLIC_*`; provider secrets, VAPID private key, JWT secret, and AI key must remain server-only.

## Webhooks & Callbacks

**Incoming:**
- `/callback/vk` and `/callback/yandex` - OAuth redirects handled by the dynamic `app/callback/[provider]/route.js` GET route. VK state and PKCE verifier data is validated from a short-lived cookie; Yandex uses a stored base URL and server-side client secret.
- No payment, messaging-platform, generic webhook, or signed event receiver is detected.

**Outgoing:**
- OAuth token/profile calls to VK ID and Yandex ID originate in `lib/oauth.js`.
- AI completion and embedding calls originate in `lib/ai.js`.
- Browser push delivery targets subscriber-provided HTTPS endpoints through `web-push` in `lib/push.js`; endpoint URLs are stored in `PushSubscription` and removed on permanent failure.
- Yandex Metrika browser events originate in `app/metrika.jsx` and goal call sites in `src/App.jsx`.
- No application-originated webhook POST callbacks are detected.

---

*Integration audit: 2026-08-14*
