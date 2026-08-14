<!-- refreshed: 2026-08-14 -->
# Architecture

**Analysis Date:** 2026-08-14

## System Overview

~~~text
┌───────────────────────────────────────────────────────────────────┐
│                 Next.js App Router / HTTP shell                    │
│  `app/layout.jsx`  `app/page.jsx`  `app/**/route.js`             │
└───────────────────────────────┬───────────────────────────────────┘
                                │ renders
                                ▼
┌───────────────────────────────────────────────────────────────────┐
│             Client application and presentation layer             │
├─────────────────────┬─────────────────────┬───────────────────────┤
│ Root coordinator    │ Mobile screen set   │ Desktop application   │
│ `src/App.jsx`       │ `src/screen-*.jsx` │ `src/web-app.jsx`     │
└──────────┬──────────┴──────────┬──────────┴───────────┬───────────┘
           │ local props/state    │ server action calls  │
           └──────────────────────┴────────────┬─────────┘
                                              ▼
┌───────────────────────────────────────────────────────────────────┐
│                   Server action boundary                          │
│                   `src/server/actions.js`                         │
└──────────┬──────────────┬──────────────┬──────────────┬───────────┘
           │              │              │              │
           ▼              ▼              ▼              ▼
┌────────────────┐ ┌────────────┐ ┌─────────────┐ ┌────────────────┐
│ Domain services│ │ Auth/OAuth │ │ Notification│ │ Media storage  │
│ `lib/ai.js`    │ │ `lib/auth` │ │ `lib/notify`│ │ `lib/storage`  │
│ `lib/chains.js`│ │ `lib/oauth`│ │ `lib/push`  │ │ + upload route │
└────────┬───────┘ └──────┬─────┘ └──────┬──────┘ └──────┬─────────┘
         └────────────────┴───────────────┴────────────────┘
                                      │
                                      ▼
┌───────────────────────────────────────────────────────────────────┐
│ Prisma data access → SQLite + runtime upload filesystem            │
│ `lib/prisma.js`  `prisma/schema.prisma`  `data/uploads/`         │
└───────────────────────────────────────────────────────────────────┘
~~~

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| App Router shell | Defines document metadata, global styles, caching headers, dynamic root rendering, and HTTP route handlers. | `app/layout.jsx`, `app/page.jsx`, `next.config.mjs` |
| Root client coordinator | Owns session bootstrap, shared application state, responsive branch selection, navigation, overlays, optimistic updates, and calls to server actions. | `src/App.jsx` |
| Mobile presentation | Renders feature screens and reusable mobile flows; data and event handlers arrive primarily through props. | `src/screen-*.jsx`, `src/ui.jsx` |
| Desktop presentation | Implements a desktop-specific view router and composes desktop views with selected mobile screens inside modals. | `src/web-app.jsx` |
| Client navigation | Converts URL hashes into mobile tab/stack state and generates deep-link paths. | `src/router.js` |
| Server action facade | Authenticates callers, validates input, coordinates Prisma operations, serializes records, and exposes mutations/queries to client components. | `src/server/actions.js` |
| AI and matching | Analyzes listings, creates embeddings, caches AI results, computes pairwise matches, and provides deterministic fallbacks. | `lib/ai.js` |
| Chain engine | Builds three-party barter graphs, scores edges, persists candidates, and finds replacement chains. | `lib/chains.js` |
| Authentication | Creates/verifies JWT cookie sessions, hashes passwords, and maps database records into client-safe objects. | `lib/auth.js`, `app/callback/[provider]/route.js` |
| Persistence | Supplies the process-wide Prisma client and defines all relational models and indexes over SQLite. | `lib/prisma.js`, `prisma/schema.prisma` |
| Notifications | Persists in-app notifications, fans them out through Web Push, and removes dead subscriptions. | `lib/notify.js`, `lib/push.js` |
| Media pipeline | Converts uploads to content-addressed WebP files, creates thumbnails, and streams validated filenames. | `lib/storage.js`, `app/uploads/[file]/route.js` |
| PWA runtime | Registers the service worker, manages install prompts, and creates/removes browser push subscriptions. | `src/pwa.jsx`, `public/service-worker.js`, `public/manifest.webmanifest` |
| Operational scripts | Perform schema-adjacent backfills, photo migration, and consistent SQLite snapshots. | `scripts/migrate-chains.mjs`, `scripts/migrate-photos.mjs`, `scripts/backup-snapshot.mjs` |

