# Coding Conventions

**Analysis Date:** 2026-08-14

## Naming Patterns

**Files:**
- Use lowercase kebab-case for feature screens and multiword UI modules: `src/screen-auth.jsx`, `src/screen-notifications.jsx`, and `src/tweaks-panel.jsx`.
- Use short lowercase domain names for server libraries: `lib/auth.js`, `lib/chains.js`, `lib/rate-limit.js`, and `lib/storage.js`.
- Use `.jsx` for modules that render React elements (`src/ui.jsx`, `src/fields.jsx`) and `.js` for data, routing, and server logic (`src/data.js`, `src/router.js`, `src/server/actions.js`).
- Use `.mjs` for Node maintenance scripts and ESM configuration: `scripts/migrate-photos.mjs`, `scripts/backup-snapshot.mjs`, and `next.config.mjs`.
- Preserve framework-required names in the Next.js App Router: `app/layout.jsx`, `app/page.jsx`, and `app/callback/[provider]/route.js`.
- `src/App.jsx` is the main PascalCase filename exception; new screen files should follow the existing `screen-*.jsx` convention rather than copying this exception.

**Functions:**
- Name React components in PascalCase: `AuthScreen` in `src/screen-auth.jsx`, `LotDetail` in `src/screen-lot.jsx`, and `RootLayout` in `app/layout.jsx`.
- Name ordinary helpers and hooks in camelCase: `parseRoute` in `src/router.js`, `saveImage` in `lib/storage.js`, and `useInstallPrompt` in `src/pwa.jsx`.
- Suffix callable server mutations and queries exposed to the client with `Action`: `loginAction`, `createDealAction`, and `listNotificationsAction` in `src/server/actions.js`.
- Use uppercase HTTP method names for route handlers, as in `GET` in `app/callback/[provider]/route.js` and `app/uploads/[file]/route.js`.
- Keep implementation-only helpers unexported and module-scoped: `recalcRating` and `completeDeal` in `src/server/actions.js`, and `fallbackDraft` in `lib/ai.js`.

**Variables:**
- Use camelCase for locals, parameters, state, and module-private values: `currentUser`, `chainStats`, and `publishingRef` in `src/App.jsx`.
- Use `[value, setValue]` pairs for React state and a `Ref` suffix for refs: `const [authOpen, setAuthOpen]` and `pendingActionRef` in `src/App.jsx`.
- Use `is*`, `has*`, or capability words for computed booleans where practical: `isLogin` in `src/screen-auth.jsx`, `isAdmin` in `src/server/actions.js`, and `pushEnabled` in `lib/push.js`; established short state such as `authed` remains in `src/App.jsx`.
- Use SCREAMING_SNAKE_CASE for module-level limits, keys, regular expressions, and configuration constants: `MAX_LOT_PHOTOS` in `src/server/actions.js`, `FILENAME_RE` in `lib/storage.js`, and `COUNTER_ID` in `app/metrika.jsx`.
- Use short names only inside tight transforms or serializer boundaries, such as `u` and `l` in `serializeUser` and `mapLot` in `lib/auth.js`; use domain names at API boundaries in `src/server/actions.js`.

**Types:**
- The project is plain JavaScript/JSX with no TypeScript configuration; data contracts are object shapes rather than declared types in `package.json`, `src/server/actions.js`, and `lib/auth.js`.
- Use PascalCase for error classes: `InsufficientFunds` and `DealClosed` in `src/server/actions.js`.
- Serialize Prisma records into explicit client-facing plain objects before returning them, using `serializeUser` and `mapLot` in `lib/auth.js`, `serializeNotification` in `lib/notify.js`, and `serializeChain` in `src/server/actions.js`.
- Use default values during destructuring for optional public inputs, as in `loginAction({ email, password } = {})` in `src/server/actions.js` and `findChains({ city = '', scope = 'region', allowCredit = true, stats = null } = {})` in `lib/chains.js`.

## Code Style

**Formatting:**
- No formatter configuration is present alongside `package.json`; formatting is maintained manually across `app/`, `lib/`, `src/`, and `scripts/`.
- Use two-space indentation, semicolons, and single-quoted JavaScript strings, matching `lib/auth.js`, `src/router.js`, and `app/layout.jsx`.
- Include trailing commas in multiline objects, arrays, function calls, and JSX-style configuration objects, matching `lib/auth.js` and `next.config.mjs`.
- Keep short guard clauses and trivial handlers on one line when they remain readable, as in `lib/rate-limit.js` and `src/pwa.jsx`; expand database calls and structured returns across lines as in `src/server/actions.js`.
- Use numeric separators for large byte/time limits when readability improves, such as `8_000_000` in `src/server/actions.js` and `3_500_000` in `lib/ai.js`.
- Use CSS custom properties for theme values in `src/design.css`; reusable layout classes live in `src/design.css` and `src/web.css`, while component-specific dynamic styling is frequently supplied through JSX `style` objects in `src/ui.jsx` and `src/screen-profile.jsx`.

