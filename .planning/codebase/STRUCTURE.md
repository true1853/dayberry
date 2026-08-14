# Codebase Structure

**Analysis Date:** 2026-08-14

## Directory Layout

~~~text
dayberry/
├── app/                         # Next.js App Router shell and HTTP route handlers
│   ├── callback/[provider]/     # OAuth callback endpoint
│   ├── uploads/[file]/          # Runtime uploaded-image endpoint
│   ├── globals.css              # Document/global reset styles
│   ├── layout.jsx               # Root layout, metadata, viewport, analytics mount
│   ├── metrika.jsx              # Client analytics integration
│   └── page.jsx                 # Dynamic root page that renders src/App.jsx
├── src/                         # Client application, screens, shared UI, catalogs
│   ├── server/
│   │   └── actions.js           # Entire browser-to-server action facade
│   ├── App.jsx                  # Root coordinator and responsive presentation switch
│   ├── web-app.jsx              # Desktop-specific application renderer
│   ├── screen-*.jsx             # Mobile feature screens and reusable modal screens
│   ├── ui.jsx                   # Shared UI primitives and display formatters
│   ├── fields.jsx               # Shared form fields
│   ├── icons.jsx                # Lucide icon adapter
│   ├── router.js                # Mobile hash route parsing/path generation
│   ├── pwa.jsx                  # Service-worker/install/push client logic
│   ├── data.js                  # Category catalog and normalization
│   ├── cities.js                # Geography catalog and helpers
│   ├── wishes.js                # Wish taxonomy
│   ├── reports.js               # Report-reason taxonomy
│   ├── design.css               # Shared/mobile design tokens and styles
│   └── web.css                  # Desktop-only layout and component styles
├── lib/                         # Server-only services and infrastructure adapters
│   ├── ai.js                    # Listing analysis, embeddings, direct matching
│   ├── chains.js                # Multi-party exchange graph engine
│   ├── auth.js                  # JWT cookie sessions and serializers
│   ├── oauth.js                 # VK/Yandex OAuth protocol helpers
│   ├── notify.js                # Durable notification facade
│   ├── push.js                  # Web Push delivery
│   ├── storage.js               # Image conversion and filesystem persistence
│   ├── rate-limit.js            # Process-local throttling
│   └── prisma.js                # Shared Prisma client
├── prisma/
│   ├── schema.prisma            # SQLite data model and indexes
│   └── dev.db                   # Local ignored SQLite database
├── scripts/                     # Operational migration and backup scripts
├── public/                      # PWA assets, icons, fonts, service workers, offline page
├── prototype/                   # Isolated legacy Vite prototype scaffold
├── .planning/codebase/          # Generated GSD codebase reference documents
├── .claude/                     # Local agent configuration and alternate worktrees
├── .kilo/                       # Local worktree/agent-manager state and dependencies
├── .next/                       # Generated Next.js build output
├── dist/                        # Generated/legacy build output
├── node_modules/                # Installed dependencies
├── Dockerfile                   # Production image build and runtime bootstrap
├── docker-compose.yml           # Container/service deployment definition
├── next.config.mjs              # Next.js build, headers, image, action-size settings
├── package.json                 # Scripts and dependency manifest
└── package-lock.json            # Locked npm dependency graph
~~~

## Directory Purposes

**`app/`:**
- Purpose: Keep Next.js framework concerns and real HTTP endpoints at the repository edge.
- Contains: The root page/layout, global CSS import point, analytics integration, OAuth callback route, and uploaded-media route.
- Key files: `app/page.jsx`, `app/layout.jsx`, `app/callback/[provider]/route.js`, `app/uploads/[file]/route.js`, `app/metrika.jsx`
- Add only App Router pages, layouts, metadata, or HTTP `route.js` handlers here; do not place reusable screen components or domain services in `app/`.

