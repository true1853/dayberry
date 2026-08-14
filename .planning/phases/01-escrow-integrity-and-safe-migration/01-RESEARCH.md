# Phase 1: Escrow Integrity and Safe Migration - Research

**Researched:** 2026-08-14  
**Domain:** Financial invariants, exact escrow linkage, SQLite/Prisma production migration  
**Confidence:** HIGH for code-path and design findings; MEDIUM for operational rollout; LOW for the contents of the unavailable production database

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SAFE-01 | Замороженные баллы однозначно связаны с конкретной сделкой, а завершение, отмена или перевод в спор изменяют состояние сделки и баллов атомарно и не более одного раза. | Exact escrow FK/reference, stable business keys, one conditional terminal claim, one short transaction, and repeated/concurrent command tests. [VERIFIED: `.planning/REQUIREMENTS.md`; `src/server/actions.js`; `prisma/schema.prisma`] |
| SAFE-02 | Существующие сделки и баллы переходят на новую модель без потери данных; неоднозначные записи не исправляются догадкой и попадают в отчёт для ручной проверки. | Read-only reconciliation, deterministic matching rules, explicit ambiguity buckets, additive schema, idempotent backfill, production-copy rehearsal, and operator disposition. [VERIFIED: `.planning/REQUIREMENTS.md`; `.planning/ROADMAP.md`] |
| SAFE-03 | Новая модель запускается управляемо и может быть отключена без остановки существующего чата, эскроу, завершения сделки и спора. | Compatibility reads, nullable expansion, corrected legacy-compatible terminal core, feature flags above the financial core, and application rollback without destructive schema rollback. [VERIFIED: `.planning/REQUIREMENTS.md`; `.planning/ROADMAP.md`; `Dockerfile`] |
</phase_requirements>

## Summary

Phase 1 must repair the current financial boundary before adding the v1.1 deal model. Direct deal creation writes a held `Transaction` without `refType/refId`; completion, cancellation, and dispute refund search for the newest held escrow row by user; completion moves `Deal` to `done` before a second transaction performs settlement; concurrent dispute release ignores the conditional-update count and can call settlement twice. Chain escrow already uses `refType='chain'`/`refId=chain.id`, which makes the direct-deal “latest held” query capable of selecting a chain hold as well as another direct-deal hold. [VERIFIED: `src/server/actions.js:647-671,674-748,785-907,1588-1621,1718-1749,2218-2269`; `prisma/schema.prisma:176-197`]

The safe target is an additive, foreign-key-backed exact link from each positive-credit deal to one escrow transaction, while retaining and populating the existing generic reference fields for compatibility and operations. Every financial row also needs a nullable unique `businessKey`; new holds use `deal:<dealId>:hold` and release earnings use `deal:<dealId>:release`. Creation, final confirmation, cancellation, and dispute resolution must each claim the legal deal state and validate/update the exact escrow row inside one short interactive transaction. Opening a dispute does not move credits: it atomically claims the deal only if its exact escrow remains held, and intentionally leaves that hold unchanged. [CITED: https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions] [VERIFIED: `prisma/schema.prisma`; `src/server/actions.js`]

Migration must be expand/backfill/verify/enable, never “rewrite and hope.” First produce a read-only report from a restored production snapshot; automatically link only globally unique, invariant-consistent pairs; export every ambiguous or broken case for manual disposition; then apply the exact same reviewed process to production. The repository’s `prisma/dev.db` currently contains the schema but zero `User`, `Deal`, and `Transaction` rows, so this research cannot enumerate live ambiguous IDs. That missing snapshot is a hard pre-mutation gate, not permission to infer by timestamps. [VERIFIED: read-only SQLite queries against `prisma/dev.db` on 2026-08-14; `.planning/STATE.md`]

