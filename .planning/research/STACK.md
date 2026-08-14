# Stack Research

**Domain:** Guided AI deal assistant inside an existing barter-marketplace monolith
**Researched:** 2026-08-14
**Confidence:** HIGH for application stack and persistence; MEDIUM for the in-process reminder runner because it depends on the current single-instance deployment remaining unchanged

## Recommendation in One Sentence

Keep the Next.js 15 / React 19 / Prisma 6 / SQLite WAL / Node 22 monolith and its direct OpenAI-compatible `fetch` adapter; add only `zod@^4.4.3`, then implement the deal state machine, versioned terms, reminders, and funnel events as ordinary server-side modules and Prisma models.

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose in this milestone | Why Recommended |
|------------|---------|---------------------------|-----------------|
| Next.js App Router + Server Actions | Existing 15.5.23 lockfile resolution | Authenticated assistant queries and explicit user-confirmed mutations | The browser-to-domain boundary already lives in `src/server/actions.js`. Extending it preserves authentication, authorization, serialization, and transaction conventions; a second REST/RPC framework would duplicate that boundary. |
| React | Existing 19.2.8 lockfile resolution | Private recommendation cards, shared stage/terms UI, confirmation controls | Existing local/root coordinator state is sufficient. The new UI is server-derived deal state plus transient form state, not a reason to introduce a global state store. |
| Prisma Client | Existing 6.19.3 lockfile resolution | Immutable terms versions, per-user confirmations, fulfillment plans, durable stage events, and due reminders | Prisma already owns every deal invariant. Interactive transactions, compound unique constraints, and version-token filtering cover dual confirmation and concurrent edits without a new workflow engine. |
| SQLite in WAL mode | Existing deployment | Authoritative deal state, assistant artifacts that must survive refresh, event timestamps, reminder claims | The expected MVP volume and single-host deployment fit the current database. WAL plus short transactions is adequate; keep external AI calls outside transactions. |
| Node.js | Existing 22.x container line | Native `fetch`, `AbortSignal.timeout`, timers, crypto, and built-in tests | Node already supplies the HTTP client, timeout control, scheduler primitive, and `node:test`; no Axios, cron library, or test framework is required. |
| Native `fetch` OpenAI-compatible adapter | Existing `lib/ai.js`; extend in place | Structured term extraction and private draft recommendations | Direct REST keeps `AI_BASE_URL` provider portability. Add a small structured-output request mode rather than coupling the application to one vendor SDK or API family. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Zod | `^4.4.3` | Runtime validation, TypeScript type inference when `.ts` modules are introduced, and built-in JSON Schema generation | Use at every untrusted boundary: server-action inputs, parsed model output, stored JSON payloads, and delivery-adapter DTOs. This is the only new runtime dependency recommended. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `node:test` + `node:assert/strict` | Transition-table, validation, reminder, and concurrency tests | Built into Node 22. Add an npm test script; keep tests in JavaScript unless the project deliberately adopts TypeScript later. Use a temporary SQLite database and serialize DB integration tests. |
| Prisma CLI | Schema application and generated client | Keep the existing Prisma 6 toolchain. Because production currently uses `prisma db push`, add an idempotent backfill script for existing deals and take a WAL-safe backup before rollout. Do not introduce a second migration tool. |
| Existing Yandex Metrika wrapper | Coarse external conversion goals | Continue `trackGoal` for best-effort external telemetry, but calculate authoritative funnel metrics from durable internal stage-event rows. Never attach chat text, prompts, extracted terms, addresses, or model output to Metrika params. |

## The One New Dependency: Zod 4

Zod is justified here because the same deal-terms contract must serve three jobs:

1. Validate browser/server-action input.
2. Validate the untrusted JSON returned by any model provider.
3. Produce JSON Schema for providers that support strict structured output.

Define schemas in a server-safe module such as `lib/deal-schemas.js` (or `.ts` only if the project intentionally begins a TypeScript migration). Zod works in plain JavaScript and ships TypeScript declarations, so this milestone does **not** require converting the existing JavaScript codebase.

Recommended schema split:

