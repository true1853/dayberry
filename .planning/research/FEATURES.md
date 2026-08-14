# Feature Research

**Domain:** Guided, two-sided barter transaction assistant embedded in marketplace chat
**Project:** Dayberry v1.1 deal assistant MVP
**Researched:** 2026-08-14
**Confidence:** MEDIUM — comparable marketplace behavior is documented in current first-party sources; Dayberry-specific prioritization is a product hypothesis that still needs real-user validation.

## Research Conclusion

The MVP should not be a general-purpose chatbot. It should be a deterministic deal workflow with a narrow AI layer: the workflow owns stages, permissions, confirmations, escrow consequences, reminders, and completion; AI privately drafts language, extracts candidate terms, detects missing or conflicting fields, and explains the next action. Users must always be able to ignore the assistant and continue through ordinary chat and existing deal controls.

Comparable marketplaces separate informal conversation from consequential transaction state. Airbnb keeps messages beside a structured reservation and applies a change only when the counterparty accepts; otherwise the existing reservation remains unchanged. Upwork formalizes deliverables, amount, and deadline in milestones, requires review before escrow release, and routes unsatisfied work into change or dispute paths. eBay lets participants arrange local pickup in Messages but uses a separate confirmation mechanism as proof of handoff. Dayberry should use the same separation: chat is evidence and negotiation space; the shared terms revision is the current proposed agreement; explicit participant actions are the only source of truth.

Dayberry's differentiator is the bridge between these layers: it can turn a casual barter conversation into a concise, shared, versioned agreement without making users complete a long form. The assistant should ask only for a blocking gap or conflict, not conduct a second interview after the users have already discussed the detail.

## Feature Landscape

### Table Stakes (Users Expect These)

These are non-negotiable for a trustworthy guided transaction flow. Missing them makes the assistant confusing or unsafe even if the AI output is good.

