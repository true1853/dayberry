---
phase: 01-escrow-integrity-and-safe-migration
plan: 02
status: complete
completed: 2026-08-20
wave: 2
requirements: [SAFE-02]
files_modified:
  - prisma/schema.prisma
  - prisma/migrations/migration_lock.toml
  - prisma/migrations/20260814170000_baseline/migration.sql
  - prisma/migrations/20260814171000_deal_escrow_integrity/migration.sql
  - scripts/backfill-deal-escrow.mjs
  - scripts/audit-deal-escrow.mjs
  - lib/deals/escrow-invariants.js
  - test/fixtures/escrow-db.mjs
  - test/migration.integration.test.mjs
  - package.json
---

# 01-02 — Additive schema, reviewed migrations and hash-guarded backfill

## What was built

**Migration history where there was none.** The project ran on `db push`, so
`prisma/migrations/` did not exist. `20260814170000_baseline` captures the exact
pre-change schema (17 tables, 46 indexes) and `20260814171000_deal_escrow_integrity`
adds, all nullable: `Deal.createCommandKey`, `Deal.escrowTransactionId` with the
`DealEscrow` relation (`onDelete: Restrict`), and `Transaction.businessKey`.
`refType`/`refId` are retained and no unique constraint is added on that pair —
one chain legitimately owns several rows.

**Reviewed SQL.** `businessKey` is a plain `ALTER TABLE ADD COLUMN`, so
`Transaction` keeps its three indexes untouched. `Deal` is rebuilt: the
`INSERT ... SELECT` carries all 14 business columns, the three original foreign
keys survive, the new escrow FK is `RESTRICT`, and all five original indexes plus
two new unique indexes are recreated.

**`scripts/backfill-deal-escrow.mjs`** with four mutually exclusive modes:
`--emit-manifest` (read-only, writes the canonical manifest with `wx`), dry-run
(default; requires manifest + hash, always reports `mutations:0`),
`--rehearsal-apply` (non-live only), `--production-apply` (01-06 only). Plain
`--apply` is rejected by name. Every row is reread inside one short transaction
before it is written; drift in user, amount, kind, ref or business key aborts the
whole apply, and `refType='chain'` is refused as a second barrier over the
classifier.

**`test/fixtures/escrow-db.mjs`** — disposable OS-temp databases, `migrate deploy`
/ `resolve` / `diff` helpers driven through `node node_modules/prisma/build/index.js`
(npx resolves to a `.cmd` shim on Windows and cannot be spawned without a shell),
and a live-like seed: direct deal with its hold, a chain with its own step and
hold, plus a chat and a review pointing at the deal.

## Key decisions

**Manifest-aware audit severity.** After the migration lands but before the
backfill runs, every deal is missing its link — with the 01-01 model that made the
pre-backfill gate uniformly HIGH and therefore useless. `audit-deal-escrow.mjs`
now takes an optional `--manifest`: without it, missing linkage blocks everything;
with it, only deals the manifest promised to link are blocking, and the rest move
to `expected` as material for the PF-02 operator disposition. The backfill
symmetrically refuses to run when the audit has any blocking bucket other than
`missingLink`.

**Manifest creation is its own mode.** The plan's interface requires both
`--manifest` and `--manifest-sha256` for dry-run, which is unsatisfiable on the
first run — the hash does not exist yet. Generation was split into
`--emit-manifest`, so dry-run stays strictly verifying. This matches runbook step 6:
create → approve → apply.

**Token before database.** The production ledger receipt is written with `wx`
before the live database is opened, so a reused token fails closed without any
connection, let alone a write.

## Deviations from plan

- `--emit-manifest` added (see above); dry-run keeps the exact interface the plan
  specified.
- `--ledger` (`ESCROW_TOKEN_LEDGER`) added as the exclusive token-consumption
  receipt path; the plan named the mechanism but not the argument.
- `npm run migrate:deploy` and `npm run escrow:backfill` added. 01-06 references
  `migrate:deploy` by name.

## Verification

- `npm test` → 24/24 pass, serial.
- Fresh deploy asserts columns, the `RESTRICT` FK and all seven `Deal` indexes.
- Schema-equivalence gate proven both ways: exit 0 on an equivalent pre-change
  database, exit 2 on a drifted one, so `resolve --applied` is not merely a
  convention.
- Data preservation checked on seeded rows including `Chat.dealId` and
  `Review.dealId`. Both are `ON DELETE SET NULL`, and the `Deal` rebuild does a
  `DROP TABLE`: had foreign keys been active during the drop, they would have been
  silently nulled. They are not.
- Rerun of `migrate deploy` and of `--rehearsal-apply` are both no-ops.
- Not exercised: production-scale row counts and real ambiguity volume; both
  belong to the 01-06 rehearsal on a restored copy.

## Carried into 01-03 / 01-04

- The container still runs `db push` at startup (`Dockerfile`); until 01-05 moves
  schema changes to a release step, a restart can drift production past this
  migration history.
- `--production-apply` exists but must never be invoked outside 01-06.
- `multipleLinks` still mixes two row shapes; nothing consumes it programmatically
  yet, but 01-04 should not start.
