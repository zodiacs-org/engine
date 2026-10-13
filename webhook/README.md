# Outbound astrology webhooks

This private workbench is being built according to [PLAN.md](PLAN.md). The
implemented milestone is subscription syntax validation. It does not yet run
a service, search the engine, resolve signing keys, store records or deliver
requests. Later milestones add those paths and a subscription control API.
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
secret provisioning milestone will bind references to recoverable protected
keys and reject unavailable keys before activation. No actual secret or token
belongs in source, examples or fixtures.

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