## Pattern Overview

**Overall:** Layered Next.js monolith with a client-heavy SPA, server-action application facade, domain service modules, and Prisma-backed persistence.

**Key Characteristics:**
- Keep the framework entry layer thin: `app/page.jsx` renders `src/App.jsx`, while HTTP-only concerns stay in `app/**/route.js`.
- Treat `src/App.jsx` as the shared state owner. Mobile screens under `src/screen-*.jsx` and `src/web-app.jsx` receive server-derived state and mutation callbacks from it.
- Use Next.js server actions in `src/server/actions.js` as the only browser-to-domain mutation boundary; client modules import actions directly instead of calling bespoke JSON endpoints.
- Put reusable server-side algorithms behind the action facade in `lib/*.js`; `lib/ai.js` and `lib/chains.js` may access Prisma because they are server-only domain services.
- Keep durable business state in SQLite through `prisma/schema.prisma`; keep only UI state and navigation state in React hooks or browser storage in `src/App.jsx`.
- Preserve two presentation paths: hash-addressable mobile navigation through `src/router.js`, and desktop-local navigation through state in `src/web-app.jsx`.

## Layers

**Framework and HTTP Layer:**
- Purpose: Enter the application through Next.js, set document-level policy, and handle non-server-action HTTP requests.
- Location: `app/`, `next.config.mjs`
- Contains: Root layout/page, analytics client, OAuth callback handler, uploaded-file streaming handler, metadata, viewport, and response headers.
- Depends on: `src/App.jsx`, `lib/auth.js`, `lib/oauth.js`, `lib/prisma.js`, `lib/storage.js`
- Used by: Browser navigation, OAuth providers, image requests, and the Next.js runtime.

**Client Orchestration Layer:**
- Purpose: Load server state, select responsive presentation, coordinate mutations, and reconcile local state after server responses.
- Location: `src/App.jsx`
- Contains: React state, bootstrap effects, authentication guards, optimistic favorite updates, refresh functions, hash navigation, overlays, and responsive branching.
- Depends on: `src/server/actions.js`, `src/router.js`, `src/screen-*.jsx`, `src/web-app.jsx`, `src/pwa.jsx`
- Used by: `app/page.jsx`

**Presentation Layer:**
- Purpose: Render mobile and desktop feature views and collect user input.
- Location: `src/screen-*.jsx`, `src/web-app.jsx`, `src/ui.jsx`, `src/fields.jsx`, `src/icons.jsx`
- Contains: Feature screens, sheets, cards, forms, navigation components, responsive desktop views, and shared visual primitives.
- Depends on: Shared display data in `src/data.js`, `src/cities.js`, `src/wishes.js`, and callbacks/actions supplied by `src/App.jsx`; chat, auth, profile, and onboarding screens also call selected actions in `src/server/actions.js`.
- Used by: `src/App.jsx` and, for shared mobile modals, `src/web-app.jsx`.

**Application Boundary:**
- Purpose: Convert client intent into authenticated business operations and client-safe return values.
- Location: `src/server/actions.js`
- Contains: Server actions for identity, lots, deals, wallet, chats, chains, notifications, AI, disputes, password resets, and moderation; private serializers and query helpers live beside their public action.
- Depends on: `lib/*.js`, `prisma/schema.prisma`, Next cookies, and Node crypto.
- Used by: `src/App.jsx`, feature screens in `src/screen-*.jsx`, and `src/pwa.jsx`.

**Domain Service Layer:**
- Purpose: Encapsulate cohesive server-side algorithms that are too specialized for UI or persistence adapters.
- Location: `lib/ai.js`, `lib/chains.js`, `lib/notify.js`, `lib/push.js`, `lib/storage.js`, `lib/oauth.js`, `lib/rate-limit.js`
- Contains: AI provider calls and fallbacks, matching and chain graph logic, delivery fan-out, media processing, OAuth protocol helpers, and in-process throttling.
- Depends on: `lib/prisma.js`, external SDKs, Node APIs, and selected shared catalogs such as `src/cities.js`.
- Used by: `src/server/actions.js` and HTTP route handlers under `app/`.

