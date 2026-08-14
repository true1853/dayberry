---
phase: 1
slug: escrow-integrity-and-safe-migration
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-08-14
revised: 2026-08-14
---

# Phase 1 — Validation Strategy

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Node.js 22 built-in `node:test` |
| Quick feedback | Focused source/invariant command below; target `<30s` |
| Wave gate | `node --test --test-concurrency=1 test/*.test.mjs` |
| Phase gate | Full serial tests, build, restored-copy evidence and production checkpoint |

## Sampling Rate

- After each code task: run its focused `<30s` command.
- After each wave: run the full serial suite; longer migration/concurrency suites are wave gates, not quick feedback.
- After Prisma changes: run `npx prisma validate`, `npx prisma generate`, focused migration tests, then the wave gate.
- Before live mutation: restored-copy approval plus all PF-01…PF-07 evidence applicable before apply.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Focused `<30s` command | Wave/phase gate |
|---------|------|------|-------------|------------|------------------------|-----------------|
| 01-01-01 | 01-01 | 1 | support | T-01-01..03 | `node --test --test-name-pattern="classifier|chain exclusion" test/migration.integration.test.mjs` | migration suite |
| 01-01-02 | 01-01 | 1 | support | T-01-02..03 | `node --check scripts/audit-deal-escrow.mjs; node --check scripts/backup-snapshot.mjs; node --check scripts/verify-restored-copy.mjs; node --test --test-name-pattern="snapshot|read-only|missing input" test/migration.integration.test.mjs` | Wave 1 migration suite |
| 01-02-01 | 01-02 | 2 | SAFE-02 | T-01-04 | `npx prisma validate`; `node --test --test-name-pattern="baseline|migrate deploy|preserves" test/migration.integration.test.mjs` | Wave 2 migration suite |
| 01-02-02 | 01-02 | 2 | SAFE-02 | T-01-01..04 | `node --test --test-name-pattern="dry-run|manifest|ambiguous|chain|production apply contract" test/migration.integration.test.mjs` | Wave 2 migration suite |
| 01-03-01 | 01-03 | 3 | support | PF inventory | `node -e "for(const n of ['ESCROW_LIVE_DB','ESCROW_RESTORED_DB','ESCROW_EVIDENCE_DIR'])if(!process.env[n]?.trim())throw Error('missing '+n)"` | blocking inventory review; no DB access |
| 01-04-01 | 01-04 | 3 | SAFE-01 | T-01-05..07 | `node --test --test-name-pattern="zero-credit|exact|rollback|chain" test/escrow.integration.test.mjs` | Wave 3 serial escrow/concurrency suite |
| 01-04-02 | 01-04 | 3 | SAFE-01 | T-01-05..09 | `node --test --test-name-pattern="duplicate create|cancel vs complete" test/escrow-concurrency.integration.test.mjs` | Wave 3 serial escrow/concurrency suite |
| 01-05-01 | 01-05 | 4 | SAFE-03 | T-01-10..11 | `node --test test/compatibility.integration.test.mjs` plus exact Docker CMD allowlist assertion from 01-05 | Wave 4 full serial suite + build |
| 01-05-02 | 01-05 | 4 | SAFE-03 | T-01-11..15 | `node -e "const fs=require('fs');const x=fs.readFileSync('docs/ESCROW_MIGRATION_RUNBOOK.md','utf8');for(const s of ['pre-apply-snapshot','post-apply-snapshot','approve-production-apply','reconciliation'])if(!x.includes(s))throw Error('missing '+s)"` | runbook review |
| 01-06-01 | 01-06 | 5 | support | PF-01..06 | `node -e "for(const n of ['ESCROW_LIVE_DB','ESCROW_RESTORED_DB','ESCROW_EVIDENCE_DIR','ESCROW_PRE_SNAPSHOT_SHA256','ESCROW_PRE_AUDIT_SHA256','ESCROW_MANIFEST_SHA256','ESCROW_CANDIDATE_SHA256','ESCROW_ROLLBACK_SHA256','ESCROW_SINGLE_WRITER_SHA256','ESCROW_APPROVAL_TOKEN'])if(!process.env[n]?.trim())throw Error('missing '+n)"` | actual-artifact restored rehearsal + PF-06 approval |
| 01-06-02 | 01-06 | 5 | support | T-01-12..15 | validate ordered `$env:ESCROW_EVIDENCE_DIR/production-sequence.json` as specified by Task 2 | stop writes в†’ verify unused authorization/hashes в†’ migrate deploy в†’ schema/integrity/FK/domain gates в†’ one production apply/token consumption в†’ immutable post snapshot в†’ post-audit/delta comparison в†’ resume-or-corrected-core rollback |

## Wave 0 Requirements

