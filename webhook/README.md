# Outbound astrology webhooks

This private workbench is being built according to [PLAN.md](PLAN.md). The
implemented milestones cover subscription validation, SQLite storage,
encrypted signing-key custody, payload signing with receiver verification,
local event searches and custom DSL queries with engine receipts, bounded
discovery into a durable outbox, an HTTPS transport for signed requests, and a
delivery worker with leases, retries and dead letters, and an authenticated
control API. Callers can drive scans and delivery attempts explicitly. Later
milestones add the runnable service, lifecycle management and replay CLI.
The code and documentation here use the repository's [MIT license](../LICENSE).

Use Node from the release line accepted by
[check-runtime.mjs](scripts/check-runtime.mjs), matching this project's
`package.json`. All commands below run inside this directory:

```sh
cd webhook
npm ci --ignore-scripts --cache .cache/npm
npm run typecheck
npm test
npm run check:events-source
npm run check:package-isolation
```

Dependencies, caches, build output, coverage and local state are ignored here.
The TypeScript check emits nothing. Vitest runs only this project's tests.
No root dependency installation or engine build is needed. The project installs
the parent's exact ephemeris dependency locally. TypeScript paths and the Vitest
resolver direct relative engine-source imports to that local dependency. Other
runners must provide equivalent resolution; a production build comes later.
The test suite uses invented inputs. Network tests use mocked DNS and local
loopback receivers only, with no external requests. TLS tests require the
`openssl` executable and generate their certificates and keys at runtime in
an ignored cache directory, removing those files immediately after loading.

`check:package-isolation` runs the parent npm inventory with `--dry-run` and
`--ignore-scripts` and rejects any selected `webhook/` file. It does not create
an archive. The parent `npm run package:contents` also requires existing
engine build output; it cannot pass in a checkout without `dist/`. The local
isolation check establishes file exclusion, not archive rebuild fidelity or
the parent package's full size and content checks.

## Subscription contract

The TypeScript entry is [src/index.ts](src/index.ts). `parseSubscription`
accepts plain JSON-like records and returns a detached, deeply frozen
`SubscriptionSpec`. This example describes a synthetic schedule:

```ts
import { parseSubscription } from "./src/index.js";

const subscription = parseSubscription({
  callbackUrl: "https://receiver.example/events",
  secretRef: "receiver_primary",
  filter: { kind: "ingress", body: "Moon", sign: "aries" },
  window: {
    start: "2000-01-01T00:00:00Z",
    end: "2000-02-01T00:00:00Z"
  }
});
```

`secretRef` is a case-sensitive identifier for separately provisioned runtime
key material. It is not a signing secret and must never be used as one. The
signing-key vault binds references to recoverable protected keys. Its
`validateSubscription` method rejects unavailable keys before activation.
No actual secret or token belongs in source, examples or fixtures.

`callbackUrl` must be an absolute HTTPS URL with a hostname. User information,
fragments (including an empty fragment), raw whitespace, control characters,
backslashes and port zero are rejected. Query strings are allowed. The result
is normalized with `URL.href`. Syntax acceptance does not establish that the
host is a permitted network destination; even IP literals are accepted at this
stage. The HTTPS transport enforces address policy at connection time.

Windows require explicit UTC timestamps with date, hours, minutes and seconds,
optionally followed by fractional milliseconds, and a trailing `Z`. Local
times, numeric offsets, date-only inputs, leap seconds and calendar rollovers
are rejected. Results use canonical `Date.toISOString()` strings. The start
must precede the end. A scheduled occurrence belongs to `[start, end)`; engine
coverage and search budgets will be checked by the search adapter. Syntax
acceptance makes no accuracy claim for the requested dates.

`enabled` defaults to `true`; when supplied it must be boolean. Unknown fields
are rejected throughout. Ordinary accessor properties, inherited records and
non-data array slots are rejected without reading getters. This is a JSON data
boundary, not a sandbox for executable same-process proxies.

## Event filters

| Kind | Required fields | Optional fields and meaning |
| --- | --- | --- |
| `aspect-exact` | `bodies`, a pair of distinct supported body names; `angle`, an unsigned separation in degrees | None |
| `ingress` | `body`; `sign`, the lowercase destination sign | `direction`: `any`, `direct` or `retrograde`; defaults to `any` |
| `station` | `body`, a planet other than Sun or Moon | `direction`: motion after the station; defaults to `any` |
| `eclipse` | `type`: `solar`, `lunar` or `any` | None |
| `custom` | `expression`, a bounded supported events DSL query | None |

Supported names are the Sun, Moon and planets listed in `EVENT_BODIES` in
[src/types.ts](src/types.ts); nodes and arbitrary points are excluded. Sign
names come from `ZODIAC_SIGNS`. Filters are case-sensitive.

Custom expressions are preserved as text and validated with the pinned events
DSL parser. The supported semantics are described below. Eclipses use the
event provider's documented geocentric definitions; a subscription does not imply visibility
at a location.

## Validation limits and evidence

These are input policy limits, not measurements of astronomical accuracy.
[subscription.test.ts](test/subscription.test.ts) enforces the boundaries
against synthetic input, including UTF-8 lengths and invalid calendar dates.

| Input | Accepted limit | Evidence in the test file |
| --- | --- | --- |
| Callback URL | 2048 UTF-8 bytes, before and after URL normalization | Callback size tests, including percent-encoding expansion |
| Signing-key reference | 128 ASCII bytes, starting with a letter and then letters, digits, underscore or hyphen | Runtime signing-key reference tests |
| Custom expression | 4096 UTF-8 bytes | Expression byte and control-character tests |
| Aspect angle | Finite degrees from 0 through 180 inclusive | Supported filters and invalid angle tests |
| Timestamp | Four-digit year and up to three fractional second digits | Schedule syntax, normalization and leap-year tests |

Ill-formed UTF-16 is rejected before UTF-8 encoding can change the text. Custom
expressions allow tabs and line endings, but not other C0 controls or DEL.
Their tokens must also match the supported DSL grammar.

Validation failures throw `SubscriptionValidationError`, whose `code` is
`invalid-subscription`. Its `field` and message use fixed field names without
echoing callback URLs, expressions or key references. The tests also check
rejection without getter execution and that output freezing leaves the input
mutable. These checks establish the local contract, not delivery guarantees.

