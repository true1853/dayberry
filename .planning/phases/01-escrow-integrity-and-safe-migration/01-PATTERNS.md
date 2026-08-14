# Phase 1: Escrow Integrity and Safe Migration - Pattern Map

**Mapped:** 2026-08-14  
**Files analyzed:** 19 likely new/modified files  
**Analogs found:** 11 / 19  
**Scope:** `prisma/`, `src/server/`, `lib/`, `scripts/`, deployment manifests, package scripts, and the absent test/migration/runbook surfaces

## File Classification

Directory names below containing `<timestamp>` are placeholders the planner must replace with ordered Prisma migration directory names. `01-VALIDATION.md` is authoritative for the concurrency-test filename (`escrow-concurrency.integration.test.mjs`) where the research outline used a shorter variant.

| New/Modified File | Change | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|---|
| `prisma/schema.prisma` | modify | model/config | CRUD | same file, `Deal`/`Transaction`/one-to-one relation conventions | exact |
| `prisma/migrations/<timestamp>_baseline/migration.sql` | create | migration | batch | none; repository has no migration history | none |
| `prisma/migrations/<timestamp>_deal_escrow_integrity/migration.sql` | create | migration | batch/CRUD | none; only `schema.prisma` expresses the current schema | none |
| `lib/deals/escrow.js` | create | service | CRUD/request-response | `src/server/actions.js:647-908`, `1591-1758` | exact flow, different tier |
| `lib/deals/escrow-invariants.js` | create | utility | transform | `lib/chains.js:53-118` | role-match |
| `src/server/actions.js` | modify | controller/server action | request-response/CRUD | same file's deal, dispute, and chain actions | exact |
| `scripts/audit-deal-escrow.mjs` | create | utility/audit | batch/file-I/O/transform | `scripts/backup-snapshot.mjs`, `scripts/migrate-chains.mjs` | partial role-match |
| `scripts/backfill-deal-escrow.mjs` | create | migration utility | batch/CRUD/file-I/O | `scripts/migrate-chains.mjs` | role-match |
| `scripts/backup-snapshot.mjs` | modify | utility/operations | file-I/O | same file | exact |
| `scripts/verify-restored-copy.mjs` | create | utility/audit | batch/file-I/O | `scripts/backup-snapshot.mjs` | partial role-match |
| `test/fixtures/escrow-db.mjs` | create | test fixture/provider | file-I/O/config | none; `test/` and `tests/` do not exist | none |
| `test/escrow.integration.test.mjs` | create | test | CRUD/request-response | none | none |
| `test/escrow-concurrency.integration.test.mjs` | create | test | concurrent CRUD/event-driven | none | none |
| `test/migration.integration.test.mjs` | create | test | batch/file-I/O | none | none |
| `test/compatibility.integration.test.mjs` | create | test | request-response/config | none | none |
| `package.json` | modify | config | batch | same file | exact |
| `Dockerfile` | modify | config/deployment | batch | same file | exact |
| `docker-compose.yml` | modify if rollout flags or a release command are exposed here | config/deployment | batch | same file | exact |
| `docs/ESCROW_MIGRATION_RUNBOOK.md` | create | operations/runbook | batch/file-I/O | none; `docs/` does not exist | none |

## Pattern Assignments

### `prisma/schema.prisma` (model/config, CRUD)

**Analog:** current `prisma/schema.prisma`.

**Datasource and generator convention** (`prisma/schema.prisma:1-8`):

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}
```

Do not introduce a second datasource or a schema-time provider switch. Tests must change `DATABASE_URL`, not the schema provider.

**Relation, optional FK, delete-action, and composite uniqueness convention** (`prisma/schema.prisma:75-89`):

```prisma
dealId   String?
deal     Deal?    @relation(fields: [dealId], references: [id], onDelete: SetNull)

@@unique([dealId, authorId])
 @@index([targetId, createdAt])
```

**Existing deal/ledger surface to extend** (`prisma/schema.prisma:147-197`):

```prisma
model Deal {
  id        String @id @default(cuid())
  userId    String
  user      User   @relation("dealInitiator", fields: [userId], references: [id], onDelete: Cascade)
  credits   Int    @default(0)
  stage     String @default("created")
  status    String @default("active")
  // ...
}

