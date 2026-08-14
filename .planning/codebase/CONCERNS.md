# Codebase Concerns

**Analysis Date:** 2026-08-14

## Tech Debt

**Monolithic server-action module:**
- Issue: Authentication, profiles, listings, deals, wallet accounting, chats, chains, notifications, OAuth, disputes, password resets, and moderation share one 2,478-line module.
- Files: `src/server/actions.js`
- Impact: Unrelated changes share imports, module-level caches, exception types, and transaction helpers; review scope is large and accidental cross-domain regressions are difficult to isolate.
- Fix approach: Split by bounded context under `src/server/` (for example `auth-actions.js`, `deal-actions.js`, `chain-actions.js`, and `moderation-actions.js`) while keeping financial transaction helpers private to their owning module.

**Schema deployment without migration history:**
- Issue: Production startup applies the current Prisma schema with `prisma db push`; the repository has no `prisma/migrations/` history.
- Files: `Dockerfile`, `package.json`, `prisma/schema.prisma`
- Impact: Schema intent is not reviewable as an ordered change set, rollback cannot be reasoned about from the repository, and a schema incompatibility can either prevent startup or place live data at risk.
- Fix approach: Adopt reviewed, forward-only Prisma migrations, require a verified snapshot before deployment, run migration validation separately from application startup, and retain the previous application artifact for rollback without reversing live data.

**Stringly typed state machines:**
- Issue: Deal, chain, chain-step, lot, transaction, report, reset, and user states are free-form `String` columns and repeated string literals.
- Files: `prisma/schema.prisma`, `src/server/actions.js`, `lib/chains.js`
- Impact: Misspelled or unsupported states can bypass filters, strand escrow, or hide records without a schema-level error.
- Fix approach: Centralize allowed transitions and validate every write; where SQLite/Prisma support is suitable, use enums or check constraints introduced through forward migrations.

**Financial logic duplicated across paths:**
- Issue: Direct-deal completion, cancellation, dispute resolution, chain activation, and chain completion each implement separate balance and transaction-row logic.
- Files: `src/server/actions.js`
- Impact: Deal escrow omits references while chain escrow uses them, concurrency guarantees differ by path, and fixes must be repeated in several places.
- Fix approach: Use one idempotent ledger service whose operations require a stable business-event key such as `deal:<id>:settle` or `chain:<id>:settle` and execute state transition plus ledger entries in one transaction.

**Generated and historical artifacts mixed into the working tree:**
- Issue: `.claude/worktrees/`, `.kilo/worktrees/`, `.next/`, `dist/`, and a local `prisma/dev.db` exist alongside source; the database is ignored but physically present.
- Files: `.gitignore`, `.dockerignore`, `prisma/dev.db`, `.claude/worktrees/`, `.kilo/worktrees/`
- Impact: Full-repository scans are noisy, stale worktree copies can be mistaken for current code, and local data can be used accidentally during manual operations.
- Fix approach: Treat the repository root outside `.claude/worktrees/` and `.kilo/worktrees/` as authoritative, keep runtime data in an explicit non-source directory, and make environment selection visible in operational tooling.

**Unbounded user-text fields:**
- Issue: Profile name, bio, phone, lot title, description, and wants lack server-side length caps; only selected fields such as messages, reports, reviews, and profile wants have explicit limits.
- Files: `src/server/actions.js`, `prisma/schema.prisma`, `next.config.mjs`
- Impact: Requests up to the 10 MB server-action body limit can create oversized rows and responses, degrade feed/bootstrap performance, and amplify storage use.
- Fix approach: Define shared maximum lengths for every user-controlled field and validate them before database writes.

## Known Bugs

**Direct deals can settle the wrong escrow row:**
- Symptoms: Completing, cancelling, refunding, or releasing a direct deal selects the newest held `escrow-in` transaction for the user rather than the transaction belonging to that deal.
- Files: `src/server/actions.js`, `prisma/schema.prisma`
- Trigger: One initiator has more than one direct deal with held credits and the deals are resolved in an order different from creation order.
- Workaround: Do not rely on transaction-row status as an audit trail for direct deals until every escrow row carries `refType: 'deal'` and `refId: deal.id`; reconcile balances and ledger rows from a verified snapshot before changing live records.