## Local SQLite storage

`WebhookStore` in [src/storage.ts](src/storage.ts) opens a local database using
Node's built-in [SQLite API](https://nodejs.org/download/release/v22.13.0/docs/api/sqlite.html).
Pass an explicit file path in an ignored directory such as `webhook/var/`,
creating its parent directory first. `:memory:` is available for ephemeral
use. Call `close()` when finished. No runtime dependencies were added.
Keep the database and its WAL sidecars private to the service account: callback
URLs, expressions and payloads can be sensitive, and the database is not
encrypted. This database stores only key references; the separate signing-key
vault described below holds encrypted key material.

Opening a database applies transactional migrations and validates the migration
checksums, schema definitions and foreign keys. An unknown schema or changed
ledger is refused. Connections enable foreign keys, WAL journaling for disk
databases, full synchronous writes and a bounded busy timeout. Tests use local
databases, including independent connections and close/reopen cycles; they do
not establish durability on every filesystem or under hardware power loss.

Subscription creation also creates its scan cursor at the schedule start.
Updates require the expected revision, increment it and reset the cursor to
the updated schedule's start. Deletion creates a tombstone and increments the
revision; inspection retains the record, while subscription listings omit it.
Disabled or deleted subscriptions cannot commit scans. Pending deliveries and
historical records survive edits and deletion. Each queued delivery retains
the callback URL and key reference captured when its event was inserted.
Deletion therefore stops future discovery, but does not cancel queued work.

`commitScan` accepts only the current subscription revision and cursor, with
occurrences inside the submitted `[from, to)` interval. It inserts immutable
event payloads and pending deliveries and advances the cursor in one transaction.
The interval must stay inside the subscription schedule. Its caller must first
establish that the search completed; storage cannot prove event completeness.
The event adapter described below establishes conditional scan completion and
captures engine receipts. The discovery worker commits only completed scans.

An occurrence key is unique within its subscription across revisions. Event
identifiers and idempotency keys are globally unique. Repeated occurrences
retain the original record only when the event identifier, idempotency key,
instant and exact serialized payload agree. A mismatch rolls back the entire
scan. This prevents a rescan from silently replacing the bytes to be signed.
Payloads are stored as supplied, with their SHA-256, and must be JSON objects;
storage does not validate their engine receipts. Future discoveries are queued
no earlier than the occurrence instant. The discovery worker computes stable
identities and serialized payloads as described below.

`recordAttempt` atomically appends a fixed, redacted outcome and changes a
pending delivery to pending, delivered or dead-letter. Attempt numbers must be
consecutive. Only a successful HTTP status can be recorded as delivered.
Failed attempts carry a status code or a fixed failure kind; response bodies
and arbitrary error strings are not retained. Dead letters reference a retained
attempt and event. This legacy method is refused once a delivery has a managed
retry policy. The delivery worker uses the lease methods described below;
replay remains a later milestone.

Listings use bounded pages ordered by identifier (attempts by attempt number),
with an exclusive continuation value. They are inspection methods, not an
atomic worker claim or a snapshot across pages. Storage inputs are local typed
calls; the subscription parser remains the public JSON validation boundary.
Storage errors have fixed codes without SQL or caller data in their messages.
Invalid subscription specifications retain `SubscriptionValidationError` and
its fixed field name; storage-specific validation uses `StorageError`.

Custom drafts saved before DSL validation remain readable, replaceable and
deletable. Storage reads retain the earlier text validation for these records;
creation and updates require supported query semantics. A worker refuses an
unsupported legacy expression with `unsupported-filter`, leaving its cursor,
outbox and policy unchanged. Other subscriptions in the page can proceed.

[storage.test.ts](test/storage.test.ts) checks repository behavior against
synthetic records: reopen persistence, cursor conflicts, payload identity,
rollback, destination snapshots, attempt sequencing and dead-letter retention.
[storage-db.test.ts](test/storage-db.test.ts) checks migrations, foreign keys
and the SQL triggers that refuse event and attempt changes. These are storage
regression tests, not astronomical accuracy evidence.

## Signing-key custody and rotation

`SigningKeyVault` in [src/secrets.ts](src/secrets.ts) takes a separate SQLite
path and a wrapping key supplied as runtime bytes. Provision a shared signing
key with `vault.provision(secretRef, sharedKey)` after securely giving that key
to the receiver. The caller supplies cryptographically random bytes, for example
from Node's `randomBytes`; the vault checks their length, not their entropy.
Provisioning returns only the reference and its status. There is no key export,
automatic environment loading or key generation response. Keep runtime key
material out of command arguments, request logs, source and fixtures.

The wrapping key and each shared signing key are exactly 32 bytes. The vault
encrypts each signing key with AES-256-GCM, using a fresh random 12-byte nonce
and a 16-byte authentication tag. Authenticated context binds the encrypted
material to its reference and the vault format. A startup authentication check
rejects a wrong wrapping key even for an empty vault. These sizes and the
rejection of modified or transplanted ciphertext are exercised by
[secrets.test.ts](test/secrets.test.ts), using randomly generated keys and local
SQLite databases. They are implementation checks, not a cryptographic audit.

Protect the vault directory, database, WAL sidecars and backups with service
account permissions. Store and back up the wrapping key separately through the
deployment's secret manager; losing it loses signing capability for all its
keys. All service processes opening that vault must receive the same wrapping
key. Restarts recover signing keys from ciphertext. Wrapping-key replacement
is not implemented. The encrypted vault does not authenticate subscription
data, protect a compromised process or prevent rollback to an older database
backup. Private fields keep keys out of ordinary serialization and inspection;
temporary Buffer wiping is best effort, not guaranteed memory erasure.

References are immutable and case-sensitive. Rotate by provisioning a new
reference, supplying the new shared key to the receiver, validating the updated
subscription with `vault.validateSubscription(input)`, and storing it through
the existing subscription update method. Queued deliveries continue to use the
old reference captured at discovery, including later retries and replay. Keep
the receiver's old key available while those deliveries remain eligible. Never
choose a receiver key from the header alone: resolve it within that receiver's
configured trusted keys and pass its identifier as `expectedKeyId`.

