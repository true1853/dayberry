# Project Research Summary

**Project:** Dayberry v1.1 Deal Assistant MVP  
**Domain:** Guided two-party barter transaction assistant embedded in an existing marketplace  
**Researched:** 2026-08-14  
**Confidence:** HIGH for technical and safety direction; MEDIUM for product behavior until real-user validation

## Executive Summary

Dayberry v1.1 should be built as a deterministic deal workflow with a narrow advisory AI layer, not as a general-purpose chatbot or autonomous agent. The shared deal stage, legal transitions, permissions, terms versions, confirmations, escrow effects, reminders, completion, and disputes must remain server-authoritative. AI may privately draft messages, extract candidate terms, identify a missing or conflicting field, and explain the next action, but every message and consequential action requires an explicit authenticated user command. Ordinary chat and the full manual deal path must remain usable when AI is unavailable.

The recommended implementation stays inside the existing Next.js 15 / React 19 / Prisma 6 / SQLite WAL / Node.js 22 monolith. The first roadmap phase is a financial-safety prerequisite: link every held transaction to its exact deal and make terminal state change, exact escrow settlement or refund, counters, reminder cancellation, and event append atomic. Only then should the project add an additive deal-state schema, immutable terms versions, per-version confirmations, provider-neutral fulfillment plans, participant-specific handoff/receipt facts, private suggestions, durable reminders, and a privacy-safe event log. Native `fetch` remains the AI transport; Zod 4 is the only recommended new runtime dependency.

The main risks are releasing the wrong escrow, allowing assistant state to diverge from the real deal, confirming stale terms, leaking one participant's private advice, and making the core flow depend on an unreliable model or reminder process. Mitigate them with exact financial references, one deterministic transition engine, optimistic concurrency and idempotency keys, recipient-filtered server projections, validated AI proposals tied to a context revision, short database transactions, and durable due rows. For v1.1, exchanged lots and held point amounts should be frozen after offer creation; only logistics may be revised through versioned terms. Delivery integrations remain future work: model normalized fulfillment data now, but add no carrier SDKs, quotes, labels, tracking webhooks, or provider-specific workflow.

## Key Findings

### Recommended Stack

Keep the existing monolith and deployment model. The milestone does not justify a full TypeScript migration, an AI SDK, a state-machine framework, Redis, a workflow engine, a separate AI service, or a new analytics platform. New domain modules can remain JavaScript or adopt TypeScript incrementally where the repository build already supports it; shared Zod schemas provide runtime enforcement in either language.

**Core technologies:**

- **Next.js 15 App Router and server actions:** keep authentication, authorization, serialization, and browser commands at the existing application boundary.
- **React 19:** render server-derived shared state, private cards, and transient editors without adding a global client state store.
- **Prisma 6 with SQLite WAL:** persist authoritative snapshots, immutable terms, confirmations, fulfillment progress, events, suggestions, and reminders with transactions and compound uniqueness.
- **Node.js 22:** use native `fetch`, abort timeouts, timers, crypto, and `node:test`.
- **Native OpenAI-compatible HTTP transport:** preserve `AI_BASE_URL` portability and make structured-output capability explicit rather than assuming every compatible provider supports it.
- **Zod `^4.4.3`:** the only recommended new runtime package; validate action inputs, model output, stored JSON, and future delivery DTOs, and generate JSON Schema when supported.
- **Internal deal events plus existing Yandex Metrika:** use committed event rows for authoritative funnel metrics and send only allowlisted, content-free dimensions to Metrika.

**Critical version and operational gates:**

- Keep the locked Next.js 15.5.x, React 19.2.x, Prisma 6.19.x, and Node 22 lines unless a separate upgrade is approved.
- Check the actual embedded SQLite version before rollout and verify it includes the documented WAL-reset fix or an applicable backport.
- Keep external AI, push, analytics, and future delivery calls outside Prisma transactions.
- Use serialized temporary-SQLite integration tests for concurrency and settlement; use `node:test` unless a broader frontend test requirement emerges.

### Expected Features

**Must have for v1.1:**