**Linting:**
- `package.json` exposes `npm run lint` as `next lint`, but no ESLint configuration or direct ESLint dependency is present in `package.json` or the repository root.
- There is no repository-wide custom lint ruleset; the only inline suppression found is `react-hooks/exhaustive-deps` in `src/screen-lot.jsx`.
- Treat the existing React hook dependency patterns in `src/App.jsx`, `src/screen-chat.jsx`, and `src/screen-lot.jsx` as the reference until lint configuration is made explicit.

## Import Organization

**Order:**
1. Put framework and third-party imports first when the module has them, as in `app/callback/[provider]/route.js`, `lib/auth.js`, and `src/App.jsx`.
2. Put Node built-ins near other external imports and use the `node:` prefix, as in `app/uploads/[file]/route.js`, `lib/storage.js`, and `scripts/migrate-photos.mjs`.
3. Put relative project imports after external imports, grouped contiguously, as in `src/screen-auth.jsx`, `src/screen-feed.jsx`, and `app/layout.jsx`.
4. Keep side-effect stylesheet imports after value imports, as in `app/layout.jsx`.

**Path Aliases:**
- No path aliases are configured; use relative imports throughout `app/`, `lib/`, and `src/`, as demonstrated by `src/server/actions.js` and `app/callback/[provider]/route.js`.
- Client-side modules normally include `.js`/`.jsx` extensions in relative imports (`src/App.jsx`, `src/screen-profile.jsx`), while several Next/server modules omit them (`app/page.jsx`, `lib/auth.js`, `src/server/actions.js`); match the convention of the directory being edited.
- Use named imports for shared helpers and components, with default exports reserved mainly for route/page roots and the main application component in `app/page.jsx`, `app/layout.jsx`, and `src/App.jsx`.

## Error Handling

**Patterns:**
- Validate user-controlled input at the start of each server action and return a discriminated result such as `{ ok: false, error }`; successful mutations return `{ ok: true, ... }`. Follow `registerAction`, `loginAction`, and `createDealAction` in `src/server/actions.js`.
- Guard authentication and authorization before database mutation, returning a user-facing error rather than throwing for expected denials; see `createReviewAction`, `createDealAction`, and moderation actions in `src/server/actions.js`.
- Throw only when an operation must abort or represents an unexpected failure. Transaction-control sentinel errors (`InsufficientFunds`, `DealClosed`) are caught and translated into result objects in `src/server/actions.js`; unknown errors are rethrown.
- Wrap atomic balance, deal, chat, and status changes in Prisma transactions in `src/server/actions.js`; do not replace transaction rollback with partial error returns inside the transaction callback.
- For optional secondary effects, catch, log, and return a safe fallback so the primary operation succeeds: notification and push delivery in `lib/notify.js`, AI fallback paths in `lib/ai.js`, and image processing fallback in `lib/storage.js`.
- For lookup routes, translate invalid input and missing resources into explicit responses, such as status 404 in `app/uploads/[file]/route.js`; OAuth failures redirect with a short-lived error cookie in `app/callback/[provider]/route.js`.
- In React screens, catch rejected server actions, clear loading state, and expose a localized message through component state, as in `src/screen-auth.jsx`, `src/screen-onboarding.jsx`, and `src/screen-wallet.jsx`.
- Empty catches are limited to best-effort browser APIs such as cookie/localStorage/share access in `src/App.jsx`, `src/pwa.jsx`, and `src/screen-profile.jsx`; operational server failures should retain contextual logging in `lib/` and `src/server/actions.js`.

## Logging

**Framework:** `console` only; no structured logging dependency is declared in `package.json`.

**Patterns:**
- Prefix server subsystem warnings with a bracketed domain tag: `[ai]` in `lib/ai.js`, `[notify]` in `lib/notify.js`, `[push]` in `lib/push.js`, and `[chains]` in `src/server/actions.js`.
- Use `console.warn` for degraded-but-recovered behavior, `console.error` for failed user flows or route handling, and `console.log` for explicit operational/audit events in `src/server/actions.js` and `scripts/`.
- Include the caught error or `e.message` with context; examples are OAuth errors in `app/callback/[provider]/route.js` and storage errors in `lib/storage.js`.
- Keep browser error messages concise and action-specific, as in `src/App.jsx`, `src/screen-chat.jsx`, and `src/screen-profile.jsx`.
- Maintenance scripts report progress and set a nonzero `process.exitCode` on failure, as in `scripts/backup-snapshot.mjs` and `scripts/migrate-chains.mjs`.