`revoke` permanently disables a reference through the vault API, including for
retained deliveries. Reprovisioning an existing or revoked reference fails.
Revocation does not retract a signature already generated or a request in flight.
Restoring an old backup can restore old revocation state. `inspect` returns
metadata only; `assertAvailable` also checks that a key decrypts. Every `sign`
call repeats that check. An enabled subscription must pass
`validateSubscription` before storage; disabled drafts may reference a missing
key. `WebhookStore` itself remains a persistence boundary with no vault lookup.
The control API uses the validation method, and the delivery worker handles
missing or revoked keys without sending unsigned requests.

`SecretError` carries a fixed code and message without paths, SQL, crypto errors
or supplied key material. Malformed signing requests use `invalid-input`;
failed ciphertext authentication uses `vault-failure`. Call `close()` during
shutdown.

## Signature protocol and receiver verification

`signWebhook` and `verifyWebhook` in [src/signatures.ts](src/signatures.ts)
operate on exact body bytes. Encode the stored payload as UTF-8 once, sign those
bytes and send those same bytes. A receiver must verify the raw request body
before JSON parsing. Reformatting JSON or changing its final newline changes
the signature.

The headers are `x-webhook-key-id` (the immutable key reference),
`x-webhook-timestamp` (integer Unix seconds), `idempotency-key` (the stored
delivery identity), and `x-webhook-signature` (`v1=` followed by the lowercase
hexadecimal HMAC-SHA256). The HMAC input is this UTF-8 prefix, including its final
newline, followed immediately by the raw body bytes:

```text
zodiacs-webhook/v1\n<timestamp>\n<key-id>\n<idempotency-key>\n
```

Here `\n` means an actual newline byte. The timestamp, key identifier and
idempotency key are authenticated along with the body. `vault.sign(secretRef,
{ body, idempotencyKey, timestamp })` builds these headers without returning
the shared key. Refresh the timestamp for each attempt while preserving payload
bytes and the idempotency key.

`verifyWebhook({ body, headers, secret, expectedKeyId, now })` returns a boolean.
`now` is the receiver's current Unix time in whole seconds. It rejects malformed
or duplicate required headers, an unexpected key identifier, changed signed
fields and a mismatching digest. It uses a constant-time digest comparison.
The default accepted clock difference is at most 300 seconds in either
direction, including the boundary; callers may supply `toleranceSeconds`.
Maintain the receiver's clock and choose a bounded tolerance for its deployment.
The body limit is 262144 bytes, matching the stored payload limit. Boundary,
tampering and malformed-header behavior is enforced in
[signatures.test.ts](test/signatures.test.ts) against runtime-generated keys,
including a separate HMAC construction from SHA-256 inner and outer pads.

Verification alone does not prevent replay within the timestamp tolerance.
After verification, the receiver must durably deduplicate the authenticated
idempotency key together with its expected sender or subscription context
before applying side effects. Retries and operator replay will intentionally
reuse that identity. Signature verification establishes authenticity of the
signed bytes; it does not acknowledge delivery or make receiver effects atomic.

## Local event searches and receipts

`searchEvents` in [src/event-search.ts](src/event-search.ts) searches an explicit
filter and UTC window synchronously, without storage or network access. Pass
`filter`, `window`, `stepMs` and `maxEvaluations`. Use `parseEventFilter` and
`parseScheduleWindow` for standalone validation; `searchEvents` also revalidates
them. There is no default scan step or evaluation budget. These are operating
choices, not physical error bounds. Custom filters use the supported DSL
semantics described below.

The local search modules are pinned from `origin/infra/events` by full commit
and checksums in [vendor/events/manifest.json](vendor/events/manifest.json).
[PROVENANCE.md](vendor/events/PROVENANCE.md) describes the import-path rewrite,
executor context seam and reproducible offline check. `npm test` verifies that snapshot first. Only
local calculation modules are included; no event HTTP service is required.
The parent engine remains a relative source dependency of this checkout.

The search coordinates are apparent geocentric tropical longitudes on the true
ecliptic of date, with the parent's geometric lunar-series convention retained.
Each `DiscoveredEvent` carries an ISO UTC label, the original search definition
including its bracket and residual, and the relevant bodies' complete
`CalcPosition` results. Those results preserve bounds and full calculation
receipts: normalized requests, engine and ephemeris versions, convention ids,
UT1 and TT instants, the input clock, time basis and Delta T provenance. They
are detached frozen data that survives JSON serialization. A calculation
receipt records how a value was computed; it is not an authenticated statement
of physical accuracy or a digest of every loaded source file.

| Filter | Preserved event meaning |
| --- | --- |
| `aspect-exact` | Crossings of both orientations of the requested unsigned separation between moving bodies; conjunction and opposition have a single branch. Relative motion, branch, angle and body order remain in the definition. Tangential contacts are not generally found. |
| `ingress` | A tropical sign-boundary crossing into the destination sign. Retrograde entry uses the upper boundary of that sign. The result retains both signs and the direction. |
| `station` | A sign-changing zero of the engine's finite-difference longitude speed. Direction is the outgoing motion. The captured position includes speeds and their bounds. |
| `eclipse` | A minimum of spherical shadow-axis distance with strict penumbral overlap. The definition retains geometry, radii and classification; positions include Sun and Moon Cartesian vectors. |

For eclipses, also pass `eclipse: { model, derivativeStepMs }`. The model requires
explicit `sunRadiusAu`, `moonRadiusAu` and `earthRadiusAu` in astronomical units;
the Sun must have the largest radius. No physical radii or atmospheric
enlargement are chosen implicitly. Solar classes are central or partial, with
no total/annular/hybrid distinction. Lunar classes are total, partial or
penumbral at the returned minimum. Paths, surface visibility, contact times,
oblateness and atmospheric shadow effects are outside this model. The
derivative step is its central-difference half-width in milliseconds and is
part of the saved search policy.

Subscription windows own `[start, end)`. The pinned searches use an open start
and closed end, and some need confirmation beyond an edge. The adapter pads
each side by a scan step, plus the eclipse derivative half-width for eclipses,
and rounds outward to a fixed Unix-epoch sampling grid. It then keeps only
events whose reported millisecond belongs to the requested window. This makes
the grid independent of scan start and supplies surrounding samples for edge
events. Search metadata retains both requested and padded windows, the step,
model, budget and source pin. Padding costs evaluations and must also be within
engine coverage. Keep the policy fixed when comparing overlapping scans.

