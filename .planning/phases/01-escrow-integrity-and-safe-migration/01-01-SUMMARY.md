---
phase: 01-escrow-integrity-and-safe-migration
plan: 01
status: complete
completed: 2026-08-20
wave: 1
files_modified:
  - lib/deals/escrow-invariants.js
  - scripts/audit-deal-escrow.mjs
  - scripts/backup-snapshot.mjs
  - scripts/verify-restored-copy.mjs
  - test/migration.integration.test.mjs
  - package.json
---

# 01-01 — Immutable snapshot, read-only audit and restore-verification tooling

## What was built

Non-mutating evidence tooling for every later migration gate.

- `lib/deals/escrow-invariants.js` — database-free deterministic classifier.
  Exports `stableHoldKey`, `stableReleaseKey`, `stableCreateKey`,
  `expectedEscrowStatus`, `validateEscrowInvariant`, `classifyEscrowCandidateGraph`.
  Output is canonically sorted, hashed (SHA-256 over a stable JSON encoding) and
  free of timestamps and chat text.
- `scripts/backup-snapshot.mjs` — `VACUUM INTO` snapshot with explicit paths, no
  overwrite, SHA-256/size/source/target/runtime/compile-option/PRAGMA evidence,
  and an independent `integrity_check` + `foreign_key_check` on the produced file.
  Snapshot and manifest are written read-only.
- `scripts/audit-deal-escrow.mjs` — snapshot-only audit with its own Prisma client
  on a `mode=ro` URI; never imports `lib/prisma.js`, refuses the resolved live path
  and any output colliding with a database path. JSON and human output derive from
  one canonical object and are written even when findings force a nonzero exit.
- `scripts/verify-restored-copy.mjs` — restore proof: manifest lookup by resolved
  target path, checksum match, independent integrity/FK checks and a full domain
  audit of the restored copy.
- `package.json` — serial `test`, `escrow:backup`, `escrow:audit`,
  `escrow:verify-restore`.

## Key decisions

**Chain topups are excluded structurally, not by refType alone.** `refType='chain'`
was added to `Transaction` only after the `latest-held` lookup had already drifted
on chains, so a live chain hold may carry an empty `refType`. The classifier
therefore also removes any `escrow-in` row with empty `refType`/`refId` whose amount
equals a `ChainStep.topup` of the same participant, reporting it in
`legacyChainSuspectHolds` for manual disposition. Without this, a direct backfill
could consume another participant's frozen credits — the exact must_have this plan
forbids.

**Chain holds already settled outside their chain are reported.**
`completeDeal` (`src/server/actions.js:649`) and deal cancellation (`:866`) still
select `findFirst({ userId, kind:'escrow-in', status:'held' })` ordered by
`createdAt desc` with no `refType` filter, so a direct deal can settle a chain
topup today. `chainHoldsSettledOutsideChain` surfaces every chain hold moved off
`held` while its chain is not `done`, giving the operator evidence of whether this
already happened on live data. The code defect itself is 01-04's scope.

**Audit severity is split.** `missingLink` is expected while
`Deal.escrowTransactionId` does not exist in the audited snapshot, and blocking once
it does. `high` is computed by the classifier from the blocking set only, so the
pre-apply audit of a pre-migration snapshot is not automatically HIGH and the
signal stays meaningful for PF-02 and for 01-06's stop conditions. Classification
`schemaVersion` is 2 and carries `schema` and `severity`.

## Deviations from plan

- Two buckets beyond the plan's HIGH list (`legacyChainSuspectHolds`,
  `chainHoldsSettledOutsideChain`) and the `severity` split were added after review;
  both serve the plan's stated must_have about never consuming a chain hold.
- The classifier now accepts `chainSteps`, `chains` and `schema`. The audit reads
  `ChainStep`/`Chain` through the same snapshot-only path and tolerates their
  absence.

## Verification

- `npm test` → 15/15 pass (`node --test --test-concurrency=1 test/*.test.mjs`).
- `node --check` on all three CLIs.
- Wave 1 gate (`test/migration.integration.test.mjs`, serial) green.
- Not exercised: production-scale snapshot timing and real live-data buckets; both
  belong to 01-06 rehearsal.

## Carried into 01-02

- Once `Deal.escrowTransactionId` and `Transaction.businessKey` exist, `missingLink`
  becomes blocking automatically — the backfill gate must account for that flip.
- Rows in `legacyChainSuspectHolds` are never automatic candidates and require an
  operator disposition by row ID (PF-02).
- `multipleLinks` accepts two row shapes (`{dealId, transactionIds}` and
  `{dealIds, transactionId}`); if 01-02 consumes it programmatically, split it first.