| Feature | Concrete expected behavior | Complexity | Existing-system dependency / notes |
|---------|----------------------------|------------|------------------------------------|
| Automatic availability after offer | When an offer creates or attaches to a direct deal chat, the assistant appears there immediately, explains that it only suggests, and points to the current next step. It must not require starting a separate bot conversation. | LOW | Trigger from successful deal/offer creation and existing `Chat.dealId`; render inside `src/screen-chat.jsx` and desktop chat without creating a fake user message. |
| Shared stage, private advice | Both participants see the same authoritative deal stage and shared terms state. Draft replies, coaching, and personal reminders are visible only to the intended participant. Every private card is visibly labeled as private. | HIGH | Current `Message` records are shared and have no audience field. Private assistant output needs a separate per-user suggestion/read model or equivalent role-filtered view; never store it as an ordinary shared message with `fromId = null`. |
| One primary next action | Each participant sees one dominant action derived from role and authoritative deal state, such as “Answer the offer,” “Clarify the meeting place,” “Review terms,” or “Confirm receipt.” Secondary options remain available but visually subordinate. | MEDIUM | Requires a centralized transition/eligibility function over deal, latest terms revision, plan, confirmations, dispute, and current user. The LLM may phrase the explanation but must not choose legal state transitions. |
| Ordinary chat remains primary | Participants can send free-form messages at every non-frozen stage. Assistant cards sit in the conversation rhythm and can be dismissed or ignored; they do not replace the composer or force a wizard. | MEDIUM | Must coexist with current optimistic send and polling in `src/screen-chat.jsx`. Assistant event insertion must be stable and deduplicated when updates poll. |
| Preview before send or action | A generated reply is editable and requires a separate Send tap. A suggested condition change opens a review screen/card and requires Save/Propose. Confirmation, receipt, cancellation, and dispute actions show their concrete consequence before the final tap. | MEDIUM | Reuse existing authenticated server actions, but add explicit proposal/confirmation actions. Never let an AI completion call invoke `sendMessageAction` or a deal mutation. |
| Graceful manual fallback | If inference is unavailable, slow, malformed, or low-confidence, chat, manual terms editing, confirmations, handoff, completion, and the issue path continue to work. The UI says what failed and offers the manual action. | MEDIUM | Existing AI provider fallback is designed for listing analysis, not consequential deal terms. Deal flow needs a non-AI deterministic path; failed AI must not advance state or poison the shared card. |
| Complete, compact terms schema | The proposed agreement names what each side gives, point top-up, fulfillment method (`meetup`, `shipment`, `remote_service`), place or shipping parameters, and date/time or deadline. Each field shows `agreed`, `missing`, or `conflicting`, with the source text available only as context, not authority. | HIGH | Depends on the two lots and existing `Deal.credits`; needs durable terms revisions rather than overloading free-form `Message.text` or mutable `Deal.stage`. |
| Explicit independent consent | Each participant reviews the exact same revision and independently confirms it. The UI shows “you confirmed / waiting for …” and never treats silence, reading, or a positive-sounding chat message as consent. | HIGH | Requires confirmation rows or timestamps keyed by both `revisionId` and `userId`; current two booleans on `Deal` are completion confirmations and must not be reused for terms consent. |
| Immutable confirmed revision and safe changes | Once both participants confirm, that revision becomes read-only. Any edit creates a new revision, shows what changed, and clears both confirmations. Until both confirm the new revision, the last fully confirmed revision remains identifiable in history. | HIGH | Requires server-side optimistic concurrency/version checks. Airbnb’s change-request pattern supports keeping the current agreement unchanged when a change is declined or unanswered. |
| Fulfillment plan after terms | Double confirmation produces a shared plan specialized for meetup, shipment, or remote service. It includes place/shipping detail and scheduled time or deadline, plus role-specific checklist items. | HIGH | Build from the confirmed revision; do not duplicate or silently diverge from it. Model a provider-neutral fulfillment method now, but no carrier API calls in MVP. |
| State/deadline-driven reminders | Notify only when the other participant can act, an agreed time approaches, a deadline is missed, or a deal has remained in one actionable state beyond a threshold. Open-chat cards and push/in-app notifications use the same event and are deduplicated. | MEDIUM | Reuse durable `Notification` + best-effort push. Needs idempotent reminder keys and a scheduler/runtime mechanism; AI text is optional and must not decide timing. |
| Participant-specific handoff and receipt confirmation | Each person records their own irreversible facts. For a meetup, each confirms the exchange after inspection; for shipment/service, the model must distinguish “I handed/sent/delivered” from “I received/accepted.” The UI explains escrow and completion effects before confirmation. | HIGH | Existing `Deal.initiatorConfirmed` / `partnerConfirmed` may cover one symmetric completion acknowledgement only. Shipping and remote service likely require directional timestamps/statuses rather than two ambiguous booleans. |
| Visible “There is a problem” path | During fulfillment, either participant can pause normal completion, privately review a structured issue summary, attach relevant facts, and explicitly submit into the existing dispute workflow. Opening the composer is not the same as filing a dispute. | MEDIUM | Reuse current deal dispute and escrow freeze behavior; do not create a second case-management system. Current listing `Report` is not an appropriate substitute for a deal dispute. |
| Completion and review handoff | After the required participant confirmations, existing escrow settlement completes exactly once and both participants receive a clear success state and review action. | MEDIUM | Must call the existing transactional completion path rather than duplicate balance updates, lot status changes, deal counts, or review eligibility. |
| Privacy-safe funnel instrumentation | Emit stage transitions and elapsed time using deal/revision IDs, actor role, method, and outcome — never message content, extracted text, exact place/address, or generated suggestion text. | MEDIUM | Extend existing Yandex Metrika goal/event pattern and retain chat privacy suppression. Server-side transition timestamps are the reliable source for funnel durations. |

### Differentiators (Competitive Advantage)

These features express the core hypothesis: users need help converting an awkward barter chat into a completed exchange. They should be validated rather than expanded indiscriminately.

