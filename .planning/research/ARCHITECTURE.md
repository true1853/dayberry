# Architecture Research

**Domain:** Guided AI deal assistant inside an existing barter marketplace monolith
**Project:** Dayberry v1.1 Deal Assistant MVP
**Researched:** 2026-08-14
**Confidence:** HIGH for codebase integration and transaction design; MEDIUM for reminder operations until a production scheduler is selected

## Executive Recommendation

Keep the current Next.js/React/Prisma monolith. Add one deterministic deal domain module behind the existing server-action facade, an append-only deal event log, versioned shared terms, a provider-neutral fulfillment plan, per-party progress, and a separate private suggestion store. Do not make the model a state-machine participant and do not put assistant cards into the shared `Message` table.

The durable `Deal` snapshot remains the fast source for the current state; `DealEvent` is an audit and analytics log, not an event-sourced reconstruction mechanism. Every business command validates the actor and expected deal revision, conditionally updates the deal, writes related records, and appends its event in one short Prisma transaction. AI calls, Web Push, and analytics occur only after commit and can fail without changing the command result.

The first implementation work should repair the existing escrow boundary. `createDealAction` currently creates a held `Transaction` without its available `refType/refId`, while completion and cancellation locate the “latest held” transaction. Completion also marks the deal done before `completeDeal()` performs a second transaction. Expanding the lifecycle on top of that behavior risks releasing the wrong escrow or leaving a completed deal with held points after a crash. Link escrow explicitly to `dealId` and make terminal transition, exact escrow release/refund, counters, and event append atomic before adding assistant states.

## Standard Architecture

### System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Existing responsive client                                          │
│ `src/App.jsx` → `screen-chat.jsx` / `screen-deal.jsx` / web views   │
│                                                                     │
│ Shared stage + terms + plan       Private suggestion for current user│
└──────────────────────────────┬──────────────────────────────────────┘
                               │ Next.js server actions
┌──────────────────────────────▼──────────────────────────────────────┐
│ Modified application boundary: `src/server/actions.js`              │
│ auth • participant checks • input validation • client view mapping  │
└──────────────┬──────────────────────────┬───────────────────────────┘
               │ commands/queries         │ explicit assistant refresh
┌──────────────▼─────────────────┐  ┌─────▼───────────────────────────┐
│ NEW deterministic deal core    │  │ NEW deal assistant service      │
│ `lib/deal-machine.js`           │  │ `lib/deal-assistant.js`         │
│ transitions • guards • next CTA│  │ context minimization • prompts  │
│ terms • plan • escrow • events │  │ parsing • validation • staleness│
└──────────────┬─────────────────┘  └─────┬───────────────────────────┘
               │ short DB transaction      │ network call outside txn
               │                            ▼
┌──────────────▼──────────────────────────────────────────────────────┐
│ Prisma 6 / SQLite WAL                                               │
│ Deal snapshot + legacy mirrors • DealEvent • TermsVersion           │
│ TermsConfirmation • FulfillmentPlan • PartyProgress                 │
│ AssistantSuggestion (recipient-scoped) • DealReminder               │
└──────────────┬──────────────────────────────────────────────────────┘
               │ committed events / reminders
┌──────────────▼──────────────────────────────────────────────────────┐
│ Existing best-effort edges                                          │
│ `lib/notify.js` → Web Push • Metrika allowlisted funnel events      │
│ reminder processor → durable due rows; future delivery adapter      │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities and Change Scope

