# Engine changelog

## 0.1.1-rc.4 — unreleased candidate

- Validate the optional GeoNames client's compact v1 index and requested shard
  before caching fulfillment. Malformed HTTP-200 JSON now rejects with a fixed
  schema error and can be retried by a later explicit call.
- Reject unsafe table indices, coerced/out-of-range coordinates and malformed
  rows before returning partial results. Preserve Unicode names, empty region
  and country labels, geographical endpoints and host-independent timezone
  strings. No automatic retries, eager shard requests or new network endpoint.
- Return metadata array snapshots from `preload()` so caller mutation cannot
  alter validated cache state. Keep valid/in-flight cache sharing and original
  fetch/HTTP/JSON-parser failures.
- These checks do not authenticate place facts or detect structurally valid
  mixed-generation data. The v1 assets lack generation/content identities;
  hosts must serve matching index and shards together.

Site application rc.1 and the separately delivered standalone starter rc.3
remain pinned to their existing artifacts. Numerical calculations are unchanged
apart from the reported engine version. SDK #5's explicit review/publication
hold remains; this entry is not npm publication or production release.

## 0.1.1-rc.3 — unreleased candidate

- Add an optional draft natal receipt/envelope entry point for bounded local
  export/import, requested-versus-actual house preservation and redacted
  diagnostics. This does not change account sync v1 or establish an industry
  standard. Preserve original ISO spelling when captured and replay the recorded
  request without consulting today's timezone database. Imported provenance is
  an unauthenticated claim; recalculation across versions may differ.
- Reject duplicate decoded JSON keys, unknown versions/features, excessive
  input, inconsistent flags/results and unsupported exact-pole angles. Keep
  parser exceptions and arbitrary imported metadata out of diagnostics.
- The site and starter retain rc.1. Package publication, production release and
  required human/external review remain separate gates.

## 0.1.1-rc.2 — unreleased candidate

- Permit a later explicit GeoNames preload/search call to retry after rejected
  network requests, unsuccessful HTTP responses or JSON parsing failures.
- Preserve shared in-flight requests, successful index/shard caches and original
  rejection reasons. No automatic retry loop or per-caller cancellation API.
- This does not validate structurally invalid but parseable JSON responses.
  The site and public starter retain their immutable rc.1 candidate.

This candidate changes the optional geo client only; existing numerical
calculations are unchanged apart from the reported package version. The SDK
PR #5 review/publication hold remains.

## 0.1.1-rc.1 — unreleased candidate

- Correct the polar ascendant in the shared implementation before deriving
  houses. Public consumers and the site receive the same rising axis.
- Require Placidus iteration convergence; allow up to 64 iterations and use
  a tighter stopping criterion, retaining the conservative 66-degree limit.
- Reject invalid calendar dates, ambiguous local date-times, non-date
  coercions, unsupported house systems and nonboolean unknown-time settings.
  Date-only ISO inputs still mean UTC midnight; date-times require an offset.
- Add public contract regressions and a real packed-consumer ESM/types check.
- Bound longitude-crossing work and reject steps that cannot advance time.
- Emit an exact coarse-sample crossing once, with explicit endpoint semantics.
- Preserve proleptic Gregorian years below 100 in local-time conversion;
  format historical years without false daylight-saving gap flags.

Migration: valid resolved inputs retain their shape. Callers previously relying
on `Date` rollover, implicit machine timezone, or silently ignored settings must
resolve/correct those inputs. Do not compare cached chart receipts across
versions without recalculation. No ownership SDK API changes.

Release holds remain in SDK PR #5. This entry records implementation, not
publication, deployment, full external review, or adoption.