| Feature | Value proposition | Complexity | Existing-system dependency / notes |
|---------|-------------------|------------|------------------------------------|
| Chat-to-terms extraction | Reduces the work of turning casual statements into item, points, method, place, and time fields. Users review a prepared proposal instead of filling a second form. | HIGH | AI reads only the authorized deal context, returns strict structured output, and writes a *candidate* revision through validated server code. Never copy an extraction directly into confirmed state. |
| Gap/conflict-only questioning | Respects what users already said. The assistant identifies the single highest-priority missing or contradictory field and asks one focused question, then re-evaluates. | HIGH | Requires field-level provenance/confidence and comparison against current offer/deal facts. Must avoid repetitive questions after manual edits or explicit dismissal. |
| Versioned mutual agreement inside chat | Gives barter participants a lightweight “same page” moment without a legalistic contract screen. A visible version number, change summary, and two confirmations reduce “that is not what we agreed” ambiguity. | HIGH | Requires immutable revisions, confirmation reset, and a shared timeline event adjacent to chat. This is stricter than ordinary marketplace messages and is a meaningful trust differentiator. |
| Role- and stage-aware private coaching | Helps one side start politely, respond to a concern, ask for a missing detail, or prepare safely for handoff without exposing that coaching to the counterparty. | HIGH | Needs participant-scoped storage/serialization and least-privilege context assembly. It must not reveal private profile, moderation, or assistant output from the other participant. |
| Single adaptive next step | Reduces cognitive load in a multi-stage exchange: the product, not the user, translates state into the most useful immediate action. | MEDIUM | Deterministic eligibility engine first; AI may make wording warmer. Measure action acceptance, rejection, and time-to-next-stage to see whether guidance helps. |
| Symmetric barter fulfillment | Unlike buyer/seller flows, each participant is both giver and receiver. Modeling both directions explicitly supports item-for-item plus points, shipment in two directions, and remote services without pretending one side is merely the seller. | HIGH | Fulfillment status must be participant- and direction-aware; existing point escrow and deal completion remain authoritative. |
| Assistant that disappears when unnecessary | If terms are complete and unconflicted, the assistant offers review instead of more conversation. If a user repeatedly dismisses suggestions, it quiets down while leaving the next action accessible. | MEDIUM | Requires suggestion lifecycle/feedback state; improves trust and controls notification fatigue. Google PAIR recommends user control and a manual route when AI is wrong or fails. |

### Anti-Features (Deliberately Avoid in MVP)

| Anti-feature | Why it seems attractive | Why it is problematic | MVP alternative |
|--------------|-------------------------|-----------------------|-----------------|
| Autonomous negotiation or sending | Appears to remove all communication effort. | Can misrepresent a person, leak private strategy, commit unwanted language, and erode trust. It also violates the project’s explicit control boundary. | Editable suggestion plus explicit Send; consequential actions always require a separate human confirmation. |
| LLM-controlled deal state machine | Promises flexible interpretation of any conversation. | Probabilistic output cannot safely own escrow, consent, deadlines, or completion; retries could produce different transitions. | Deterministic state and permission engine; AI only extracts, drafts, explains, and flags. |
| Treating extracted text as agreement | Makes the flow look magically instant. | Extraction can be wrong; conversational intent is ambiguous; one participant may not share the interpretation. | Candidate revision → both participants review → two explicit confirmations. |
| Silent in-place editing of confirmed terms | Feels simpler than version history. | Destroys evidence of what was accepted and can leave one participant apparently bound to a changed condition. | Immutable revisions, visible diff, both confirmations reset on every material edit. |
| Auto-confirming after inactivity | Can accelerate completion and escrow release. | Silence is not consent, especially for physical goods, services, or disputes. Upwork’s timed auto-release is tied to a formal funded milestone and mature policy; copying it into an early barter MVP is unsafe. | Remind, then leave pending; provide cancel/problem routes and admin escalation under existing rules. |
| A separate open-ended “AI chat” | Easy to demo and broad in scope. | Adds a third conversation, competes with the participant thread, invites unsupported requests, and obscures who sees what. | Compact private assistant cards and quick replies embedded in the actual deal chat. |
| Full pre-negotiation questionnaire | Guarantees structured fields from the outset. | Recreates form friction, repeats details already in the offer/chat, and undermines the “light conversation” goal. | Extract first; ask one blocking gap or conflict at a time; always permit manual card editing. |
| Multiple equally prominent next actions | Looks flexible and comprehensive. | Recreates the uncertainty the assistant is meant to solve and makes the funnel hard to interpret. | One primary action; secondary chat, terms, cancel, and problem actions remain available but subordinate. |
| Generic assistant messages visible to both | Reuses the current `Message` model cheaply. | Leaks private coaching and makes generated text look like a shared fact or participant statement. | Separate typed shared system events from participant-scoped assistant suggestions. |
| Reminder spam or AI-chosen cadence | May increase short-term clicks. | Repetition creates notification fatigue and can pressure users when the other side, not they, must act. | State-aware, idempotent reminders with quiet periods and no duplicate push/chat card. |
| Exact address revealed during negotiation | Makes meetup planning direct. | Violates the project’s geo-privacy constraint and exposes sensitive location before mutual agreement. | General area first; exact place only in the confirmed shared terms when users explicitly provide it. |
| Delivery-provider integration | Creates an impressive end-to-end shipping demo. | Adds carrier accounts, pricing, labels, tracking, failures, refunds, and provider-specific data before the core guided-deal hypothesis is validated. | Provider-neutral `shipment` plan and manual tracking/reference field; integrate providers after validation. |
| Handoff QR/codes in first MVP | eBay shows that proof-of-pickup can protect transactions. | Code issuance, offline recovery, fraud rules, proxy pickup, and support policy are a separate trust project; Dayberry first needs evidence that users reach handoff. | Independent participant confirmation plus clear consequence copy; research stronger proof if disputes or false confirmations appear. |
| Rebuilding escrow, completion, reviews, or disputes | A new assistant flow may tempt a clean rewrite. | Creates two sources of truth and puts production balances/deals at risk. | Add orchestration and structured records around existing transactional paths. |
| Legal-contract styling or e-signature | Versioned agreement can resemble a contract. | Raises perceived stakes and abandonment for a casual household exchange without adding meaningful legal certainty. | Plain-language “terms of this exchange,” concise version history, and clear mutual confirmation. |
| Sentiment scoring, persuasion, or “winning” negotiation | Sounds like advanced AI coaching. | Optimizes against the counterparty, can manipulate users, and distracts from successful mutual completion. | Neutral clarity, missing-term detection, safety prompts, and respectful reply drafts. |
| Multi-party/circular-chain assistant in v1.1 | Reuses Dayberry’s unique three-way exchange capability. | Participant-scoped advice, N-way consent, directional handoffs, and partial failure multiply complexity before the two-party flow is validated. | Launch assistant only for direct two-party deal chats; adapt to chains after stable state/terms primitives exist. |