| Component | New / Modified | Responsibility |
|-----------|----------------|----------------|
| `prisma/schema.prisma` | Modified | Add additive assistant state/revision fields and new event, terms, plan, progress, suggestion, and reminder relations. Preserve production rows and legacy fields. |
| `lib/deal-machine.js` | New | Sole owner of legal transitions, role/participant resolution, deterministic next action, terms/plan invariants, escrow settlement, OCC, idempotency, and event append. No model or network calls. |
| `lib/deal-assistant.js` | New | Build a minimized role-scoped prompt, call the AI transport, validate structured output, classify missing/conflicting fields, and persist only a private suggestion if its context is still current. |
| `lib/ai-client.js` | New extraction from `lib/ai.js` | Reuse the current OpenAI-compatible request, timeout, retry, and response parsing behavior without coupling assistant code to listing analysis. Provider-specific structured-output features must be optional capabilities. |
| `lib/ai.js` | Modified | Continue listing/matching responsibilities but consume the shared AI transport. Its listing heuristic fallback must not be reused to invent deal terms. |
| `lib/deal-reminders.js` | New | Create deterministic reminder rows transactionally, claim due rows idempotently, and call `notify` after claim. |
| `scripts/process-deal-reminders.mjs` | New | Small repeatable runner for the deployment scheduler. It must also process overdue rows after downtime. |
| `src/server/actions.js` | Modified | Keep as browser boundary; existing deal/chat actions delegate to the deal core. Add narrow actions for terms, fulfillment, suggestion refresh/dismissal, and problem intake. |
| `serializeDeal` / `serializeChat` | Modified | Return a participant-scoped deal workspace view; never return raw terms provider data or another user’s suggestions. |
| `src/screen-chat.jsx` | Modified | Embed stage rail, one deterministic primary CTA, private suggestion cards, and compact terms/plan entry points. Existing chat send/poll remains available independently. |
| `src/screen-deal.jsx` | Modified | Render the full shared terms, confirmation state, fulfillment plan, handoff/receipt actions, review entry, and existing dispute path. |
| `src/deal-assistant-ui.jsx` | New | Shared responsive cards and editor used by mobile chat/deal screens and desktop views, avoiding duplicate behavioral logic. |
| `src/App.jsx`, `src/web-app.jsx`, `src/router.js` | Modified | Reconcile authoritative deal workspace responses and expose equivalent mobile/desktop navigation; keep assistant transient UI out of global state where possible. |
| `lib/notify.js`, `lib/push.js` | Modified only at call sites/templates | Send generic state/reminder notifications after commit. Never include chat text, exact locations, or private suggestion content in push bodies. |
| `app/metrika.jsx` and call sites | Modified | Emit allowlisted event names and numeric/enumerated properties only; event-log-derived server metrics remain authoritative. |

## Durable Data Model

### Modify `Deal` Additively

Keep `stage`, `status`, `initiatorConfirmed`, `partnerConfirmed`, and dispute fields during v1.1 for rollback compatibility. Add:

| Field | Purpose |
|-------|---------|
| `assistantState String?` | Canonical v1.1 state after backfill. Nullable on first additive deployment so existing rows are not misclassified by a default. |
| `assistantRevision Int @default(0)` | Optimistic concurrency token and monotonic event sequence. |
| `currentTermsVersion Int @default(0)` | Identifies the version clients may edit/confirm without a fragile “latest row” race. |

The new engine writes `assistantState` and derived legacy mirrors in the same transaction. Suggested compatibility mapping is: pre-handoff states → legacy `stage='created'`; `handoff`/`awaiting_confirmation` → `stage='confirm'`; `completed` → `stage='done', status='done'`; `cancelled` → `status='cancelled'`; `disputed` → `status='active'` plus existing dispute fields. All existing mutations must route through the engine once the field becomes authoritative.

### New Models