- A shared authoritative stage and one deterministic, role-aware primary action.
- Assistant availability inside the existing direct-deal chat, with ordinary chat always primary.
- Strict separation between shared deal artifacts and recipient-private suggestions.
- Preview and explicit confirmation before sending text or performing any deal action.
- A complete manual fallback for terms, confirmation, fulfillment, cancellation, completion, and dispute.
- Candidate extraction for item composition, frozen point top-up, handoff method, place or shipment parameters, and date/time or deadline.
- Missing/conflicting-field handling that asks one focused question rather than restarting a questionnaire.
- Immutable terms revisions and independent confirmation of the exact same revision by both participants.
- A provider-neutral meetup, shipment, or remote-service plan derived from confirmed terms.
- Directional handoff and receipt facts, visible consequence copy, exact-once existing escrow completion, review handoff, and the existing dispute route.
- Durable, state-aware, deduplicated reminders and content-free funnel/duration measurement.

**Competitive differentiators to validate in v1.1:**

- Turning casual chat into a concise candidate agreement without a separate long form.
- Asking only about the highest-priority gap or contradiction.
- Showing a lightweight versioned mutual agreement directly beside the conversation.
- Private, role- and stage-aware coaching that never appears to the counterparty.
- Symmetric barter fulfillment in which each participant can both give and receive.
- An assistant that becomes quiet when no guidance is needed while leaving the deterministic next action available.

**Defer until validation or v2+:**

- Carrier integrations, quotes, labels, webhooks, refunds, and live provider tracking.
- Pickup QR/codes or stronger proof unless disputes demonstrate a need.
- Three-party/circular-chain assistance until two-party privacy, consent, and directional fulfillment are stable.
- Calendar/maps integrations, cross-deal memory, advanced dispute evidence packaging, and any bounded automation.
- Suggestion adaptation, reminder preferences, shipment-reference parsing, and reschedule shortcuts until usage data provides a trigger.

### Architecture Approach

Use a durable `Deal` snapshot for fast current state and an append-only deal event table for audit and analytics; do not reconstruct operational state by replaying chat or model output. Every command must authorize the actor, validate an expected deal revision and exact target, claim the transition conditionally, write all invariant-related records, and append its event in one short Prisma transaction. AI is a separate advisory service that reads a minimized participant-scoped context, returns schema-validated proposals, and persists a private suggestion only if the context is still current.

**Major components:**

1. **Escrow-safe deal command core** — owns legal transitions, guards, optimistic concurrency, idempotency, exact settlement/refund, legacy mirrors, and event append.
2. **Participant-scoped view mapper** — returns the same shared state to both participants while selecting private suggestions only for the authenticated recipient.
3. **Versioned agreement protocol** — stores immutable normalized terms snapshots and per-user confirmation rows keyed to one exact version.
4. **Fulfillment protocol** — derives a normalized plan and records participant/direction-specific handoff and receipt facts without provider coupling.
5. **Advisory assistant service** — assembles bounded context, invokes the existing compatible transport, validates output, rejects stale results, and never exposes executable tools.
6. **Durable reminder processor** — stores due intent, claims work idempotently, rechecks current state/version, and delivers through existing in-app/push facilities after commit.
7. **Event and measurement layer** — records allowlisted domain events transactionally and derives conversion and elapsed-time metrics from them.

### Resolved Research Disagreements

| Topic | Decision for v1.1 | Reconciliation |
|------|-------------------|----------------|
| Production schema changes | Use reviewed, forward Prisma migrations and `migrate deploy`; do not rely on startup `db push` for this milestone. | STACK suggested retaining the current `db push` convention, while ARCHITECTURE and PITFALLS identify live financial data and rollback risk. Prisma Migrate is the existing ORM toolchain, not a second migration system, and the safety evidence outweighs convenience. |
| Reminder wake-up mechanism | Persist all reminder intent and implement one reusable idempotent sweep. Under the current one-long-lived-process deployment, start it through guarded Node instrumentation; keep the same processor callable from a script/external scheduler. | STACK favors an in-process sweep for the current deployment; ARCHITECTURE asks for scheduler wiring; PITFALLS rejects in-memory-only timers. Durable rows and catch-up semantics are mandatory, while the wake-up mechanism is deployment-specific. If the process can suspend or replicas are added, disable the loop and use an external scheduler. |
| AI transport structure | Keep direct native `fetch`; extracting a small shared transport module is allowed but does not change provider strategy. | STACK recommends extending the existing adapter; ARCHITECTURE recommends separating `ai-client`. Both reject vendor SDK and agent-framework coupling. |
| Editable economic terms | Freeze the two lots and point top-up for v1.1; version only logistics and execution details. A changed economic composition requires cancel-and-re-offer. | FEATURES leaves economic edits conditional on a safe escrow-rebalance flow; ARCHITECTURE recommends immutability. The milestone explicitly excludes replacing escrow, so rebalance is out of scope. |
| Delivery extensibility | Store normalized method, schedule/deadline, shared location/dispatch data, and nullable provider references; create no provider adapter until a provider is selected. | Requirements need future compatibility, but research consistently rejects premature Yandex/Ozon fields and SDKs. A stable domain contract is sufficient now. |