## Expected User Behavior by Stage

| Stage | Shared state both users see | Private assistant behavior | Primary action | Exit criteria |
|-------|-----------------------------|----------------------------|----------------|---------------|
| `offer_sent` | Offer composition, points, who must respond | Recipient: concise accept/discuss prompt; sender: optional first-message draft | Recipient responds / sender starts discussion | At least one participant engages or deal is cancelled |
| `negotiating` | “Discussing details”; no false progress claims | Suggest a reply or the one highest-priority missing/conflicting term | Clarify that term | Enough consistent information exists for a candidate revision |
| `terms_draft` | Shared candidate card with incomplete/conflict markers | Explain only the participant’s relevant gap; permit manual edit | Complete/check the card | Required fields are syntactically complete |
| `terms_pending` | Exact revision, version, change summary, two confirmation states | Explain consequences and flag any mismatch with original offer | Confirm or propose change | Both confirm the same revision |
| `terms_confirmed` | Locked revision and confirmation timestamps | No further negotiation prompt unless a user requests change | Build/review fulfillment plan | Plan is created from confirmed revision |
| `fulfillment_planned` | Method, place/parameters, scheduled time/deadline, shared progress | Personal checklist and timely reminder | Execute the user’s next handoff step | Fulfillment begins or a problem is raised |
| `handoff` / `awaiting_confirmation` | Directional shared progress, never private speculation | Explain what the user is about to assert and its escrow effect | Mark handed off / received | Required participant facts are recorded |
| `completed` | Completion and escrow outcome | Optional review wording help | Leave a review | Review submitted or dismissed |
| `disputed` | Deal paused and dispute status | Private fact collection before explicit submission; thereafter status explanation only | Continue existing issue flow | Existing dispute resolution owns outcome |
| `cancelled` | Cancellation and any escrow reversal outcome | No revival pressure; explain how to make a new offer if appropriate | Return to listing/chat | Terminal |

## Feature Dependencies

```text
Existing offer creation + direct Deal/Chat linkage
    └──requires──> Authoritative deal state/transition engine
                       ├──requires──> Role-based next-action resolver
                       ├──requires──> Privacy-aware assistant projections
                       └──requires──> Transition analytics

Chat context + offer facts
    └──enables──> Candidate term extraction
                     └──requires──> Validated terms schema + field provenance
                                         └──requires──> Immutable terms revisions
                                                              └──requires──> Per-user, per-revision confirmations
                                                                                   └──enables──> Fulfillment plan

Confirmed fulfillment plan
    ├──enables──> Deadline/state reminders
    ├──enables──> Directional handoff/receipt confirmations
    └──enables──> Structured issue context

Directional completion facts
    └──requires──> Existing escrow-safe completion transaction
                       └──enables──> Existing reviews

AI unavailability ──must not conflict with──> Manual chat, manual terms, confirmations, handoff, dispute
Autonomous AI actions ──conflicts with──> Explicit participant control
```