| Schema | Key rules |
|--------|-----------|
| `TermsExtractionSchema` | Strict object; item/service composition, integer credit top-up, handoff type, public meeting description or shipment parameters, ISO date/time or deadline, `missingFields`, and `conflicts`. |
| `TermsVersionInputSchema` | User-editable authoritative terms; stricter than extraction; IDs must resolve to the deal's lots and credit amount must match escrow rules. |
| `FulfillmentPlanInputSchema` | Provider-neutral `mode`, schedule/deadline, location/dispatch fields, and nullable `providerCode`/`providerPayload`; no Yandex/Ozon-specific fields in the core contract. |
| `AssistantSuggestionSchema` | Recipient-private suggestion kind, display text, optional proposed action, explanation, and confidence/source metadata; never an executable command. |
| `DealTransitionInputSchema` | Event plus expected version. Allowed transitions remain a deterministic application table, not model output. |

For the model-facing schema:

- Use `z.strictObject(...)`; Zod emits `additionalProperties: false` for ordinary strict object shapes.
- Make every field required and represent missing data with `null` or an empty bounded array. OpenAI strict structured output requires all fields to be required; nullable values emulate optional fields.
- Represent dates as bounded ISO strings, not `z.date()`. Zod documents that `z.date()`, transforms, maps, sets, and other constructs cannot be represented directly in JSON Schema.
- Generate the provider schema with `z.toJSONSchema(schema)` and keep a `TERMS_SCHEMA_VERSION` beside it. Persist the schema version with extraction metadata so prompt/schema changes are diagnosable.
- Always run `safeParse` after JSON parsing even when the provider claims strict conformance. The application supports multiple OpenAI-compatible providers, whose schema support is not uniform.
- If parsing or validation fails, discard the proposal and return the deterministic stage/next action plus the manual terms form. Never partially merge invalid model fields into authoritative deal state.

## Direct HTTP vs AI SDK Decision

**Decision: keep direct native `fetch`; do not add `openai`, Vercel AI SDK, LangChain, or an agent framework for v1.1.**

The official OpenAI JavaScript SDK offers convenient Zod parsing and treats the Responses API as its primary API, but Dayberry's existing contract is intentionally `AI_BASE_URL` plus OpenAI-compatible `/chat/completions`. Other providers and gateways frequently implement only a subset of OpenAI behavior. Adopting an SDK would therefore add vendor-shaped types and retry/transport behavior without eliminating the need for Dayberry's own capability checks and Zod validation.

Extend `lib/ai.js` behind a small provider capability setting:

| Mode | Request behavior | Fallback behavior |
|------|------------------|-------------------|
| `json_schema` | Send Chat Completions `response_format: { type: "json_schema", json_schema: { name, strict: true, schema } }` | On an explicit unsupported-feature response, log provider/model metadata without chat content and fall back to prompt JSON mode for that request. |
| `json_object` | Send `response_format: { type: "json_object" }` and a schema-focused prompt | Parse and validate with Zod; invalid output becomes manual/deterministic fallback. |
| `prompt` | Existing prompt-only JSON request for unknown compatibility | Parse and validate with Zod; never treat prompt compliance as trusted. |

Use an environment value such as `AI_STRUCTURED_OUTPUT_MODE=json_schema|json_object|prompt`, defaulting conservatively for non-OpenAI base URLs. Do not probe capabilities on every user request. Preserve the current timeout/abort and deterministic fallback path. A strict structured response improves extraction reliability, but it must never become a dependency of ordinary chat, terms editing, confirmation, fulfillment, disputes, or escrow completion.

Reconsider the official `openai` SDK only if the product deliberately standardizes on OpenAI's Responses API and drops generic Chat Completions compatibility. That is a provider strategy change, not an MVP prerequisite.

## Persistence and Concurrency Changes (No New Database)

Add relational Prisma models rather than a JSON document store:

| Model/change | Purpose | Required constraints/indexes |
|--------------|---------|------------------------------|
| `Deal.version`, `Deal.stageChangedAt` | Optimistic concurrency token and funnel timing | Increment `version` on every authoritative transition; update with `where: { id, version: expectedVersion }`. |
| `DealTermsVersion` | Immutable shared terms snapshot | Unique `(dealId, version)`; index `(dealId, createdAt)`; store normalized fields, not only an opaque blob. |
| `DealTermsConfirmation` | Independent participant confirmation of one exact version | Unique `(termsVersionId, userId)`; validate that the user is a deal participant. A new version creates no confirmations, which naturally resets both sides. |
| `FulfillmentPlan` | Provider-neutral handoff/shipment/digital plan | One current plan per deal or immutable versions with an explicit current pointer; keep provider fields nullable. |
| `DealReceipt` or equivalent participant status | Separate sent/handed-off/received confirmations | Unique `(dealId, userId, kind)`; timestamps are authoritative and written transactionally with stage changes. |
| `DealStageEvent` | Append-only internal funnel and duration source | Index `(dealId, createdAt)` and `(event, createdAt)`; include stage/event, actor role, source, and test/cohort flag—never chat or terms content. |
| `DealReminder` | Durable due work and retry state | Unique deterministic `dedupeKey`; index `(status, dueAt)`; fields for attempt count, claimed/sent timestamps, and last non-sensitive error code. |

