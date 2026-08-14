# Testing Patterns

**Analysis Date:** 2026-08-14

## Test Framework

**Runner:**
- Not detected. `package.json` contains no test runner dependency and no `test` script.
- No Jest, Vitest, Playwright, Cypress, or other test configuration exists at the repository root alongside `package.json` and `next.config.mjs`.

**Assertion Library:**
- Not detected in `package.json`, `package-lock.json`, or source files under `app/`, `lib/`, `src/`, and `scripts/`.

**Run Commands:**
```bash
# No test command is defined in package.json.
npm run lint          # Existing static-check script; not a test runner.
npm run build         # Existing production compilation gate; not a test runner.
# No watch or coverage command is defined in package.json.
```

**Current Automated Gates:**
- `npm run lint` maps to `next lint` in `package.json`; no ESLint configuration is present at the repository root.
- `npm run build` maps to `next build` in `package.json` and exercises framework compilation against `next.config.mjs`, `app/`, and `src/`.
- No CI workflow directory is present at `.github/workflows/`; these commands are not repository-enforced by CI.

## Test File Organization

**Location:**
- No co-located `*.test.*` or `*.spec.*` files exist under `app/`, `lib/`, `src/`, or `scripts/`.
- No dedicated `test/`, `tests/`, or `__tests__/` directory exists beside `app/`, `lib/`, `src/`, or `scripts/`.

**Naming:**
- Not established; there are no test filenames in the main source tree under `app/`, `lib/`, `src/`, or `scripts/`.

**Structure:**
```text
Not detected in app/, lib/, src/, or scripts/.
```

**Observable Code Boundaries:**
- Pure or mostly pure exported helpers are colocated with production code, including `parseRoute`/`screenPath` in `src/router.js`, `normalizeCat`/`catOf` in `src/data.js`, `formatPhone` in `src/fields.jsx`, and rate-window behavior in `lib/rate-limit.js`.
- Database and authentication flows are centralized in `src/server/actions.js` and `lib/auth.js`; there is no separate test adapter layer around them.
- Route behavior is contained in `app/callback/[provider]/route.js` and `app/uploads/[file]/route.js`; no route-level integration suite is present.

## Test Structure

**Suite Organization:**
```javascript
// Not applicable: no describe/test/it suites exist under app/, lib/, src/, or scripts/.
```

**Patterns:**
- Setup pattern: Not detected; no test setup file or runner configuration exists alongside `package.json`.
- Teardown pattern: Not detected; production singleton cleanup appears only in maintenance scripts such as `scripts/migrate-chains.mjs` and `scripts/migrate-photos.mjs`.
- Assertion pattern: Not detected; source checks in `src/server/actions.js`, `lib/auth.js`, and `app/uploads/[file]/route.js` are runtime guards, not automated assertions.
- Test isolation pattern: Not detected; `lib/prisma.js` exports a process-wide Prisma singleton and `lib/rate-limit.js` retains module-level in-memory state.

## Mocking

**Framework:** Not detected in `package.json` or `package-lock.json`.

**Patterns:**
```javascript
// Not applicable: no jest.mock, vi.mock, spy, stub, or fake-timer usage exists
// under app/, lib/, src/, or scripts/.
```

**What to Mock:**
- No repository-defined mocking guidelines exist. External HTTP calls are invoked directly from `lib/ai.js`, `lib/oauth.js`, and `lib/push.js`.
- Database access is imported directly from the singleton in `lib/prisma.js` by `src/server/actions.js`, `lib/auth.js`, `lib/chains.js`, and `lib/notify.js`.
- Browser globals are referenced directly in `src/App.jsx`, `src/pwa.jsx`, `app/metrika.jsx`, and `src/screen-profile.jsx`; no browser test harness or shim is configured.

**What NOT to Mock:**
- Not established because there is no test suite. Production fallback behavior is implemented directly in `lib/ai.js`, `lib/notify.js`, and `lib/storage.js`, but it is not exercised through test doubles.

## Fixtures and Factories

**Test Data:**
```javascript
// Not detected: there are no test fixtures or factories.
// src/data.js, src/cities.js, and src/wishes.js contain production reference data.
```