**Chain settlement can credit receivers twice:**
- Symptoms: Receiver balances, earning transactions, and participant deal counts can be incremented more than once for one chain.
- Files: `src/server/actions.js`
- Trigger: Two final transfer confirmations arrive concurrently; both callers can observe all steps confirmed and call `completeChain()`, whose writes are not guarded by a one-time claim or unique event key.
- Workaround: Avoid parallel administrative or automated replay of final chain confirmations; permanent correction requires an atomic `active` to `done` claim and idempotent ledger-event uniqueness.

**Dispute release can settle a deal more than once under concurrency:**
- Symptoms: The lot owner can receive duplicate credits and deal counters can increment twice.
- Files: `src/server/actions.js`
- Trigger: Two administrators resolve the same active dispute as `release` concurrently; the conditional deal update count is ignored and `completeDeal()` is called by both paths.
- Workaround: Operationally serialize dispute resolution until state claiming and settlement are combined in one transaction with an idempotency key.

**Completed deal history is deleted with its lot:**
- Symptoms: A user can delete a lot after its active deals finish, and associated `Deal` rows disappear through `onDelete: Cascade`; chats lose their deal link and reviews retain only a nullable deal reference.
- Files: `src/server/actions.js`, `prisma/schema.prisma`
- Trigger: `deleteLotAction()` runs when the lot has no active deals but has completed or cancelled deals.
- Workaround: Archive such lots instead of deleting them; permanent correction requires preserving deal-history references and restricting hard deletion to records with no historical business events.

**Balance and wallet history can diverge during top-up:**
- Symptoms: A balance increment can persist without the corresponding transaction row if the second write fails.
- Files: `src/server/actions.js`
- Trigger: Database/process failure occurs between `prisma.user.update()` and `prisma.transaction.create()` in `topUpAction()`.
- Workaround: Reconcile from an append-only ledger; permanent correction is a single transaction with a unique top-up event ID.

**Yandex OAuth does not validate state:**
- Symptoms: The callback accepts a Yandex authorization code without comparing the returned `state` to a server-stored value.
- Files: `lib/oauth.js`, `src/server/actions.js`, `app/callback/[provider]/route.js`
- Trigger: A crafted or cross-session authorization response reaches `/callback/yandex`.
- Workaround: Disable Yandex login if the provider flow cannot be fixed immediately; store the generated state in the HTTP-only cookie and require an exact, one-time comparison before token exchange.

**Foreign or unavailable lots can be attached as the initiator's offer:**
- Symptoms: A deal can store any supplied `myLotId`, including a lot the initiator does not own or one that is not active.
- Files: `src/server/actions.js`, `prisma/schema.prisma`
- Trigger: A caller invokes `createDealAction()` with another user's lot ID or an archived/hidden/traded lot ID.
- Workaround: Treat `myLotId` as untrusted display data until the action validates owner and status in the same transaction that creates the deal.

## Security Considerations

**Unverified self-service balance minting:**
- Risk: Any authenticated account can call `topUpAction()` repeatedly and mint up to 200,000 internal credits per call without a payment provider, signed grant, administrator authorization, or rate limit.
- Files: `src/server/actions.js`
- Current mitigation: Per-call amount is capped at 200,000, and a transaction row is written after the balance update.
- Recommendations: Remove the action from production exposure or require a server-verified, unique payment/grant event; never trust an amount supplied only by the client.

**Long-lived sessions survive credential changes:**
- Risk: A stolen 30-day JWT remains valid after password change or administrator-issued reset because sessions contain only `uid` and there is no session-version check or revocation store.
- Files: `lib/auth.js`, `src/server/actions.js`, `prisma/schema.prisma`
- Current mitigation: Cookies are HTTP-only, `SameSite=Lax`, secure in production, signed with HS256, and production startup rejects the known development secret.
- Recommendations: Add a user session version or password-changed timestamp to verified claims, rotate it on every credential reset/change and block event, and provide explicit session revocation.