**Data Layer:**
- Purpose: Define and access durable relational state.
- Location: `lib/prisma.js`, `prisma/schema.prisma`
- Contains: A development-safe singleton Prisma client, SQLite PRAGMA initialization, models, relations, uniqueness constraints, and indexes.
- Depends on: `@prisma/client` and the configured SQLite database.
- Used by: `src/server/actions.js`, `lib/ai.js`, `lib/chains.js`, `lib/auth.js`, `lib/notify.js`, `lib/push.js`, route handlers, and operational scripts.

**Runtime Asset Layer:**
- Purpose: Serve installable PWA assets and immutable uploaded media.
- Location: `public/`, `lib/storage.js`, `app/uploads/[file]/route.js`
- Contains: Manifest, icons, service worker assets, offline page, local fonts, content-addressed upload files, and streaming responses.
- Depends on: Browser PWA APIs, Node filesystem APIs, and `sharp`.
- Used by: `src/pwa.jsx`, `app/layout.jsx`, `src/ui.jsx`, and browsers requesting `/uploads/*`.

## Data Flow

### Primary Request Path

1. Next renders the dynamic root page and mounts the client application (`app/page.jsx:5`).
2. The root client coordinator starts a progressive bootstrap by calling `bootstrapAction()`, then loads authenticated data and AI matches after critical feed/session state is visible (`src/App.jsx:333`).
3. The server action resolves the cookie session once and fetches feed/chain data in parallel (`src/server/actions.js:114`, `lib/auth.js:44`).
4. Prisma queries SQLite through the shared client, with WAL, busy timeout, and normal synchronous mode configured at startup (`lib/prisma.js:23`).
5. `src/App.jsx` stores normalized response objects in React state and passes them into the mobile screen tree or desktop app based on the media query (`src/App.jsx:811`, `src/App.jsx:813`).

### User Mutation Path

1. A screen emits a callback or calls a narrowly selected action, for example listing creation in `src/screen-onboarding.jsx` or favorite/deal operations coordinated by `src/App.jsx`.
2. A public action in `src/server/actions.js` resolves the user, validates input and ownership, then invokes Prisma and domain helpers.
3. Multi-record invariants use Prisma transactions for reviews, deals, escrow, chain activation/completion, moderation, and password-reset handling (`src/server/actions.js`).
4. The action returns a client-safe object; `src/App.jsx` updates the affected state slice, refreshes authoritative aggregates such as wallet balance, and exposes a snack message on failure (`src/App.jsx`).
5. Side-effect notifications are recorded through `lib/notify.js`; Web Push delivery through `lib/push.js` is best-effort and does not roll back the originating business action.

### Chat Synchronization

1. `src/screen-chat.jsx:181` loads the full chat through `getChatAction` and marks it read.
2. The open thread polls incremental updates via `getChatUpdatesAction`; the interval is installed at `src/screen-chat.jsx:257` and pauses while the document is hidden.
3. New outgoing messages render optimistically in a pending list, then reconcile with the serialized message returned by `sendMessageAction` in `src/server/actions.js`.
4. `ChatMember.lastReadAt` in `prisma/schema.prisma` is the per-user unread boundary for both direct and chain chats.

### AI Matching and Chain Generation

1. Listing analysis enters through `analyzeListingAction` in `src/server/actions.js` and delegates provider/fallback logic to `lib/ai.js:256`.
2. Direct matching combines cached embeddings or token similarity with user wants and lot demand in `lib/ai.js:454`.
3. Chain search loads active lots, groups them by owner, builds weighted directed edges, and finds three-party circle/credit exchanges in `lib/chains.js:144`.
4. Candidate refresh deduplicates by fingerprint and persists `Chain` plus nested `ChainStep` records in `lib/chains.js:367`.
5. Acceptance, replacement, escrow, chat creation, transfer confirmation, and completion are transactional state transitions in `src/server/actions.js`.

### OAuth Callback