**Location:**
- No fixture/factory directory exists under `app/`, `lib/`, `src/`, `scripts/`, or `prisma/`.
- `prisma/dev.db` is a development SQLite database, not a test fixture, and no seed command is defined in `package.json`.
- Production taxonomy and lookup data live in `src/data.js`, `src/cities.js`, `src/wishes.js`, and `src/reports.js`; these are imported by application code rather than test setup.

## Coverage

**Requirements:** None enforced in `package.json`; no coverage thresholds, provider, or reporting configuration is present at the repository root.

**View Coverage:**
```bash
# Not available: package.json defines no coverage script and no coverage tool dependency.
```

**Coverage Artifacts:**
- No committed coverage configuration or report directory is present alongside `package.json`, `app/`, `lib/`, or `src/`.
- No CI coverage publication exists because `.github/workflows/` is not present.

## Test Types

**Unit Tests:**
- Not used. Pure logic in `src/router.js`, `src/data.js`, `lib/rate-limit.js`, `lib/ai.js`, and `lib/chains.js` has no automated unit coverage.
- React helpers and components in `src/ui.jsx`, `src/fields.jsx`, `src/screen-auth.jsx`, and `src/screen-profile.jsx` have no component-test coverage.

**Integration Tests:**
- Not used. Prisma-backed actions in `src/server/actions.js`, auth/session handling in `lib/auth.js`, and route handlers in `app/callback/[provider]/route.js` and `app/uploads/[file]/route.js` have no automated integration coverage.
- External integration fallbacks in `lib/ai.js`, `lib/oauth.js`, `lib/push.js`, and `lib/notify.js` are not exercised by an integration harness.

**E2E Tests:**
- Not used. No Playwright, Cypress, or browser-test dependency/configuration is declared in `package.json` or present at the repository root.
- User journeys coordinated by `src/App.jsx`—authentication, listing creation, offers, chat, chains, wallet, and moderation—have no automated end-to-end suite.

## Common Patterns

**Async Testing:**
```javascript
// Not established: asynchronous production flows use async/await directly,
// for example src/server/actions.js and app/callback/[provider]/route.js,
// but no tests exercise them.
```

**Error Testing:**
```javascript
// Not established: expected failures are represented at runtime as
// { ok: false, error } in src/server/actions.js or HTTP responses in
// app/uploads/[file]/route.js; no assertions cover these contracts.
```

**Runtime Validation in Place of Tests:**
- Server actions normalize and reject malformed inputs inline in `src/server/actions.js`; callers display returned errors in `src/screen-auth.jsx`, `src/App.jsx`, and `src/screen-profile.jsx`.
- Transaction rollback uses sentinel exceptions in deal and chain flows in `src/server/actions.js`; no regression tests verify rollback or concurrency behavior.
- Optional integrations log and fall back at runtime in `lib/ai.js`, `lib/notify.js`, and `lib/storage.js`; no automated test verifies degraded-mode output.
- Browser behavior relies on effect cleanup and guarded global access in `src/App.jsx`, `src/pwa.jsx`, and `app/metrika.jsx`; no DOM or browser runner validates those paths.

## Database and Environment Isolation

**Database:**
- Application and scripts use the Prisma client exported by `lib/prisma.js`, backed by the schema in `prisma/schema.prisma`; there is no test database configuration in `package.json`.
- Maintenance scripts create or disconnect their own Prisma clients in `scripts/backup-snapshot.mjs`, `scripts/migrate-chains.mjs`, and `scripts/migrate-photos.mjs`; this is operational cleanup, not a test lifecycle.

**Environment:**
- Integration behavior is selected through runtime environment access inside `lib/ai.js`, `lib/auth.js`, `lib/oauth.js`, `lib/push.js`, and `lib/storage.js`; no test environment loader or environment fixture is configured in `package.json`.
- AI and notification modules contain production-safe fallback paths in `lib/ai.js` and `lib/notify.js`, but the repository has no automated matrix for configured versus unconfigured integrations.

---

*Testing analysis: 2026-08-14*