| Model | Key fields / constraints | Purpose |
|-------|--------------------------|---------|
| `DealEvent` | `dealId`, `seq`, `type`, `fromState`, `toState`, `actorId?`, `idempotencyKey @unique`, `metadataJson`, `createdAt`; `@@unique([dealId, seq])`, index `[type, createdAt]` | Append-only audit trail and funnel source. Metadata is allowlisted and never contains message/terms text. |
| `DealTermsVersion` | `dealId`, `version`, `createdById`, `status`, item snapshot JSON strings, `credits`, `fulfillmentType`, shared location/window/deadline fields, `createdAt`, `lockedAt?`; `@@unique([dealId, version])` | Immutable historical versions. A new version, rather than deletion, resets confirmation. |
| `DealTermsConfirmation` | `termsId`, `userId`, `confirmedAt`; `@@unique([termsId, userId])` | Independent confirmation by each current participant. Old confirmations remain historical and cannot confirm a newer version. |
| `FulfillmentPlan` | `dealId`, `termsVersion`, `method`, shared schedule/location fields, `status`, `providerCode?`, `externalRef?`, `providerStateJson`, timestamps; `@@unique([dealId, termsVersion])` | Deterministic plan derived from locked terms. Provider-neutral fields avoid Yandex/Ozon columns in the domain. Provider state stays server-only. |
| `DealPartyProgress` | `dealId`, `userId`, `handedOffAt?`, `receivedAt?`; `@@unique([dealId, userId])` | Separate handoff and receipt acknowledgements per participant. Replaces ambiguous reuse of the two receipt booleans while the booleans can be mirrored for old UI. |
| `AssistantSuggestion` | `dealId`, `recipientId`, `kind`, `contextHash`, `basisRevision`, `basisMessageId?`, `payloadJson`, `status`, `model`, `promptVersion`, timestamps; unique on recipient/context/kind/prompt | Private, durable, deduplicated proposal. It is not a chat message and cannot mutate shared state. |
| `DealReminder` | `dealId`, `userId`, `kind`, `dueAt`, `status`, `dedupeKey @unique`, `attempts`, `claimedAt?`, `sentAt?` | Durable schedule that survives restarts and prevents duplicate reminders. |

Use `String` fields containing validated JSON where the current SQLite/Prisma conventions favor strings. All JSON must be parsed and revalidated at the service boundary; raw payloads must never cross to the client.

### Escrow Linkage Is a Prerequisite

The existing `Transaction` already has `refType` and `refId`, so no new financial model is required. Change deal creation to create the `Deal` first inside the transaction, conditionally debit the balance, and create the held transaction with `refType='deal'`, `refId=deal.id`. Add an index/uniqueness rule appropriate to one held escrow per deal, then make cancel, complete, and dispute resolution address that exact row.

For v1.1, keep `Deal.credits` and the terms-card credit amount immutable after the offer is opened. The assistant may detect that chat text conflicts with the frozen amount and ask the users to resolve it, but it must not silently rebalance escrow. A different point amount should require cancellation/re-offer until an explicit, separately researched escrow-adjustment flow exists.

## Deterministic State Machine

### State Graph

```text
offer_sent ──first participant message──> negotiating
    │                                          │
    └────────manual/accepted AI draft──────────┤
                                               ▼
terms_draft ──submit version──> terms_pending ──two confirmations──>
terms_confirmed ──derive plan──> fulfillment_planned
                                      │
                                      └──first handoff──> handoff
                                             └──all required handoffs──> awaiting_confirmation
                                                    └──all receipts──> completed

allowed pre-handoff cancellation ───────────────────────────────> cancelled
execution problem / moderation freeze ──────────────────────────> disputed
admin resolution from disputed ───────────────> completed | cancelled
```

`terms_confirmed` may be a zero-duration persisted transition: the second confirmation transaction appends `terms_confirmed`, creates the plan, then appends `fulfillment_planned`, leaving the snapshot in `fulfillment_planned`. Keeping both events satisfies funnel timing without requiring a user to reload an intermediate screen.

### Guards