**Manual password-reset custody:**
- Risk: Administrators receive a plaintext temporary password and must transfer it out of band; there is no forced-change flag, expiry, delivery proof, or second-factor verification.
- Files: `src/server/actions.js`, `src/screen-profile.jsx`, `prisma/schema.prisma`
- Current mitigation: Only emails listed in `ADMIN_EMAILS` can issue the password; only the bcrypt hash is stored after issuance.
- Recommendations: Replace with expiring, single-use reset tokens delivered to a verified channel; if manual recovery remains, require dual verification, short expiry, forced change on next login, and an immutable audit event.

**Process-local rate limits are bypassable and can lock out victims:**
- Risk: Limits reset on process restart, do not coordinate across instances, and key login/reset attempts by target email. Attackers can distribute requests or deliberately exhaust another user's allowance.
- Files: `lib/rate-limit.js`, `src/server/actions.js`
- Current mitigation: Maps have expiry and a 10,000-key cap; login, registration, messages, broadcasts, resets, and reports use selected limits.
- Recommendations: Use a durable limiter keyed by a combination of normalized account, trusted client IP, and action; apply exponential backoff without letting one source globally lock a victim account.

**Unlimited guest-account creation:**
- Risk: `guestAction()` performs bcrypt work and inserts a persistent user on every call with no rate limit, CAPTCHA, quota, expiry, or cleanup.
- Files: `src/server/actions.js`, `prisma/schema.prisma`
- Current mitigation: Each guest gets an isolated random identity rather than a shared account.
- Recommendations: Rate-limit by trusted network/client signals, avoid expensive password hashing for non-login guest identities, expire inactive guests safely, and measure creation volume.

**Client-controlled OAuth origin and callback host:**
- Risk: OAuth start accepts an arbitrary client-provided `origin`, stores it, uses it as `redirect_uri`, and later redirects to it; callback failure redirects are built from the request host. Weak proxy/provider allowlisting could create open-redirect or login-confusion behavior.
- Files: `src/server/actions.js`, `app/callback/[provider]/route.js`, `lib/oauth.js`
- Current mitigation: OAuth cookies are HTTP-only, `SameSite=Lax`, secure in production; VK uses state plus PKCE.
- Recommendations: Derive redirect bases only from an explicit server-side allowlist, validate `Host`/forwarded headers at the edge, and never persist a client-provided absolute origin as a redirect target.

**Upload resource exhaustion:**
- Risk: Authenticated users can repeatedly submit multi-megabyte image payloads; Sharp decoding is CPU/memory intensive and each unique image persists to disk.
- Files: `next.config.mjs`, `src/server/actions.js`, `lib/storage.js`
- Current mitigation: Server actions cap bodies at 10 MB, lots cap six images and eight million encoded characters, avatars cap two million characters, and Sharp re-encodes images.
- Recommendations: Enforce per-user upload quotas and request rates, validate decoded byte size and pixel dimensions before full processing, and monitor volume capacity.

## Performance Bottlenecks

**Unpaginated feed and bootstrap payload:**
- Problem: Every feed request loads every active lot, its owner projection, and all photo rows; bootstrap returns that entire collection before the user can paginate.
- Files: `src/server/actions.js`, `src/App.jsx`
- Cause: `lotsFeed()` has no `take`, cursor, or page boundary.
- Improvement path: Add stable cursor pagination on `(createdAt, id)`, fetch thumbnails only for cards, and load detail galleries on demand.

**All-lot personalized matching:**
- Problem: Each matching request reads all active lots and constructs embedding/similarity inputs for the full set.
- Files: `src/server/actions.js`, `lib/ai.js`
- Cause: `getMatchesAction()` has no corpus limit or candidate prefilter, and `computeMatches()` compares each candidate against all of the user's offers/demands.
- Improvement path: Prefilter by city/category/status using indexed queries, cap candidates, compute embeddings asynchronously, and cache results per user/data version.

**Quadratic chain search with a hard visibility ceiling:**
- Problem: Chain generation compares owners/lots pairwise and explores paths; it deliberately reads at most 250 recent lots.
- Files: `lib/chains.js`
- Cause: Graph construction is quadratic before path enumeration, with `MAX_LOTS = 250` and `TOP_EDGES = 8` limiting cost.
- Improvement path: Partition by geography/category, maintain candidate edges incrementally, and expose metrics showing how many eligible lots were excluded from each run.

