---
gsd_state_version: 1.0
milestone: v1.1
milestone_name: Помощник сделки MVP
status: executing
stopped_at: Wave 3 complete (01-03, 01-04); Wave 4 (01-05) is ready to execute.
last_updated: "2026-08-20T00:00:00.000Z"
last_activity: 2026-08-20 -- 01-03 completed (production inventory, unresolved-row dispositions)
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 6
  completed_plans: 4
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-14)

**Core value:** Новый пользователь получает понятный и безопасный путь от найденного варианта обмена до реально завершённой сделки.
**Current focus:** Phase 1 — escrow-integrity-and-safe-migration

## Current Position

Phase: 1 (escrow-integrity-and-safe-migration) — EXECUTING
Plan: 01-05 (Wave 4)
Status: Waves 1-3 complete; 01-05 not started
Last activity: 2026-08-20 -- 01-03 completed

Progress: [███████░░░] 67%

## Performance Metrics

**Velocity:**

- Total plans completed: 4
- Average duration: not tracked
- Total execution time: not tracked

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 | 4/6 | — | — |

**Recent Trend:** Waves 1-3 complete; only rollout and the live apply remain.

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md. Current milestone decisions:

- Exact escrow linkage and safe migration precede lifecycle expansion.
- Holds with an empty `refType` whose amount matches a `ChainStep.topup` of the same
  user are never direct-backfill candidates; they need an operator disposition (01-01).
- Audit severity is split: `missingLink` is expected until `Deal.escrowTransactionId`
  exists, blocking afterwards, so `high` stays a meaningful stop signal (01-01).
- Between migration and backfill the audit compares against the approved manifest:
  only deals the manifest promised to link are blocking (01-02).
- Manifest creation is its own mode (`--emit-manifest`); dry-run stays verifying (01-02).
- A positive-credit deal without an exact escrow link refuses to settle and asks for
  an operator instead of guessing a hold (01-04).
- Бэкфилл связывает здоровые пары даже при наличии сломанных строк, но применение
  требует поимённых решений оператора по каждой неразрешённой строке (01-03).
- Живой инвентарь: один контейнер, том dayberry_dayberry-data, окно —
  docker stop dayberry; репетиция идёт на машине оператора (01-03).
- Server rules remain authoritative; AI is advisory and every consequential action requires explicit user confirmation.
- Economic terms are frozen after offer creation; only logistics are versioned in v1.1.
- The complete manual path must work before advisory AI and remain available during AI failure.
- Delivery integrations, autonomous AI, AI adjudication, and multi-party assistance are deferred beyond v1.1.

### Pending Todos

- 01-05: the container still runs `db push` at startup (`Dockerfile`); a restart can
  drift production past the new migration history.
- BK-01 (01-05): backup_dayberry.sh на сервере вызывает backup-snapshot.mjs
  позиционным аргументом — после 01-01 CLI fail-closed, ночной бэкап сломается
  при первом деплое нового образа.
- BK-02 (01-05): CMD контейнера делает prisma db push при каждом старте.
- BK-03 (01-06): порядок выката несущий — снимок, migrate deploy, бэкфилл,
  затем новый образ.
- 01-04: remove the `latest-held` lookup in `completeDeal` and deal cancellation
  (`src/server/actions.js:649`, `:866`) — it can settle a chain topup today.

### Blockers/Concerns

- Подтверждено на проде: latest-held уже снял чужой холд — 3500 заморожены без
  основания, активная сделка на 3000 без обеспечения. Строки признаны тестовыми,
  но проходят через dispositions, а не молча.
- Phase 1 planning must define manual handling for ambiguous held escrow rows and verify forward migration plus backup/restore on production-like data.
- Phase 4 planning must settle directional handoff and receipt checkpoints for meetup, shipment, and remote service.
- Phase 5 planning must verify the selected model/provider contract, privacy, structured output, refusal, and timeout semantics.
- Phase 6 planning must verify the long-lived production process and actual Metrika/Webvisor payload masking before rollout.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Delivery | Provider quotes, labels, tracking and webhooks | Future milestone | v1.1 roadmap |
| Assistant | Autonomous actions, AI adjudication and multi-party deals | Future milestone | v1.1 roadmap |

## Session Continuity

Last session: 2026-08-20 +03:00
Stopped at: 01-03 complete (inventory approved, 38 tests green).
Resume file: .planning/phases/01-escrow-integrity-and-safe-migration/01-05-PLAN.md