Known discontinuities of the engine's UTC time basis cause a
`time-discontinuity` refusal. This check includes padding and, for stations,
the engine's speed stencil, so a window near a discontinuity can also refuse.
It uses the engine's time-basis implementation directly. The worker must not
advance a cursor over such a refusal; handling events across those steps needs
a separate policy. A UTC label outside the IERS coverage still retains the
engine's documented civil-time-as-UT1 convention in its receipt.

All discovery and receipt calculations share the evaluation budget. A unit is
an adapter calculation request, including one that fails, not an internal
ephemeris operation. Receipt capture can exhaust the budget after discovery.
Solar and lunar searches for `type: "any"` also share that budget. Every
refusal has an empty event list, including cancellation and `engine-refused`,
which retains the parent's refusal object. Unexpected computation failures
throw; they never become completed empty scans. Cancellation is cooperative
between synchronous calculations, not a wall-clock deadline.

`complete` means the prescribed scan and receipt capture finished under the
sampling assumptions recorded as `conditional-on-sampling-assumptions`.
Longitude and relative-longitude cells must be continuous and monotonic, with
travel shorter than a half turn; station and eclipse scans require isolated
sign-changing roots. Coarse cells can hide paired crossings or several extrema,
and numerical enclosures do not measure astronomical accuracy. A completed
empty result therefore is not proof that no physical event occurred.

[event-search.test.ts](test/event-search.test.ts) tests analytic motion and
invented geometry, including ownership at adjacent windows, grid stability,
directions, refusal atomicity and budgets. Its injected sources test adapter
behavior and are not sky predictions. [event-engine.test.ts](test/event-engine.test.ts)
checks the real relative-source engine over the synthetic schedule windows in
that file, equality of captured results with direct engine calls, version and
clock preservation, and known clock-step refusals. These are integration and
regression checks, with no new independent astronomical accuracy claim.

## Custom event queries

`parseSubscription` and `parseEventFilter` validate custom expressions using the
parser pinned in [vendor/events/PROVENANCE.md](vendor/events/PROVENANCE.md).
Queries are data, with no JavaScript evaluation. Supported forms include:

```text
all Mars square Sun from 2000-01-01 to 2000-02-01
all Mercury ingresses into Taurus from 2000-01-01 to 2000-02-01
all Mercury stations retrograde from 2000-01-01 to 2000-02-01 clock utc
all solar eclipses from 2000-01-01 to 2000-02-01
```

These are synthetic query examples, not predictions. Named aspects are
conjunction, sextile, square, trine and opposition. An ingress may omit
`into <sign>` to select every destination sign; a station may omit its outgoing
direction. Lunar eclipses are also supported. Body, sign and grammar tokens
are case insensitive, while the original expression text is retained. The
parser also accepts increasing year ranges; its final named year is included
in full. Explicit date ranges end at midnight on the `to` date, exclusively.

Every subscription query must use `all` and an explicit range. An omitted
clock means UTC; explicit UT1 and TT clocks are rejected. `next` is rejected
because selecting a first event separately in each worker slice would change
its meaning when the schedule is partitioned. Natal targets have no supported
input contract here. Sun and Moon station queries are rejected, consistently
with built-in station filters. Unrecognized or unsupported expressions fail
with `SubscriptionValidationError` on `filter.expression`, without echoing
their contents. The parser's token cap is enforced in addition to the byte
limit; [custom-query.test.ts](test/custom-query.test.ts) exercises both bounds.

Retrograde and void-of-course expressions produce intervals in the upstream
executor. This service rejects those expressions before calculation. It does
not turn a clipped interval boundary into an exact event, issue a notification
for each scan slice, or advance the cursor on an unresolved interval result.
Supporting intervals needs a separate transition and persistence contract.

For a supported query, the adapter intersects the DSL range with the requested
`[start, end)` window. An empty intersection completes without calculations.
A nonempty intersection receives the same fixed-grid padding as built-in
filters. Padding may sample outside both ranges to establish roots, but only
points inside the intersection are emitted. Search metadata adds `custom`,
with the parsed query, effective window and interval policy. Broad expression
ranges therefore do not force the worker to rescan that whole range.

The pinned executor runs on that padded window through a documented shared
context seam. Search and receipt capture consume the same budget and
cancellation signal. All results are discarded on refusal, including a budget
exhausted while capturing receipts. Eclipse expressions require the explicit
model and derivative step used by built-in eclipses; the worker passes them
from its policy. Clock continuity checks apply to custom searches too.

Each emitted event has `kind: "custom"`, its original point definition and
full engine calculation results. The raw expression and its range stay in
subscription/search metadata, outside the immutable event payload. A custom
policy marker distinguishes these payloads from built-in filters; switching
between the two on a pinned subscription requires a new subscription. Changes
to a custom query's spelling or range do not alone create new occurrence
identities. A rediscovered point must still have identical payload bytes.

[custom-query.test.ts](test/custom-query.test.ts) checks parser restrictions,
range intersection, boundary ownership, receipt preservation, cancellation
and shared budgets with analytic motion and synthetic geometry. Its real
engine comparison checks integration, not independent physical accuracy.
[custom-worker.test.ts](test/custom-worker.test.ts) checks SQLite discovery,
restart, repartitioning, rescan identity, legacy drafts and refusal rollback.
The existing search accuracy limitations also apply to custom queries.

## Bounded discovery worker

`ScanWorker` in [src/scan-worker.ts](src/scan-worker.ts) connects the local
search adapter to `WebhookStore`. Construct it with the store and explicit
`maxWindowMs`, `stepMs` and `maxEvaluations`. Durations are integer milliseconds;
the evaluation budget counts the same calculation requests as the adapter.
All must be positive safe integers. Eclipse subscriptions also need the
explicit `eclipse` model and derivative step described above. The worker
snapshots its settings. It performs no HTTP and starts no background timer.

Call `worker.scanSubscription(id, { now, through, signal })`, where `now` is
the discovery time and `through` is an exclusive discovery horizon, both in
integer Unix milliseconds. `signal` is optional. The worker owns the interval
from the durable cursor to the earliest of the schedule end, the horizon, and
the cursor plus `maxWindowMs`. It never skips backlog to catch up with `now`.
A future horizon is allowed; delivery availability remains no earlier than
the occurrence instant. The search adapter's padded samples may extend beyond
that owned interval, and all of their evaluations count against the budget.