### Critical Pitfalls

1. **Expanding on an unsafe escrow boundary** — first populate exact `refType='deal'` / `refId=deal.id` linkage, reconcile ambiguous live rows without guessing, and make terminal settlement/refund atomic and idempotent.
2. **Two state machines or stale confirmations** — use one server transition table, expected revision predicates, immutable terms versions, per-version confirmation uniqueness, and explicit stale-client conflict handling.
3. **Treating valid AI output as business truth** — structured output is still probabilistic; retain `unknown`/`conflict` states and provenance, validate domain fields, and require a human to apply and confirm a candidate.
4. **Privacy or prompt-injection leakage** — authorize context server-side, separate shared and recipient-private storage/queries, treat chat as untrusted data, provide no tools/action credentials, minimize context, and never log raw prompts or responses.
5. **Optional services blocking or corrupting the deal** — keep AI, push, reminders, and analytics off the critical mutation path; bind results to revisions, persist durable intent, suppress obsolete work, and prove manual operation during timeouts, refusals, malformed output, and restarts.

## Implications for Roadmap

The roadmap should use six dependency-ordered phases. These are implementation boundaries, not six partial public launches; feature flags should keep incomplete workflows unavailable to real users.

### Phase 1: Escrow Integrity and Safe Migration Foundation

**Rationale:** Exact escrow linkage and atomic terminal settlement are prerequisites for every expanded lifecycle state. Building terms or assistant UI first would increase the number of paths that can release, retain, or refund the wrong points.

**Delivers:** Read-only reconciliation of live deals and held transactions; exact deal references and unique business keys; atomic create/cancel/complete/dispute settlement; concurrency tests; reviewed forward migration workflow; production-like backup/restore rehearsal; SQLite runtime verification.

**Requirement scope:** Foundation for REQ-013 and REQ-014. It preserves rather than replaces existing escrow and dispute behavior.

**Avoids:** Wrong escrow selection, double settlement, assistant/ledger divergence, destructive migration, and unverified rollback.

### Phase 2: Deterministic Deal Core and Scoped Workspace

**Rationale:** Shared stage, permissions, next action, privacy projections, and trustworthy funnel events must exist before terms or AI can depend on them.

**Delivers:** Additive deal revision/state fields; pure transition and next-action tables; idempotent typed commands; append-only events; legacy-field dual writes; participant-scoped serializers; feature flags and deterministic backfill for non-ambiguous legacy state.

**Addresses:** REQ-001 to REQ-003 and the event foundation of REQ-017.

**Avoids:** Client- or model-controlled transitions, incompatible `stage/status/escrow` combinations, private DTO leakage, duplicate transition events, and guessed legacy states.

### Phase 3: Manual Versioned Agreement

**Rationale:** The authoritative terms contract and concurrency semantics must be proven without AI before probabilistic extraction can propose values.

**Delivers:** Zod-backed terms schema; immutable normalized terms versions; frozen lots and points; editable logistics; visible diffs; independent per-version confirmations; confirmation reset on revision; manual terms editor and stale-version UX.

**Addresses:** Manual and deterministic portions of REQ-004 to REQ-009, including the complete fallback required by REQ-005.

**Avoids:** Lost updates, ghost confirmations, silent economic/escrow mismatch, ambiguous consent, and mutable dispute evidence.

### Phase 4: Manual Fulfillment and Existing Terminal Paths

**Rationale:** A complete non-AI vertical workflow is the acceptance baseline. Confirmed terms must drive execution, and final participant facts must feed the already-corrected settlement/dispute core.

**Delivers:** Provider-neutral fulfillment plan; meetup/shipment/remote-service checkpoints; per-participant handoff and receipt facts; consequence previews; exact-once completion and review eligibility; private problem intake that explicitly enters the existing dispute path.

**Addresses:** REQ-010, REQ-012 to REQ-014, and REQ-016.