Use short Prisma transactions to validate participant, expected deal version, current terms version, and allowed transition; write the mutation plus `DealStageEvent`; and commit. Call the AI provider before or after the transaction, never inside it. Treat an AI extraction as a proposal. Only an explicit user action may create a terms version, send a message, confirm terms/receipt, or open the existing dispute flow.

Prisma's documented optimistic-concurrency pattern uses a version field as a concurrency token. It is the right fit for the rare collision where both participants edit or confirm nearly simultaneously. Compound uniqueness provides the final database guard against duplicate confirmation and reminder delivery.

## Deterministic State Machine (No State-Machine Framework)

Implement a pure transition table in a focused server module such as `lib/deal-workflow.js`:

```text
current stage + domain event -> next stage + allowed actor + side effects to enqueue
```

The model may suggest wording or extract candidate terms, but it must never select or execute a transition. The transition module should expose pure functions for `canTransition`, `nextStage`, and `primaryNextAction`; server actions persist the result in a Prisma transaction. This is small enough to test exhaustively and does not justify XState, a rules engine, Temporal, or an agent planner.

Keep `Deal.stage` as the operational state and `DealStageEvent` as history. Do not infer the current stage by replaying chat messages or LLM summaries. Also do not replace the existing `Deal.status`, escrow, completion, review, or dispute behavior; the new stage machine orchestrates those established domain actions.

## Reminder Runner Without Redis or a Queue

The reminder schedule must be durable in SQLite; timers are only a wake-up mechanism. Under the current deployment contract—one long-lived, self-hosted Node process—start a small Node-runtime sweep from root `instrumentation.js` and guard it with an explicit production environment flag. Next.js 15 documents `register()` as running once when a new server instance starts, and instrumentation is stable in Next 15.

Recommended runner behavior:

1. Sweep once at startup, then every 60 seconds with a native Node timer; call `.unref()` so the interval does not prevent shutdown.
2. Query only indexed due rows in small batches.
3. Atomically claim each row with a conditional `updateMany` on status/claim timestamp.
4. Create the existing durable `Notification` using the reminder's unique dedupe key, then attempt Web Push through existing failure-tolerant delivery.
5. Mark sent or schedule bounded retry; on restart, reclaim expired claims and catch up overdue rows.
6. Make the processor callable directly so `node:test` can run it with an injected clock and so a future external scheduler can reuse it.

This runner recommendation is conditional. If Dayberry moves to multiple replicas, serverless execution, or a platform that can suspend the Node process, move the same idempotent sweep behind an external cron/scheduler. That future deployment change—not the v1.1 feature set—is the trigger for evaluating Redis/BullMQ or a managed workflow service.

## Analytics Without a New Analytics SDK

Record every required transition (`offer_sent`, `terms_draft`, `terms_confirmed`, `fulfillment_planned`, `handoff`, `completed`, `cancelled`, `disputed`) as an internal append-only event in the same transaction as the domain change. Use those rows for offer-to-terms conversion, terms-to-completion conversion, and stage duration queries.

Mirror only coarse event names and non-sensitive dimensions to the existing Yandex Metrika `reachGoal` wrapper. The official API permits an optional params object, but params must be restricted to a fixed allowlist such as presentation (`mobile|desktop`), stage, and test/cohort marker. Deal IDs, participant IDs, chat contents, prompt/model output, exact place/time, and dispute notes stay out of third-party analytics.

Do not add PostHog, Segment, Amplitude, OpenTelemetry, or a message bus for this milestone. The product questions are answerable with the internal event table plus the existing Metrika source/acquisition view.

## Installation

```bash
# The only new runtime package
npm install zod@^4.4.3

# No test dependency: add a package.json script similar to
# "test": "node --test --test-concurrency=1"
```

