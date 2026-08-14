# Technology Stack

**Analysis Date:** 2026-08-14

## Languages

**Primary:**
- JavaScript (ECMAScript modules) - Next.js application, server actions, server-side libraries, maintenance scripts, route handlers, and service workers in `app/`, `src/`, `lib/`, `scripts/`, and `public/sw.js`.
- JSX - React screens and UI composition in `src/*.jsx` and the Next.js App Router shell in `app/*.jsx`.

**Secondary:**
- CSS - Global design tokens and responsive application styling in `app/globals.css`, `src/design.css`, and `src/web.css`.
- Prisma Schema Language - SQLite data models, relations, indexes, and datasource configuration in `prisma/schema.prisma`.
- HTML - Offline fallback and retained prototype shell in `public/offline.html` and `prototype/index.html`.

## Runtime

**Environment:**
- Node.js 22 on Alpine Linux in production, declared by `FROM node:22-alpine` in `Dockerfile`.
- Node.js 22.14.0 is the runtime detected in the mapped development environment.
- Browser runtime supports React, Service Worker, Push API, Cache API, and installable-PWA behavior through `src/pwa.jsx`, `public/sw.js`, and `public/manifest.webmanifest`.

**Package Manager:**
- npm 11.9.0 detected; project scripts are defined in `package.json`.
- Lockfile: present at `package-lock.json` with lockfile version 3.
- Use `npm ci` for reproducible installs because `Dockerfile` and `package-lock.json` establish npm as the deployment path.

## Frameworks

**Core:**
- Next.js 15.5.23 (declared as `^15.1.6`) - App Router host, React server/client boundary, route handlers, server actions, metadata, build, and production server; entry files are `app/layout.jsx` and `app/page.jsx`.
- React 19.2.8 (declared as `^19.0.0`) with React DOM 19.2.8 - Interactive SPA screens under `src/`, mounted by `src/App.jsx`.
- Prisma 6.19.3 (declared as `^6.2.1`) - schema management and generated SQLite client through `prisma/schema.prisma` and `lib/prisma.js`.

**Testing:**
- Not detected. `package.json` has no test script or test dependency, and no project-owned Jest, Vitest, or Playwright configuration is present.

**Build/Dev:**
- Next CLI 15.5.23 - `npm run dev`, `npm run build`, and `npm run start` in `package.json`.
- Prisma CLI 6.19.3 - client generation during `postinstall`, explicit `db:push`, and container startup migration in `package.json` and `Dockerfile`.
- Docker / Docker Compose - production image and single-service orchestration in `Dockerfile` and `docker-compose.yml`.
- Vite configuration exists only for the retained prototype at `prototype/vite.config.js`; Vite and its plugins are not dependencies in the active root `package.json`, so do not use it for the production application.

## Key Dependencies

**Critical:**
- `@prisma/client` 6.19.3 - all persistent application state and database transactions in `lib/prisma.js`, `lib/chains.js`, `lib/notify.js`, and `src/server/actions.js`.
- `jose` 5.10.0 - HS256 JWT signing and verification for the `dayberry_session` HTTP-only cookie in `lib/auth.js`.
- `bcryptjs` 2.4.3 - password hashing and verification in `lib/auth.js`.
- `sharp` 0.35.3 in `package-lock.json` - uploaded-image normalization, EXIF rotation, metadata removal, WebP encoding, and thumbnails in `lib/storage.js`.
- `web-push` 3.6.7 - VAPID configuration and delivery to browser push endpoints in `lib/push.js`.
- `lucide-react` 1.17.0 - icon implementation used by `src/icons.jsx` and UI screens.