model Transaction {
  id      String @id @default(cuid())
  userId  String
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  kind    String @default("earn")
  amt     Int    @default(0)
  status  String @default("done")
  refType String @default("")
  refId   String @default("")

  @@index([userId, createdAt])
  @@index([userId, status])
  @@index([refType, refId])
}
```

**Target delta from research (no existing exact analog):** add nullable unique `Deal.createCommandKey`, nullable unique `Deal.escrowTransactionId`, named optional relation `DealEscrow`, and nullable unique `Transaction.businessKey`. Keep `refType/refId` for compatibility. Use `onDelete: Restrict` for the authoritative escrow link; the repository currently uses `Cascade`/`SetNull`, so the generated SQLite SQL must be reviewed explicitly. Do not add `@@unique([refType, refId])`: chain rows legitimately share that pair.

---

### `lib/deals/escrow.js` (service, CRUD/request-response)

**Analog:** direct-deal and chain financial paths in `src/server/actions.js`.

**Imports/module convention** (`src/server/actions.js:1-22`, adjusted for a `lib/` module):

```javascript
import { prisma } from '../prisma.js';
```

Server actions omit `.js` in Next-resolved imports, while standalone ESM under `lib/`/`scripts/` uses explicit `.js`. The service should accept an injected Prisma client/transaction where tests need isolated clients; it must not read cookies or perform notification I/O.

**Conditional debit inside an interactive transaction** (`src/server/actions.js:690-712`):

```javascript
result = await prisma.$transaction(async (tx) => {
  if (num > 0) {
    const debited = await tx.user.updateMany({
      where: { id: user.id, balance: { gte: num } },
      data: { balance: { decrement: num } },
    });
    if (debited.count !== 1) throw new InsufficientFunds();

    await tx.transaction.create({
      data: {
        userId: user.id,
        kind: 'escrow-in',
        amt: num,
        status: 'held',
      },
    });
  }
  // related records are created using tx before commit
});
```

Copy the `updateMany` claim and `count === 1` convention, but change the creation order/shape so the hold gets `refType: 'deal'`, `refId: deal.id`, `businessKey: deal:<id>:hold`, and is linked through `Deal.escrowTransactionId` before commit.

**Explicit reference convention** (`src/server/actions.js:1596-1614`):

```javascript
await tx.transaction.create({
  data: {
    userId: s.userId,
    kind: 'escrow-in',
    amt: s.topup,
    status: 'held',
    refType: 'chain',
    refId: chain.id,
  },
});
```

For direct deals use the same shape with `refType: 'deal'` and `refId: deal.id`; the FK and business key remain the authority.

**Domain rollback signal convention** (`src/server/actions.js:602-608`):

```javascript
class InsufficientFunds extends Error {
  constructor(userId) { super('insufficient funds'); this.userId = userId; }
}
class DealClosed extends Error {}
```

Add explicit conflict/invariant error types in the domain module. Throw them inside the transaction to roll back, then translate them to `{ ok: false, error }` only in `src/server/actions.js`.

**Required terminal core shape:** one interactive transaction must (1) conditionally claim the legal deal state, (2) update the exact linked hold with a full invariant predicate, (3) update the correct balance and counters, and (4) create the unique `deal:<dealId>:release` earning row. A positive-credit deal for which the exact escrow update count is not one must throw and roll back. Zero-credit deals must neither link nor mutate a hold.

**Do not copy:** `completeDeal` at `src/server/actions.js:647-673`, the latest-held lookup at `648-651`, or the split claim/settlement at `795-805`. Those are the defects this phase removes.

---

### `lib/deals/escrow-invariants.js` (utility, transform)

**Analog:** small deterministic helpers in `lib/chains.js:53-118`.

```javascript
const clamp100 = n => Math.max(0, Math.min(99, Math.round(n)));

function fingerprintOf(kind, steps) {
  const parts = steps.map(s => `${s.userId}>${s.lotId || '-'}`).sort();
  return `${kind}|${parts.join(',')}`;
}

function topupOf(givenValue, receivedValue) {
  return receivedValue - givenValue;
}
```

Follow this module style: constants and pure functions first, descriptive comments around business rules, named exports only for the public surface. The new helpers should be database-free and deterministic: stable hold/release/create keys, expected escrow status by deal state, zero-credit rules, row invariant validation, and globally unique candidate-graph classification. This makes them directly testable without cookies or Prisma.

---

### `src/server/actions.js` (controller/server action, request-response/CRUD)

**Analog:** the existing actions being replaced; preserve the boundary, auth, result shape, and post-commit notifications.

**Server-action imports and auth** (`src/server/actions.js:1-22`, `675-683`):

```javascript
'use server';