| Command | Allowed state | Required guard | Atomic writes |
|---------|---------------|----------------|---------------|
| Save/send message | Any nonterminal state | Actor is `ChatMember`; message limits/rate limit pass | Message and read cursor; conditional first transition to `negotiating` must tolerate another message winning the claim. |
| Save terms draft | `offer_sent`, `negotiating`, `terms_draft`, `terms_pending`, or pre-handoff planned state | Actor is participant; `expectedRevision` and current terms version match; credits equal frozen deal credits | New terms version, reset by absence of confirmations, current version pointer, state/event. Existing plan becomes superseded if safe. |
| Submit terms | `terms_draft` | Actor is participant; required fields validate by fulfillment type | Terms status pending, state/event. |
| Confirm terms | `terms_pending` | Confirmation targets exact current version and actor has not confirmed it | Confirmation; on second confirmation lock terms, append confirmation event(s), create plan, create reminder rows, advance snapshot. |
| Mark handoff | `fulfillment_planned` or `handoff` | Explicit actor action; no dispute; exact revision | Party progress, state/event, reminder cancellation/reschedule. |
| Confirm receipt | `handoff` or `awaiting_confirmation` | Explicit actor action; own handoff/required counterpart handoff rules pass | Party progress; on final receipt atomically settle exact escrow, update counts, complete state, append event. |
| Cancel | Nonterminal and before any handoff/receipt | Participant; no open dispute | Cancel state, exact escrow refund, pending reminder cancellation, event. |
| Open problem | Execution states | Participant; structured facts explicitly reviewed | Existing dispute fields, disputed state/event, reminder cancellation. AI may prepare facts but cannot invoke this command. |
| Resolve dispute | `disputed` | Existing admin authorization | Atomic exact escrow refund/release, terminal state, counters where relevant, event. |

### Pure Next-Action Selector

The primary CTA must be computed by a pure function such as `nextActionFor({ state, role, terms, progress, disputed })`. It returns a fixed action ID and translation key. The model may generate explanatory copy or a suggested message around that action, but it never chooses which transitions are legal. Thus the same state produces a useful next step when `AI_API_KEY` is absent or the provider is down.

## API and Internal Boundaries

### Existing Actions to Refactor

- `createDealAction`: delegate deal/chat/escrow/event creation to the deal core; return `dealWorkspace` and `chatId`.
- `sendMessageAction`: accept an optional client message key and optional `suggestionId`; persist the user-edited final text first. Mark a suggestion accepted only in the same successful transaction. Do not await AI.
- `getChatAction` and `getChatUpdatesAction`: retain the current chat membership check and add a `dealWorkspace` view containing shared state plus suggestions filtered to `recipientId === currentUser.id`.
- `confirmReceiptAction` and `confirmPartnerAction`: retain temporary wrappers for UI compatibility, but derive the side from the authenticated actor and call one `confirmReceipt` command. Never trust a client-supplied role.
- `cancelDealAction`, `openDisputeAction`, and `resolveDisputeAction`: use exact escrow linkage and the state engine.
- `serializeDeal` / `serializeChat`: replace ad hoc state fragments with a central role-aware view mapper.

### New Narrow Actions

```text
getDealWorkspaceAction(dealId)
saveTermsDraftAction({ dealId, expectedRevision, commandId, fields })
submitTermsAction({ dealId, termsVersion, expectedRevision, commandId })
confirmTermsAction({ dealId, termsVersion, expectedRevision, commandId })
markHandoffAction({ dealId, expectedRevision, commandId })
confirmReceiptAction({ dealId, expectedRevision, commandId })
refreshDealAssistantAction({ dealId, contextCursor, kinds })
dismissAssistantSuggestionAction(suggestionId)
openDisputeAction({ dealId, expectedRevision, commandId, reviewedFacts })
```

Do not expose a generic `executeAssistantAction(toolName, args)`. Each meaningful operation needs its own authorization, validation, confirmation UI, and transition guard.

### Future Delivery Seam

Define a small server-only interface only when the first provider arrives:

```js
// lib/delivery/provider.js
// quote(plan), createShipment(plan), getStatus(externalRef), cancel(externalRef)
```

