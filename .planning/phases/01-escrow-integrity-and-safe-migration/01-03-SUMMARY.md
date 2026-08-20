---
phase: 01-escrow-integrity-and-safe-migration
plan: 03
status: complete
completed: 2026-08-20
wave: 3
type: checkpoint
files_modified:
  - .planning/evidence/preflight-facts.json
  - .planning/evidence/preflight-inventory.json
  - scripts/backfill-deal-escrow.mjs
  - test/migration.integration.test.mjs
---

# 01-03 — Owned production path, topology, policy and single-writer inventory gate

## What was resolved

Read-only inventory of the live host, collected without opening the database for
writing, without creating a snapshot and without touching backups or cron.

- **Live path:** `/var/lib/docker/volumes/dayberry_dayberry-data/_data/dayberry.db`
  (`/app/data/dayberry.db` inside the container). Compose project `dayberry` in
  `/home/srvadm/apps/dayberry`; the volume name carries the project prefix, which
  is why `dayberry-data` alone did not resolve.
- **Restored copy and evidence:** on the operator's machine,
  `E:\Projects\dayberry-rehearsal\` — distinct from the live path by construction.
- **Owners:** single-operator project; Андрей holds all five roles.
- **Topology:** one container, one process, no other container mounts the volume,
  no host process writes the database. Host cron only reads it through
  `VACUUM INTO` inside the container. A single-writer window is provable.
- **Stop-writes window:** `docker stop dayberry`, 10–20 minutes. Chosen over
  closing traffic at the proxy because only a stopped process proves there is no
  writer.
- **Backup policy:** daily 03:55, `VACUUM INTO` + gzip, 14 database copies and 7
  upload archives, same host, unencrypted, access limited to `srvadm`. Accepted
  risks recorded: no off-host copy, no encryption, restore never exercised —
  the restore proof itself belongs to 01-06.
- **Runtime (PF-03 input):** SQLite 3.46.0 from the production container,
  `journal_mode=wal`, `synchronous=2`, 22 GB free against an 11 MB database.

Baseline counts are recorded for the PF-07 delta comparison: 14 deals, 5 active
paid, 10 transactions, 5 held direct holds, 0 chain holds, 8 chains (all
`candidate`), 9 chain steps with a topup, 122500 credits across balances.

## What the inventory found in the data

Four of five active paid deals match a hold exactly. The fifth does not, and the
reason is visible in the rows: user `cmsohffs2…` holds 3500 in `held` with no
matching deal, while their active 3000 deal's own hold — created moments after it,
adjacent cuid — is already `done`. A neighbouring deal of the same user was
completed, and `latest-held` settled the wrong row. The recipient was paid the
correct 3500; the damage is that a live deal now has no escrow behind it and 3500
is frozen without cause.

This is the defect 01-04 removed, observed after the fact on production data
rather than inferred from code.

The operator reviewed both rows and classified them as test data, so no manual
repair is planned. They still cannot pass through the backfill silently.

**Chain risk did not materialise:** the collision query returned nothing, all 8
chains are `candidate`, no `refType='chain'` hold exists, and topup amounts
(35000, 48000, 13000, 6500, 300000) do not intersect direct hold amounts. The
`legacyChainSuspectHolds` rule needs no narrowing.

## Contract change made here

The audit is not the only thing that must tolerate imperfect data. The backfill
previously refused to emit a manifest at all when any blocking bucket was
non-empty — one broken row would have blocked four healthy pairs, which is not
what SAFE-02 asks for.

`--emit-manifest` now plans the healthy pairs and lists everything it may not fix
under `unresolved`, keyed by bucket and exact row ID. Any apply mode with a
non-empty `unresolved` requires `--dispositions`: a file carrying an explicit
decision per ID. The sets are compared exactly — a missing or extra entry stops
the run before any write. A disposition never authorises touching the row; it
records that the operator saw it. Manifest `schemaVersion` is 2.

## Verification

- `npm test` → 38/38 (24 migration, 8 escrow core, 6 concurrency).
- Inventory paths are absolute and distinct; owners, policy fields, topology and
  the stop-writes method are all populated.
- No snapshot created, no audit run, no PF-06 digest approved, no database
  mutated by this plan.

## Blocking items carried forward

- **BK-01 (01-05):** `backup_dayberry.sh` calls `backup-snapshot.mjs` with a
  positional argument, while 01-01 made that CLI fail-closed on
  `--source`/`--target`/`--evidence`. The first deploy of the new image breaks the
  nightly backup. The script must be updated in the same rollout, with `rm -f`
  before the call because the new snapshot is written read-only and refuses to
  overwrite.
- **BK-02 (01-05):** the container `CMD` still runs `prisma db push` at every
  start, which would drift the schema past the migration history on restart.
- **BK-03 (01-06):** deploy order is load-bearing — snapshot → `migrate deploy` →
  backfill → new image. The new escrow core refuses to settle deals without an
  exact link.

Deferred by design: PF-02 dispositions, PF-03 candidate-runtime evidence and
PF-06 artifact digests all belong to 01-06, where the artifacts exist.