import { prisma } from '../../lib/prisma';
import { getCurrentUser } from '../../lib/auth';

export async function createDealAction(input) {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: 'Требуется вход' };
  if (user.status === 'blocked') return { ok: false, error: 'Аккаунт заблокирован — открывать сделки нельзя' };
  // participant and lot validation follows
}
```

Actions must derive the actor from `getCurrentUser()`, never accept a client-supplied actor ID. Preserve participant checks before calling the extracted command. Admin resolution keeps the current guard (`src/server/actions.js:2221-2228`):

```javascript
const user = await getCurrentUser();
if (!isAdmin(user)) return { ok: false, error: 'Недостаточно прав' };
if (outcome !== 'refund' && outcome !== 'release') return { ok: false, error: 'Неизвестное решение' };
```

**Compare-and-set response convention** (`src/server/actions.js:794-804`):

```javascript
const claimed = await prisma.deal.updateMany({
  where: { id: deal.id, status: 'active', [mine]: false, [other]: both },
  data: both
    ? { stage: 'done', status: 'done', [mine]: true }
    : { stage: 'confirm', [mine]: true },
});
if (claimed.count !== 1) return { ok: false, error: 'Статус сделки изменился — обновите страницу' };
```

Move the final confirmation claim into the extracted financial transaction. The controller should map a domain conflict to the same stable user-facing response; it must not perform a second settlement call.

**Post-commit side effects** (`src/server/actions.js:747-762`, `878-908`, `1748-1758`): notification and serialization occur only after the database transaction returns. Preserve this ordering and notify only for the caller that won the conditional claim.

**Routes that must converge on the same domain core:** `createDealAction`, final path of `confirmSide`, `cancelDealAction`, `openDisputeAction`, both outcomes of `resolveDisputeAction`, and the deal-freezing loop in `blockUserAction`. The current moderation loop at `2558-2599` bypasses dispute validation and must call the same open-dispute command instead of directly updating deals.

**Wallet compatibility contract** (`src/server/actions.js:946-969`):

```javascript
const [txs, heldSum, delta] = await Promise.all([
  prisma.transaction.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: WALLET_TX_LIMIT }),
  prisma.transaction.aggregate({ where: { userId: user.id, status: 'held' }, _sum: { amt: true } }),
  prisma.transaction.aggregate({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - 30 * 86400000) }, status: 'done' },
    _sum: { amt: true },
  }),
]);
```

Opening a dispute must leave the exact escrow row `held`; introducing a new ledger status would silently remove it from the wallet escrow total.

---

### `scripts/audit-deal-escrow.mjs` (utility/audit, batch/file-I/O/transform)

**Partial analogs:** `scripts/migrate-chains.mjs:13-45` for standalone ESM lifecycle and `scripts/backup-snapshot.mjs:12-25` for CLI path validation/error exit.

```javascript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
```

Keep direct `PrismaClient` ownership and guaranteed disconnect. Do **not** import `lib/prisma.js`: its initialization issues `journal_mode`, `busy_timeout`, and `synchronous` PRAGMAs (`lib/prisma.js:5-18`), which violates a strictly read-only audit.

There is no safe repository analog for opening SQLite with `mode=ro`, resolving and denying the live production path, generating a deterministic JSON report, or globally classifying ambiguous candidate graphs. Implement those from `01-RESEARCH.md`; dry/read-only behavior is mandatory, not an optional CLI mode. Human summary and JSON must come from the same classification result.

Required result buckets include missing/multiple links, wrong user/amount/kind/ref/status, zero-credit links, orphan/dangling direct refs, duplicate key candidates, chain collisions, and balance/held/payout/counter anomalies. Include row IDs; never use timestamps or chat text as automatic proof.

---

### `scripts/backfill-deal-escrow.mjs` (migration utility, batch/CRUD/file-I/O)

**Analog:** idempotent chat-member migration in `scripts/migrate-chains.mjs:17-45`.

```javascript
const before = await prisma.chatMember.count({ where: { chatId: chat.id, userId } });
if (before) continue;
try {
  await prisma.chatMember.create({ data: { chatId: chat.id, userId } });
  created++;
} catch (e) {
  if (e.code !== 'P2002') throw e;
}
```

Reuse the standalone lifecycle, explicit counts, rerunnable/no-op expectation, and narrow handling of `P2002`. Do not copy its “scan then infer” semantics. Phase 1 backfill must default to dry-run, accept only an audited manifest plus verified hash for `--apply`, update only globally unique invariant-consistent pairs, and leave every ambiguous/broken row unchanged. A second apply of the same manifest must report zero mutations.

---

### `scripts/backup-snapshot.mjs` (utility/operations, file-I/O)

**Analog:** same file, `scripts/backup-snapshot.mjs:1-25`.

```javascript
const target = process.argv[2] || '/tmp/dayberry-backup.db';
if (target.includes("'")) {
  console.error('недопустимый путь');
  process.exit(1);
}

