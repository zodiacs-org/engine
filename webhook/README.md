# Outbound astrology webhooks

This private workbench is being built according to [PLAN.md](PLAN.md). The
implemented milestones cover subscription syntax validation, SQLite storage,
encrypted signing-key custody and payload signing with receiver verification.
It does not yet run a service, search the engine or deliver requests. Later
milestones add those paths and a control API.
The code and documentation here use the repository's [MIT license](../LICENSE).

Use Node from the release line accepted by
[check-runtime.mjs](scripts/check-runtime.mjs), matching this project's
`package.json`. All commands below run inside this directory:

```sh
cd webhook
npm ci --ignore-scripts --cache .cache/npm
npm run typecheck
npm test
npm run check:package-isolation
```

Dependencies, caches, build output, coverage and local state are ignored here.
The TypeScript check emits nothing. Vitest runs only this project's tests.
No root dependency installation or engine build is needed for this milestone.
The test suite uses invented inputs and performs no network requests.

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
stage. The transport milestone will enforce address policy at connection time.

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
| `custom` | `expression`, nonblank bounded text | None |

Supported names are the Sun, Moon and planets listed in `EVENT_BODIES` in
[src/types.ts](src/types.ts); nodes and arbitrary points are excluded. Sign
names come from `ZODIAC_SIGNS`. Filters are case-sensitive.

Custom expressions are preserved as text, not parsed or executed in this
milestone. The planned integration uses the existing events DSL's supported
grammar, not JavaScript evaluation. Search semantics must be validated before
custom subscriptions can be activated. Eclipses will use the event provider's
documented geocentric definitions; a subscription does not imply visibility
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
The worker and engine receipt adapter are not implemented yet.

An occurrence key is unique within its subscription across revisions. Event
identifiers and idempotency keys are globally unique. Repeated occurrences
retain the original record only when the event identifier, idempotency key,
instant and exact serialized payload agree. A mismatch rolls back the entire
scan. This prevents a rescan from silently replacing the bytes to be signed.
Payloads are stored as supplied, with their SHA-256, and must be JSON objects;
storage does not validate their engine receipts. Future discoveries are queued
no earlier than the occurrence instant. Event identities will be computed by
the later worker milestone.

`recordAttempt` atomically appends a fixed, redacted outcome and changes a
pending delivery to pending, delivered or dead-letter. Attempt numbers must be
consecutive. Only a successful HTTP status can be recorded as delivered.
Failed attempts carry a status code or a fixed failure kind; response bodies
and arbitrary error strings are not retained. Dead letters reference a retained
attempt and event. Retries, delivery leases and replay remain later milestones;
the storage methods alone do not provide at-least-once delivery.

Listings use bounded pages ordered by identifier (attempts by attempt number),
with an exclusive continuation value. They are inspection methods, not an
atomic worker claim or a snapshot across pages. Storage inputs are local typed
calls; the subscription parser remains the public JSON validation boundary.
Storage errors have fixed codes without SQL or caller data in their messages.
Invalid subscription specifications retain `SubscriptionValidationError` and
its fixed field name; storage-specific validation uses `StorageError`.

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
The future control API must use the validation method, and the future delivery
worker must handle missing or revoked keys without sending unsigned requests.

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
reuse that identity. The transport, delivery worker and replay command are
later milestones; these functions do not claim at-least-once delivery yet.
