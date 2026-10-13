# Outbound webhook service plan

Keep source, tests, configuration, documentation and generated local output
under `webhook/`. The parent engine, its package metadata and carried archives
stay unchanged. Git metadata is read-only; the harness handles commits and
draft pull requests. Each session completes the next unchecked milestone,
runs its checks, ticks it here, appends a line to `CHANGES.txt`, and stops.

- [x] M1 Bootstrap a private TypeScript/Vitest project and validate subscription contracts: HTTPS callback syntax, signing-key references, event filters and explicit UTC schedule windows, with rejection and boundary tests.
- [x] M2 Add SQLite migrations and repositories for subscriptions, scan cursors, immutable event payloads, delivery attempts and dead letters; test durability, transactions and uniqueness after reopening.
- [x] M3 Implement runtime secret provisioning and custody, HMAC payload signatures and receiver verification; keep raw keys out of subscription responses and logs, and test tampering, timestamp checks and key rotation.
- [x] M4 Integrate the relative-source engine and pinned read-only event-search interfaces for aspect exacts, ingresses, stations and eclipses; preserve engine receipts, event definitions, clock conventions and complete/refused results.
- [ ] M5 Add bounded worker scans over schedule windows with durable cursors, stable occurrence identities and transactional outbox insertion; test adjacent windows, restarts, duplicate scans and search refusals.
- [ ] M6 Connect custom event DSL filters to the existing events parser and executor, with bounded expressions, explicit schedule intersection and defined handling of interval results; test unsupported expressions and budget exhaustion.
- [ ] M7 Implement HTTPS POST transport with a mock HTTP receiver seam, public-address resolution checks, pinned connection addresses, redirect refusal, request deadlines and bounded response handling; make all tests local or mocked.
- [ ] M8 Add delivery leases, stable idempotency keys, exponential retries and SQLite dead-letter transitions; test ambiguous acknowledgements, crashes, concurrent workers and retry exhaustion for at-least-once delivery.
- [ ] M9 Expose an authenticated control API for subscription CRUD, secret provisioning and redacted delivery-log inspection, with bounded requests, pagination and update/delete semantics; test it over loopback HTTP.
- [ ] M10 Add a replay CLI that inspects and requeues retained dead letters without changing payload bytes or occurrence identity; test dry runs, selection, audit records and repeated replay requests.
- [ ] M11 Wire service configuration, worker lifecycle and graceful shutdown; add an end-to-end synthetic subscription test from event discovery through signed delivery, retries, restart and replay.
- [ ] M12 Document runnable local examples, receiver verification, deployment configuration, retention and operational limits; run the webhook suite, check package isolation and record remaining search-accuracy limitations.

## Integration decisions

`origin/infra/events` was inspected read-only at
`7d6fb88d03b3896ee1e5496ed99961015d291d3c`. It exposes local search functions
and a bounded DSL parser/executor under `events/`. M4 freezes the local search
modules under `vendor/events/`, with original and transformed digests and an
offline integrity check. Only relative engine import paths change. Resolve any
additional DSL modules from those pinned git objects with the same provenance
policy; do not depend on a mutable sibling worktree or its HTTP service.
The engine itself is consumed through relative source imports without changing
or rebuilding the root `dist/`. Event-search output does not include a full
engine receipt, so the adapter must capture the engine's calculation receipt
at each emitted instant. Numerical search convergence is not accuracy evidence.

Schedule windows use `[start, end)` in UTC. The adapter must reconcile each
search's endpoint convention before advancing a scan cursor. Refused or
incomplete searches cannot silently advance the cursor. Stable occurrence
identity must survive overlap, retries and replay; successful delivery means
the receiver acknowledged the request, not that side effects occurred once.

Subscription records hold opaque signing-key references. Later secret
provisioning accepts runtime material, and persistence must protect recoverable
keys separately from public subscription records. Do not write actual secrets
or tokens in source, fixtures, examples or logs. Tests generate keys at runtime.

M1 validates callback syntax only. Network destination validation belongs to
the delivery boundary and must run for every connection, including retries.
M1 bounds custom expression text but does not claim it is valid DSL. Semantic
validation must be wired before the control API accepts custom subscriptions.

All tests use synthetic inputs and local or mocked network receivers. Bulk
data, databases, caches and build output belong in ignored directories. New
documentation uses plain text without em dash characters. Each claimed number
must refer to committed tests or evidence with its actual scope.