**Synchronous external AI and push work:**
- Problem: User-facing actions wait for external AI calls or fan out web-push requests in-process; a large broadcast creates one promise per subscription.
- Files: `lib/ai.js`, `lib/push.js`, `lib/notify.js`, `src/server/actions.js`
- Cause: There is no job queue, concurrency cap, retry schedule, or delivery outbox.
- Improvement path: Persist jobs/outbox rows in the same transaction as domain events, process them with bounded concurrency, and keep user responses independent of provider latency.

**SQLite single-writer pressure:**
- Problem: Chats, notifications, view counters, ledger entries, chain refreshes, and moderation all write to one SQLite file.
- Files: `prisma/schema.prisma`, `lib/prisma.js`, `src/server/actions.js`
- Cause: WAL permits concurrent reads but still serializes writes; `busy_timeout = 5000` delays failure rather than increasing write capacity.
- Improvement path: Measure lock wait and write latency, batch non-critical counters/notifications, keep transactions short, and plan a transactional server database before multi-instance scaling.

**Unbounded cache and event-table growth:**
- Problem: `AiCache`, `Message`, `Notification`, `Transaction`, and guest `User` records have no retention/archival process; current WebP uploads also have no garbage collector.
- Files: `prisma/schema.prisma`, `lib/ai.js`, `lib/storage.js`, `scripts/migrate-photos.mjs`, `src/server/actions.js`
- Cause: Read paths cap some result sets, but storage is append-only; `removeOrphans()` explicitly skips `.webp` files.
- Improvement path: Define retention policies that preserve financial/audit records, archive or compact only safe derived data, and implement reference-counted upload cleanup with dry-run reporting and verified backups.

## Fragile Areas

**Wallet and escrow state transitions:**
- Files: `src/server/actions.js`, `prisma/schema.prisma`
- Why fragile: User balances are mutable aggregates while `Transaction` is not consistently treated as the source of truth; some operations are transactional, some are split, and direct deals do not use the available `refType`/`refId` fields.
- Safe modification: Preserve existing data, introduce idempotent event keys through a forward migration, reconcile discrepancies in a read-only report first, then route every balance mutation through one transaction boundary.
- Test coverage: No automated tests cover insufficient funds, concurrent confirmation, cancellation, dispute release/refund, duplicate requests, or crash boundaries.

**Chain lifecycle concurrency:**
- Files: `src/server/actions.js`, `lib/chains.js`, `prisma/schema.prisma`
- Why fragile: Lifecycle work combines conditional updates, later rereads, external notifications, replacement search, escrow writes, chat creation, and final settlement across multiple calls.
- Safe modification: Model every transition as a compare-and-set operation, make settlement idempotent, and keep notification delivery outside the authoritative transaction through an outbox.
- Test coverage: No tests exercise simultaneous accepts, simultaneous final transfers, insufficient funds during activation, replacement races, or expired chains.

**Filesystem/database consistency:**
- Files: `lib/storage.js`, `src/server/actions.js`, `app/uploads/[file]/route.js`, `scripts/migrate-photos.mjs`
- Why fragile: Image bytes are written before the owning database write; a later DB failure leaves an orphan, while deleting/updating records does not remove current WebP files. The database and filesystem cannot commit atomically.
- Safe modification: Record upload lifecycle state, finalize references only after successful domain writes, use a conservative reference audit before cleanup, and retain recoverable snapshots.
- Test coverage: No tests cover partial write failure, corrupt images, duplicate uploads, missing files, volume exhaustion, or cleanup/reference races.

**Production startup pipeline:**
- Files: `Dockerfile`, `scripts/migrate-photos.mjs`, `scripts/migrate-chains.mjs`, `prisma/schema.prisma`
- Why fragile: Container startup creates directories, pushes schema, rewrites photo references/files, backfills chat members, and only then starts serving. Any failure prevents service, and startup behavior changes live state.
- Safe modification: Move backup verification and forward migrations into an explicit release stage with observable checkpoints; start the application only after a successful migration record is present.
- Test coverage: No disposable production-like migration test or automated restore verification is present.