**Infrastructure:**
- SQLite - embedded database selected by `provider = "sqlite"` in `prisma/schema.prisma`; production points `DATABASE_URL` at the persistent container data volume in `docker-compose.yml`.
- Node built-ins - `node:crypto` for OAuth PKCE, content hashes, and random credentials; `node:fs` / `node:fs/promises` for upload storage and backups; `node:path` and `node:stream` for file routing in `lib/oauth.js`, `lib/storage.js`, `app/uploads/[file]/route.js`, and `scripts/backup-snapshot.mjs`.
- Native Fetch API - external AI and OAuth HTTP clients use Node/browser `fetch`; no Axios-style client dependency is used in `lib/ai.js` or `lib/oauth.js`.

## Configuration

**Environment:**
- `.env` is present and ignored by `.gitignore`; note its existence only and keep all secret values outside committed files.
- Required for persistence: `DATABASE_URL`, referenced by `prisma/schema.prisma`; `docker-compose.yml` supplies the production SQLite file URL.
- Required in production for custom sessions: `AUTH_SECRET`; `lib/auth.js` refuses to start production with the development fallback.
- Optional AI configuration: `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, and `AI_EMBED_MODEL` in `lib/ai.js`. Without a key or on provider failure, deterministic analysis and matching remain available.
- Optional OAuth configuration: `APP_URL`, `NEXT_PUBLIC_VK_CLIENT_ID`, `VK_CLIENT_SECRET` or `VK_SERVICE_TOKEN`, `NEXT_PUBLIC_YANDEX_CLIENT_ID`, and `YANDEX_CLIENT_SECRET` in `lib/oauth.js` and `docker-compose.yml`.
- Optional push configuration: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` in `lib/push.js`; push is disabled when the key pair is absent.
- Optional operations configuration: `ADMIN_EMAILS` in `src/server/actions.js` and `UPLOAD_DIR` in `lib/storage.js`.

**Build:**
- `next.config.mjs` sets the tracing root, unoptimized Next Image handling, a 10 MB Server Action body limit, compression, security header removal, and cache-control policies.
- `Dockerfile` installs with `npm ci --ignore-scripts`, generates Prisma Client, builds Next.js, applies `prisma db push`, runs idempotent migrations, and starts Next in production.
- `docker-compose.yml` passes public OAuth client IDs at build time and supplies runtime database, auth, AI, push, OAuth, and admin configuration.
- `public/manifest.webmanifest`, `src/pwa.jsx`, and `public/sw.js` define installability, offline fallback, and push delivery.
- `prisma/schema.prisma` is the authoritative database configuration; there is no SQL migration directory in the current repository.

## Platform Requirements

**Development:**
- Use Node.js 22 and npm with `package-lock.json`; run `npm ci`, which triggers Prisma client generation through `postinstall` unless scripts are disabled.
- Provide a writable SQLite location via `DATABASE_URL`; the repository-local `prisma/dev.db` is ignored and is not a portable source artifact.
- Provide a writable upload directory. `lib/storage.js` defaults to `data/uploads` under the process working directory and creates it on demand.
- Native `sharp` support must be installable for the target Node/OS combination; image upload and migration paths depend on it.
- Current installed `node_modules` is not authoritative: the mapped environment reports `sharp@0.34.5` against required `^0.35.3` and a missing `web-push`; use a clean `npm ci` from `package-lock.json` before validating builds.

**Production:**
- Deploy as the Node 22 Alpine container described by `Dockerfile`, orchestrated by `docker-compose.yml`.
- Persist `/app/data` for the SQLite database and uploaded media; `Dockerfile` creates `/app/data/uploads`, and `scripts/backup-snapshot.mjs` provides a WAL-safe SQLite snapshot path.
- The container startup path applies the schema with `prisma db push`, migrates legacy photos, backfills chat membership, and starts the Next server, as defined in `Dockerfile`.
- Terminate TLS in front of the container and preserve `X-Forwarded-Proto`; `app/callback/[provider]/route.js` uses that header to construct OAuth callback origins correctly.
- No cloud-provider-specific runtime, serverless adapter, or managed hosting configuration is detected; the deployment contract is Docker plus persistent local storage.

---

*Stack analysis: 2026-08-14*