**Avoids:** Reusing ambiguous completion booleans, provider-shaped core state, premature delivery integration, AI adjudication, and loss of agreement evidence during disputes.

### Phase 5: Chat-Native Advisory AI

**Rationale:** AI should enrich a manual workflow whose state, consent, privacy, and terminal behavior already work. This confines model failure to suggestion quality.

**Delivers:** Private suggestion storage and UI; bounded recipient-scoped context; direct-fetch structured-output modes; Zod validation; extraction with provenance, missing/conflict states, and one-gap clarification; editable reply drafts; context hashes and stale-result rejection; timeout/refusal/manual-fallback tests; mobile/desktop parity and Metrika DOM masking.

**Addresses:** Full user-facing REQ-001, REQ-002, REQ-004 to REQ-007, and the non-autonomy boundary in REQ-015.

**Avoids:** Autonomous actions, shared assistant messages, cross-user leakage, prompt injection with tools, model outages blocking chat, and fabricated fallback terms.

### Phase 6: Durable Reminders, Measurement, and Controlled Rollout

**Rationale:** Reminders require stable plan/state timestamps, while conversion metrics must observe committed domain transitions rather than UI clicks. Both are operational layers best enabled after the lifecycle is complete.

**Delivers:** Durable reminder rows, deduplicated claims, restart catch-up, obsolete-work suppression, bounded retry and quiet rules; guarded current-host wake-up loop and reusable processor; funnel and duration queries; allowlisted Metrika goals; test/cohort separation; AI/reminder/transition observability; canary enablement and rollback rehearsal.

**Addresses:** REQ-011, completes REQ-017, and delivers REQ-018.

**Avoids:** Reminder spam, lost timers, notifications after cancellation/dispute/completion, content leakage into analytics/Webvisor, false funnel events, and all-at-once rollout.

### Phase Ordering Rationale

- Financial correctness comes before new lifecycle surface area: exact escrow linkage and atomic terminal settlement are the hard gate for Phase 2.
- Deterministic state and participant-scoped projections come before shared terms or private advice.
- Immutable terms and explicit consent come before fulfillment; confirmed terms are the only plan input.
- The complete manual path comes before AI so REQ-005 and REQ-015 are architectural properties, not error-screen promises.
- AI remains a replaceable advisory edge; reminders and analytics consume committed state/events and do not become state authorities.
- Future delivery providers consume the normalized plan through later adapters; they are not roadmap work for this milestone.

### Requirement-Scoping Guidance

| Requirement group | In v1.1 now | Explicitly not included now |
|------------------|-------------|-----------------------------|
| State and control | Direct two-party stages, one next action, typed commands, human confirmation, manual fallback | LLM-selected transitions, generic executable tools, multi-party chain assistant |
| Agreement | Versioned logistics plus frozen offer composition/points, explicit same-version dual consent | In-place economic edits or automatic escrow rebalance |
| Fulfillment | Normalized meetup/shipment/remote-service plan and directional human facts | Carrier quotes, labels, provider status webhooks, automated receipt/handoff |
| AI | Private drafts, extraction, gap/conflict detection, explanations | Autonomous negotiation, sending, confirmation, dispute opening, adjudication |
| Operations | Durable reminders on the current single-process host; internal events and Metrika allowlist | Redis/queue platform, new analytics SDK, AI-chosen reminder cadence |

### Research Flags

**Phases likely needing deeper research during planning:**

- **Phase 1:** Map every current `Deal.status`, confirmation, cancellation, completion, dispute, and ledger path; define reconciliation handling for ambiguous held rows; verify SQLite runtime and a forward migration/rollback procedure.
- **Phase 4:** Decide required `handedOff` and `received` checkpoints for symmetric meetup, two-direction shipment, and remote service, and map each to existing settlement/dispute rules.
- **Phase 5:** Select the actual provider/model and verify structured-output support, retention/data residency, rate limits, refusals, and failure semantics; define an adversarial extraction eval set.
- **Phase 6:** Confirm the production process truly remains long-lived, inspect actual Metrika/Webvisor settings and captured replays, and tune reminder cadence only from observed behavior.

**Phases with well-documented patterns that can skip broad research:**