const prisma = new PrismaClient();
await prisma.$executeRawUnsafe(`VACUUM INTO '${target}'`);
```

Retain `VACUUM INTO` as the consistent WAL-aware snapshot primitive, but replace the fixed/default target behavior with a unique, resolved target and robust collision/live-path checks. Add checksum, size, source/target metadata, SQLite runtime/PRAGMAs, post-snapshot independent open, `integrity_check`, `foreign_key_check`, and a machine-readable evidence manifest. Follow the other scripts' `.finally(() => prisma.$disconnect())` convention; the current script exits without disconnecting.

---

### `scripts/verify-restored-copy.mjs` (utility/audit, batch/file-I/O)

**Partial analog:** backup script for CLI/path ownership and direct Prisma client lifecycle.

Copy only the explicit target argument, validation, error exit, and standalone-client shape shown above. There is no existing restore verification analog. The verifier must independently open an isolated restored file (never the live path), run both `integrity_check` and `foreign_key_check`, capture table counts/schema/runtime/PRAGMAs, invoke the domain escrow audit, and emit machine-readable evidence. Application boot/synthetic terminal smoke remains an orchestration/runbook step if it cannot safely live in this process.

---

### `package.json` (config, batch)

**Analog:** current script naming at `package.json:6-15`.

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "postinstall": "prisma generate",
  "db:push": "prisma db push",
  "migrate:photos": "node scripts/migrate-photos.mjs",
  "migrate:chains": "node scripts/migrate-chains.mjs"
}
```

Use colon-separated operational names and non-watch commands. Add the serial full test command required by validation (`node --test --test-concurrency=1 test/*.test.mjs`) plus explicit audit/backfill/verify/migrate-deploy commands. No new test dependency is needed; Node 22 is already the runtime.

---

### `Dockerfile` (config/deployment, batch)

**Analog:** current build/start split at `Dockerfile:7-31`.

```dockerfile
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npx prisma generate
RUN npm run build

CMD ["sh", "-c", "mkdir -p /app/data/uploads && npx prisma db push --skip-generate && node scripts/migrate-photos.mjs && node scripts/migrate-chains.mjs && node node_modules/next/dist/bin/next start -p 80"]
```

Preserve locked install, explicit Prisma generation, build, and Node 22. The `db push` startup segment is an anti-pattern for this phase: schema deployment must become a reviewed `prisma migrate deploy` release step and must not race across replicas. Do not bury backup, audit approval, or backfill apply inside application startup. Keep old idempotent content backfills only if the operator-approved rollout design still requires them.

---

### `docker-compose.yml` (config/deployment, batch)

**Analog:** existing server-only environment and persistent-volume conventions (`docker-compose.yml:12-36`).

```yaml
environment:
  DATABASE_URL: file:/app/data/dayberry.db
  AUTH_SECRET: ${AUTH_SECRET:?AUTH_SECRET is required}
  ADMIN_EMAILS: ${ADMIN_EMAILS:-}
volumes:
  - dayberry-data:/app/data
```

If Phase 1 exposes rollout/compatibility flags here, follow `${NAME:-safe_default}` and keep them server-only. The exact-escrow fix itself must never be flag-disabled; only later/new-model behavior may be switched off. Do not encode an assumed live host path or replica topology in compose—the runbook must require operator inventory first.

---

### Environment/flag convention shared by deployment and actions

**Source:** `src/server/actions.js:1798-1817`.

```javascript
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

const isAdmin = (user) => !!user && ADMIN_EMAILS.includes((user.email || '').toLowerCase());
```

Use module-level parsing, safe defaults, normalization, and no client exposure. For a boolean rollout flag, parse an explicit allow value rather than relying on JavaScript truthiness of environment strings. Production mutation still requires explicit CLI `--apply` and manifest verification; an environment flag alone is insufficient authority.

