# Engine changelog

## 0.1.1-rc.0 — unreleased candidate

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