### Dependency Notes

- **The deal state engine must precede assistant UX.** A shared stage and next action cannot be inferred independently on each client or regenerated by an LLM. Transitions must validate actor, current state, terms revision, dispute status, and completion facts in one server transaction.
- **Privacy-aware projections must precede private recommendations.** The current shared `Message` schema is insufficient. The server must serialize the same shared deal state to both participants while filtering suggestions by recipient.
- **Terms revisions must precede confirmation.** Confirmation belongs to a specific immutable revision. Two mutable booleans on `Deal` cannot prove which text a participant accepted.
- **Field provenance improves extraction correction.** Store enough non-public metadata to identify whether a value came from the offer, a message, or a manual edit and which input caused a conflict. Do not expose hidden messages or model reasoning to the counterparty.
- **Economic changes have an escrow dependency.** `Deal.credits` already participates in held point transactions. If v1.1 allows a revised point amount, accepting the new revision must atomically validate balance and adjust the existing held transaction. If that cannot be implemented safely in the MVP, item composition and points must be explicitly immutable after the offer, with cancel-and-new-offer as the alternative; logistics can still be revised.
- **Fulfillment semantics must be decided before UI labels.** For symmetric meetup barter, one acknowledgement per person may represent completed exchange. For shipment or remote service, each participant can both give and receive, requiring directional `handedOffAt` and `receivedAt` facts. Ambiguous reuse of the existing two completion booleans will block later delivery integrations.
- **Reminder delivery depends on durable timestamps.** In-app and push notifications already exist, but reminders need a runner, idempotency key, quiet period, and an “actor currently able to act” check. Client timers alone will miss closed-app users and duplicate across devices.
- **The issue flow depends on existing dispute freeze/escrow behavior.** The assistant collects and previews structured facts; the existing dispute action performs the authoritative state change. AI must never adjudicate or recommend an outcome.
- **Analytics depends on server transitions, not chat text.** Emit `offer_sent`, `terms_draft`, `terms_confirmed`, `fulfillment_planned`, `handoff`, `completed`, `cancelled`, and `disputed` from authoritative mutations. This supports conversion and elapsed-time metrics without capturing conversation content.

## MVP Decision Boundary

Before implementation, resolve one product/technical question: **Can participants change the exchanged lots or point top-up after the offer is created?**

- Recommended MVP boundary: logistics fields (method, place/parameters, time/deadline) are editable through new revisions. Economic fields (the two lots and points) are displayed from the original offer and can only change through a transactional “revise offer” operation that revalidates ownership, availability, balance, and escrow.
- If a safe transactional revise-offer operation is not included, economic fields must be visibly read-only and the assistant should propose “Cancel and make a new offer,” not pretend a chat agreement changed escrow.
- Do not silently allow a terms card to disagree with `Deal.myLotId`, `Deal.lotId`, or `Deal.credits`.

## MVP Definition

### Launch With (v1.1)

- [ ] **Deterministic direct-deal stages and one role-aware next action** — foundation for every assistant recommendation and the measurable funnel.
- [ ] **Assistant activation inside the existing deal chat** — no separate bot surface; concise onboarding explains privacy and human control.
- [ ] **Strictly private editable reply/action suggestions** — validates whether coaching reduces awkwardness without impersonation.
- [ ] **Manual fallback for every AI-supported task** — preserves production chat and deal availability when inference fails.
- [ ] **Validated candidate extraction for the six required term groups** — items, points, method, place/shipping parameters, time/deadline, with explicit missing/conflict markers.
- [ ] **One-gap-at-a-time clarification and manual card editing** — the core low-friction UX differentiator.
- [ ] **Shared immutable terms revisions with two independent confirmations** — essential trust boundary; edits create a new revision and clear both confirmations.
- [ ] **Provider-neutral meetup/shipment/remote-service plan** — supports real barter behavior without carrier integration.
- [ ] **State/deadline reminders through existing in-app/push infrastructure** — limited, idempotent, and only for an actionable participant.
- [ ] **Separate human confirmation of handoff/receipt with consequence copy** — feeds the current escrow-safe completion path.
- [ ] **Structured “There is a problem” handoff to the existing dispute flow** — prevents happy-path guidance from becoming a dead end.
- [ ] **Privacy-safe transition funnel and durations** — validates offer→terms, terms→completion, and time between stages without logging content.