No other package installation is recommended.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Native `fetch` + Zod | Official `openai` JavaScript SDK | Use after an explicit decision to standardize on OpenAI and the Responses API; its official helpers can parse Zod-backed structured outputs. |
| Pure transition table | XState | Consider only if workflows become deeply nested/parallel, need machine visualization/interpreters, or are shared across several independently deployed clients. The MVP's linear two-party stages do not meet that threshold. |
| SQLite reminder table + in-process sweep | BullMQ + Redis | Use when workers must run independently across multiple replicas, throughput is high, or operational retry/queue visibility outweighs a new datastore. |
| Existing internal events + Yandex Metrika | PostHog/Segment/Amplitude | Use only when broader experimentation, session/product analytics, or multi-destination event routing becomes an approved product/operations requirement. |
| Prisma relational models | JSON document database | Use only if the application changes its primary persistence architecture. Versioning and two-party uniqueness are more naturally enforced relationally. |
| `node:test` | Vitest/Jest | Use if frontend component testing, browser-like DOM tooling, coverage/reporting plugins, or a larger test suite creates a concrete need. |
| Polling already used by chat | WebSockets/SSE | Use when measured latency/load shows polling is inadequate or live collaborative editing is added. Terms confirmation does not require a new realtime transport for MVP. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| OpenAI SDK as a mandatory dependency | Couples a deliberately provider-agnostic adapter to OpenAI-specific API types and primary Responses API conventions; generic providers still require custom compatibility handling. | Native `fetch`, explicit capability mode, Zod validation. |
| Vercel AI SDK, LangChain, agent frameworks | Streaming UI abstraction, tool orchestration, memory, and autonomous planning are not requirements. They enlarge the failure surface and can blur the "proposal only" safety boundary. | Focused functions in `lib/ai.js` returning validated suggestions. |
| XState or a rules-engine package | The required deal stages are small, deterministic, server-authoritative, and exhaustively testable as a transition table. | Pure module plus Prisma transaction and version token. |
| BullMQ, Redis, RabbitMQ, Kafka, Temporal | Adds infrastructure and operational state to a single-host, low-volume MVP. | Durable `DealReminder` rows plus an idempotent sweep. |
| A cron npm package | Scheduling syntax is not the hard problem; durable claims, idempotency, and catch-up are. | Native timer as wake-up, SQLite as schedule. |
| New analytics/CDP SDK | Creates another privacy and taxonomy surface while existing Metrika and internal admin funnel already exist. | Append-only `DealStageEvent` plus allowlisted `trackGoal`. |
| Separate Python AI service | Splits deployment, schemas, authentication, privacy controls, and fallback behavior without requiring Python-only capabilities. | Keep AI orchestration in Node/JavaScript. |
| Vector database or RAG stack | Terms extraction uses the current deal and bounded chat context; no retrieval corpus is needed. | Bounded context assembly and existing AI adapter. |
| Autonomous tools/function execution | Directly conflicts with REQ-004 and REQ-015 and increases escrow/dispute risk. | Return display-only proposed actions; execute only through authenticated explicit server actions. |
| Delivery-provider SDKs | Delivery integration is out of scope and would prematurely shape the core fulfillment model around one vendor. | Provider-neutral DTO and nullable adapter boundary. |
| Full TypeScript migration | High churn unrelated to validating the deal-assistant hypothesis. | Zod schemas now; adopt `.ts` incrementally only under a separate decision. |
| New client state store | Deal state is authoritative on the server and existing coordinator/local state already handles refresh and optimistic UI. | Existing React state and serialized view models. |

## Stack Patterns by Variant

**Current self-hosted single Node process:**

- Use the SQLite reminder table and guarded startup sweep.
- Keep interval work bounded and idempotent.
- Because the database and push notification writer share the process/volume, no queue service is needed.

**Unknown or partially compatible AI provider:**

- Configure `json_object` or `prompt` mode.
- Parse then `safeParse`; return deterministic/manual fallback on any error.
- Do not silently assume that an OpenAI-compatible endpoint supports strict JSON Schema.

**Provider explicitly supports Chat Completions strict JSON Schema:**

- Send the Zod-derived JSON Schema with `strict: true`.
- Still validate the response locally and detect refusal/incomplete output.
- Keep all business transitions outside the model call.

**Future multiple application replicas or suspended/serverless runtime:**

- Disable the in-process timer.
- Invoke the same reminder sweep from a platform scheduler, then evaluate a queue only if concurrency/throughput demands it.

**Future delivery integration:**

- Add a `DeliveryProvider` adapter behind the provider-neutral fulfillment DTO.
- Add a provider SDK only for the selected provider and only inside its adapter; never leak provider fields into the core terms/state machine.

## Version Compatibility