- **Phase 2:** Deterministic transition tables, OCC, idempotency, compound uniqueness, and append-only audit events are established patterns; planning should focus on the local code mapping.
- **Phase 3:** Immutable relational versions and per-version confirmations are standard; the economic immutability decision removes the largest open design branch.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Existing versions and deployment were inspected; recommended additions rely on official Zod, Prisma, Next.js, Node, SQLite, and Metrika documentation. Reminder wake-up remains conditional on the deployment contract. |
| Features | MEDIUM | Trust and consent patterns are strongly supported by first-party marketplace and human-AI guidance, but Dayberry's extraction, coaching, and reminder value is not validated with real users. |
| Architecture | HIGH | It follows inspected server-action, Prisma, escrow, notification, polling, and analytics boundaries and uses standard transaction/OCC patterns. |
| Pitfalls | HIGH | Most critical risks are visible in the current code/data model and align with official database, AI safety, retention, and analytics guidance. |

**Overall confidence:** HIGH for the roadmap ordering and safety boundaries; MEDIUM for engagement and conversion impact.

### Gaps to Address

- **Ambiguous existing escrow rows:** reconcile read-only and require manual review when more than one candidate exists; never infer by recency.
- **Fulfillment semantics:** specify checkpoint requirements per method before implementing labels or completion guards.
- **AI provider contract:** verify the selected endpoint/model rather than treating `AI_BASE_URL` compatibility as uniform.
- **Reminder cadence:** begin conservatively and tune from real time-to-action, suppression, and opt-out signals.
- **SQLite runtime and deployment behavior:** verify the engine patch level and that the process remains continuously available; change wake-up strategy if that contract changes.
- **Analytics privacy:** validate real network payloads and Webvisor recordings, not only CSS declarations.
- **Product validation:** current accounts/listings are largely artificial, so segment test activity and combine funnel data with privacy-preserving qualitative feedback.
- **Delivery future:** provider choice, quotes, labels, tracking, cancellation/refund policy, webhooks, and support operations require a separate researched milestone.

## Sources

### Primary Project Evidence (HIGH confidence)

- [PROJECT.md](../PROJECT.md) — milestone goal, production constraints, human-control boundary, privacy, deployment, and delivery deferral.
- [REQUIREMENTS.md](../REQUIREMENTS.md) — REQ-001 through REQ-018 and explicit exclusions.
- [STACK.md](./STACK.md) — current versions, direct AI transport, Zod recommendation, reminder and analytics stack.
- [FEATURES.md](./FEATURES.md) — table stakes, differentiators, anti-features, comparable marketplace patterns, and MVP boundary.
- [ARCHITECTURE.md](./ARCHITECTURE.md) — live integration boundaries, escrow findings, data model, transaction design, build order, and rollout strategy.
- [PITFALLS.md](./PITFALLS.md) — code-backed risk register, prevention criteria, recovery strategies, and phase research flags.

### Official Technical Sources (HIGH confidence)

- [Prisma transactions and optimistic concurrency](https://www.prisma.io/docs/orm/prisma-client/queries/transactions) — short atomic transactions, idempotency, and version tokens.
- [Prisma Migrate](https://docs.prisma.io/docs/orm/prisma-migrate) — reviewed migration history and production deployment.
- [SQLite WAL](https://www.sqlite.org/wal.html) — concurrency limits, checkpoints, busy behavior, and runtime fix notices.
- [Zod JSON Schema](https://zod.dev/json-schema) — runtime validation and JSON Schema generation constraints.
- [OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) — strict schema behavior, refusal/incomplete handling, and semantic-error caveats.
- [OpenAI safety best practices](https://developers.openai.com/api/docs/guides/safety-best-practices) — human review and constrained input/output.
- [OpenAI data controls](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint) — provider retention and data-control considerations.
- [Next.js 15 instrumentation](https://nextjs.org/docs/15/app/api-reference/file-conventions/instrumentation) — current-host startup hook semantics.
- [Node.js test runner](https://nodejs.org/download/release/latest-v22.x/docs/api/test.html) — built-in test support.
- [Yandex Metrika Session Replay settings](https://yandex.com/support/metrica/en/webvisor/settings) — explicit content masking requirements.

### Product and Human-AI Sources (MEDIUM for Dayberry-specific inference)

- Airbnb change requests and messaging — structured transaction state remains separate from conversation and requires counterparty acceptance.
- Upwork milestones and disputes — explicit scope, review, escrow consequences, and issue paths.
- eBay local pickup — informal coordination is separate from proof of handoff.
- Google PAIR patterns — review/approval, manual takeover, and graceful AI failure.

---
*Research completed: 2026-08-14*  
*Ready for roadmap: yes*