### Add After Validation (v1.x)

- [ ] **Suggestion feedback and adaptive quieting** — add when enough real assistant interactions exist to measure repeated rejection/dismissal.
- [ ] **Stronger handoff proof such as pickup codes** — add only if meetup disputes, false confirmations, or support burden justify it.
- [ ] **Manual shipment tracking/reference and status parsing** — add when real deals use shipment often enough to establish required fields.
- [ ] **Reschedule/change shortcuts with visible revision diff** — add if plan changes are common and chat-based editing causes abandonment.
- [ ] **Participant-controlled reminder preferences** — add if notification opt-out, snooze, or fatigue becomes material.
- [ ] **Assistant support for three-party chains** — add only after two-party terms, privacy projections, directional handoff, and N-way consent are proven stable.
- [ ] **Localized safety checklist by handoff method** — add after observing the actual incident and support patterns of the regional launch.

### Future Consideration (v2+)

- [ ] **Pluggable Yandex/Ozon/other delivery providers** — requires provider selection, quotes, labels, tracking, cancellation/refund policy, webhooks, and operational support.
- [ ] **Calendar/map integrations** — useful only after meeting scheduling volume and permission/privacy expectations are understood.
- [ ] **Advanced dispute evidence packaging** — develop with moderators based on real case taxonomy; do not let AI judge credibility.
- [ ] **Cross-deal personal assistant memory** — high privacy and consent burden; unnecessary for validating guided completion.
- [ ] **Any bounded automation** — consider only for reversible, low-risk actions after explicit opt-in and evidence that review burden exceeds value; never for consent, messages, receipt, escrow, or disputes by default.

## Feature Prioritization Matrix

| Feature | User value | Implementation cost | Priority |
|---------|------------|---------------------|----------|
| Authoritative stages + next-action resolver | HIGH | HIGH | P1 |
| Shared stage/private advice projection | HIGH | HIGH | P1 |
| Chat-native assistant activation | HIGH | MEDIUM | P1 |
| Explicit preview/approval of suggestions | HIGH | MEDIUM | P1 |
| Manual non-AI fallback | HIGH | MEDIUM | P1 |
| Structured terms schema and extraction | HIGH | HIGH | P1 |
| Gap/conflict-only clarification | HIGH | HIGH | P1 |
| Versioned card + dual confirmation | HIGH | HIGH | P1 |
| Provider-neutral fulfillment plan | HIGH | HIGH | P1 |
| Deterministic reminders | MEDIUM | MEDIUM | P1 |
| Directional handoff/receipt facts | HIGH | HIGH | P1 |
| Existing completion/review integration | HIGH | MEDIUM | P1 |
| Existing dispute integration | HIGH | MEDIUM | P1 |
| Privacy-safe funnel analytics | HIGH | MEDIUM | P1 |
| Economic terms revision with escrow adjustment | MEDIUM | HIGH | P1 only if economic edits are allowed; otherwise defer explicitly |
| Suggestion feedback/quieting | MEDIUM | MEDIUM | P2 |
| Pickup proof code | MEDIUM | HIGH | P2 after fraud/dispute signal |
| Shipment tracking reference | MEDIUM | MEDIUM | P2 after shipment usage signal |
| Three-party chain assistant | MEDIUM | HIGH | P3 |
| Carrier integrations | HIGH later | HIGH | P3 |
| Calendar/map integrations | LOW before validation | HIGH | P3 |

**Priority key:**

- **P1:** Required to validate a safe guided-deal MVP.
- **P2:** Add after a measured behavior or support problem supplies a trigger.
- **P3:** Future scope; exclude from the milestone roadmap except as an architectural constraint.

## Comparable Product Patterns