The deal core owns normalized `method`, deadlines, parties, and shared handoff state. Provider adapters own credentials, request/response mapping, and opaque provider state. Provider webhooks must translate external updates into idempotent domain commands; they must not update `Deal` directly. The MVP creates no provider adapter and makes no provider call.

## Data Flow

### Offer and Initial Availability

```text
User confirms offer
  → createDealAction
  → short transaction:
      create Deal + assistantState=offer_sent
      conditional balance debit
      create exact escrow Transaction(refType=deal, refId=dealId)
      create Chat + two ChatMembers + system Message
      append offer_sent event
  → commit
  → best-effort in-app/push notification
  → chat renders deterministic next action immediately
  → client separately requests private AI suggestion
```

An initial assistant card is therefore always present even if the separate AI request times out.

### Message and Suggestion Refresh

```text
Optimistic client message
  → sendMessageAction saves message and returns normally
  → UI reconciles saved message
  → debounced refreshDealAssistantAction(dealId, latestMessageId)
      authorize deal participant
      read bounded current-deal context only
      compute contextHash and return cached suggestion if present
      call provider outside any DB transaction
      parse + locally validate structured response
      re-read latest deal revision/message cursor
      persist private suggestion only if still current
  → existing 4-second chat poll returns recipient-scoped suggestion
```

A timeout or malformed response changes only suggestion availability. It cannot roll back or delay the saved chat message.

### Terms to Fulfillment

1. The model returns a private proposed draft with `missingFields`, `conflicts`, and field values; it does not write shared terms.
2. The user edits and explicitly applies it through `saveTermsDraftAction`.
3. Submitting creates/pins a specific pending version. Each participant confirms that version independently.
4. The second confirmation transaction locks the version, derives a provider-neutral plan from validated fields, creates both party-progress rows and reminder rows, and appends the two state events.
5. Explicit handoff and receipt commands update only the authenticated party’s progress.
6. Final receipt atomically completes the deal and settles the exact escrow. Review eligibility continues to use the existing completed-deal rules.

### Analytics

Use `DealEvent` as the authoritative funnel for `offer_sent`, `terms_draft`, `terms_confirmed`, `fulfillment_planned`, `handoff`, `completed`, `cancelled`, and `disputed`. Derive conversion and elapsed time with database queries over event timestamps. Metrika receives only the same event name plus safe dimensions such as fulfillment type, role, test/cohort flag, and duration bucket. It never receives `Message.text`, terms JSON, suggestion payloads, location, user IDs, or dispute facts.

## Transaction, Concurrency, and Idempotency Boundaries

- Keep all write transactions short. Do not call the AI provider, Web Push, Metrika, or a future delivery provider inside `prisma.$transaction`.
- Require `expectedRevision` for state-changing browser commands. Claim with a conditional update on `id + assistantRevision + assistantState`, increment the revision, and reject stale clients with a refreshable conflict response.
- Require a client-generated `commandId`/idempotency key for deal commands. A unique `DealEvent.idempotencyKey` makes double taps and server-action retries return the already-committed current view instead of repeating settlement or confirmations. Automatic sub-events derive stable suffixes from the command key.
- Use database uniqueness for `[dealId, termsVersion]`, `[termsId, userId]`, `[dealId, userId]` progress, suggestion context, and reminder dedupe. Application checks alone are insufficient.
- A terms confirmation and its possible state/plan transition are one transaction. A final receipt, exact escrow release, balance/counter updates, reminder cancellation, legacy mirrors, and `completed` event are one transaction.
- SQLite WAL permits readers alongside a writer but still permits only one writer at a time. Preserve the existing busy timeout, use bounded retry only around commands proven idempotent, and monitor lock/busy frequency. Avoid a high-frequency polling write; chat polling stays read-only and `lastReadAt` updates only when needed.
- The currently installed SQLite runtime version must be checked before rollout. SQLite’s official WAL documentation reports a rare WAL-reset corruption bug fixed in 3.51.3 (with specific backports). Do not assume the Prisma engine’s embedded SQLite is patched based only on the npm package version.

