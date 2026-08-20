---
phase: 01-escrow-integrity-and-safe-migration
plan: 05
status: complete
completed: 2026-08-20
wave: 4
requirements: [SAFE-03]
files_modified:
  - lib/deals/rollout.js
  - src/server/actions.js
  - Dockerfile
  - docker-compose.yml
  - package.json
  - test/compatibility.integration.test.mjs
  - docs/ESCROW_MIGRATION_RUNBOOK.md
---

# 01-05 — Compatibility rollout, exact startup allowlist and executable runbook

## What was built

**Startup no longer touches data.** The container `CMD` was a shell chain:
`mkdir` + `prisma db push` + `migrate-photos` + `migrate-chains` + `next start`.
Every restart silently changed the live schema outside the migration history —
the direct cause of BK-02 in the 01-03 inventory. It is now exactly:

```
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "80"]
```

with no `ENTRYPOINT`. A test compares that line character for character, so a
wrapper, `sh -c`, an npm alias or any later-added command fails the suite. Being
an allowlist rather than a denylist, a dangerous command added next year does not
need to have been predicted.

**`lib/deals/rollout.js`** holds the read flag `DEAL_ESCROW_EXPANDED_READS`. Only
a normalized `1` enables it; `true`, `yes`, `on` and anything else mean off,
because an ambiguous value in production must resolve to the safe behaviour. When
on, the deal payload gains `escrowLinkState` (`linked` / `needs-attention` /
`none`) and the query selects `status` and `refType` from the linked row — never
its id. When off, the query is not altered at all.

**`docs/ESCROW_MIGRATION_RUNBOOK.md`** is the executable protocol: stop writes,
immutable pre-snapshot, snapshot-only audit, restore the copy, schema equivalence,
baseline resolve, `migrate deploy`, manifest, dispositions, two rehearsal applies
requiring `"mutations":0` on the second, then the single production apply with the
one-time token, a distinct post-snapshot and delta reconciliation.

## Key decisions

**The flag governs reads only.** `lib/deals/escrow.js` never reads it. The
compatibility test runs create, settle and cancel against two databases — one with
the flag off, one on — and requires the resulting transactions and balances to
match. Turning the projection off must not restore the old money behaviour; that
is the whole point of SAFE-03.

**Rollback means a corrected artifact, not a schema reversal.** The runbook forbids
rolling back to any pre-integrity image, since that image still contains the
`latest-held` lookup. Columns are never dropped and links are never erased.
Database restore is allowed only after writes are stopped and post-snapshot writes
are reconciled.

**Startup-time data migrations became release steps.** `mkdir -p /app/data/uploads`
and the one-off `migrate:photos` / `migrate:chains` runs are documented in the
runbook. `migrate-chains` was previously justified as "must run every start"; it is
idempotent and long since applied, so a release step is sufficient.

## Deviations from plan

- Added `escrow:manifest`, `escrow:backfill:rehearse`, `escrow:backfill:production`
  and `test:compat` scripts; the plan asked for separate backfill and compatibility
  commands without naming them.
- `DEAL_ESCROW_EXPANDED_READS` is surfaced in `docker-compose.yml` defaulting to
  `0`, so the flag is visible to the operator rather than implicit.

## Verification

- `npm run test:compat` green; full `npm test` and `npm run build` green.
- Startup allowlist asserted twice: inside the test suite and as the plan's own
  focused check.
- Runbook contains every required marker (`$env:ESCROW_LIVE_DB`,
  `$env:ESCROW_PRE_SNAPSHOT`, `$env:ESCROW_POST_SNAPSHOT`, `pre-apply-snapshot`,
  `post-apply-snapshot`, `migrate:deploy`, `approve-production-apply`,
  `reconciliation`).

## Carried into 01-06

- BK-01 remains open on the server side: `backup_dayberry.sh` must be updated to
  the flag-based `backup-snapshot.mjs` call before the new image runs, otherwise
  the nightly backup fails silently at 03:55. The exact replacement command is in
  the runbook.
- The uploads directory is no longer created at startup; the release step must
  create it if it is ever missing.
- PF-02, PF-03 and PF-06 evidence is produced in 01-06.