| Behavior | Airbnb | Upwork | eBay local pickup | Dayberry implication |
|----------|--------|--------|-------------------|----------------------|
| Conversation beside transaction | Every reservation has an organized message thread; read receipts support transparency. | Contract workroom actions are reachable beside Messages. | Participants arrange time/place and keep the agreement in Messages. | Keep assistant and structured cards in the deal chat, but distinguish conversation from authoritative state. |
| Material change requires response | A submitted reservation change applies only if the counterparty accepts; a decline/no response leaves the current reservation unchanged. | A freelancer may request milestone changes, but the client accepts or declines; they cannot silently edit active terms. | Cancellation after inspection is a request the seller can approve. | New revision remains pending until both accept; retain the last confirmed revision as historical truth. |
| Structured scope | Reservation details define dates, guests, and price. | Milestones formalize deliverable, due date, and amount before work begins. | Order details define item and pickup option; messages fill in meetup detail. | Terms card should contain only fields needed to execute the barter, not a verbose transcript summary. |
| Review before irreversible consequence | Parties explicitly accept a reservation change. | Client reviews submitted work before escrow release or requests changes/dispute. | Buyer inspects the item before sharing the pickup code. | Explain consequences immediately before terms, handoff, receipt, and problem confirmations. |
| Evidence/status after handoff | Reservation and issue records stay attached to the booking. | Submission/review status and workroom create a structured record. | QR/6-digit code updates order to Picked up and acts as proof. | Start with independent participant facts and immutable history; only add stronger pickup proof when data shows need. |
| Reminder and issue path | Reservation reminders are a distinct notification category; issues are documented, messaged to the host, then escalated for help. | Notifications prompt milestone review; revisions/refunds/disputes are explicit branches. | Messages support rescheduling; cancellation/protection routes handle unsuccessful pickup. | Remind the participant who can act, and keep “problem” visible during fulfillment rather than hiding it behind support menus. |
| AI control/failure | Not the differentiator in the cited flow. | Not the differentiator in the cited flow. | Not the differentiator in the cited flow. | Follow Google PAIR: users review/approve automation, can take over manually, and are never blocked by AI failure. |

## Recommended Requirement Categories

The roadmap should scope requirements in these boundaries rather than as one monolithic “assistant” feature:

1. **Deal state and participant projections** — shared stage, role permissions, one next action, transition analytics.
2. **Chat integration and privacy** — typed assistant/system events, participant-scoped suggestions, editable drafts, polling/deduplication.
3. **Terms intelligence** — strict extraction schema, provenance/confidence, gap/conflict detector, manual correction, AI failure handling.
4. **Agreement protocol** — immutable revisions, change diff, independent per-revision confirmations, concurrency protection, economic-term/escrow policy.
5. **Fulfillment protocol** — provider-neutral method, plan, directional handoff and receipt facts, deterministic reminders.
6. **Existing lifecycle integration** — escrow-safe completion, reviews, cancellation, dispute freeze/escalation, notifications.
7. **Measurement and safety** — content-free funnel events, latency/error/acceptance metrics, privacy filters, rate limits, model output validation.

This ordering reflects dependency, not screen order: state and privacy must exist before AI suggestions; the terms schema must exist before extraction; revisions must exist before confirmation; confirmed terms must exist before fulfillment; fulfillment facts must integrate with existing completion and dispute transactions.

## Validation Metrics and Behavioral Signals

Measure whether guidance changes outcomes, not whether users merely click AI cards.

| Hypothesis | Primary metric | Diagnostic signals | Guardrail |
|------------|----------------|--------------------|-----------|
| Assistant helps people reach agreement | Offer → same-revision dual confirmation conversion | Time to first response; number of assistant suggestions shown/used/dismissed; number of clarification turns | Cancellation/dispute rate must not rise materially |
| Extraction reduces form work | Median manual edits and focused questions before confirmation | Field-level correction rate; conflict detection rate; invalid-output/fallback rate | Never auto-confirm extracted fields |
| One next action reduces stalls | Median time in each actionable stage | Reminder count before action; users choosing a secondary action; state/action mismatch errors | Do not notify a participant who cannot currently act |
| Shared terms reduce misunderstandings | Change-after-first-confirmation rate; disputes citing terms/logistics | Revision count; which fields change most; confirmation reset comprehension in usability tests | Last confirmed revision remains auditable |
| Fulfillment guidance improves completion | Confirmed terms → completed conversion | Meetup/shipment/service split; missed deadline; handoff-to-receipt time | Escrow completion occurs once and only from valid human confirmations |

Because the production population and listings are currently artificial, do not interpret baseline conversion as validated demand. Segment team/test accounts organizationally and technically, and pair funnel data with qualitative review of early real-user sessions without collecting private message content into analytics.

## Sources

Primary/current product sources (accessed 2026-08-14):