Each call commits at most one slice. A completed empty scan advances its
cursor too. Missing, disabled, deleted, exhausted and not-yet-due subscriptions
return an `idle` reason without searching. A `committed` result gives the
window, evaluation count, inserted and duplicate counts, and new cursor.
Refusals, cancellation, excessive output and unexpected search failures leave
the cursor and outbox unchanged. Refused searches keep their fixed reason;
unexpected calculations throw `ScanWorkerError` with a fixed message. The
worker does not automatically reduce the step, skip clock discontinuities or
retry forever. An operator must resolve a refusal while preserving coverage.

`scanPage({ now, through, limit, afterId, signal })` inspects a bounded page
ordered by subscription identifier and attempts a slice for each subscription.
Disabled and exhausted records count toward the page limit. Continue with the
returned `lastId`, including when a subscription refuses, and begin a new pass
without `afterId` once `exhausted` is true. A full final page requires a later
empty page to establish exhaustion. New records inserted earlier in the order
are seen on the next pass. Pagination is not a database snapshot. A thrown
error stops that call; earlier successful subscription commits remain durable
and a retry starts each subscription at its current cursor.

The per-page calculation bound is the page limit times `maxEvaluations`, and
each subscription's owned span is bounded by `maxWindowMs`. Pagination and
outbox limits come from `STORAGE_LIMITS`. Oversized event batches and payloads
are refused as a whole, never truncated while advancing a cursor. These are
work limits, not wall-clock deadlines: search and SQLite work are synchronous.
Cancellation is checked between calculations and again before commit.

Calculations run outside a SQLite write transaction. Commit rechecks the
subscription revision, enabled/deleted state, cursor and numerical policy in
the transaction that writes events, deliveries and cursor progress. Competing
scans or subscription edits return `conflict` instead of inserting stale work.
Retry by reading current state through a new call. Storage failures propagate;
no successful cursor advancement is reported for a failed transaction.

## Occurrence identity and scan policy

The first successful worker scan, including an empty scan, binds a policy
fingerprint to the subscription in the same transaction as cursor progress.
It includes the event-search source pin, parent engine and ephemeris versions,
Node and V8 versions, platform and architecture, sampling step and grid,
clock ownership, coordinates and any eclipse model
and derivative step. The database keeps that pin across subscription edits,
disable/enable cycles and restarts. A changed numerical policy returns
`policy-conflict`; use a new subscription when deliberately adopting a new
policy. Switching between eclipse and other filter kinds also changes that
policy. Operating budgets, owned slice length, discovery horizon and filter
selection are excluded, so a refused budget can be increased and a schedule
can be repartitioned without changing occurrence identity.

The SQLite migration preserves existing subscription data without guessing a
policy for earlier untracked scans. A subscription without a pin may bind only
when its current cursor is at its schedule start and it has no retained events.
An edited draft qualifies. Retained legacy events require a new subscription;
the worker does not reinterpret their provenance or rewrite their payloads.
Once bound, even lower-level `commitScan` calls must supply the matching
`policyKey`.

An occurrence key hashes the numerical policy, UTC millisecond label and the
event's identifying definition: bodies, aspect angle and directed branch,
sign-boundary direction, outgoing station motion, or eclipse kind. Body order
remains meaningful for aspects. A separate hash scopes the event identifier
and idempotency key to the subscription. Scan partitions, retries and replay
do not create new identities. These are computed-event identities under a
fixed policy; they do not identify a physical event across different engines
or numerical policies. Runtime labels do not fingerprint a processor or every
loaded source byte. Preserve the deployed code and execution environment when
resuming a database; the policy pin is a consistency check, not a claim of
cross-machine numerical reproducibility.

The outbound JSON object has schema `zodiacs.webhook-event.v1` and carries
`id`, `occurrenceKey`, `idempotencyKey`, `subscriptionId`, `event` and `policy`.
`event` preserves the complete discovered definition, bracket, residual,
positions, bounds and engine receipts. Object keys are sorted for stable
serialization and array order is preserved. Numbers use JavaScript's JSON
encoding, with no decimal rounding added. Discovery
timestamps, subscription revisions, destinations, key references, search
windows and evaluation counts are not part of these payload bytes. Storage
separately retains the revision, discovery time and original delivery snapshot.

Changing a schedule, callback URL or signing-key reference resets the cursor
under the existing subscription-update contract. Rediscovered occurrences
deduplicate only if their full payloads still match; the original event,
delivery state, destination and key reference remain intact. Numerical detail
changes under the same identity cause a transaction conflict. The worker never
silently replaces a retained receipt. Updating the callback therefore does not
reissue old events to the new destination. Delivery retries and operator replay
consume the saved bytes and idempotency key. Operator replay will use the same
identity in its later milestone.

[scan-worker.test.ts](test/scan-worker.test.ts) exercises synthetic schedules
through the real search adapter and SQLite, including partition boundaries,
restart recovery, rescan deduplication, failures, racing connections and bounded
pages. [occurrence.test.ts](test/occurrence.test.ts) checks deterministic JSON,
identity scope and receipt preservation.
[scan-engine.test.ts](test/scan-engine.test.ts) checks the built-in filters
through the real relative-source engine, then repartitions the synthetic
schedules and confirms that delivered events retain their bytes and state.
[storage-scan-policy.test.ts](test/storage-scan-policy.test.ts) checks policy
binding, migration from the earlier schema, reopen persistence and rollback
after injected SQLite failures. These establish local discovery and storage
behavior, not physical event accuracy or at-least-once HTTP delivery.

## Signed HTTPS transport

`HttpsTransport` in [src/transport.ts](src/transport.ts) sends a single request.
Construct it with explicit `deadlineMs`, `maxResponseBytes`,
`maxResponseHeaderBytes` and `maxAddresses`. Settings are copied and must be
positive integers within `TRANSPORT_LIMITS`. These service policy caps are
enforced by the constructor tests in [transport.test.ts](test/transport.test.ts),
which also test response boundaries against synthetic streams and local HTTP:

| Setting | Maximum | Unit |
| --- | ---: | --- |
| `deadlineMs` | 60000 | Milliseconds for the whole attempt |
| `maxResponseBytes` | 65536 | Encoded response body bytes |
| `maxResponseHeaderBytes` | 16384 | Response header bytes, including trailers |
| `maxAddresses` | 64 | Addresses returned by a resolution |