## Shared Patterns

### Authentication and authorization

**Sources:** `lib/auth.js:44-55`; `src/server/actions.js:675-683`, `2138-2147`, `2221-2228`.

- Resolve the authenticated user from the signed httpOnly session via `getCurrentUser()`.
- Participant commands verify the actor is `deal.userId` or `deal.lot.ownerId`.
- Administrative resolution uses the normalized `ADMIN_EMAILS` allowlist and rejects before reading/mutating the dispute.
- Domain services receive an already authenticated actor ID/role; they do not read cookies.
- Operator scripts never reuse browser/admin authentication. Their safety boundary is target-path validation, read-only mode, explicit apply intent, reviewed manifest/hash, and runbook sign-off.

### Atomicity and compare-and-set

**Sources:** `src/server/actions.js:690-745`, `779-805`, `853-876`, `1595-1658`.

- Use short `prisma.$transaction(async (tx) => { ... })` blocks.
- Conditional `updateMany` plus exact `count` is the claim primitive.
- Throw a domain error inside the callback to roll back every authoritative write.
- Keep notifications, push, filesystem I/O, and serialization after commit.
- Do not pre-read a mutable row and treat that read as the concurrency guard.

### Ledger references and uniqueness

**Source:** `src/server/actions.js:1603-1614`; target constraints from research.

- Generic reference shape is `refType` + `refId`; direct deals use `deal`, chains retain `chain`.
- `Deal.escrowTransactionId` is the authoritative one-to-one link.
- Stable `businessKey` values arbitrate retries: `deal:<dealId>:hold` and `deal:<dealId>:release`.
- A direct terminal command predicates on exact transaction ID, user, kind, amount, status, reference type, and reference ID.
- Never select an escrow row by user/amount/recency.

### Error handling and result format

**Sources:** `src/server/actions.js:602-608`, `742-745`, `873-876`; `scripts/migrate-chains.mjs:43-45`.

- Server actions convert recognized domain conflicts to `{ ok: false, error: '<Russian user message>' }` and rethrow unknown errors.
- CLI scripts set nonzero exit state, print a concise error, and always disconnect.
- Only ignore a Prisma uniqueness race when the exact expected idempotent state is re-verified; do not broadly swallow `P2002`.
- Invariant mismatch is fail-closed and observable, never silently treated as an already-completed success.

### SQLite client ownership

**Source:** `lib/prisma.js:5-25`.

The app singleton enables WAL, `busy_timeout=5000`, and `synchronous=NORMAL`. Reuse it in normal app/domain paths. Tests and operational scripts need their own client bound to an explicit database URL so clients can be isolated and disconnected. Strict read-only audit code must not import the singleton because its startup PRAGMAs affect database state.

### Script reporting

**Sources:** `scripts/migrate-photos.mjs:21-57`, `74-105`; `scripts/migrate-chains.mjs:17-45`.

Existing scripts report scanned/created/converted/skipped counts, run a `main()`, surface per-row failures, and disconnect. Preserve those conventions, but Phase 1 financial tooling additionally needs deterministic JSON, stable row IDs, checksums, target banner, mode (`dry-run`/`apply`), manifest hash, before/after totals, and proof that rerun is a no-op.

## No Safe Analog Found