**Primary recommendation:** Plan three ordered deliverables: (1) read-only audit plus backup/restore rehearsal, (2) additive schema and idempotent backfill with flags off, and (3) one exact, atomic terminal command core used by all existing direct-deal and moderation/dispute entry paths. [VERIFIED: codebase and official Prisma/SQLite sources listed below]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Escrow reconciliation and migration | Database / Storage | API / Backend | SQLite rows and constraints are authoritative; scripts classify and mutate only through reviewed operator commands. [VERIFIED: `prisma/schema.prisma`; `scripts/backup-snapshot.mjs`] |
| Deal creation and terminal commands | API / Backend | Database / Storage | Auth, participant/admin authorization, guards, and command semantics belong server-side; the database transaction enforces coupled writes. [VERIFIED: `src/server/actions.js`] |
| Idempotency and exact linkage | Database / Storage | API / Backend | Unique keys, FK/unique constraints, and conditional updates are the final duplicate/race barrier. [CITED: https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions] |
| Rollout/rollback switches | API / Backend | Frontend client | Server flags select compatible behavior; clients must not decide which ledger path is authoritative. [VERIFIED: SAFE-03 in `.planning/REQUIREMENTS.md`] |
| Backup, restore, and release evidence | Database / Storage | Operations | A consistent database snapshot, restored copy, and evidence manifest are operational artifacts, not UI state. [CITED: https://www.sqlite.org/backup.html] |

## Project Constraints

- No `AGENTS.md` exists at the repository root, and neither `.codex/skills/` nor `.agents/skills/` exists. [VERIFIED: filesystem inspection on 2026-08-14]
- The project is a Next.js monolith whose browser mutation boundary is `src/server/actions.js`; reusable server domain logic belongs under `lib/`. [VERIFIED: `.planning/codebase/ARCHITECTURE.md`; source inspection]
- Production startup currently runs `prisma db push`, then photo/chat backfills, then Next.js; there is no committed `prisma/migrations/` directory. [VERIFIED: `Dockerfile`; filesystem inspection]
- SQLite is configured to WAL, `busy_timeout=5000`, and `synchronous=NORMAL` by `lib/prisma.js`. [VERIFIED: `lib/prisma.js`]
- Preserve unrelated user changes: `BACKLOG.md` is modified and `DESIGN-dayberry.md` is untracked; neither belongs to this phase research. [VERIFIED: `git status -sb` on 2026-08-14]

## Current Lifecycle and Invariants

### Current Schema Facts

- `Deal` stores `credits`, string `stage/status`, two confirmation booleans, and dispute fields, but has no relation to `Transaction`. [VERIFIED: `prisma/schema.prisma:148-174`]
- `Transaction` stores mutable `status`, amount, `refType`, and `refId`; both reference fields default to empty strings and are only indexed, not unique or foreign-key constrained. [VERIFIED: `prisma/schema.prisma:176-197`]
- `User.balance` is a mutable aggregate. Wallet escrow is calculated as the sum of every held transaction for the user, regardless of kind/reference. [VERIFIED: `prisma/schema.prisma:10-46`; `src/server/actions.js:944-966`]
- Deleting a `Lot` cascades its `Deal` rows, while `Chat.dealId` and `Review.dealId` become null; this can erase settlement history after a lot is deleted. [VERIFIED: `prisma/schema.prisma:69-101,148-174,199-221`; `.planning/codebase/CONCERNS.md`]

### Exact Mutation Map

| Path | File / function | Current writes and transaction boundary | Current invariant/risk |
|------|-----------------|-----------------------------------------|------------------------|
| Create direct deal + hold | `src/server/actions.js` — `createDealAction` | Inside one interactive transaction: conditional balance decrement, unreferenced held transaction, deal, chat, members, system message. The hold is created before the deal ID exists. [VERIFIED: lines 674-748] | Balance cannot go negative under two concurrent debits, but retries can create multiple deals/holds and the hold has no exact deal identity. [VERIFIED: same code] |
| First receipt confirmation | `confirmSide` via `confirmReceiptAction` / `confirmPartnerAction` | Conditional `Deal.updateMany`; if other party had not confirmed, only confirmation/stage changes. [VERIFIED: lines 785-838] | Repeat confirmation is rejected and concurrent same-side claim has one winner. [VERIFIED: same code] |
| Final receipt / completion | `confirmSide` then `completeDeal` | First transaction/autocommit marks deal `done`; afterward `completeDeal` finds newest held user escrow and runs a second transaction for escrow status, receiver earning/balance, and both counters. [VERIFIED: lines 647-671,785-818] | Crash can leave `Deal=done` with held escrow; wrong hold can be marked done; the deal claim prevents ordinary double-final-confirm settlement but does not make state+money atomic. [VERIFIED: same code] |
| Cancel | `cancelDealAction` | One interactive transaction conditionally closes deal, increments initiator balance, then finds newest held user escrow and marks it refunded. [VERIFIED: lines 844-907] | Deal/refund are atomic, but a missing/wrong held row still increments balance; the selected row may belong to another deal or chain. [VERIFIED: same code] |
| Open dispute | `openDisputeAction` | Conditional deal-only update sets dispute fields; held credits remain unchanged. [VERIFIED: lines 2138-2194] | Concurrent duplicate opens have one winner, but there is no exact-hold validation in the same transaction. [VERIFIED: same code] |
| Moderation opens disputes | `blockUserAction` | User and lots are updated, then matching deals are looped and changed to disputed outside one encompassing transaction and without using `openDisputeAction`. [VERIFIED: `src/server/actions.js` moderation section] | Can partially freeze the account/deals and bypass exact-hold validation. [VERIFIED: same code] |
| Admin dispute refund | `resolveDisputeAction(...,'refund')` | Mirrors cancellation in one transaction: conditional close, balance increment, newest-held lookup, status refund. [VERIFIED: lines 2218-2251] | Wrong/missing hold can create balance; exact-row risk remains. [VERIFIED: same code] |
| Admin dispute release | `resolveDisputeAction(...,'release')` | Conditional deal update is outside settlement; its count is ignored; `completeDeal` is always called. [VERIFIED: lines 2253-2260] | Two admin requests can both settle/credit/count the same deal. [VERIFIED: `.planning/codebase/CONCERNS.md`; source] |
| Chain hold | `activateChain` | Each payer is conditionally debited and gets a held row with `refType='chain'`, `refId=chain.id`, inside chain activation transaction. [VERIFIED: lines 1588-1621] | Direct-deal latest-held lookups do not filter empty/deal refs, so a chain row is a candidate for the wrong direct settlement. [VERIFIED: direct and chain code] |
| Chain completion | `markTransfer` / `completeChain` | Final step update is conditional, then reread and separate completion transaction updates all chain refs and credits receivers. [VERIFIED: lines 1664-1750] | Concurrent final transfers can both call an unguarded completion; chain exact-once is a known adjacent risk, but chain redesign is out of Phase 1 unless shared ledger changes touch it. [VERIFIED: `.planning/codebase/CONCERNS.md`] |
| Wallet read | `walletOf` | Escrow is `SUM(amt) WHERE userId=? AND status='held'`. [VERIFIED: lines 944-966] | A new dispute-only status would disappear from escrow; therefore keep disputed credits `held` in this phase. [VERIFIED: same code] |

### Required Post-Phase Invariants

For every direct `Deal`:

1. `credits = 0` implies no escrow transaction link and no `deal:*:hold` row. [VERIFIED: current creation semantics; SAFE-01]
2. `credits > 0` implies exactly one linked transaction with the same initiator, `kind='escrow-in'`, `amt=credits`, `refType='deal'`, and `refId=Deal.id`. [VERIFIED: SAFE-01; existing chain reference convention]
3. Active or disputed deal implies linked escrow `status='held'`; completed deal implies `done`; cancelled deal implies `refunded`. [VERIFIED: current intended status semantics in `src/server/actions.js`]
4. Exactly one terminal outcome wins. Completion/release changes the exact hold, receiver balance, earning row, both deal counters, and deal state in one transaction; cancellation/refund changes the exact hold, initiator balance, and deal state in one transaction. [CITED: https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions]
5. If any exact-link or amount/status invariant is missing, the command fails closed and rolls back; it never credits a balance “because `Deal.credits` said so.” [VERIFIED: failure mode in current cancel/refund code; SAFE-01]
6. Opening a dispute performs a conditional deal claim while validating the exact linked escrow remains held in the same short transaction; the escrow status intentionally stays `held` so wallet semantics remain compatible. [VERIFIED: current wallet aggregation and dispute semantics]
7. Notifications occur only after the authoritative transaction commits and only for the request that won the claim. [VERIFIED: current notification pattern; recommendation grounded in atomic command design]

## Standard Stack

### Core

| Tool | Verified version | Purpose | Prescription |
|------|------------------|---------|--------------|
| Node.js | 22.14.0 available | Built-in test runner, scripts, runtime | Use `node:test` and process-spawned SQLite integration tests; add no test framework for Phase 1. [VERIFIED: `node --version`; Node 22 already required by Dockerfile] |
| Prisma ORM / Client | 6.19.3 in lockfile | Schema, generated client, short transactions, migrations | Stay on the locked 6.19 line for this phase; do not combine financial migration with Prisma 7 upgrade. [VERIFIED: `package-lock.json`; package source is npm registry] |
| SQLite | Production engine version unknown; local CLI 3.52.0 | Production system of record and rehearsal database | Query `select sqlite_version()` through the deployed Prisma runtime, not the operator CLI, and block rollout unless version is 3.51.3+ or patched 3.50.7/3.44.6. [CITED: https://www.sqlite.org/wal.html] |
| Prisma Migrate | Prisma 6.19.3 CLI when dependencies are installed | Reviewed forward schema history and production deploy | Baseline the existing schema, commit SQL migrations, use `migrate deploy`; remove `db push` from production startup after cutover. [CITED: https://www.prisma.io/docs/orm/prisma-migrate/getting-started; https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production] |

### Supporting

| Tool | Version | Purpose | When to Use |
|------|---------|---------|-------------|
| SQLite CLI | 3.52.0 available locally | Independent inspection, PRAGMA checks, restored-copy assertions | Operator/rehearsal evidence only; production runtime version must be queried separately. [VERIFIED: `sqlite3` probes] |
| Existing backup script | repository version | `VACUUM INTO` consistent snapshot | Use as the snapshot primitive, but add unique target, checksum, manifest, post-backup integrity checks, off-host retention, and restore proof. [VERIFIED: `scripts/backup-snapshot.mjs`; CITED: https://www.sqlite.org/lang_vacuum.html] |

**No new runtime dependency is required.** [VERIFIED: Node, Prisma, and SQLite already provide the required primitives]

## Recommended Additive Schema

Use an expand-only first migration. Keep every new field nullable until the audit/backfill and compatibility gate are complete. [CITED: https://www.prisma.io/docs/orm/prisma-migrate]

```prisma
model Deal {
  // existing fields remain
  createCommandKey    String?      @unique
  escrowTransactionId String?      @unique
  escrowTransaction   Transaction? @relation("DealEscrow", fields: [escrowTransactionId], references: [id], onDelete: Restrict)
}

model Transaction {
  // existing fields remain
  businessKey String? @unique
  escrowFor   Deal?   @relation("DealEscrow")
}
```

This one-to-one relation gives the exact hold a real SQLite FK/unique constraint, while `refType/refId` remain populated for generic operational queries and compatibility with chain conventions. `businessKey` is nullable so all legacy rows survive expansion; uniqueness is enforced for every new key. [VERIFIED: current generic reference design; CITED: https://www.prisma.io/docs/orm/reference/prisma-schema-reference]

Recommended keys:

| Row / command | Stable key |
|---------------|------------|
| Initial deal create retry | `createCommandKey = deal:create:<actorId>:<clientCommandId>` |
| Escrow hold row | `businessKey = deal:<dealId>:hold` |
| Receiver earning row | `businessKey = deal:<dealId>:release` |

Do not add a generic unique constraint on `(refType, refId)`: one chain legitimately owns several payer holds and receiver earnings. [VERIFIED: `activateChain` and `completeChain`]

## Architecture Patterns

### System Architecture Diagram

```text
restored production snapshot (read-only)
        |
        v
reconciliation audit ---- ambiguous/broken ----> operator CSV/JSON + manual decision
        | unique and invariant-consistent
        v
reviewed additive migration -> nullable FK/business keys -> idempotent backfill
        |                                      |
        | flags off                            v
        +------------------------------> post-migration invariant audit
                                               |
browser command -> server action -> exact escrow command transaction
                                      | CAS deal state
                                      | validate/update exact hold
                                      | update balance/counters + unique earning
                                      v
                                   COMMIT -> notification/push best effort
```

### Recommended Project Structure

```text
lib/
└── deals/
    ├── escrow.js              # exact create/complete/cancel/dispute commands
    └── escrow-invariants.js   # pure classification and invariant helpers
scripts/
├── audit-deal-escrow.mjs      # strictly read-only; JSON + human summary
├── backfill-deal-escrow.mjs   # dry-run default; --apply requires audited manifest
├── backup-snapshot.mjs        # existing primitive, extended evidence
└── verify-restored-copy.mjs   # integrity, schema, counts, and domain invariants
test/
├── fixtures/escrow-db.mjs
├── escrow.integration.test.mjs
├── escrow.concurrent.test.mjs
└── migration.integration.test.mjs
prisma/
├── schema.prisma
└── migrations/               # baseline + forward migrations
```

### Pattern 1: One Conditional Claim and One Financial Transaction

```javascript
// Pattern derived from Prisma interactive transactions and current Dayberry fields.
await prisma.$transaction(async (tx) => {
  const claimed = await tx.deal.updateMany({
    where: expectedDealPredicate,
    data: terminalDealState,
  });
  if (claimed.count !== 1) throw new DealConflict();

  const escrow = await tx.transaction.updateMany({
    where: {
      id: deal.escrowTransactionId,
      userId: deal.userId,
      kind: 'escrow-in',
      amt: deal.credits,
      status: 'held',
      refType: 'deal',
      refId: deal.id,
    },
    data: { status: outcome === 'release' ? 'done' : 'refunded' },
  });
  if (deal.credits > 0 && escrow.count !== 1) throw new EscrowInvariantError();

  // Balance, counters, and unique release row execute here before commit.
});
```

[CITED: https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions]

### Pattern 2: Audit Before Mutation

The audit must open a restored copy read-only and never import `lib/prisma.js`, because that singleton issues write-affecting WAL/synchronous PRAGMAs on creation. A SQLite URI with `mode=ro` is the database-level mechanism; the script must fail if the target resolves to the live production path. [VERIFIED: `lib/prisma.js`; CITED: https://www.sqlite.org/uri.html]

Audit output must include counts and row IDs for:

- positive-credit deal with zero/multiple exact links;
- exact link with wrong user, amount, kind, reference, or status;
- active/disputed deal without one held row;
- completed deal without one done row;
- cancelled deal without one refunded row;
- zero-credit deal with an escrow link;
- orphan `escrow-in` row, dangling `refType='deal'`, duplicate business key candidate;
- chain-referenced hold separated from direct-deal candidates;
- per-user balance, held sum, and terminal payout/counter anomalies before and after migration. [VERIFIED: current schema and paths]

### Pattern 3: Globally Unique Matching Only

Automatic backfill may use an escrow row only when there is one globally unique one-to-one candidate satisfying user, amount, expected status, empty/deal reference, and no competing deal/row in the same candidate graph. `createdAt` and title text are report evidence only, never sufficient proof. Multiple same-user/same-amount deals, crossed statuses caused by the current bug, missing holds, extra holds, or chain collisions are manual. [VERIFIED: current creation/settlement behavior; SAFE-02]

### Anti-Patterns to Avoid

- **Latest-held lookup:** never search by user and time; dereference `Deal.escrowTransactionId`. [VERIFIED: current defect]
- **Balance change without exact hold claim:** if the exact `updateMany` count is not one, roll back everything. [VERIFIED: current cancel/refund defect]
- **Deal terminal update followed by settlement:** there must be no crash boundary between them. [VERIFIED: current completion defect]
- **`db push` at application startup:** production migration needs reviewed history and a separate release gate. [CITED: https://www.prisma.io/docs/cli/db/push; https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production]
- **Schema down-migration as rollback:** retain additive schema and roll back code/flags only. [VERIFIED: SAFE-03 and live-data constraint]
- **Auto-fixing ambiguous rows:** quarantine for operator decision; never infer by recency or chat text. [VERIFIED: SAFE-02]
- **Flagging the financial fix off:** only new model/UI behavior is optional; the exact escrow core is the permanent compatibility foundation. [VERIFIED: SAFE-01 and SAFE-03]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Atomicity | Cross-call compensation logic | Prisma interactive transaction | All invariant writes succeed or fail together. [CITED: https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions] |
| Retry safety | In-memory “already processed” set | Unique SQLite/Prisma business keys plus conditional state claim | Process memory does not survive restart and cannot arbitrate separate requests. [CITED: same Prisma source] |
| Live SQLite copy | OS copy of only `.db` while WAL is active | Existing `VACUUM INTO` or SQLite Backup API | The WAL is persistent database state; SQLite documents consistent snapshot mechanisms. [CITED: https://www.sqlite.org/wal.html; https://www.sqlite.org/backup.html] |
| Migration history | Ad-hoc SQL run from startup | Prisma Migrate baseline + committed forward SQL + `migrate deploy` | Gives reviewable history and production application semantics. [CITED: https://www.prisma.io/docs/orm/prisma-migrate/getting-started] |
| Database health | One generic smoke query | `integrity_check` and `foreign_key_check` plus domain audit | `integrity_check` explicitly does not find FK errors. [CITED: https://www.sqlite.org/pragma.html] |

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Workspace `prisma/dev.db` contains schema but 0 users/deals/transactions; production rows are unavailable. Production SQLite may contain unreferenced direct holds and referenced chain holds. [VERIFIED: local read-only queries; source paths] | Obtain a consistent production snapshot; run read-only audit; classify every row; backfill only audited unique pairs; manual disposition for all others. |
| Live service config | Container startup mutates schema/data using `db push`, photo migration, and chain migration. Actual deployment scheduler/replica count and mounted production DB path are not in the repo. [VERIFIED: `Dockerfile`; ASSUMED for external deployment state] | Move schema migration to release step; record actual DB/upload paths, replica count, artifact digest, and flags in runbook. |
| OS-registered state | No task scheduler/systemd/PM2 definitions are present in the repository. [VERIFIED: repository inspection] | Operator must inventory the real host before rollout and document who invokes backup/migrate/restore; no automatic code edit can be planned from this repo. |
| Secrets/env vars | `DATABASE_URL` selects SQLite; no escrow/model feature flags currently exist in inspected code. [VERIFIED: `.env` key name and source inspection] | Add documented server-only flags; record names, defaults, and rollback values without copying secret contents into evidence. |
| Build artifacts / installed packages | Lockfile pins Prisma 6.19.3, but this workspace’s `node_modules` lacks installed Prisma packages; Docker installs with `npm ci`. Local CLI SQLite is 3.52.0 and is not evidence of Prisma’s deployed engine. [VERIFIED: package lock, `npm list`, Dockerfile, probes] | Reinstall from lockfile in disposable test environment; record Prisma engine `select sqlite_version()` from the built image and regenerate client before tests/deploy. |

## Migration and Rollout Runbook Facts

### Required Sequence

1. Freeze schema changes for the rehearsal window; identify live DB path, upload volume, current artifact digest, one/multiple process topology, disk free, and maintenance contact. [ASSUMED: deployment details require operator confirmation]
2. Create a uniquely named `VACUUM INTO` snapshot, copy upload assets consistently if restore scope includes them, calculate checksums, and copy evidence off-host. Verify snapshot with `integrity_check`, `foreign_key_check`, table counts, and escrow audit. [CITED: https://www.sqlite.org/lang_vacuum.html; https://www.sqlite.org/pragma.html]
3. Restore that snapshot into an isolated path/container; prove the restored application can read chats/deals/wallet and execute synthetic operations without touching live services. [VERIFIED: ROADMAP success criterion]
4. Baseline the existing Prisma schema, review generated SQL against the restored schema, and mark the baseline applied only after schema equivalence is proven. [CITED: https://www.prisma.io/docs/orm/prisma-migrate/getting-started]
5. Apply additive migration on restored copy with flags off; run audit before/after and record schema, counts, checksums, durations, errors, SQLite runtime, WAL mode, and migration table. [CITED: https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production]
6. Run backfill dry-run; compare its manifest to audit; require operator approval for unique rows; apply using the manifest/hash; rerun must be a no-op. Ambiguous rows remain untouched and block their own automatic terminal operations. [VERIFIED: SAFE-02]
7. Run existing-code compatibility test against expanded schema, then new-code tests with new-model flags off. Corrected exact escrow commands stay active in both modes. [VERIFIED: SAFE-03]
8. Repeat snapshot and release sequence in production. Enable new writes first; verify every newly created positive-credit deal has link/ref/business key. Enable broader model separately only after a zero-new-mismatch observation window. [VERIFIED: SAFE-03]

### Rollback

- Runtime rollback is a server flag or a known-compatible application artifact that still contains the corrected escrow core; it does not remove columns/tables or erase links. [VERIFIED: SAFE-03]
- Stop rollout immediately on migration error, integrity/FK error, any unexplained count/balance delta, new ambiguous row, duplicate business key, settlement mismatch, or repeated terminal side effect. [VERIFIED: SAFE-01/02]
- Restore the pre-migration snapshot only if post-migration production writes have been stopped and explicitly reconciled; otherwise restoring would discard valid newer chats/deals. [VERIFIED: live-data safety requirement; CITED: SQLite backup semantics]

## Common Pitfalls

### Pitfall 1: A Unique Candidate Is Not Necessarily the Historical Truth

The current wrong-row bug can cross transaction statuses, so a simplistic “one row with same amount” matcher may attach the remaining row after another deal already consumed its hold. Use global invariant matching and report contradictions; never use chronological proximity alone. [VERIFIED: current complete/cancel/refund algorithms]

### Pitfall 2: Exact Reference Without a Real FK

Populating only `refType/refId` improves lookup but still allows dangling IDs and duplicate direct holds. Use the one-to-one `Deal.escrowTransactionId` relation as authority and keep generic refs as denormalized compatibility metadata. [VERIFIED: current schema permits arbitrary refs]

### Pitfall 3: Treating SQLite WAL as Multi-Writer

WAL allows readers with a writer but only one writer at a time, and `SQLITE_BUSY` remains possible. Keep transactions short; do not notify or perform external I/O inside them; retry only commands proven idempotent. [CITED: https://www.sqlite.org/wal.html; https://www.sqlite.org/lang_transaction.html]

### Pitfall 4: Testing Only Sequential Repeats

The known dispute-release defect requires two callers that both read active/disputed before either settles. Tests must use separate Prisma clients/processes against one temporary SQLite file and synchronize at a barrier, then assert one terminal effect. [VERIFIED: current source race]

### Pitfall 5: Confusing Backup Creation with Restore Proof

`VACUUM INTO` creates a consistent snapshot after successful completion, but a release gate also needs checksum, independent open, integrity/FK/domain checks, application boot, and a documented replacement procedure. [CITED: https://www.sqlite.org/lang_vacuum.html; https://www.sqlite.org/backup.html]

### Pitfall 6: Using the Local SQLite CLI Version as Production Evidence

Prisma carries its own query engine/runtime path. Record `select sqlite_version()` through the deployed application image and verify the WAL-reset patch level there. [VERIFIED: separate local CLI and Prisma dependency; CITED: https://www.sqlite.org/wal.html]

## Validation Architecture

No test framework, test script, test files, or CI workflow currently exists in the root project. `npm run lint` points to `next lint` and is not a database test; `npm run build` is only a compilation gate. [VERIFIED: `package.json`; `.planning/codebase/TESTING.md`]

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js 22 built-in `node:test` [VERIFIED: runtime; official Node API referenced in project research] |
| Config file | none required; add serialized DB integration helpers in Wave 0 |
| Quick run command | `node --test test/escrow.integration.test.mjs` |
| Full suite command | `node --test --test-concurrency=1 test/*.test.mjs` |
| Build gate | `npm run build` after Prisma generation |

Use a unique temporary directory and SQLite file per test file; generate/apply schema/migrations to it; never point tests at `prisma/dev.db`. Use at least two independent Prisma clients or child processes for race tests and disconnect both in teardown. [VERIFIED: current singleton would defeat isolation; SQLite cross-connection behavior in official docs]

### Test Layers

| Layer | Required coverage | Evidence |
|-------|-------------------|----------|
| Pure invariant unit | Candidate graph classification; state-to-escrow status; stable key generation; zero-credit rules | TAP output + deterministic fixtures |
| Prisma integration | Create hold/link/ref/key; insufficient funds rollback; cancel/refund; two confirmations/settlement; dispute open/refund/release; zero-credit deal | TAP output + post-test invariant query |
| Concurrency integration | duplicate create command; same-side confirmation; both final confirmations; cancel vs complete; dispute vs cancel/complete; two admin release/refund commands; repeated after restart | TAP output, final row/balance/counter snapshots |
| Migration integration | Baseline empty/current schema; apply forward migration to pre-change fixture; backfill twice; old-compatible read; migrate a malformed/ambiguous fixture without mutation | migration logs + before/after manifests |
| Backup/restore rehearsal | Snapshot live-like WAL DB, restore isolated copy, run integrity/FK/audit, boot old-compatible and new artifacts, perform synthetic terminal operations | checksums, PRAGMA output, audit JSON, boot/smoke log |
| Manual operational | Feature flags off/on, ambiguous-deal fail-closed/operator flow, chat remains usable, rollback artifact reads expanded schema | signed checklist and timestamps |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| SAFE-01 | Exact link and atomic at-most-once create/complete/cancel/dispute settlement under repeats/races | integration + concurrency | `node --test --test-concurrency=1 test/escrow*.test.mjs` | No — Wave 0 |
| SAFE-02 | Unique rows backfill; ambiguous/broken rows reported and unchanged; rerun no-op; no data/count loss | migration + restored-copy | `node --test test/migration.integration.test.mjs` | No — Wave 0 |
| SAFE-03 | Flags disable new model while corrected chat/escrow/complete/dispute paths work; old-compatible artifact reads expanded schema | integration + smoke/manual | `node --test test/compatibility.integration.test.mjs` | No — Wave 0 |

### Required Fixtures

- Happy-path: zero-credit, active held, disputed held, completed/done, cancelled/refunded. [VERIFIED: current state semantics]
- Ambiguity: same user/same amount/two deals/two holds; one deal/two holds; two deals/one hold; crossed statuses; missing hold; orphan hold; dangling direct ref; chain hold newer than direct hold. [VERIFIED: current defect space]
- Corruption-safe failure: wrong amount/user/kind/status/ref and duplicate release-key attempt. [VERIFIED: target invariants]
- Race barrier: two authenticated actors/admins with independent connections reaching their claim together. [CITED: SQLite transaction concurrency docs]
- Production-like copy: preserved IDs/timestamps/status combinations with content anonymized; never commit production PII. [VERIFIED: SAFE-02 and privacy constraint]

### Evidence Artifacts

Each rehearsal/production run must retain: input snapshot checksum and size; application/lockfile/migration commit; migration SQL checksum; deployed SQLite runtime and compile options; WAL/journal/synchronous settings; `integrity_check`; `foreign_key_check`; table row counts; audit summary and full ambiguous IDs; backfill manifest/hash; second-run no-op result; balance/held/payout/counter deltas; test TAP; start/smoke log; flags; operator/timestamp; restore duration and result. [CITED: SQLite PRAGMA/backup docs; VERIFIED: SAFE-01/02/03]

### Sampling Rate

- **Per task commit:** targeted Node test file plus `npm run build` when schema/client-facing code changes.
- **Per wave merge:** full serial Node suite against fresh temporary databases.
- **Migration candidate:** full suite plus restored-copy rehearsal.
- **Phase gate:** all automated tests green, production-copy audit reviewed, ambiguous rows dispositioned or quarantined, restore drill passed, and rollback flags/artifact rehearsed.

### Wave 0 Gaps

- [ ] Add `test/fixtures/escrow-db.mjs` for isolated database creation and teardown.
- [ ] Add the four test files listed above and a `test` package script.
- [ ] Ensure Prisma 6.19.3 is installed from lockfile and client generation works in the disposable environment.
- [ ] Extract pure invariant functions and transaction core so server actions can be tested without browser cookies.
- [ ] Build read-only audit/backfill/verify scripts with machine-readable output and dry-run default.

### Phase Exit Gates

1. No positive-credit new deal can commit without exact FK, `refType/refId`, and unique hold key. [VERIFIED: SAFE-01]
2. For every automatically migrated deal, the invariant audit is clean; every non-clean row is unchanged and present in the operator report. [VERIFIED: SAFE-02]
3. At least 20 repeated invocations and a concurrent pair for each terminal outcome produce one balance/counter/earning effect and one terminal state; exact count is a recommended test budget, not a production performance target. [ASSUMED]
4. Forced exception after each internal write point rolls back the whole authoritative transaction. [CITED: Prisma transaction semantics]
5. Restored-copy migration/backfill rerun is a no-op and old-compatible/new artifacts both read expanded schema. [VERIFIED: SAFE-03]
6. Backup restore, integrity, FK, and domain audit pass before production mutation. [VERIFIED: ROADMAP success criterion]
7. Any HIGH blocking threat below is closed or explicitly accepted by the accountable operator before execution. [VERIFIED: requested validation requirement]

## Security Domain and Threat Model

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | yes | Existing authenticated server actions; tests must exercise participant vs admin authority. [VERIFIED: `src/server/actions.js`] |
| V3 Session Management | indirectly | Do not widen session behavior in this phase; use current authenticated actor, never client-supplied user ID. [VERIFIED: current action boundary] |
| V4 Access Control | yes | Participant checks for deal commands and `isAdmin` for dispute resolution; migration scripts are operator-only. [VERIFIED: source] |
| V5 Input Validation | yes | Validate command IDs, deal IDs, expected state, amount invariants, flags, and file paths server-side. [VERIFIED: target design] |
| V6 Cryptography | yes for backup integrity/secrets | Use platform cryptographic checksums and existing secret management; do not invent encryption. Backup encryption/retention policy needs operator confirmation. [ASSUMED] |
| V10 Malicious Code / integrity | yes | Lockfile install, migration SQL review/checksum, artifact digest, no production PII in fixtures. [VERIFIED: migration risk] |
| V11 Business Logic | critical | Exact linkage, CAS, unique business keys, atomic balance/state transitions, fail-closed mismatch. [VERIFIED: SAFE-01/02] |

### Assets

- User balances, held credits, earning/refund history, deal/counter state, and exact deal-to-escrow provenance. [VERIFIED: schema]
- Live chats/deals and their availability during rollback. [VERIFIED: SAFE-03]
- Production SQLite file, WAL state, backup copies, upload volume, migration/audit manifests, and admin authority. [VERIFIED: codebase and runbook scope]

### Trust Boundaries

1. Browser/client command to authenticated Next.js server action. [VERIFIED: architecture]
2. Server action/domain command to Prisma/SQLite transaction. [VERIFIED: architecture]
3. Application container to persistent DB/upload volume. [VERIFIED: Docker/storage design]
4. Operator/CI migration process to restored or live database. [VERIFIED: migration design]
5. Authoritative commit to best-effort notification/push. [VERIFIED: current notification architecture]

### Threat Register

| Threat | STRIDE | Severity | Mitigation | Residual Risk / Gate |
|--------|--------|----------|------------|----------------------|
| User settles/refunds another deal’s or chain’s hold | Tampering / elevation | HIGH | Exact FK, invariant predicate, participant/admin auth, no latest-held query | Any unresolved automatic path using user/time lookup blocks execution. |
| Duplicate/replayed/concurrent terminal command credits twice | Tampering / repudiation | HIGH | CAS deal claim, unique business keys, one transaction, race tests | Any duplicate financial/counter delta blocks execution. |
| Crash commits deal state without money or vice versa | Tampering / availability | HIGH | One short transaction and failpoint rollback tests | Any split authoritative write blocks execution. |
| Migration guesses ambiguous provenance | Tampering / repudiation | HIGH | Read-only global matching, unchanged ambiguity report, manual sign-off | Production snapshot/audit absence blocks mutation. |
| Malicious/accidental script points at live DB during rehearsal | Tampering / denial | HIGH | Read-only URI, resolved-path denylist, explicit `--apply`, snapshot/manifest hash, environment banner | Unverified target path or missing backup blocks execution. |
| Backup is missing, corrupt, or exfiltrated | Availability / information disclosure | HIGH | Consistent snapshot, checksum, integrity/FK check, least access, retention/encryption policy, restore drill | Encryption/retention/off-host owner remains operator decision; no restore proof blocks execution. |
| Feature rollback reactivates unsafe old settlement | Tampering | HIGH | Corrected escrow core is never flag-disabled; keep tested fallback artifact containing the fix | Rollback to pre-integrity artifact blocks rollout. |
| `SQLITE_BUSY` causes uncertain retry | Denial / tampering | MEDIUM | Short transaction, bounded retry only with idempotency, observable conflict result | Monitor busy count/latency; repeated unexplained busy failures stop rollout. |
| Admin resolves wrong dispute/outcome | Elevation / repudiation | MEDIUM | Admin authorization, exact immutable target, outcome preview, stable key/audit evidence | Existing email allowlist is retained; stronger admin audit may be later scope. |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | scripts/tests/app | yes | 22.14.0 | Docker Node 22 image [VERIFIED: probe; Dockerfile] |
| npm | install/scripts | yes | 11.9.0 | Docker `npm ci` [VERIFIED: probe; Dockerfile] |
| SQLite CLI | independent audit/rehearsal | yes | 3.52.0 | Node/Prisma queries, but production engine still must be probed [VERIFIED: probe] |
| Prisma packages | migration/client | lockfile yes, workspace install missing | 6.19.3 | `npm ci` in disposable/Docker environment [VERIFIED: lockfile and `npm list`] |
| Production SQLite snapshot | SAFE-02 audit | no | — | No safe fallback; obtain consistent snapshot before mutation [VERIFIED: workspace inspection] |
| Existing automated tests | validation | no | — | Wave 0 `node:test` harness [VERIFIED: testing audit] |
| Migration history | production migration | no | — | Baseline current schema, then forward migrations [VERIFIED: filesystem; CITED: Prisma docs] |

**Missing dependency with no fallback:** a consistent production snapshot containing the actual deals/transactions is required to enumerate ambiguous rows and approve backfill. [VERIFIED: local DB is empty; SAFE-02]

## State of the Art

| Old/current approach | Required Phase 1 approach | Impact |
|----------------------|---------------------------|--------|
| `db push` without history at startup | Baselined, reviewed forward migrations and separate `migrate deploy` release step | Reviewable and rehearsable schema change. [CITED: Prisma Migrate docs] |
| Infer latest held row | Exact one-to-one FK plus compatibility refs | Removes cross-deal/chain selection. [VERIFIED: current defect] |
| State claim then separate settlement | One conditional claim and all financial writes in one transaction | Removes crash gap and double release. [CITED: Prisma transactions] |
| Sequential/manual confidence | Temporary SQLite, independent connections, barriered race tests, restored-copy rehearsal | Produces evidence for actual failure modes. [VERIFIED: current gaps] |
| Copy `.db` around WAL | `VACUUM INTO`/Backup API plus restore checks | Produces a consistent snapshot and verifiable recovery. [CITED: SQLite WAL/backup docs] |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Production host topology, DB path, backup retention/encryption, off-host storage, and operator ownership are not represented in this repository. | Runtime State / Runbook / Threat Model | Rollout procedure may target the wrong environment or provide insufficient recovery/security. |
| A2 | Twenty repeated invocations per terminal test is an adequate minimum stress sample for the phase gate. | Validation Architecture | A rarer race may escape; concurrency correctness must still come from constraints/transactions, not the sample count. |

## Open Questions (RESOLVED)

The repository cannot supply production-only values, so every such value is resolved as a named, owned, non-autonomous preflight prerequisite. “Unknown” is a stop result, never permission to infer a value.

| ID | Resolution | Owner | Evidence | Stop behavior |
|----|------------|-------|----------|---------------|
| PF-01 | The release operator identifies the resolved absolute live SQLite path and creates a unique consistent immutable pre-apply snapshot. Audit scripts reject the resolved live path; all pre-apply domain audits target the snapshot only. | Release operator | `preflight-inventory.json`, `pre-apply-snapshot.json`, snapshot SHA-256 | Missing path/snapshot/checksum or any path equality stops rehearsal and production mutation. |
| PF-02 | The audit produces actual ambiguous/broken row IDs. A named financial-data reviewer records one disposition for every ID; no timestamp or chat-text inference is allowed. | Financial-data reviewer | `pre-audit.json`, `ambiguity-dispositions.json` | Any unreviewed ID, changed audit hash, or ambiguous ID in the apply manifest stops backfill. |
| PF-03 | The deployed artifact queries `select sqlite_version()`, compile options and PRAGMAs through its own Prisma runtime. | Runtime owner | `runtime.json` tied to artifact digest | Runtime below 3.51.3 unless patched 3.50.7/3.44.6, or unknown runtime, stops rollout. |
| PF-04 | The release controller records replica/process count, scheduler, mounted DB/upload paths, current writer, maintenance owner and a single-writer stop-writes window. | Infrastructure owner | `topology.json` | Unknown topology, more than one active writer, or inability to stop writes stops schema/backfill apply. |
| PF-05 | Retention, encryption, access, off-host copy and deletion date are approved before snapshot creation. | Backup owner | `backup-policy.json` | Missing owner/policy/off-host destination stops copying live data and all later gates. |
| PF-06 | Final approval occurs only in non-autonomous plan 01-06 after the actual candidate and a separate actual rollback artifact have both passed restored-copy smoke. Capture current/candidate/corrected-rollback/lockfile/both migration SQL digests; rollback must contain the exact corrected escrow core and read the expanded nullable schema, and rollback to any pre-integrity artifact is forbidden. | Release operator | `artifact-digests.json`, candidate smoke log, corrected-rollback smoke log | Missing/mismatched digest, failed artifact smoke, or any pre-integrity rollback artifact stops deployment before live mutation. |
| PF-07 | A separately created immutable post-apply snapshot is audited after production writes. Neither pre- nor post-audit is permitted to open the resolved live path. | Release operator | `post-apply-snapshot.json`, `post-audit.json` | Snapshot creation failure, HIGH finding, unexplained count/balance delta, or live-path audit attempt stops rollout and keeps reads flag off. |

**Chain scope decision:** chain exact-once completion is explicitly excluded from Phase 1. Shared schema additions remain nullable and compatible with chain rows. Direct-deal classification and every direct terminal command must separate `refType='chain'` rows and must never consume, relabel, or settle a chain hold. Chain lifecycle hardening requires a separate phase before chain expansion.

## Sources

### Primary Project Evidence (HIGH confidence)

- `src/server/actions.js` — every direct deal create/confirm/cancel/dispute path, moderation dispute path, wallet aggregation, chain hold/completion.
- `prisma/schema.prisma` — Deal, Transaction, User, Lot, Chat, Review relations and constraints.
- `Dockerfile`, `lib/prisma.js`, `scripts/backup-snapshot.mjs`, `package.json`, `package-lock.json` — startup mutation, WAL settings, backup primitive, versions, and missing test command.
- `.planning/STATE.md`, `.planning/ROADMAP.md`, `.planning/REQUIREMENTS.md` — phase goal, SAFE requirements, success criteria, blockers.
- `.planning/research/{SUMMARY,ARCHITECTURE,PITFALLS}.md` and `.planning/codebase/{ARCHITECTURE,CONCERNS,TESTING}.md` — prior architecture/risk findings cross-checked against source.
- Read-only SQLite probes against `prisma/dev.db` on 2026-08-14 — SQLite CLI 3.52.0, valid schema, zero User/Deal/Transaction rows.

### Official Documentation (HIGH confidence)

- https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions — atomic transactions, interactive transactions, idempotency, OCC, and avoiding long/network work in transactions.
- https://www.prisma.io/docs/orm/prisma-migrate — migration history and customizable SQL.
- https://www.prisma.io/docs/orm/prisma-migrate/getting-started — adding Migrate to an existing database and baselining.
- https://www.prisma.io/docs/orm/v6/prisma-migrate/workflows/development-and-production — `migrate dev` vs production/testing `migrate deploy`.
- https://www.prisma.io/docs/cli/db/push — `db push` is schema synchronization without migration history and is intended for prototyping/local development.
- https://www.sqlite.org/wal.html — single-writer WAL semantics, WAL file safety, busy cases, and the 2026 WAL-reset fix versions.
- https://www.sqlite.org/lang_transaction.html — transaction modes, one writer, snapshot behavior, and `SQLITE_BUSY`.
- https://www.sqlite.org/backup.html and https://www.sqlite.org/lang_vacuum.html — consistent online backup / `VACUUM INTO` snapshot behavior.
- https://www.sqlite.org/pragma.html — integrity and foreign-key checks and their separate coverage.
- https://www.sqlite.org/uri.html — `mode=ro` SQLite URI behavior.

## Metadata

**Confidence breakdown:**
- Current code paths: HIGH — inspected directly and cross-checked with codebase audits.
- Standard stack/migration primitives: HIGH — lockfile plus current official Prisma/SQLite documentation.
- Target atomic architecture: HIGH — follows documented transaction/idempotency patterns and closes observed code defects.
- Production data classification: LOW — production snapshot is absent; no row IDs/counts can be asserted.
- Operational rollout: MEDIUM — repository defines container/startup but not the real host, retention, or release controller.

**Research date:** 2026-08-14  
**Valid until:** 2026-09-13 for the stable design; re-verify Prisma/SQLite runtime and production inventory immediately before rollout.
