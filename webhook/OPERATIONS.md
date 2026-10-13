# Running and operating the webhook service

This service discovers astrology events into a SQLite outbox and delivers
signed JSON to HTTPS callbacks. The control API manages subscriptions and
keys; the replay command requeues retained dead letters. It consumes this
checkout's engine source and the frozen events modules, without a chart HTTP
API or MCP server. Contracts and detailed test evidence are in [README.md](README.md).

## Offline walkthrough

Use the Node runtime accepted by [check-runtime.mjs](scripts/check-runtime.mjs).
From the repository root:

```sh
cd webhook
npm ci --ignore-scripts --cache .cache/npm
npm run build:service
node build/webhook/examples/offline-demo.js
```

The example generates credentials in memory, creates temporary databases under
the ignored `.cache/` directory, and starts loopback control and receiver
listeners. It provisions a signing key, creates a synthetic Sun ingress
subscription, discovers with the engine, verifies the raw signed request,
loses an acknowledgement, and accepts a retry with the same identity and bytes.
It checks embedded calculation receipts and inspects delivery completion through
the control API, then closes listeners and removes temporary state.

Successful output is:

```json
{"status":"delivered","verifiedRequests":2,"receiverEffects":1}
```

These counts describe only this lost-acknowledgement example. The compiled
example is exercised by [service-cli.test.ts](test/service-cli.test.ts).
Its source, [offline-demo.ts](examples/offline-demo.ts), shows complete control
requests and receiver verification without storing or printing credentials.
The callback's `.example` hostname is never resolved. An explicit trusted
transport seam sends only to the generated loopback receiver. This seam and
the receiver's in-memory inbox are teaching code; they are not production TLS
or durable receiver storage. The regular service CLI uses `HttpsTransport`
and refuses loopback callback destinations.

For restart, retry exhaustion and replay together, run the synthetic service
integration check, which uses only local and mocked networking:

```sh
npm test -- test/service.test.ts
```

## Deployment configuration

Build with `npm run build:service`, then run `npm start` inside `webhook/`.
The compiled runtime needs its local `node_modules/`. Preserve the checkout,
lockfile, build and runtime used with an existing database: discovery pins
include runtime and numerical policy facts. A changed pin can stop discovery
with `policy-conflict`, rather than reinterpret saved events.

Supply credentials through the deployment's runtime secret manager:

| Environment name | Custody and meaning |
| --- | --- |
| `WEBHOOK_ADMIN_TOKEN` | Canonical base64url random admin credential. Clients send this token in a Bearer authorization header. |
| `WEBHOOK_WRAPPING_KEY` | Canonical base64url random wrapping key. Persist and back it up separately from databases; every process sharing a vault needs the same key. |
| `WEBHOOK_SETTINGS` | Optional JSON policy, with no credentials. Unknown settings and unknown `WEBHOOK_` names are rejected. |

Credential sizes and canonical encoding are enforced by
[service-config.test.ts](test/service-config.test.ts); do not substitute
passwords or a key reference for key bytes. Receiver shared signing keys are
provisioned through the authenticated API and supplied separately to the receiver.
No token or raw signing key belongs in a configuration file, command argument,
example fixture, access log or tracing output.

This optional policy selects a project-local state directory and a loopback
listener. The field values are the tested service defaults in
[service-config.test.ts](test/service-config.test.ts), except for the directory name:

```sh
export WEBHOOK_SETTINGS='{"stateDirectory":"var/production","host":"127.0.0.1","port":8787,"lookAheadMs":86400000}'
npm start
```

Inject the credentials before running that command. The settings variable
contains policy only. The state directory must remain beneath `webhook/`.
It holds `service.sqlite` and the separate encrypted `signing.sqlite` vault.
Keep state, sidecars and backups private to the service account. Directory
symlink checks do not prevent replacement by another process with write access.

The control listener accepts loopback addresses. Remote administration needs a
protected TLS boundary in front of it with restricted access and credential
logging disabled. The admin token controls all subscriptions and keys; this
service does not implement tenant isolation. Browser Origin requests are refused.
Outbound requests require publicly routed HTTPS destinations, validated again
on each attempt; the transport pins the resolved connection address, verifies
the original TLS identity and does not follow redirects.