| Package / API | Compatible With | Notes |
|---------------|-----------------|-------|
| `zod@^4.4.3` | Node 22; JavaScript and TypeScript | Zod 4 is stable, has zero external dependencies, and provides built-in `z.toJSONSchema`. Pin through the npm lockfile. |
| Zod JSON Schema | Strict structured-output providers | Keep model-facing schemas within the provider-supported JSON Schema subset; use nullable required fields and no `z.date()`/transforms. |
| Next.js instrumentation | Next.js 15.x Node runtime | `instrumentation.js` is stable in Next 15 and `register()` runs once per server instance. Guard against Edge/build contexts and enable the reminder loop explicitly. |
| Prisma OCC pattern | Existing Prisma 6.19.3 | Prisma supports filtering an update by a non-unique version token in current versions. Check affected-row count and report a stale-version conflict. |
| Compound unique constraints | Prisma 6 + SQLite | Use for `(dealId, version)`, `(termsVersionId, userId)`, and reminder dedupe keys. |
| `node:test` | Node 22.x | Built-in runner; no dev dependency. Use dependency-injected clocks for domain logic and serialized temporary-SQLite integration tests. |
| Chat Completions `response_format: json_schema` | Provider/model capability dependent | Official OpenAI models support strict structured output, but "OpenAI-compatible" does not guarantee it. Make capability explicit. |

## Implementation Order Implied by the Stack

1. Add Zod schemas and the pure transition table; test them with `node:test`.
2. Add Prisma models/indexes and an idempotent production backfill for existing deals.
3. Add transactional server actions for version creation, confirmation, fulfillment, receipt, and event recording.
4. Extend `lib/ai.js` with validated structured extraction and conservative capability modes; wire manual fallback first.
5. Add the durable reminder sweep using existing notification/push services.
6. Mirror allowlisted funnel goals to Metrika and expose internal conversion/duration queries.

This order makes the non-AI deal lifecycle complete and testable before adding probabilistic assistance, satisfying the requirement that an AI outage cannot block the core workflow.

## Sources

- [Zod package documentation](https://zod.dev/packages/zod) — Zod 4 stable API, `safeParse`, JavaScript/TypeScript support (HIGH).
- [Zod JSON Schema documentation](https://zod.dev/json-schema) — built-in `z.toJSONSchema`, strict object output, target selection, and unrepresentable schema types (HIGH).
- [npm: zod](https://www.npmjs.com/package/zod) — current stable version `4.4.3`, zero dependencies, JavaScript/TypeScript support (HIGH; checked 2026-08-14).
- [OpenAI structured outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs) — Chat Completions `response_format`, `strict: true`, required-field rule, supported JSON Schema subset, refusal handling (HIGH for OpenAI; provider compatibility remains provider-specific).
- [Official OpenAI JavaScript SDK repository](https://github.com/openai/openai-node) and [structured-output helpers](https://github.com/openai/openai-node/blob/master/helpers.md) — SDK primary API direction and Zod parsing helpers, used to assess but reject an SDK dependency for this provider-agnostic milestone (HIGH).
- [Prisma transactions documentation](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions) — atomic transactions, idempotency, and optimistic concurrency with a version field (HIGH).
- [Prisma compound IDs and unique constraints](https://docs.prisma.io/docs/orm/prisma-client/special-fields-and-types/working-with-composite-ids-and-constraints) — compound uniqueness and unique query/update patterns (HIGH).
- [Next.js 15 instrumentation file convention](https://nextjs.org/docs/15/app/api-reference/file-conventions/instrumentation) — stable `register()` server-instance startup hook and runtime guard (HIGH for startup semantics; MEDIUM for the project-specific reminder-loop choice).
- [Node.js 22 test runner](https://nodejs.org/download/release/latest-v22.x/docs/api/test.html) — built-in test invocation and mocking facilities (HIGH).
- [Node.js timers](https://nodejs.org/api/timers.html) — native intervals and `timeout.unref()` semantics (HIGH).
- [Yandex Metrika `reachGoal`](https://yandex.com/support/metrica/en/objects/reachgoal) — JavaScript goal event and optional params object (HIGH).
- Existing project evidence: `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, `.planning/codebase/STACK.md`, `.planning/codebase/ARCHITECTURE.md`, `package.json`, `lib/ai.js`, and `prisma/schema.prisma` (HIGH).

---
*Stack research for: Dayberry v1.1 deal assistant MVP*
*Researched: 2026-08-14*