## Privacy and Authorization

- Deal workspace queries start from authenticated `ChatMember`/deal participation. Never accept `recipientId`, party role, or owner ID from the client as authority.
- Shared terms and plans are visible to both participants; `AssistantSuggestion` is selected by both `dealId` and current `recipientId`. Do not serialize all suggestions and filter in React.
- Mark the entire assistant, terms, plan, and dispute-facts DOM with the existing `ym-hide-content`; mark text inputs with `ym-disable-keys`. Exact location and private advice need the same protection already applied to chat.
- The AI context contains only the current deal’s bounded recent messages, listing titles/snapshots, frozen points, current state, and current terms. Do not send email, phone, internal user IDs, other chats, wallet history, or moderation data. Refer to parties as roles rather than identities.
- Because users may type addresses or phone numbers into chat, disclose that assistant generation processes this deal conversation and provide a no-AI/manual path. Do not log prompts or raw provider responses to console; log request ID/hash, provider/model, latency, outcome, and error class only.
- Private suggestion text and exact plan location must not appear in generic push notification bodies or analytics properties.
- `metadataJson` on `DealEvent` uses per-event allowlists. Never place arbitrary command input into the event log.

## Failure, Fallback, and Rollback

### Runtime Fallback

| Failure | Required behavior |
|---------|-------------------|
| AI key missing, timeout, provider error, malformed JSON | Keep chat and all manual deal actions usable; return an unavailable/try-again suggestion state; deterministic next action remains visible. |
| AI response is stale after new message/terms version | Discard or mark stale; never overwrite the newer suggestion or shared terms. |
| Notification/push failure | Business transaction remains committed; durable in-app state and reminder row remain authoritative. |
| Reminder runner downtime | Due rows remain pending and are processed once the runner resumes; unique dedupe keys prevent a duplicate send. |
| Concurrent confirmation/edit | One OCC claim wins; loser receives current workspace and a “deal changed” response. |
| Analytics/Metrika failure | No effect on deal/chat; event log remains available for later aggregation. |

Do not create a fabricated deterministic terms draft when the model fails. The safe fallback is a manual card prefilled only from authoritative deal fields, with unknown place/time/method left explicitly missing.

### Deployment and Rollback

1. Take the existing consistent SQLite snapshot before schema/backfill deployment.
2. Use additive nullable columns/tables and an idempotent `scripts/migrate-deal-assistant.mjs`; do not rewrite/delete chat, deal, or financial history.
3. Backfill `assistantState` by mapping existing `status`, `stage`, and dispute fields. Append one `state_imported` event per deal with a deterministic idempotency key.
4. Deploy the new engine with `DEAL_ASSISTANT_ENABLED=false`, dual-write legacy mirrors, and verify production reads.
5. Enable manual state/terms UI first, then AI suggestions separately. A separate `DEAL_ASSISTANT_AI_ENABLED` switch should disable provider calls without disabling the deal workflow.
6. Rollback is code/flag rollback: old code continues reading the mirrored legacy fields and ignores additive tables. Do not attempt a destructive database down-migration while live deals exist.

## Recommended Project Structure

```text
lib/
├── ai-client.js                # OpenAI-compatible transport/capabilities
├── ai.js                       # existing listing analysis and matching
├── deal-machine.js             # states, guards, commands, escrow/event writes
├── deal-assistant.js           # prompt context, extraction, validation, staleness
├── deal-views.js               # participant-scoped server serializers
├── fulfillment.js              # normalized plan derivation/checkpoints
└── deal-reminders.js           # durable schedule and delivery claims
src/
├── server/actions.js           # existing facade; narrow actions delegate to lib
├── screen-chat.jsx             # embedded compact assistant workspace
├── screen-deal.jsx             # full terms/plan/progress/dispute UI
├── deal-assistant-ui.jsx       # shared cards/editor/primary action
├── App.jsx                     # authoritative response reconciliation
└── web-app.jsx                 # desktop composition of same workspace
prisma/
└── schema.prisma               # additive models/relations/indexes
scripts/
├── migrate-deal-assistant.mjs  # idempotent production backfill
└── process-deal-reminders.mjs  # scheduler-safe due reminder processor
```