Policy groups are `scan`, `delivery`, `transport` and `control`; pagination,
polling, lookahead and shutdown settings are at the top level. Durations and
lookahead use milliseconds, byte limits use encoded bytes, and scan evaluation
budgets count adapter calculation requests. Defaults and caps are defined in
[service-config.ts](src/service-config.ts) and the corresponding policy modules,
with their test references in README. These are configuration limits, not
throughput or latency measurements. No deployment capacity benchmark is claimed.

Eclipse filters, including custom eclipse queries, require `scan.eclipse` with
explicit spherical radii in astronomical units and a derivative half-step in
milliseconds. No implicit physical model is supplied. See the Local event
searches section of README before choosing those values.

## Subscription and receiver workflow

The walkthrough uses `POST /v1/signing-keys` before
`POST /v1/subscriptions`. The subscription contains an HTTPS callback, an opaque
`secretRef`, a filter, and an explicit UTC `[start, end)` window. Register only
a callback whose receiver holds the corresponding shared key. Registration
does not probe the callback or establish its availability.

Built-in filters are `aspect-exact`, `ingress`, `station` and `eclipse`.
The custom filter accepts bounded UTC `all` point queries with explicit ranges,
such as `all Mars square Sun from 2000-01-01 to 2000-02-01`. This is a synthetic
query example, not a prediction. Interval queries, natal targets and `next`
queries are refused; the DSL never executes JavaScript.

Read a subscription to obtain its ETag, then supply that exact value as
`If-Match` on a full replacement or deletion. An edit resets its discovery
cursor but preserves its numerical policy pin. Disable or delete stops future
discovery; queued deliveries retain their original URL and key reference and
remain eligible. An uncertain creation response must be investigated before
retrying, because creation has no idempotency contract.

The receiver must read a bounded raw body and retain duplicate header values.
Call `verifyWebhook` with those bytes, the configured trusted key identifier,
its shared key and the receiver's current whole Unix seconds. Verify before
parsing JSON. The headers authenticate key identifier, timestamp, idempotency
key and exact bytes. Do not select an arbitrary key from an untrusted header,
normalize JSON before verification, or log signed payloads or credentials.
Protocol details and clock-tolerance evidence are in README and
[signatures.test.ts](test/signatures.test.ts).

After verification, atomically commit the authenticated idempotency identity
and receiver effects in durable receiver storage, scoped to the trusted sender.
Reject the same identity with conflicting bytes. A retry of a committed request
should return a successful acknowledgement without applying effects again.
Keep deduplication records for as long as retained events can be replayed,
including restored backups. There is no finite automatic replay-expiry window.
The walkthrough's Map only demonstrates the rule within its running process.

## Delivery inspection and replay

Inspect `GET /v1/deliveries`, its event detail and attempt routes, and
`GET /v1/dead-letters`. Follow `nextAfter` with the same page limit; pages are
ordered but not a snapshot. Logs omit payloads, destinations, key material and
idempotency keys. Readiness means listeners and workers started, not that every
subscription is progressing or every receiver is reachable.

Failed and ambiguous attempts retry with a capped exponential delay. Retry
policy binds when a delivery is first claimed. Expired leases, cancellation
and lost acknowledgements count as attempts. Exhaustion creates a SQLite dead
letter; destination rejection and signing failure also need operator attention.
This is at-least-once delivery within the retained retry/replay workflow, not
unlimited retry or guaranteed receiver side effects. A successful acknowledgement
only records a successful HTTP response.

Run local replay with filesystem authorization, without an admin token or vault
key. The example event below is a placeholder; select an actual retained event
and its current failed attempt from inspection:

```sh
npm run replay -- list --db var/production/service.sqlite
npm run replay -- inspect --db var/production/service.sqlite --event EVENT_ID
npm run replay -- requeue --db var/production/service.sqlite --event EVENT_ID --attempt FAILED_ATTEMPT --request OPERATOR_REQUEST_ID --dry-run
npm run replay -- requeue --db var/production/service.sqlite --event EVENT_ID --attempt FAILED_ATTEMPT --request OPERATOR_REQUEST_ID --apply
npm run replay -- history --db var/production/service.sqlite --event EVENT_ID
```