| File | Why no safe analog exists | Planner instruction |
|---|---|---|
| `prisma/migrations/<timestamp>_baseline/migration.sql` | No `prisma/migrations/` directory exists; production currently uses `db push`. | Follow Prisma baseline workflow from research; prove schema equivalence before marking applied. Never generate baseline SQL that recreates/drops live tables. |
| `prisma/migrations/<timestamp>_deal_escrow_integrity/migration.sql` | No reviewed forward SQL exists, and SQLite relation changes can rebuild tables. | Generate from the additive nullable schema, inspect FK/unique indexes and table-copy SQL, and rehearse twice on a restored pre-change database. |
| `test/fixtures/escrow-db.mjs` | No test directory, framework configuration, disposable DB helper, or independent-client pattern exists. | Use Node 22 built-ins, a unique OS temp directory/file per test file, explicit `DATABASE_URL`, migration application, independent Prisma clients, and teardown/disconnect. Never use `prisma/dev.db`. |
| `test/escrow.integration.test.mjs` | No tests exist. | Use `node:test`/`node:assert`; cover zero-credit, create/link/key, rollback failpoints, cancel, two confirmations, dispute open/refund/release, and exact invariant failures. |
| `test/escrow-concurrency.integration.test.mjs` | The app singleton and sequential actions are not a concurrency harness. | Use at least two clients or child processes against one temp SQLite file plus a start barrier; assert one terminal state, one balance/counter delta, one earning row, and restart retry safety. Run the suite serially at file level. |
| `test/migration.integration.test.mjs` | No migration fixture/history exists. | Build pre-change and malformed fixtures, apply baseline/forward migration, backfill twice, compare manifests/counts, and assert ambiguous rows are unchanged. |
| `test/compatibility.integration.test.mjs` | No rollout flags or old/new artifact smoke harness exists. | Prove corrected escrow remains active with new-model flags off and that old-compatible/new code can read the expanded schema. Keep artifact-level smoke in the runbook if not practical in `node:test`. |
| `docs/ESCROW_MIGRATION_RUNBOOK.md` | No `docs/` directory, deployment controller, host inventory, retention policy, or restore procedure is committed. | Document inventory/prechecks, unique backup, checksums, restore drill, audit, baseline, migrate deploy, dry-run/apply manifest approval, verification, enable/observe, stop conditions, and rollback reconciliation. Leave host paths/owners as explicit operator-filled fields, not guesses. |

## Unsafe Existing Analogs (Do Not Copy)

| Existing code | Unsafe behavior | Replacement pattern |
|---|---|---|
| `src/server/actions.js:647-672` | Finds newest held escrow by user and settles it separately from the deal claim. | Dereference `Deal.escrowTransactionId`; claim deal, exact hold, payout, counters, and unique release row in one transaction. |
| `src/server/actions.js:864-871`, `2240-2247` | Credits refund before proving the exact held row and tolerates a missing hold. | Exact conditional escrow update must succeed before/with balance change; otherwise throw and roll back. |
| `src/server/actions.js:2253-2260` | Ignores dispute-release claim count and always calls settlement. | One terminal command with checked CAS count and one financial transaction. |
| `src/server/actions.js:2578-2599` | Moderation opens disputes through direct writes, bypassing exact-hold validation. | Reuse the same dispute command for participant and moderation entry points. |
| `Dockerfile:25-31` | Runs `prisma db push` and data mutations during every application startup. | Separate reviewed `migrate deploy`/backfill release gate; application startup must not perform the Phase 1 financial migration. |
| `scripts/backup-snapshot.mjs:12-25` | Fixed default target, quote-only validation, no checksum/manifest/restore proof, no disconnect. | Resolved unique target, deny live path/collisions, evidence manifest, independent validation, guaranteed disconnect. |

## Planner Ordering and Ownership Notes

1. **Foundation/Wave 0:** pure invariants, disposable DB fixture, package test commands, and baseline/forward migration test scaffolding.
2. **Audit before mutation:** strengthen backup, add read-only audit and restore verifier, then create the operator runbook. Production snapshot absence is a hard gate, not a code blocker for building/testing the tools.
3. **Expand/backfill:** nullable schema + reviewed migration history; audit restored copy; dry-run manifest; explicit apply; second-run no-op; post-audit.
4. **Command core:** extracted exact escrow service, then route every existing direct-deal/dispute/moderation action through it. The integrity core is permanent and not behind a kill switch.
5. **Compatibility/deploy:** remove startup `db push`, rehearse old-compatible/new artifacts, expose only safe rollout flags, and require restore/audit evidence before live mutation.

Avoid splitting `lib/deals/escrow.js` and `src/server/actions.js` across concurrent implementation plans: their signatures and error mapping are tightly coupled. The operational scripts can be separate from the action refactor once the invariant helper/report schema is agreed.

## Metadata

**Analog search scope:** `prisma/`, `src/server/`, `lib/`, `scripts/`, root deployment/package files, and checks for `test/`, `tests/`, `docs/`, `.codex/skills/`, `.agents/skills/`  
**Primary analog files read:** 11 (`schema.prisma`, selected `actions.js` ranges, `lib/prisma.js`, `lib/auth.js`, `lib/chains.js`, three scripts, `Dockerfile`, `docker-compose.yml`, `package.json`)  
**Absent surfaces confirmed:** `AGENTS.md`, `.codex/skills/`, `.agents/skills/`, `test/`, `tests/`, `prisma/migrations/`, `docs/`  
**Pattern extraction date:** 2026-08-14