**`src/`:**
- Purpose: Hold the browser application and environment-neutral UI/catalog modules.
- Contains: Root coordination, responsive renderers, mobile feature screens, UI primitives, form controls, routing, PWA client logic, static taxonomies, and CSS.
- Key files: `src/App.jsx`, `src/web-app.jsx`, `src/ui.jsx`, `src/router.js`, `src/server/actions.js`
- Put user-facing feature presentation in `src/screen-<feature>.jsx`; keep shared display primitives in `src/ui.jsx` or a new focused peer module if the primitive set grows.

**`src/server/`:**
- Purpose: Expose trusted server operations to client components through Next.js server actions.
- Contains: One `'use server'` facade with public `*Action` exports and private query/serialization/state-transition helpers.
- Key files: `src/server/actions.js`
- Add browser-callable actions here. Extract substantial reusable algorithms or infrastructure behavior to `lib/<domain>.js` and keep the action as the authorization/validation/orchestration boundary.

**`lib/`:**
- Purpose: Hold server-only domain services and infrastructure adapters.
- Contains: Prisma access, authentication, OAuth, AI, chain matching, notification delivery, Web Push, upload processing, and throttling.
- Key files: `lib/prisma.js`, `lib/auth.js`, `lib/ai.js`, `lib/chains.js`, `lib/storage.js`
- Name new modules after one server responsibility, such as `lib/payments.js`; do not import React components into `lib/`.

**`prisma/`:**
- Purpose: Define and host local relational persistence.
- Contains: The Prisma generator/datasource, all models/relations/indexes, and an ignored development SQLite file.
- Key files: `prisma/schema.prisma`, `prisma/dev.db`
- Make schema changes in `prisma/schema.prisma`; put data backfills in `scripts/` when `prisma db push` alone cannot populate or transform rows.

**`scripts/`:**
- Purpose: Provide explicit server-side maintenance and migration entry points.
- Contains: Consistent SQLite backup creation, photo extraction/re-encoding, and chat membership backfill.
- Key files: `scripts/backup-snapshot.mjs`, `scripts/migrate-photos.mjs`, `scripts/migrate-chains.mjs`
- Add one-off or idempotent operational jobs as `scripts/<verb>-<subject>.mjs`; ensure scripts disconnect their Prisma client.

**`public/`:**
- Purpose: Serve static browser assets directly from the site root.
- Contains: Icons, WebP logos, local WOFF2 fonts, PWA manifest, service workers, registration helper, and offline fallback.
- Key files: `public/manifest.webmanifest`, `public/service-worker.js`, `public/offline.html`, `public/fonts/*.woff2`
- Put build-time static assets here. Runtime user uploads belong under the `UPLOAD_DIR` used by `lib/storage.js`, not in `public/`.

**`prototype/`:**
- Purpose: Preserve a separate Vite/PWA prototype scaffold outside the production Next.js build.
- Contains: `prototype/index.html` and `prototype/vite.config.js`.
- Key files: `prototype/index.html`, `prototype/vite.config.js`
- Do not add production features here; the production entry is `app/page.jsx`, and `prototype/` is excluded by `.dockerignore`.