Use the same request identifier after an uncertain replay response. A deliberately
new replay cycle needs a new identifier and the current failed attempt. Replay
preserves payload, identity, destination, key reference and original retry policy.
It queues work for a running worker rather than sending immediately. Resolve the
underlying failure first: replay cannot restore a revoked key or redirect saved
events to a new callback. Inspection and dry runs are read-only and require the
current schema. Full replay behavior is checked in
[replay-cli.test.ts](test/replay-cli.test.ts) and
[storage-replay.test.ts](test/storage-replay.test.ts).

## Retention, backup and recovery

Subscriptions retain deletion tombstones. Events, completed attempts, replay
audit records and key-reference metadata are retained indefinitely. There is
no automatic expiration, purge endpoint, quota or database compaction job.
Requeue removes the current dead-letter entry while preserving its failure in
the replay audit. Monitor disk growth and schedule storage capacity accordingly.
Manual SQL deletion can break foreign keys, policy pins and replay identities;
there is no supported selective erasure workflow in this version.

For a simple consistent backup, stop every service process and replay writer
using the state directory, wait for clean shutdown, then copy the entire state
directory including any SQLite sidecars. Keep the wrapping key in separate
protected custody. Do not copy only an active database file and discard its WAL.
Online coordinated backup across the store and vault is not implemented here.
Store and vault migrations validate checksums; back up before a software upgrade.

Restore the matched state and wrapping key under private filesystem permissions,
with the saved build/runtime and numerical policy. Open the writable service
before using read-only replay on an older schema. Pending work resumes and
expired leases become ambiguous attempts. A restored snapshot can redeliver
previously acknowledged work and roll revocations back, so coordinate with
receiver deduplication and key administration. Losing the wrapping key prevents
recovering signing capability; wrapping-key replacement is not implemented.

## Remaining limits and diagnosis

The tests establish local contracts and regression behavior over their named
synthetic windows. They provide no new independent sky-accuracy or exhaustive
event-completeness evidence. A `complete` search means the prescribed calculation
finished under its sampling assumptions. Coarse cells can hide paired crossings,
tangential aspect contacts or multiple extrema. Station roots use engine
finite-difference speeds. Eclipse output is geocentric spherical geometry with
no surface visibility, contact-time or total/annular/hybrid contract.

Receipts preserve calculation conventions, clock basis and engine provenance;
root residuals and narrow brackets measure numerical convergence, not physical
timing error. Check each position's bounds and refusal data. Search padding must
stay inside the parent's calculation coverage, and known time-basis steps cause
`time-discontinuity` refusals. The adapter will not silently advance a cursor
across them. Handling events across those steps remains unsupported.

An evaluation-budget refusal can be addressed by raising the operating budget or
reducing the owned slice length. Changing the sampling step, runtime or model
changes the numerical pin and requires a new subscription. Refusal does not
advance the cursor or return partial events. Fixed diagnostics intentionally
omit subscription details, so inspect subscriptions and local storage separately
through authorized interfaces. There is no built-in health endpoint, metrics
exporter, fairness guarantee or distributed queue service.

Engine calculations and SQLite operations are synchronous. They can delay
control responses, poll timers, lease recovery and shutdown processing; the
configured grace period bounds control draining after the event loop resumes,
not total process exit time. Run under a supervisor, preserve state on restart,
and monitor fixed worker notices, deliveries and disk space. Use a local
filesystem suitable for SQLite WAL rather than sharing state over a network
filesystem. Independent local processes have lease and cursor fencing tests;
power-loss durability and arbitrary filesystem behavior are not established.

An intermittent concurrent first-open failure was observed during M9. It did
not recur in the M11 concurrent-start checks; its cause remains unresolved,
as recorded in [PLAN.md](PLAN.md). A fixed `startup-failed` report requires
checking filesystem custody, listener availability, schema compatibility and
wrapping-key custody before restarting. Do not delete or recreate an existing
vault to bypass that error.

## Validation and package isolation

Run from `webhook/`:

```sh
npm run typecheck
npm test
npm run build:service
node build/webhook/examples/offline-demo.js
npm run check:events-source
npm run check:package-isolation
```

The package-isolation check inventories the parent's package with dry-run and
ignore-scripts and enforces exclusion of `webhook/`. It creates no archive and
does not rebuild the parent's `dist/` or replace its package-content and archive
gates. All generated dependencies, databases, caches and builds stay in ignored
project directories. Preserve parent [NOTICE](../NOTICE) and
[LICENSING.md](../LICENSING.md) when distributing a deployment with compiled
engine code and data; this folder's MIT code does not replace those terms.