- [ ] `test/fixtures/escrow-db.mjs`
- [ ] `test/migration.integration.test.mjs`
- [ ] `test/escrow.integration.test.mjs`
- [ ] `test/escrow-concurrency.integration.test.mjs`
- [ ] `test/compatibility.integration.test.mjs`
- [ ] serial `npm test` and focused non-watch commands
- [ ] immutable snapshot, read-only audit, dry-run backfill and restore verification CLIs

## Explicit Wave and Phase Gates

- Wave 1: `node --test --test-concurrency=1 test/migration.integration.test.mjs`.
- Wave 2: `npx prisma generate` then `node --test --test-concurrency=1 test/migration.integration.test.mjs`.
- Wave 3: `node --test --test-concurrency=1 test/escrow.integration.test.mjs test/escrow-concurrency.integration.test.mjs`.
- Wave 4 / pre-rehearsal phase gate: `node --test --test-concurrency=1 test/*.test.mjs` then `npm run build`.
- Wave 5: restored-copy evidence and blocking production checkpoints; full suites are not repeated inside task `<verify>` blocks.

## Required Fixtures

- Zero-credit, active, disputed, completed and cancelled direct deals.
- One-to-many/many-to-one ambiguous direct holds, wrong user/amount/kind/status/ref and dangling rows.
- A newer `refType='chain'` hold beside a direct deal; direct audit/backfill/commands must never select it.
- Two independent clients at a barrier and retry after reconnect.
- Synthetic pre-change database preserving identifiers/status combinations without production PII.

## Manual Gates and Evidence

| Gate | Owner | Required evidence | Stop condition |
|------|-------|-------------------|----------------|
| PF-01 snapshot/live path | Release operator | inventory + immutable pre snapshot checksum | missing/equal path |
| PF-02 ambiguity disposition | Financial-data reviewer | audit hash + every row ID disposition | unreviewed or changed set |
| PF-03 runtime | Runtime owner | deployed Prisma SQLite version/options/PRAGMAs | unknown or below patch gate |
| PF-04 topology | Infrastructure owner | writer/replica/mount inventory + stop-writes window | multiple/unknown writers |
| PF-05 backup policy | Backup owner | retention/encryption/access/off-host approval | any field absent |
| PF-06 artifacts | Release operator | actual candidate and actual corrected-core rollback smoke plus their digests, lockfile/SQL digests | mismatch, failed smoke, or any pre-integrity rollback artifact |
| PF-07 post snapshot | Release operator | separate post snapshot + audit + deltas | HIGH/unexplained delta/live audit |

## Security Exit Gates

- [ ] Exact direct-deal FK/ref/business key; no user/time/latest-held lookup.
- [ ] Chain holds are excluded from direct matching and settlement; chain completion is out of Phase 1.
- [ ] Repeat/race produces one terminal financial effect; failpoints roll back all authoritative writes.
- [ ] Ambiguous rows remain unchanged and reviewed by ID.
- [ ] Audit scripts reject the resolved live path; pre/post audits use separate immutable snapshots.
- [ ] Docker has no ENTRYPOINT and its sole CMD exactly equals `CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "80"]`; wrappers and npm aliases are not allowed.
- [ ] Restored-copy proof precedes live apply; rollback never restores unsafe latest-held behavior.
- [ ] Production apply alone may resolve to live, and only with exact three-way path confirmation, six immutable hashes, recomputed one-time token and unused consumption receipt; all audit/restore/backup-target/rehearsal operations reject live equality.

## Multi-Source Coverage Audit

| Source | ID | Item | Plan | Status |
|--------|----|------|------|--------|
| GOAL | — | Exact escrow linkage plus safe live-data transition | 01-01…01-06 | COVERED |
| REQ | SAFE-01 | Atomic at-most-once direct escrow | 01-04 | COVERED |
| REQ | SAFE-02 | Lossless migration and ambiguity report | 01-02 | COVERED |
| REQ | SAFE-03 | Reversible read rollout without disabling corrected core | 01-05 | COVERED |
| RESEARCH | PF-01…PF-07 | Snapshot, ambiguity, runtime, topology, backup policy, digests, post snapshot | 01-03, 01-05, 01-06 | COVERED |
| RESEARCH | — | Immutable snapshot-only pre/post audit contract | 01-01, 01-03, 01-06 | COVERED |
| RESEARCH | — | HIGH threat and migrate-deploy gates | all applicable plans | COVERED |
| RESEARCH | — | Chain exact-once completion | NONE | EXCLUDED — explicitly outside Phase 1; direct code must exclude chain holds |
| CONTEXT | — | No Phase 1 CONTEXT.md exists | — | N/A |

**Approval:** pending production evidence; plan-level validation is complete.