- [Airbnb — Responding to a guest’s trip change request](https://www.airbnb.com/help/article/1504) — proposed changes are accepted or declined; the counterparty cannot silently change a reservation. **Confidence: HIGH.**
- [Airbnb — How to read and send messages](https://www.airbnb.com/help/article/145) — reservations have organized message threads and transparent read state. **Confidence: HIGH.**
- [Airbnb — Managing notifications](https://www.airbnb.com/help/article/14) — reminders are a distinct transaction-related notification class. **Confidence: HIGH.**
- [Airbnb — If you have a problem or issue during your reservation](https://www.airbnb.com/help/article/248) — document the issue, contact the counterparty, then escalate for platform help. **Confidence: HIGH.**
- [Upwork — How to use milestones in fixed-price jobs](https://support.upwork.com/hc/en-us/articles/211068218-How-to-use-milestones-in-fixed-price-jobs) — milestones define deliverable, deadline, and amount; review leads to approval or requested changes. **Confidence: HIGH.**
- [Upwork — How to add or edit milestones](https://support.upwork.com/hc/en-us/articles/360000990268-How-to-add-or-edit-milestones-on-Upwork) — counterpart changes are explicit requests that must be accepted or declined. **Confidence: HIGH.**
- [Upwork — How payments for milestones and fixed-price contracts work](https://support.upwork.com/hc/en-us/articles/211063718-How-payments-for-milestones-and-fixed-price-contracts-work) — funded work moves through submission, review, approval/change, hold, and release states. **Confidence: HIGH.**
- [Upwork — How to file a dispute when a client doesn’t pay a milestone](https://support.upwork.com/hc/en-us/articles/211068528-How-to-file-a-dispute-when-your-client-doesn-t-pay-a-milestone) — unresolved transaction problems have a structured dispute route. **Confidence: HIGH.**
- [eBay — Buying with local pickup](https://www.ebay.com/help/Buying/Shipping_Tracking_Items/Buying_with_local_pickup?id=4056) — users arrange pickup in Messages, inspect before confirmation, and use a code as handoff proof. **Confidence: HIGH.**
- [eBay — Offering local pickup](https://www.ebay.com/help/selling/shipping-items/setting-shipping-options/local-pickup?id=4181) — proof-of-pickup is separated from informal coordination. **Confidence: HIGH.**
- [Google PAIR — People + AI design patterns](https://pair.withgoogle.com/guidebook-v2/patterns) — recommends review/approval, supervisory control, manual takeover, and forward paths from AI failure. **Confidence: HIGH for AI UX guidance.**
- [Google PAIR — Errors + Graceful Failure](https://pair.withgoogle.com/chapter/errors-failing/) — AI errors require a clear manual path and preserved user control. **Confidence: HIGH for AI UX guidance.**

Project evidence:

- `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, and `.planning/notes/deal-assistant-flow.md` — milestone goals, explicit non-autonomy, privacy, delivery deferral, required fields, stages, and metrics.
- `.planning/sketches/001-deal-assistant-message/README.md` — selected compact chat-native assistant treatment.
- `.planning/sketches/002-terms-card-in-chat/README.md` — selected visible version/change/two-confirmation treatment.
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`, `.planning/codebase/INTEGRATIONS.md`, and `prisma/schema.prisma` — current chat polling, server-action boundary, Deal/Chat/Message constraints, escrow-related transaction state, notification/push infrastructure, and analytics privacy boundary.

## Confidence and Open Questions

| Area | Confidence | Reason / validation need |
|------|------------|--------------------------|
| Explicit consent, structured state, changes, reminders, handoff evidence, issue paths | HIGH | Repeated across current first-party Airbnb, Upwork, and eBay flows. |
| Human control and manual AI fallback | HIGH | Explicit project boundary and aligned with Google PAIR guidance. |
| Chat-to-terms extraction and one-gap questioning as a differentiator | MEDIUM | Strong fit with the documented product problem, but no Dayberry real-user evidence yet. |
| Exact reminder cadence | LOW | Must be tuned from real time-to-action and notification opt-out/dismissal data. |
| Meetup versus shipment confirmation semantics | MEDIUM | Comparable patterns exist, but Dayberry’s symmetric barter creates two-direction semantics not directly matched by buyer/seller flows. |
| Economic-term edits after escrow hold | LOW until product decision | Requires code-level transactional design and a clear UX policy; current requirements do not say whether item/point fields are editable after offer. |
| Pickup codes or stronger proof | LOW for MVP necessity | eBay validates the pattern at scale, but Dayberry has no real dispute signal justifying the complexity yet. |

---
*Feature research for: Dayberry v1.1 guided deal assistant MVP*
*Researched: 2026-08-14*