Keep the facade in one file to match the current codebase, but move new business rules out of `actions.js`; it is already the entire application boundary and should not become the state machine itself.

## Build Order That Minimizes Risk

1. **Safety harness and escrow correctness.** Add disposable-SQLite integration tests for create/cancel/both-confirm/dispute races. Populate exact deal escrow refs and make completion/cancellation/dispute settlement atomic. Verify the runtime SQLite patch level. No assistant UI yet.
2. **Additive schema and backfill.** Add assistant state/revision, event log, terms, confirmations, plan, progress, suggestions, and reminders. Run snapshot + idempotent backfill with feature flags off.
3. **Deterministic engine and event dual-write.** Route existing create, confirm, cancel, and dispute actions through `lib/deal-machine.js`; preserve old UI and legacy mirrors. Add OCC/idempotency tests and concurrent double-submit tests.
4. **Manual vertical deal workflow.** Build shared stage, versioned terms, two confirmations, deterministic plan, handoff, receipt, completion, and problem handoff without AI. This proves all core requirements and fallback behavior.
5. **Chat integration and private storage.** Extend chat views/polling with role-filtered workspace data and private suggestion cards. Verify Metrika masking and mobile/desktop parity.
6. **AI enrichment.** Extract shared AI transport, add bounded context/extraction/clarification/message suggestions, schema validation, context hashes, and stale-result rejection. Provider failure tests must show unchanged chat/deal behavior.
7. **Durable reminders and notifications.** Add deduplicated schedule generation, catch-up processor, deployment scheduler wiring, and generic push templates. This phase needs an operational decision on how the host invokes the script.
8. **Funnel analytics and rollout.** Build event-log queries for conversions/durations, emit privacy-safe Metrika goals, separate test cohorts, then progressively enable manual assistant and AI flags.

The dependency order is deliberate: financial invariants → compatible state/event foundation → complete manual workflow → AI convenience → background operations/measurement. AI is late because it is not needed to validate the hardest business invariants.

## Scaling Considerations

| Scale | Architecture adjustment |
|-------|-------------------------|
| Current launch / under 1k active users | One monolith and SQLite WAL are appropriate. Bound chat context, use existing 4-second open-thread polling, keep transactions short, and batch reminder/event queries. |
| 1k–100k active users | First watch SQLite write contention, chat polling query rate, event/reminder indexes, AI spend, and WAL/checkpoint health. Move assistant generation and reminder delivery to a durable job worker before splitting the deal core. |
| Beyond single-host constraints | Move relational state to a server database and use an outbox-backed queue. Preserve the same command/event/provider interfaces; do not start by decomposing into microservices. |

The likely first bottleneck is serialized SQLite writes amplified by event/reminder records, not CPU in the state machine. The second is external AI latency/cost. Context hashing, deduplication, bounded recent messages, and explicit refresh keep both manageable.

## Anti-Patterns to Avoid

### Model-Driven State Transitions

**Mistake:** Ask the model for `nextState` or a tool call and execute it.
**Why wrong:** Nondeterministic output can bypass financial, confirmation, and dispute guards.
**Instead:** The model returns proposals only; explicit typed actions call the deterministic engine.

### Private Cards as System Messages

**Mistake:** Insert assistant suggestions into `Message` with `fromId=null`.
**Why wrong:** Existing messages are shared with all chat members and poll serializers have no recipient visibility rule.
**Instead:** Store suggestions separately with mandatory `recipientId` filtering.

### External Calls Inside Transactions