1. The client asks `getOAuthUrlAction` in `src/server/actions.js` to create provider state and an authorization URL.
2. The provider returns to `app/callback/[provider]/route.js:25`, which validates stored state where required and exchanges the authorization code via `lib/oauth.js`.
3. The callback upserts the user through Prisma, creates the same JWT cookie session used by password login through `lib/auth.js`, and redirects to the application root.

### Uploaded Media

1. Listing/profile actions accept a data URL or existing upload path and call `lib/storage.js`.
2. `lib/storage.js` removes metadata, resizes, encodes WebP, creates a thumbnail, and names files from the source-content hash.
3. Prisma stores public `/uploads/<hash>.webp` paths in models defined by `prisma/schema.prisma`.
4. `app/uploads/[file]/route.js:16` validates the filename against a strict allowlist, streams the runtime file, and returns immutable cache headers.

**State Management:**
- Use React local state and refs in `src/App.jsx` for shared client state; no external state-store library is present.
- Use component-local state in `src/screen-*.jsx` and `src/web-app.jsx` for transient forms, selections, modals, filters, and pending messages.
- Use URL hash state parsed by `src/router.js` for mobile deep links and back/forward; desktop view selection remains local to `src/web-app.jsx`.
- Use browser local storage only for onboarding, chain scope, and tweak preferences in `src/App.jsx` and `src/tweaks-panel.jsx`.
- Treat SQLite models in `prisma/schema.prisma` as authoritative for accounts, lots, deals, escrow transactions, chats, chains, notifications, reviews, moderation, and cached AI results.

## Key Abstractions

**Server Action Facade:**
- Purpose: Provide the trusted browser-to-server boundary without separate JSON controller files.
- Examples: `bootstrapAction`, `createDealAction`, `sendMessageAction`, and `refreshChainsAction` in `src/server/actions.js`.
- Pattern: Public `*Action` functions call private `*Of`, serializer, ownership, and transaction helpers in the same module.

**Serialized View Models:**
- Purpose: Prevent raw Prisma rows and secret fields from crossing into client components.
- Examples: `serializeUser` and `mapLot` in `lib/auth.js`; `serializeDeal`, `serializeChat`, and `serializeChain` in `src/server/actions.js`.
- Pattern: Query related records explicitly, then return UI-oriented plain objects with ISO dates and role-specific fields.

**Responsive Presentation Adapter:**
- Purpose: Reuse one data/control plane while rendering distinct phone and desktop experiences.
- Examples: The media-query branch in `src/App.jsx:813`, mobile tab/overlay functions in `src/App.jsx:600` and `src/App.jsx:690`, and the desktop state router in `src/web-app.jsx:715`.
- Pattern: Keep authoritative data and mutations in `src/App.jsx`; pass the same state and handlers into either renderer.

**Transaction State Machines:**
- Purpose: Enforce escrow and multi-party invariants while deals and chains advance through status fields.
- Examples: `Deal`, `Transaction`, `Chain`, and `ChainStep` in `prisma/schema.prisma`; transition helpers in `src/server/actions.js`.
- Pattern: Validate actor and present state first, mutate all coupled records inside `prisma.$transaction`, then serialize the committed state.

**Notification Record plus Delivery Channels:**
- Purpose: Preserve a durable in-app event even if a secondary delivery channel fails.
- Examples: `Notification` and `PushSubscription` in `prisma/schema.prisma`, `notify` in `lib/notify.js`, and `sendPush` in `lib/push.js`.
- Pattern: Insert notification records first; attempt fan-out separately and swallow delivery failures after logging.

**Content-Addressed Media:**
- Purpose: Deduplicate uploads and make immutable browser caching safe.
- Examples: `saveImage` and `thumbPath` in `lib/storage.js`, streaming in `app/uploads/[file]/route.js`.
- Pattern: Hash source bytes, encode a full image and thumbnail, store only public paths in Prisma, and allow only the known filename grammar at read time.

## Entry Points

**Application Page:**
- Location: `app/page.jsx`
- Triggers: HTTP request to `/`.
- Responsibilities: Force dynamic rendering and mount `src/App.jsx`.

**Root Layout:**
- Location: `app/layout.jsx`
- Triggers: Every App Router request.
- Responsibilities: Apply global/mobile metadata, PWA manifest, viewport settings, CSS, and Yandex Metrika.