**`.planning/codebase/`:**
- Purpose: Store GSD-generated maps used by planning and execution workflows.
- Contains: Architecture, structure, stack, integrations, conventions, testing, and concerns documents as generated.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`
- Keep these documents as repository analysis, not runtime code.

**`.claude/` and `.kilo/`:**
- Purpose: Store local agent/worktree orchestration metadata.
- Contains: `.claude/commands/`, `.claude/worktrees/`, `.kilo/worktrees/`, and local tool dependencies/configuration.
- Key files: `.claude/launch.json`, `.kilo/agent-manager.json`
- Treat nested worktrees as separate repository copies, not production source directories; make product edits in the repository root paths documented above.

## Key File Locations

**Entry Points:**
- `app/page.jsx`: Production browser entry; renders `src/App.jsx`.
- `app/layout.jsx`: Root HTML/document metadata, global style imports, and analytics mount.
- `src/App.jsx`: Hydrated client entry and owner of shared application state/workflows.
- `src/server/actions.js`: Server-action entry surface for browser-initiated queries and mutations.
- `app/callback/[provider]/route.js`: OAuth HTTP callback for VK and Yandex.
- `app/uploads/[file]/route.js`: Runtime media HTTP endpoint.
- `Dockerfile`: Container build and start entry.
- `scripts/*.mjs`: Maintenance/operational command entries.

**Configuration:**
- `package.json`: npm scripts, Next/React/Prisma dependencies, and module mode.
- `package-lock.json`: Exact npm dependency lock.
- `next.config.mjs`: Output tracing, image behavior, server-action body limit, compression, and cache headers.
- `Dockerfile`: Node runtime, Prisma generation, production build, schema push, migrations, and server port.
- `docker-compose.yml`: Container topology and persistent runtime configuration; inspect without copying inline secret values.
- `.dockerignore`: Docker build-context exclusions, including `prototype/`, local data, environment files, and build output.
- `.gitignore`: Source-control exclusions for dependencies, outputs, environment files, runtime data, and SQLite files.
- `prisma/schema.prisma`: Database provider and complete relational schema.
- `public/manifest.webmanifest`: Installable application metadata.

**Core Logic:**
- `src/App.jsx`: Cross-feature client orchestration, auth gates, shared state, optimistic updates, refresh policy, and responsive selection.
- `src/server/actions.js`: Application use cases, authorization, validation, transactions, and serializers.
- `lib/ai.js`: Listing analysis and direct match scoring.
- `lib/chains.js`: Exchange graph construction and candidate persistence.
- `lib/auth.js`: Session and client-safe user/lot mapping.
- `lib/notify.js`: Durable notification creation and delivery fan-out.
- `lib/storage.js`: Content-addressed image conversion/storage.
- `prisma/schema.prisma`: Durable domain model and invariants.

**Presentation:**
- `src/screen-feed.jsx`: Feed, swipe, category, favorite presentation.
- `src/screen-lot.jsx`: Listing detail and offer sheet.
- `src/screen-deal.jsx`: Deal state and rating sheet.
- `src/screen-chat.jsx`: Conversation list/thread, polling, optimistic send.
- `src/screen-chain.jsx`: Chain feed/cards/detail.
- `src/screen-onboarding.jsx`: Onboarding and listing editor.
- `src/screen-profile.jsx`: Profile, settings, owned listings, admin/moderation screens.
- `src/screen-auth.jsx`: Password and OAuth sign-in/register flow.
- `src/screen-wallet.jsx`: Balance, transaction list, and top-up UI.
- `src/web-app.jsx`: Desktop variants and modal reuse of selected mobile screens.
- `src/ui.jsx`: Shared cards, photos, navigation, sheets, formatters, and pull-to-refresh.

**Shared Catalogs and Helpers:**
- `src/data.js`: Category IDs/labels and normalization.
- `src/cities.js`: City/region definitions and locality helpers.
- `src/wishes.js`: Wish groups and quick suggestions.
- `src/reports.js`: Moderation report reasons.
- `src/router.js`: Hash route parser and path builders.
- `src/fields.jsx`: Phone and city field components.
- `src/icons.jsx`: Named icon mapping.

**Styles and Assets:**
- `app/globals.css`: Document-level global styles.
- `src/design.css`: Design tokens and shared/mobile application styles.
- `src/web.css`: Desktop application styles.
- `public/fonts/`: Locally served Inter and JetBrains Mono font subsets.
- `public/icon-*.png`, `public/maskable-*.png`, `public/apple-touch-icon.png`: PWA/browser icons.
- `public/service-worker.js`, `public/sw.js`, `public/registerSW.js`: Service-worker assets.

**Testing:**
- Not detected: no first-party `*.test.*` or `*.spec.*` files, test directory, or test-runner config is present under `app/`, `src/`, `lib/`, `prisma/`, or `scripts/`.
- If tests are introduced, co-locate focused module tests with the implementation, such as `lib/chains.test.js` or `src/router.test.js`, and place browser-wide flows in a new root `e2e/` directory with its runner config at the repository root.

## Naming Conventions

**Files:**
- Use PascalCase only for the root React component file `src/App.jsx`; feature screen files use lowercase kebab-case with the `screen-` prefix, such as `src/screen-chat.jsx`.
- Use lowercase kebab-case for multiword server/support modules, such as `lib/rate-limit.js` and `scripts/backup-snapshot.mjs`.
- Use concise lowercase nouns for single-responsibility modules, such as `lib/auth.js`, `lib/push.js`, `src/router.js`, and `src/wishes.js`.
- Use `.jsx` for modules containing React JSX, `.js` for JavaScript modules without JSX, and `.mjs` for standalone Node scripts/configuration such as `scripts/migrate-photos.mjs` and `next.config.mjs`.
- Use App Router reserved filenames `page.jsx`, `layout.jsx`, and `route.js` under `app/`.
- Use bracketed dynamic segment directories under `app/`, such as `app/callback/[provider]/` and `app/uploads/[file]/`.
- Use `*.css` beside the layer that owns the stylesheet: global framework CSS in `app/globals.css`, shared/mobile CSS in `src/design.css`, and desktop CSS in `src/web.css`.

**Directories:**
- Use lowercase singular/plural nouns for product layers: `app/`, `src/`, `lib/`, `prisma/`, `scripts/`, and `public/`.
- Mirror URL segments in `app/`; dynamic URL parameters use square brackets as in `app/uploads/[file]/`.
- Keep the only server subdirectory beneath client source as `src/server/`; place reusable server services at root `lib/`.
- Keep local tool/worktree state in dot-prefixed directories such as `.claude/`, `.kilo/`, and `.planning/`.

**React Components and Hooks:**
- Export component functions in PascalCase, matching examples such as `ChatThread` in `src/screen-chat.jsx` and `WebApp` in `src/web-app.jsx`.
- Prefix hooks with `use`, as in `useTweaks` in `src/tweaks-panel.jsx`, `useInstallPrompt` in `src/pwa.jsx`, and local `useMediaQuery` in `src/App.jsx`.
- Keep unexported desktop subviews as PascalCase functions in `src/web-app.jsx`, such as `HomeView`, `LotView`, and `ProfileView`.

**Server Functions:**
- Suffix browser-callable server exports with `Action`, such as `createLotAction`, `sendMessageAction`, and `refreshChainsAction` in `src/server/actions.js`.
- Name private query helpers as domain phrases such as `lotsFeed`, `walletOf`, `chatsOf`, and `notificationsOf` in `src/server/actions.js`.
- Prefix record-to-view conversion with `serialize` or `map`, such as `serializeUser` and `mapLot` in `lib/auth.js`.
- Name operational scripts with a verb and subject, such as `scripts/migrate-chains.mjs` and `scripts/backup-snapshot.mjs`.

## Where to Add New Code

**New User-Facing Feature:**
- Mobile presentation: `src/screen-<feature>.jsx`
- Desktop presentation: add a focused view in `src/web-app.jsx`; extract to `src/web-<feature>.jsx` if the feature is large enough to stand alone.
- Shared client coordination/state: `src/App.jsx`
- Mobile deep link: `src/router.js`, plus mobile rendering in `src/App.jsx`
- Desktop navigation: `src/web-app.jsx`
- Trusted browser-callable operation: `src/server/actions.js`
- Reusable domain algorithm: `lib/<feature>.js`
- Durable fields/relations: `prisma/schema.prisma`
- Feature tests once a runner exists: co-locate as `src/screen-<feature>.test.jsx` and `lib/<feature>.test.js`.

**New HTTP Endpoint:**
- Route handler: `app/<route>/route.js`
- Dynamic parameter: `app/<route>/[param]/route.js`
- Shared server implementation: `lib/<domain>.js`
- Keep route handlers thin, following `app/callback/[provider]/route.js` and `app/uploads/[file]/route.js`.

**New Component/Module:**
- Reusable visual primitive: `src/ui.jsx`; create `src/<domain>-ui.jsx` when it serves a focused domain rather than every screen.
- Reusable field: `src/fields.jsx`
- Feature-specific component: keep it in the owning `src/screen-<feature>.jsx` while small; split to `src/<feature>-<part>.jsx` when independently reusable.
- New icon name mapping: `src/icons.jsx`
- Desktop-only component: `src/web-app.jsx` or a new `src/web-<feature>.jsx`.

**New Data Taxonomy:**
- Categories: `src/data.js`
- Geography: `src/cities.js`
- Wish vocabulary: `src/wishes.js`
- Report reasons: `src/reports.js`
- Keep catalogs environment-neutral when server modules import them, as `lib/chains.js` imports `src/cities.js`.

**New Server Capability:**
- Authentication/session behavior: `lib/auth.js`
- OAuth provider behavior: `lib/oauth.js` and `app/callback/[provider]/route.js`
- AI analysis/matching behavior: `lib/ai.js`
- Multi-party exchange algorithm: `lib/chains.js`
- Notification creation: `lib/notify.js`
- Delivery channel: add `lib/<channel>.js` and invoke it from the durable notification facade in `lib/notify.js`
- Image/media behavior: `lib/storage.js` and `app/uploads/[file]/route.js`
- Database access bootstrap: `lib/prisma.js`

**New Database Work:**
- Schema and indexes: `prisma/schema.prisma`
- Idempotent data backfill: `scripts/migrate-<subject>.mjs`
- Container-start backfill wiring, when required for every deployment: `Dockerfile`
- Local data files must remain outside source control under the ignored locations defined in `.gitignore`.

**Utilities:**
- Client display/formatting helpers shared by screens: `src/ui.jsx` or a new focused `src/<subject>.js`
- Server-only helpers: the matching `lib/<subject>.js`
- Do not create an unscoped generic helper dumping ground; follow focused modules such as `src/cities.js`, `lib/rate-limit.js`, and `lib/storage.js`.

## Special Directories

**`.next/`:**
- Purpose: Next.js development/build cache and compiled output.
- Generated: Yes, by Next.js from `app/`, `src/`, and `lib/`.
- Committed: No; excluded by `.gitignore` and `.dockerignore`.

**`dist/`:**
- Purpose: Build output outside the active Next.js source tree.
- Generated: Yes.
- Committed: No; excluded by `.gitignore` and `.dockerignore`.

**`node_modules/`:**
- Purpose: Installed npm dependencies from `package-lock.json`.
- Generated: Yes, by `npm ci` or `npm install`.
- Committed: No; excluded by `.gitignore` and `.dockerignore`.

**`prisma/dev.db`:**
- Purpose: Local SQLite development database for `prisma/schema.prisma`.
- Generated: Yes, through Prisma/database usage.
- Committed: No; `prisma/*.db` and its journal files are excluded by `.gitignore`.

**`data/`:**
- Purpose: Runtime persistent uploads and production SQLite volume mounted around `lib/storage.js` and Prisma.
- Generated: Yes, at runtime; `Dockerfile` creates `/app/data/uploads`.
- Committed: No; excluded by `.gitignore` and `.dockerignore`.

**`public/`:**
- Purpose: Build-time static/PWA assets served at stable root URLs.
- Generated: No for the checked-in assets.
- Committed: Yes.

**`prototype/`:**
- Purpose: Standalone Vite prototype scaffold retained outside the production application.
- Generated: No.
- Committed: Yes; excluded only from the Docker build context by `.dockerignore`.

**`.claude/worktrees/` and `.kilo/worktrees/`:**
- Purpose: Local alternate worktrees managed by development agents/tools.
- Generated: Yes, by local worktree managers.
- Committed: Treat as local tooling state; do not use nested copies as source locations for production changes.

**`.planning/codebase/`:**
- Purpose: Generated architectural reference consumed by GSD planning/execution.
- Generated: Yes, by codebase mapping.
- Committed: Managed by the planning workflow rather than the runtime build.

---

*Structure analysis: 2026-08-14*