**Moderation multi-step updates:**
- Files: `src/server/actions.js`
- Why fragile: Blocking a user updates the user, hides lots, iterates deals into dispute, and emits notifications without one transaction; failure can leave a partially moderated account.
- Safe modification: Commit the authoritative moderation state changes atomically, then enqueue notifications; make reruns idempotent and report partial legacy states read-only before repair.
- Test coverage: No tests cover failure between steps, administrator concurrency, unblock semantics, or active-chain participation.

**OAuth account linking by email:**
- Files: `app/callback/[provider]/route.js`, `lib/oauth.js`, `prisma/schema.prisma`
- Why fragile: Provider identities are not stored in a dedicated `(provider, externalId)` table; callback lookup/upsert relies on email or a synthesized provider email.
- Safe modification: Persist verified provider identity separately, require explicit linking to an existing password account, and validate provider email-verification semantics.
- Test coverage: No tests cover changed/missing provider email, duplicate callback delivery, state mismatch, cross-provider collision, or account unlinking.

## Scaling Limits

**Chain candidate corpus:**
- Current capacity: At most 250 recent active lots per chain-search run, with at most eight outgoing edges retained per owner/lot path.
- Limit: Eligible older lots are invisible to a run, while raising the cap increases pairwise similarity and path-search cost rapidly.
- Scaling path: Partition searches and incrementally maintain edges rather than raising `MAX_LOTS` globally.
- Files: `lib/chains.js`

**Application and database topology:**
- Current capacity: Code assumes one Node process and one SQLite database; process-local rate limits and cooldown maps reinforce that assumption.
- Limit: Multiple application replicas do not share rate limits/cooldowns and cannot safely scale writes against a local SQLite file.
- Scaling path: Externalize coordination and move the authoritative datastore to a server database before horizontal application scaling.
- Files: `lib/rate-limit.js`, `src/server/actions.js`, `lib/prisma.js`, `prisma/schema.prisma`

**Feed and match corpus:**
- Current capacity: No explicit maximum; every active lot is returned by the feed and loaded for matching.
- Limit: Response size, database read time, client rendering, embedding input, and matching CPU all grow with total active listings.
- Scaling path: Add pagination, candidate indexes, precomputed match jobs, and payload budgets.
- Files: `src/server/actions.js`, `lib/ai.js`, `src/App.jsx`

**Upload volume:**
- Current capacity: Per request is limited, but persistent per-user and total-volume quotas are absent.
- Limit: Unique WebP and thumbnail files accumulate until the mounted volume is exhausted; current cleanup skips WebP files.
- Scaling path: Track ownership/reference counts and quotas, alert on free-space thresholds, and use lifecycle-managed object storage when local-volume capacity becomes operationally unsafe.
- Files: `lib/storage.js`, `scripts/migrate-photos.mjs`, `Dockerfile`

## Dependencies at Risk

**SQLite as the production system of record:**
- Risk: Single-writer behavior, file-level operational handling, and schema push on startup make availability and live-data safety depend on one volume and one process.
- Impact: Write contention, volume loss/corruption, or a failed startup migration affects the entire service.
- Migration plan: Preserve SQLite snapshots, introduce database-agnostic ledger invariants first, validate a copy through read-only consistency checks, and cut over through a rehearsed forward migration with rollback at the application-routing layer.
- Files: `prisma/schema.prisma`, `lib/prisma.js`, `Dockerfile`, `scripts/backup-snapshot.mjs`

**No automated dependency/security update gate:**
- Risk: The repository declares caret ranges and a lockfile but has no CI workflow, dependency scanning configuration, or test gate visible in the root project.
- Impact: Security or compatibility regressions in Next.js, Prisma, Sharp, JWT, bcrypt, and web-push dependencies can reach deployment without automated evidence.
- Migration plan: Add lockfile-based dependency scanning, scheduled update review, build/test gates, and explicit runtime compatibility checks.
- Files: `package.json`, `package-lock.json`

**Native Sharp image processing in request paths:**
- Risk: Image decoding uses native code and consumes CPU/memory on user-triggered server actions.
- Impact: Malformed or high-volume uploads can reduce availability; platform/runtime changes can also break native installation.
- Migration plan: Pin and scan the dependency, test representative images in the deployment image, and move processing to a bounded worker when load grows.
- Files: `package.json`, `package-lock.json`, `lib/storage.js`, `Dockerfile`