**Root Client Application:**
- Location: `src/App.jsx`
- Triggers: Hydration of `app/page.jsx`.
- Responsibilities: Bootstrap data, own shared state, enforce client-side auth gates, select mobile/desktop rendering, and coordinate all major workflows.

**Server Actions:**
- Location: `src/server/actions.js`
- Triggers: Direct imports invoked by client components under Next.js server-action transport.
- Responsibilities: Authorize, validate, transact, serialize, and delegate domain work.

**OAuth Callback Route:**
- Location: `app/callback/[provider]/route.js`
- Triggers: VK or Yandex redirect to `/callback/<provider>`.
- Responsibilities: Validate callback state, exchange code, upsert user, establish session, and redirect.

**Upload Route:**
- Location: `app/uploads/[file]/route.js`
- Triggers: Browser request to a stored `/uploads/<file>` URL.
- Responsibilities: Validate content-addressed filenames and stream files with immutable headers.

**Container Runtime:**
- Location: `Dockerfile`
- Triggers: Container start.
- Responsibilities: Create the runtime upload directory, push the Prisma schema, run idempotent photo/chat backfills, and start Next on port 80.

**Operational Scripts:**
- Location: `scripts/*.mjs`
- Triggers: Explicit npm/shell invocation or the container command.
- Responsibilities: Migrate media/chat membership data and create a consistent SQLite backup snapshot.

## Architectural Constraints

- **Threading:** Application code runs in the Node.js request/event-loop model. CPU/IO libraries such as `bcryptjs`, `sharp`, Prisma, and external AI calls are awaited; no worker-thread layer exists in `src/` or `lib/`.
- **Single-instance assumptions:** SQLite and the in-memory hit map in `lib/rate-limit.js` assume one application instance. `lib/prisma.js` enables WAL and a busy timeout to improve concurrency inside that instance.
- **Global state:** `lib/prisma.js` caches the Prisma client on `globalThis` in development; `lib/rate-limit.js` stores mutable request counters in a module-level `Map`; `lib/storage.js` caches its directory-creation promise.
- **Server-only boundaries:** Files using Prisma, secrets, Node filesystem APIs, or OAuth exchange logic must remain behind `'use server'`, route handlers, or server-only imports in `src/server/actions.js` and `lib/*.js`.
- **Navigation split:** Mobile routes must remain synchronized with `src/router.js` and push URL hashes. Desktop views in `src/web-app.jsx` do not consume that hash stack, so cross-presentation navigation changes require both paths.
- **Persistence:** The schema is SQLite-specific in `prisma/schema.prisma`; runtime startup uses `prisma db push` plus idempotent scripts from `scripts/`, not a checked-in Prisma migration directory.
- **Media locality:** Uploads live on the local filesystem selected by `UPLOAD_DIR` in `lib/storage.js`. The upload route and application process must see the same persistent volume.
- **Circular imports:** No direct circular import chain is detected among the main server layers. Preserve the direction `client → server actions → lib services → Prisma`; do not import client screens from `lib/`.
- **Shared catalogs:** `lib/chains.js` imports geography data from `src/cities.js`, so that module must remain environment-neutral and free of browser-only code.
- **Build limits:** Server-action bodies are limited to 10 MB in `next.config.mjs`; upload validation and client-side image constraints in `src/screen-onboarding.jsx` must stay below that boundary.

## Anti-Patterns

### Bypassing the Server Action Boundary

**What happens:** A client screen imports `lib/prisma.js`, `lib/auth.js`, `lib/storage.js`, or another server-only module directly.
**Why it's wrong:** It leaks server dependencies/secrets into the client graph and bypasses authorization, validation, serialization, and transaction rules centralized in `src/server/actions.js`.
**Do this instead:** Add or extend a public `*Action` in `src/server/actions.js`, keep reusable server logic in `lib/<domain>.js`, and return a client-safe plain object.

### Adding More Domain Logic to the Root Coordinator

**What happens:** New validation, persistence rules, or transaction state transitions are implemented inside `src/App.jsx`.
**Why it's wrong:** `src/App.jsx` already owns navigation, responsive selection, state reconciliation, and orchestration; domain rules there can diverge from authoritative server behavior.
**Do this instead:** Keep UI sequencing in `src/App.jsx`, place trusted operations in `src/server/actions.js`, and extract cohesive algorithms to `lib/<domain>.js` following `lib/chains.js`.

