# Engine changelog

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