## Missing Critical Features

**Verified production backup and restore workflow:**
- Problem: A consistent snapshot helper exists, but the repository contains no scheduled backup configuration, retention policy, off-host copy, restore procedure, or automated restore test. Uploaded files also require coordinated backup with the database.
- Blocks: Safe confidence in schema deployments, corruption recovery, volume-loss recovery, and data reconciliation.
- Files: `scripts/backup-snapshot.mjs`, `Dockerfile`, `lib/storage.js`

**Production-grade credit issuance:**
- Problem: Credits are minted directly from a client-supplied amount with no external payment/grant verification or idempotency key.
- Blocks: Trustworthy wallet balances, fraud resistance, and financial reconciliation.
- Files: `src/server/actions.js`, `prisma/schema.prisma`

**Secure self-service account recovery:**
- Problem: Recovery depends on an administrator creating and manually relaying a plaintext temporary password.
- Blocks: Scalable recovery, verifiable account ownership, least-privilege administration, and reliable credential revocation.
- Files: `src/server/actions.js`, `src/screen-profile.jsx`, `prisma/schema.prisma`

**Operational observability and immutable audit trail:**
- Problem: Logging uses `console`, notification failures are swallowed, and sensitive administrative/financial actions do not write an immutable audit-event model.
- Blocks: Incident reconstruction, alerting on settlement mismatch, administrator accountability, and reliable delivery retries.
- Files: `src/server/actions.js`, `lib/notify.js`, `lib/push.js`, `prisma/schema.prisma`

## Test Coverage Gaps

**Financial invariants:**
- What's not tested: Balance conservation, escrow-to-deal linkage, idempotent completion/refund, concurrent confirmations, dispute races, and crash consistency.
- Files: `src/server/actions.js`, `prisma/schema.prisma`
- Risk: Credits can be duplicated, stranded, or paired with the wrong audit row without detection.
- Priority: High

**Production-data migrations and recovery:**
- What's not tested: Forward schema migration against a production-like copy, photo migration restartability, upload/database consistency, snapshot completeness, and restore verification.
- Files: `Dockerfile`, `scripts/migrate-photos.mjs`, `scripts/migrate-chains.mjs`, `scripts/backup-snapshot.mjs`, `prisma/schema.prisma`
- Risk: Deployment or recovery can make the service unavailable or leave data/files inconsistent.
- Priority: High

**Authentication and authorization:**
- What's not tested: JWT revocation, blocked-user boundaries, Yandex/VK state handling, OAuth origin validation, admin-only actions, password reset expiry/change enforcement, and rate-limit bypass/lockout behavior.
- Files: `lib/auth.js`, `lib/oauth.js`, `lib/rate-limit.js`, `app/callback/[provider]/route.js`, `src/server/actions.js`
- Risk: Account takeover, login CSRF, privilege misuse, or denial of service can regress unnoticed.
- Priority: High

**Chain lifecycle:**
- What's not tested: Candidate pruning, accept/decline races, replacement selection, activation rollback, simultaneous final transfers, and ledger settlement.
- Files: `lib/chains.js`, `src/server/actions.js`, `prisma/schema.prisma`
- Risk: Listings or escrow can become stuck, and concurrent completion can duplicate credits.
- Priority: High

**Listings, uploads, and moderation:**
- What's not tested: Ownership checks for offered lots, historical-record preservation on deletion, image limits/corruption, orphan handling, and partial moderation failure.
- Files: `src/server/actions.js`, `lib/storage.js`, `app/uploads/[file]/route.js`, `prisma/schema.prisma`
- Risk: History can be lost, storage can fill, foreign data can be attached to deals, and blocked content can remain partially visible.
- Priority: High

**Performance regressions:**
- What's not tested: Feed/bootstrap payload budgets, matching latency versus corpus size, SQLite lock contention, push fan-out concurrency, and image-processing resource use.
- Files: `src/server/actions.js`, `lib/ai.js`, `lib/chains.js`, `lib/push.js`, `lib/storage.js`
- Risk: Growth can cause slow requests or process exhaustion before functional errors appear.
- Priority: Medium

---

*Concerns audit: 2026-08-14*