**Mistake:** Hold a SQLite transaction open while waiting for AI, push, analytics, or delivery.
**Why wrong:** WAL has one writer at a time; network latency increases lock contention and couples optional services to core writes.
**Instead:** Commit intent/state first, then perform idempotent side effects.

### State Plus Event Written Separately

**Mistake:** Update `Deal` and later append analytics/event history.
**Why wrong:** Crashes create a state with no funnel/audit record or an event for a transition that rolled back.
**Instead:** Snapshot, related invariant writes, and event append share one transaction.

### “Latest Held Escrow” Lookup

**Mistake:** Infer a deal’s financial record by user and timestamp.
**Why wrong:** Parallel deals can release/refund the wrong points.
**Instead:** Use the existing `Transaction.refType/refId` as an exact foreign-reference convention in every deal settlement path.

### In-Process-Only Reminders

**Mistake:** Store only `setTimeout` callbacks or last-run timestamps in memory.
**Why wrong:** Container restart/deploy loses them and may duplicate sends.
**Instead:** Persist due rows and let any runner claim them idempotently; the deployment scheduler is only a wake-up mechanism.

### Destructive State Rename on First Deploy

**Mistake:** Replace `stage/status` and rewrite all production deals in one irreversible deploy.
**Why wrong:** It removes the safe rollback path for live chats and escrow.
**Instead:** Add `assistantState`, backfill, dual-write legacy mirrors, and remove old fields only in a later milestone after observation.

## Research Flags for Planning

- **Escrow migration/backfill:** needs deal-by-deal reconciliation rules for existing `held` transactions that lack `refId`; never guess when multiple candidates exist. Ambiguous rows require a report/manual review.
- **Reminder scheduler:** repository has no scheduler. Choose and document the production wake-up mechanism before claiming REQ-011 complete; the durable table/processor is independent of that choice.
- **SQLite runtime:** verify the actual embedded SQLite library and WAL-reset fix, not merely Prisma’s package version.
- **Terms credit edits:** recommended MVP rule is immutable frozen credits. If product requires editing points inside terms, plan a separate atomic escrow-rebalance design and tests.
- **State semantics for handoff:** validate whether both parties always give and receive (including remote services). The normalized progress model supports this, but plan derivation must state which checkpoints are required per method.

## Sources

### Primary project evidence (HIGH confidence)

- `.planning/PROJECT.md` — milestone, constraints, rollback/privacy expectations.
- `.planning/REQUIREMENTS.md` — REQ-001–018 and explicit non-autonomy/failure requirements.
- `.planning/notes/deal-assistant-flow.md` — agreed states, shared/private boundary, terms and fulfillment flow.
- `.planning/codebase/ARCHITECTURE.md`, `STRUCTURE.md`, `INTEGRATIONS.md` — current layers, integration conventions, SQLite WAL, push and Metrika boundaries.
- `prisma/schema.prisma`, `src/server/actions.js`, `src/screen-chat.jsx`, `lib/ai.js`, `lib/prisma.js` — live schema and mutation/read paths inspected on 2026-08-14.

### Official documentation (HIGH confidence)

- Prisma transactions, idempotency, and optimistic concurrency control: https://www.prisma.io/docs/orm/prisma-client/queries/transactions
- Prisma Client `updateMany` and non-unique filters for OCC: https://www.prisma.io/docs/orm/reference/prisma-client-reference
- SQLite WAL concurrency, single-writer behavior, busy cases, checkpointing, and current WAL-reset notice: https://www.sqlite.org/wal.html
- SQLite transaction behavior: https://www.sqlite.org/lang_transaction.html
- SQLite busy timeout: https://www.sqlite.org/pragma.html#pragma_busy_timeout
- OpenAI Structured Outputs reference (use only as an optional provider capability; retain local validation for OpenAI-compatible providers): https://platform.openai.com/docs/api-reference/responses

---
*Architecture research for: Dayberry v1.1 Deal Assistant MVP*
*Researched: 2026-08-14*
