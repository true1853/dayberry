---
phase: 01-escrow-integrity-and-safe-migration
plan: 04
status: complete
completed: 2026-08-20
wave: 3
requirements: [SAFE-01]
files_modified:
  - lib/deals/escrow.js
  - lib/deals/escrow-invariants.js
  - src/server/actions.js
  - src/App.jsx
  - test/escrow.integration.test.mjs
  - test/escrow-concurrency.integration.test.mjs
  - test/fixtures/escrow-db.mjs
---

# 01-04 — Exact atomic escrow core across all direct-deal terminal paths

## What was built

`lib/deals/escrow.js` — five injectable domain commands (`createDealWithEscrow`,
`confirmDealSide`, `cancelDealWithEscrow`, `openDealDispute`,
`resolveDealDispute`) with typed `EscrowError` codes. Money is reached only
through `Deal.escrowTransactionId` plus a full row predicate: user, kind, amount,
`held` status, `refType`/`refId`. A `refType='chain'` row is refused by name
before anything else is checked.

Every command is one short transaction in which the conditional claim and the
financial effect are inseparable, and none of them performs external I/O —
notifications are sent by the caller after the commit returns.

`src/server/actions.js` routes create, both confirmations, cancel, participant
dispute and both admin outcomes through those commands. Moderation has no
separate road to money.

## What was actually wrong

Beyond the known `latest-held` lookup, reading the code turned up three more
defects, all now closed:

- `confirmSide` claimed the transition in one transaction and `completeDeal`
  moved the money in another. A failure between them left the deal `done` with
  the credits still frozen.
- `resolveDisputeAction`'s `release` branch ran `updateMany` without checking the
  result, then settled — so a concurrent close could be paid out twice.
- `createDealAction` had no command key: a retried request opened a second deal
  and froze the credits again.

## Key decisions

**A positive-credit deal without an exact link refuses to settle.** It returns
`ESCROW_MISMATCH` and the user sees "Сделка требует проверки оператором — баллы
остаются в эскроу". This is deliberate: guessing is what caused the original
defect. The consequence is a hard ordering constraint — until 01-02's backfill
runs on production, legacy deals cannot be completed, so this plan must not ship
ahead of 01-06.

**Chat creation moved inside the create transaction.** The core takes an `attach`
callback so the chat and its first message are created with the deal and the
hold. Not a financial concern, but a deal without a chat is still a divergence.

**`clientCommandId` is stable per payload.** `App.jsx` keeps one id while lot,
credits and counter-item are unchanged and clears it after success. A retry after
a dropped connection returns the same deal (`replayed: true`); a changed amount
raises `COMMAND_CONFLICT` rather than silently opening a second deal.

**Notifications only for real effects.** A replayed create sends nothing, so the
lot owner never receives a duplicate offer.

## Verification

- `test/escrow.integration.test.mjs` → 8/8: exact link on create, no hold for a
  zero-credit deal, idempotent retry and payload conflict, full rollback on
  insufficient funds, settlement paying the owner once, refund once, refusal to
  consume a chain hold, refusal to settle without a link, and both dispute
  outcomes.
- `test/escrow-concurrency.integration.test.mjs` → 6/6: duplicate create,
  confirm vs confirm, cancel vs complete, dispute vs terminal, duplicate admin
  resolution, retry after reconnect. Two independent Prisma clients race on one
  database; `SQLITE_BUSY` counts as a legitimate loss, the assertion is that the
  financial effect happened exactly once.
- `npm run build` clean.
- Source gate: no `latest-held` lookup remains anywhere in `src` or `lib`.

## Carried into 01-05 / 01-06

- Deploy order is now load-bearing: backfill (01-02) must complete on production
  before this code serves traffic, or legacy deals will refuse to settle.
- Chain completion still uses its own path and is out of Phase 1 scope; the
  `latest-held` pattern was removed from direct paths only.
- `InsufficientFunds` remains in `actions.js` for the chain flow; the direct path
  no longer uses it.