## Comments

**When to Comment:**
- Explain operational constraints, prior failure modes, and why a non-obvious threshold or fallback exists; `lib/ai.js`, `lib/chains.js`, and `lib/auth.js` are the strongest reference modules.
- Mark major regions in long modules with divider comments, as in the bootstrap, deals, chat, chains, notifications, and moderation sections of `src/server/actions.js`.
- Document security-sensitive validation next to the guard, such as the filename whitelist in `app/uploads/[file]/route.js` and the production secret check in `lib/auth.js`.
- Document React effect intent and cleanup-sensitive behavior immediately above the effect, as in polling and routing effects in `src/App.jsx`.
- JSX section labels may use short block comments for visual landmarks, as in `src/screen-auth.jsx`; avoid narrating obvious markup already expressed by component names in `src/ui.jsx`.

**JSDoc/TSDoc:**
- JSDoc is selective rather than comprehensive; use it for public helpers whose object contract is not obvious, such as `notify` in `lib/notify.js`, `hit` in `lib/rate-limit.js`, and exported chain operations in `lib/chains.js`.
- There is no generated API documentation or TypeScript type-checking configured in `package.json`; JSDoc currently supplements, rather than enforces, object shapes in `lib/notify.js` and `lib/chains.js`.

## Function Design

**Size:**
- Keep reusable serializers, validators, routing helpers, and UI primitives focused and module-scoped, following `src/router.js`, `lib/rate-limit.js`, and the exported primitives in `src/ui.jsx`.
- Large orchestration modules are an established pattern: `src/server/actions.js`, `src/App.jsx`, and `src/screen-profile.jsx` group many related flows. Add code under the existing divider/feature section and extract reusable calculations or serializers into helpers in the same module or the matching `lib/*.js` domain module.
- React screen modules contain both local subcomponents and their exported screen component; follow `src/screen-auth.jsx` and `src/screen-deal.jsx` when a helper is used by only one screen.

**Parameters:**
- Pass a single object for multi-field domain inputs and provide defaults for optional shapes, as in `analyzeListing(input)` in `lib/ai.js`, `notify(input)` in `lib/notify.js`, and server actions in `src/server/actions.js`.
- Destructure React props in the function signature and specify defaults there, as in `src/screen-feed.jsx`, `src/screen-chain.jsx`, and `src/ui.jsx`.
- Normalize boundary values immediately with `trim`, `toLowerCase`, `Number`, or fallback defaults before database use, as in `registerAction` and `createDealAction` in `src/server/actions.js`.

**Return Values:**
- Return `{ ok, error, ...data }` from user-triggered mutation actions in `src/server/actions.js`; callers in `src/screen-auth.jsx` and `src/App.jsx` branch on `res.ok`.
- Return serialized arrays/objects directly from read actions where failure is represented as empty/null, as in `listNotificationsAction` and `loadAuthedDataAction` in `src/server/actions.js`.
- Return cleanup functions from React effects that register listeners or intervals, as in `src/App.jsx` and `src/pwa.jsx`.
- Return safe deterministic fallbacks from optional integrations in `lib/ai.js`, `lib/notify.js`, and `lib/storage.js`.

## Module Design

**Exports:**
- Prefer named exports for domain functions, serializers, React screens, constants, and server actions in `lib/`, `src/`, and `src/server/actions.js`.
- Use default exports for Next.js page/layout components and the application root in `app/page.jsx`, `app/layout.jsx`, `app/metrika.jsx`, and `src/App.jsx`.
- Keep singleton infrastructure behind a named module export, as with `prisma` in `lib/prisma.js`.
- Keep server-only behavior in `lib/*.js`, App Router routes in `app/**/route.js`, and `'use server'` actions in `src/server/actions.js`.

**Barrel Files:**
- Barrel files are not used; import directly from implementation modules such as `src/ui.jsx`, `src/icons.jsx`, `lib/auth.js`, and `lib/storage.js`.
- Public surfaces are assembled through named exports in each concrete file, including the many actions in `src/server/actions.js` and UI primitives in `src/ui.jsx`.

---

*Convention analysis: 2026-08-14*