Call `send({ callbackUrl, body, headers, signal })` with the delivery's saved
callback URL, its exact payload bytes and headers from `SigningKeyVault.sign`.
Use the retained idempotency key and a fresh timestamp for each attempt.
`signal` is optional. The transport copies the body and signature header values
before asynchronous work, validates their syntax, and forwards only the
protocol's signature headers plus its own Host, content type, length and
connection headers. It does not reserialize JSON or authenticate a supplied
digest. Key selection and signing belong to the caller; never accept these
headers from an untrusted control request. Invalid local input throws
`TransportError` with a fixed message.

Every attempt resolves the original hostname afresh through the OS resolver,
without a transport DNS cache. Empty or excessive answers are refused, as is
an answer containing any disallowed address, even alongside a public address.
IP literals undergo the same address check without DNS. The service then
selects the first validated address and connects directly to it. It performs
no fallback connection within an attempt. A later attempt can resolve again.
No connection pool, proxy environment setting or second name lookup changes
that pin. The original URL determines Host, path and query; TLS authenticates
the original DNS name or IP certificate SAN, with certificate-chain validation
enabled. The socket peer must match the selected address before any request
headers or body are flushed. The OS's mapped spelling of an IPv4 peer is
accepted only when it denotes that exact pin.

[src/destination.ts](src/destination.ts) defines a deliberately conservative
policy informed by the IANA [IPv4](https://www.iana.org/assignments/iana-ipv4-special-registry/)
and [IPv6](https://www.iana.org/assignments/iana-ipv6-special-registry/) special-purpose
registries, read for this milestone. It rejects local, private, shared,
documentation, multicast and reserved addresses. It also rejects special-purpose
blocks with globally reachable exceptions, mapped or translated destinations,
tunnel ranges, zone identifiers and IPv6 outside the policy's global-unicast
range. The publicly numbered [Azure host virtual endpoint](https://learn.microsoft.com/en-us/azure/virtual-network/what-is-ip-address-168-63-129-16)
is explicitly refused. [destination.test.ts](test/destination.test.ts) checks
these blocks, boundary addresses and numeric peer equivalence without connecting
to them. This fixed policy does not auto-update from a registry and cannot
prove how a deployment routes public addresses. Use an egress boundary that
keeps public destinations separate from local infrastructure.

Redirect statuses are returned as HTTP failures without following Location.
The whole-attempt deadline covers DNS, TCP, TLS, sending and reading the
response; it does not reset when data arrives. On expiration or cancellation,
the transport destroys request and response streams and ignores late results.
Node's OS lookup cannot be interrupted in flight, so the deadline releases
the caller and discards its result while that underlying operation finishes.
Timers depend on the Node event loop remaining responsive.

Response bodies are discarded as encoded chunks, never decompressed, parsed,
saved or logged. An excessive Content-Length, body, header block or combined
header/trailer size refuses acknowledgement, as do protocol errors and a
truncated response. Header accounting uses UTF-8 field names and values plus
separator overhead; Node independently enforces its wire parser header limit.
Outcomes expose
only `http` with a status, `timeout`, `network-error`, `destination-rejected`
or `cancelled`. DNS failures, TLS errors and receiver content never enter the
outcome. Only a fully received bounded successful response can acknowledge
delivery. A timeout or interrupted response can still follow a receiver side
effect, so the delivery worker retains the same idempotency key.
The transport performs no retry, lease or SQLite state transition; those
belong to the delivery worker and storage methods below.

[transport.test.ts](test/transport.test.ts) uses mocked DNS and a loopback HTTP
receiver seam to check signed bytes, destination pins, redirect refusal,
response limits, whole-attempt deadlines and cancellation. Its HTTP seam
simulates the TLS state and is trusted test code. [transport-tls.test.ts](test/transport-tls.test.ts)
uses a loopback TLS receiver with runtime-generated keys, certificates and IP
SANs to check successful identity validation, wrong names, untrusted chains,
peer mismatches and a stalled handshake. The production path uses Node's
[HTTPS client](https://nodejs.org/download/release/latest-jod/docs/api/https.html)
and [IP SAN checker](https://nodejs.org/download/release/latest-jod/docs/api/crypto.html#x509checkipip).
Test seams are constructor dependencies, never subscription settings; the
production constructor defaults enforce HTTPS with no trust override.

## Delivery leases, retries and dead letters

`DeliveryWorker` in [src/delivery-worker.ts](src/delivery-worker.ts) joins the
store, signing-key vault and HTTPS transport. Construct it with those objects
and explicit `maxAttempts`, `baseDelayMs`, `maxDelayMs`, `leaseMs` and
`deadlineMs`. The constructor copies the settings. A trusted optional clock
function returns integer Unix milliseconds; production defaults to `Date.now`.
The worker creates no polling timer. Call `deliverNext({ signal })` repeatedly
from a bounded service loop. Cancellation is optional.

Settings must be positive integers within these service policy caps. The
boundary tests in [delivery-leases.test.ts](test/delivery-leases.test.ts) and
[delivery-worker.test.ts](test/delivery-worker.test.ts) enforce them against
synthetic delivery records; these are configuration limits, not timing or
throughput measurements.

| Setting | Maximum | Unit |
| --- | ---: | --- |
| `maxAttempts` | 100 | Reserved attempts, including interrupted attempts |
| `baseDelayMs` | 86400000 | Milliseconds after the first failed attempt |
| `maxDelayMs` | 604800000 | Milliseconds of retry delay |
| `leaseMs` | 300000 | Milliseconds of exclusive attempt ownership |
| `deadlineMs` | 60000 | Milliseconds for a local attempt |

The maximum delay must be at least the base delay. A lease must allow an
integer deadline strictly shorter than itself. The deadline covers signing
elapsed time and transport waiting; synchronous signing and SQLite operations
cannot be interrupted while they block the event loop. The HTTPS transport's
own deadline may expire earlier. A retained shorter lease also shortens the
worker deadline, leaving time before lease expiry for completion. Timers do
not guarantee a wall-clock deadline if the event loop is paused.

Each call either processes a single due record, recovers a single expired
lease, returns `idle`, or returns `cancelled` before claiming. Due records are
ordered by availability and event identifier. Active leases are skipped, so
another due delivery can proceed. Future occurrences are never sent early.
Subscription edits, disable and deletion stop or change discovery according to
their existing contract; retained deliveries keep their original destination
and signing-key reference and remain eligible.

`WebhookStore.claimDelivery(now, policy)` claims a record in a short SQLite
write transaction. The first claim stores an immutable retry policy, including
the attempt budget, delays and lease duration. Later workers use that saved
policy even when their own configuration differs. Existing completed attempt
history counts toward the budget. Changing deployment settings cannot reset
an already retained delivery's budget or delay. Database migration adds the
lease and policy tables while preserving existing payloads and attempt logs;
earlier deployed migration text is unchanged.

The claim reserves an attempt number, start, expiry and random fencing token.
It returns the saved event and delivery snapshot; no network operation runs
inside the transaction. `finishDelivery(eventId, token, result, finishedAt)`
atomically appends the redacted outcome, updates delivery state, removes the
lease and, when necessary, inserts its dead letter. The completion must match
the current token and finish before its expiry. A forged, expired or superseded
token cannot alter the delivery. Tokens are internal worker state, never
outbound headers, payload fields or control-response data.

The worker signs the exact saved UTF-8 body with the saved idempotency key and
a current attempt timestamp, then invokes the transport. It does not rerun the
engine or reserialize a receipt. A fully received bounded HTTP response with
status in the success class acknowledges delivery, including on the last
permitted attempt. Every other HTTP status retries, including redirects,
client errors and rate limits. Receiver headers and bodies do not select the
retry schedule. The service does not follow redirects or honor Retry-After.

For failed attempt number `n`, the delay is
`min(maxDelayMs, baseDelayMs * 2 ** (n - 1))`, without jitter. Availability is
the attempt finish plus that delay. Timeouts, network failures and cancellation
are ambiguous failures and consume the same budget. A destination rejection
goes directly to `destination-rejected` dead letters. Signing failures send
nothing and produce only `signing-error`, with dead-letter reason `operator`;
this includes an absent or revoked key and a vault failure. Resolve key custody
before the future replay operation. Exhausting the saved budget produces
`attempts-exhausted`. All dead letters retain the event, original bytes,
destination, key reference, idempotency key and attempt history.

If a process stops before saving completion, the next eligible claim records
the expired reservation as `interrupted`, with its lease expiry as finish time.
That reservation counts even when the process stopped before sending. Recovery
uses the saved retry policy and commits before another call can claim a retry.
A delayed recovery may find the retry already due; it still returns
`recovered` without sending in that call. Repeated crashes therefore reach dead
letters rather than silently resetting the budget. An uncertain storage commit
does not cause an immediate resend; the exception reaches the caller and
durable lease recovery decides the next step. Completion with a stale token
returns `lease-lost` and leaves the current owner's state intact.

This is at-least-once attempt delivery under a finite retry budget, with dead
letters for operator action. A receiver may act and lose its acknowledgement,
or a worker may stop after receiving an acknowledgement and before committing
it. The retry intentionally has the same identity. The receiver must combine
durable idempotency-key deduplication and its effects in its own transaction;
signatures and SQLite leases do not provide exactly-once effects. A crash before
send can exhaust reservations without any receiver acknowledgement. Delivery
is not guaranteed when a destination stays unavailable, the budget is exhausted
or the service stops polling.

Leases use the deployment's wall clock and local SQLite storage. Maintain
consistent clocks across workers. A forward jump or process pause can expire
a still-running attempt; fencing protects database completion, while receiver
deduplication handles overlapping side effects. A backward clock delays
eligibility, and the worker clamps finish time to its start rather than writing
decreasing attempt times. Runtime cancellation and deadlines abort the transport
and discard late results. They cannot retract a receiver effect.

[delivery-leases.test.ts](test/delivery-leases.test.ts) covers competing SQLite
connections, reopening, expired and forged tokens, saved policies, exponential
delay caps, repeated abandoned reservations, legacy history, migration and
transaction rollback under injected failures.
[delivery-worker.test.ts](test/delivery-worker.test.ts) covers concurrent
workers, cancellation, deadlines, stale acknowledgements, signing and transport
failures, and a real loopback HTTP receiver through the trusted transport seam.
That receiver acts before dropping its first acknowledgement, then verifies
the retry's signature and stable bytes after store and vault reopening. Other
local receiver cases cover retry exhaustion and destination revalidation. These
tests establish local delivery behavior, not power-loss durability, physical
event accuracy or the reliability of external receivers.

## Authenticated control API

`createControlServer` in [src/control-api.ts](src/control-api.ts) creates an
unbound Node HTTP server from `{ store, vault, bearerToken, policy?, now? }`.
The caller owns listening, shutdown and the store and vault lifetimes. Creating
or closing the server does not start workers or close those databases. Service
configuration and lifecycle wiring remain a later milestone.

Supply a random admin token as runtime bytes, separately from both the vault
wrapping key and receiver signing keys. Clients send its canonical base64url
encoding as `Authorization: Bearer <runtime-token>`. The server copies the
bytes, compares a correctly encoded candidate with `timingSafeEqual`, and
clears its owned copy when the server closes. There is no token export or
provisioning endpoint. Tokens, shared signing keys and authorization headers
must stay out of files, shell arguments, proxy access logs and request tracing.
The implementation does not log requests, bodies, headers or exception text.
JavaScript strings and network buffers cannot be guaranteed erased.

This is a single-admin API: the token grants access to all subscriptions and
key administration. It has no tenant isolation, account authentication, token
rotation endpoint or per-route roles. Bind to loopback or a private listener
behind a TLS boundary with restricted access. The HTTP server itself does not
terminate TLS; bearer tokens and key provisioning require protected transport.
Tests use ephemeral loopback HTTP listeners and runtime-generated credentials.
The outbound delivery transport continues to enforce HTTPS independently.

Authentication precedes routing, body parsing and persistence access. Missing,
wrong, duplicate or noncanonical credentials receive `unauthorized`. Query
parameters and cookies cannot authenticate. Browser Origin headers are refused,
with no CORS response. The API accepts programmatic callers only. Subscription
creation validates syntax and signing-key recoverability without DNS or a test
callback request; every delivery still validates its destination.

All paths are literal, case-sensitive paths under `/v1`, with no trailing slash.
Identifiers use the existing storage alphabet. Unknown parameters and repeated
query parameter names are rejected. Requests that carry JSON require
`Content-Type: application/json`, optionally with `charset=utf-8`. Invalid UTF-8,
malformed JSON, compressed request bodies and Expect handshakes are refused.
GET and DELETE requests must have empty bodies. Responses use JSON, no-store
caching and connection close. HTTP parser failures can instead return an empty
error response before application authentication.

| Method and path | Input and behavior |
| --- | --- |
| `POST /v1/subscriptions` | A complete subscription specification. Returns the stored record, a generated identifier, Location and ETag. Creation has no request idempotency contract; inspect before retrying an uncertain creation. |
| `GET /v1/subscriptions` | Lists live records with `after` and `limit` parameters. |
| `GET /v1/subscriptions/<id>` | Returns the stored record and ETag, including a deletion tombstone. |
| `PUT /v1/subscriptions/<id>` | Replaces the complete specification; requires its current ETag as If-Match. |
| `DELETE /v1/subscriptions/<id>` | Saves a deletion tombstone; requires the current ETag as If-Match. |
| `POST /v1/signing-keys` | `{ secretRef, secret }`, where secret is a caller-held random shared key encoded as canonical base64url. Returns reference and status only. |
| `GET /v1/signing-keys/<ref>` | Inspects key metadata without exporting or decrypting the key. |
| `DELETE /v1/signing-keys/<ref>` | Permanently revokes the reference. Repeated revocation returns its revoked metadata. |
| `GET /v1/deliveries` | Lists redacted delivery records using `after` and `limit`. |
| `GET /v1/deliveries/<eventId>` | Returns a redacted delivery record and its dead-letter metadata, if any. |
| `GET /v1/deliveries/<eventId>/attempts` | Lists completed outcomes; `after` is an exclusive attempt number. |
| `GET /v1/dead-letters` | Lists retained dead-letter metadata using `after` and `limit`. Requeue belongs to the replay milestone. |

Stored subscription responses include `id`, `revision`, `spec`, creation and
update times and `deletedAt`. The authenticated admin can inspect callback URLs
and filter expressions through these records; they are not diagnostic logs.
A signing-key reference remains opaque metadata. Actual key material is never
included in subscription or key responses. Provisioning cannot overwrite or
restore an existing reference. Rotation provisions a new reference before an
update. An enabled subscription must have a recoverable available signing key;
a disabled draft may refer to an unavailable key. Each delivery still checks
availability at signing time, since later revocation can invalidate a key.

ETags are quoted revision integers. Updates and deletion accept a single exact
If-Match value; wildcards, lists and weak validators are refused. A missing
precondition returns `revision-required`; a stale revision returns
`revision-conflict` without writing. A valid replacement increments the
revision and resets its discovery cursor to the new schedule start. Disabled
and deleted subscriptions stop discovery. Deletion increments the revision,
retains its tombstone for inspection, omits it from live listings and refuses
later edits or repeated deletion. Saved events and delivery attempts remain
intact. Queued deliveries keep their original callback URL and signing-key
reference and can still be delivered after an edit, disable or deletion.

List responses are `{ items, nextAfter }`. Continue by passing the non-null
`nextAfter` as `after` with the same limit. A full final page returns its last
identifier and needs an additional empty page to establish exhaustion. Pages
are ordered by identifier, or attempt number, and do not form a snapshot
across requests. Records inserted earlier in the order appear on a fresh pass.

The delivery-log SQL selects only event and subscription identifiers,
subscription revision, occurrence time, delivery status, availability,
completed attempt count and update time. It never selects payload bytes,
receipt contents, payload hashes, occurrence or idempotency keys, callback URLs,
signing-key references or lease tokens. Detail responses add fixed dead-letter
fields. Attempts contain only their identifiers, sequence numbers, start and
finish times and the saved fixed outcome or HTTP status. Active reservations
are not completed attempts. Inspection is read-only and does not recover,
claim, acknowledge or replay work.

Requests and listings have explicit policy limits in `CONTROL_DEFAULTS` and
`CONTROL_LIMITS`. These are service input limits, not throughput or latency
measurements. [control-api.test.ts](test/control-api.test.ts) enforces defaults,
configuration caps, revision conflicts and pagination over synthetic records.
[control-http.test.ts](test/control-http.test.ts) exercises body, target, header,
response and timeout rejection against local sockets, including the exact
configured body boundary.

| Setting | Default | Configuration cap | Unit |
| --- | ---: | ---: | --- |
| `maxRequestBytes` | 16384 | 65536 | Encoded body bytes |
| `maxHeaderBytes` | 8192 | 16384 | Node HTTP parser header bytes |
| `requestTimeoutMs` | 5000 | 60000 | Milliseconds |
| `defaultPageSize` | 25 | 100 | Records |
| `maxPageSize` | 100 | 100 | Records |

All settings must be positive safe integers, with default page size no greater
than maximum page size. Request targets have a fixed limit of 4096 UTF-8 bytes;
serialized responses have a fixed limit of 1048576 UTF-8 bytes. A response
exceeding that limit returns `response-too-large`; retry a listing with a
smaller page. The admin token and each provisioned signing key require exactly
32 bytes, encoded canonically without padding. The constructor and provisioning
boundary tests in the files above enforce these sizes with runtime randomness.

The application deadline starts after headers and does not reset as body
chunks arrive. It aborts incomplete reads and is checked again before routing.
Node separately bounds incomplete headers and whole-request parsing with its
parser deadlines and a configured connection-check interval. The event loop
must remain responsive for timers to fire. Synchronous validation and SQLite
writes cannot be interrupted or rolled back by a later network disconnect;
once a request has entered its write, losing the response can leave a committed
operation. Re-read the record before deciding how to retry. The server closes
connections after responses and permits only the first request on a socket.

Application errors return `{ error: { code, field? } }` with fixed values,
without supplied URLs, expressions, keys, SQL, paths or arbitrary exceptions.
Unavailable storage or vault internals return `service-unavailable`. Protocol
parser errors omit diagnostic text. The tests cover authentication before
storage, concurrent edits, key custody, revocation, connection reopening,
redacted logs, stale revisions, malformed requests, timeouts and disconnects.
These checks establish local control behavior, not protection of a compromised
process, multi-tenant authorization or external receiver reliability.