### Updating Only One Responsive Navigation Path

**What happens:** A feature route is added only to the mobile hash switch in `src/router.js` or only to the desktop state switch in `src/web-app.jsx`.
**Why it's wrong:** The same data model then exposes different workflows by viewport, and deep links handled by `src/App.jsx` cannot reach the desktop equivalent.
**Do this instead:** Update `src/router.js`, mobile tab/overlay rendering in `src/App.jsx`, desktop navigation in `src/web-app.jsx`, and push URLs in `lib/push.js` together when the feature is addressable.

### Returning Raw Prisma Records

**What happens:** An action sends a database row with server-only fields or unnormalized dates directly to a client component.
**Why it's wrong:** Raw `User` rows include `passwordHash`, relation shapes vary by query, and Date objects/role-specific fields are not stable view contracts.
**Do this instead:** Extend serializers in `lib/auth.js` or `src/server/actions.js` and return only the fields consumed by `src/screen-*.jsx` or `src/web-app.jsx`.

### Treating Notifications as the Transaction

**What happens:** A deal, chain, or moderation mutation fails because Web Push delivery failed.
**Why it's wrong:** Delivery is secondary; durable business state and the in-app `Notification` record must remain authoritative.
**Do this instead:** Commit the business mutation in `src/server/actions.js`, then use the failure-tolerant `notify` abstraction in `lib/notify.js`.

## Error Handling

**Strategy:** Validate anticipated user errors at the server boundary and return structured `{ ok: false, error }` results; throw unexpected infrastructure errors, catch them at client workflow boundaries, log context, and show a user-safe snack or screen error.

**Patterns:**
- Public actions in `src/server/actions.js` return explicit errors for unauthenticated access, invalid input, ownership violations, illegal state transitions, and Prisma uniqueness conflicts.
- Multi-step mutations in `src/server/actions.js` use `prisma.$transaction` so partial writes do not escape.
- `src/App.jsx` and screens such as `src/screen-chat.jsx` catch action failures, preserve or roll back optimistic UI, and keep network errors out of render paths.
- Optional integrations degrade safely: `lib/ai.js` falls back to deterministic heuristics, while `lib/notify.js`, `lib/push.js`, and `app/metrika.jsx` prevent delivery/analytics failures from breaking core flows.
- Route handlers in `app/callback/[provider]/route.js` convert OAuth failures to a clean redirect plus short-lived error cookie; `app/uploads/[file]/route.js` returns 404 for invalid or missing files.

## Cross-Cutting Concerns

**Logging:** Use scoped `console.error` for failed user workflows in `src/App.jsx` and route callbacks, and scoped `console.warn` for non-fatal infrastructure/integration failures in `lib/prisma.js`, `lib/storage.js`, `lib/notify.js`, and `lib/push.js`.

**Validation:** Keep client affordance checks close to forms in `src/screen-*.jsx`, but repeat authoritative validation, limits, ownership checks, and state checks in `src/server/actions.js`. Use database constraints in `prisma/schema.prisma` for uniqueness and relational integrity.

**Authentication:** Use JWT sessions in the httpOnly `dayberry_session` cookie through `lib/auth.js`; every protected action in `src/server/actions.js` resolves the current user and must not trust a client-supplied user ID.

**Authorization:** Use ownership/participant checks in `src/server/actions.js`; administrative access derives from the configured email allowlist inside that server-only module.

**Analytics:** `app/metrika.jsx` loads only on the production host, manually records hash-route hits, and exposes `trackGoal`; sensitive chat/auth DOM is marked from screens such as `src/screen-chat.jsx` and `src/screen-auth.jsx`.

**Caching:** `next.config.mjs` marks built assets and fonts immutable while dynamic HTML/RSC remains no-store; `app/uploads/[file]/route.js` can cache media forever because filenames are content-addressed.

**PWA:** `src/pwa.jsx` handles registration/subscription UX; `public/service-worker.js`, `public/sw.js`, and `public/offline.html` own browser-side offline and push behavior.

---

*Architecture analysis: 2026-08-14*
