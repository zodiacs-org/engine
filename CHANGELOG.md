# Engine changelog

## 0.1.1-rc.8

- Observed ΔT with a band (Phase 1 step 1.4). The model `zodiacs-deltat/1`
  replaces astronomy-engine's 2004 polynomial: Stephenson, Morrison &
  Hohenkerk's 2016 reconstruction to 1941, USNO and IERS values from 1941,
  Bulletin A's predictions, then a damped extrapolation. Today ΔT falls from
  75.50 s to 69.20 s (IERS: 69.20 s): the Moon moves back 3.4″, and Moon
  events come about 6 s later. At 2100 ΔT is 78.9 ± 42.4 s, where rc.7 gave
  202.7 s. Every chart reports `deltaT`; birth inputs take a `deltaT` pin;
  `@zodiacs/engine/deltat` exports the model with no dependencies.
- Receipts record ΔT (`result.deltaT`, conventions `deltaT`) and name the
  ephemeris (`receipt.engine.ephemeris`, astronomy-engine 2.1.19, now an
  exact dependency pin). The conventions no longer call the planets
  "apparent": they are aberrated but not deflected, and the Moon has
  neither correction. rc.7's conventions are frozen; each set is read only
  from the engine versions that wrote it, and receipts from rc.3 to rc.7
  still parse and replay.
- `REFERENCE_SPAN`: a chart before 1800-01-01T00:00Z or from
  2200-01-01T00:00Z carries the new `outside-reference-span` flag.
- One longitude-crossing solver, the one the site runs. It moves into the
  package as `@zodiacs/engine/crossings`: `findLongitudeCrossingsWith` and
  `searchLongitudeCrossingsWith` take the longitude function as their first
  argument and import no ephemeris. `findLongitudeCrossings` and
  `saturnReturn` run it on the engine's longitudes.
- The window is (from, to]. A root exactly at `from` is no longer returned. A
  sample exactly on the target is returned once, at that sample, including a
  touch and the start of a plateau, which rc.7 dropped.
- A station that falls between two samples just past the target now gives
  both crossings. A natal Saturn 0.002° below its 2019 station gets three
  first-return passes, where rc.7 gave one.
- No sample budget and no `RangeError` for the size of a search. A quarter-day
  Moon scan over 2,600 days returns its 95 crossings, and Saturn from 1900 to
  2100 at 5 days its 13, where rc.7 threw at 10,000 samples.
  `searchLongitudeCrossings` takes an optional `maxSamples` and returns a typed
  `refused` result instead of throwing.

Migration: positions move by ΔT's change (the Moon about 3.4″ today, far
more in the far future), charts gain `deltaT` and may gain
`outside-reference-span`, and receipts from rc.8 carry the new conventions.
A crossing exactly at `from` is left out; include it by starting the window
earlier. Exact touches and grazing station pairs can add crossings to
Saturn-return seasons. Code that relied on the `RangeError` to bound work
should pass `maxSamples` to `searchLongitudeCrossings`.

## 0.1.1-rc.7

- Judge an aspect applying from the sign of its orb's rate of change. The old
  rule moved both bodies 0.02 day ahead, and so read every aspect as separating
  for the last 14.4 minutes before exact. `aspectMotion`, `AspectMotion` and
  `STATIONARY_RELATIVE_SPEED` are exported; `Aspect.applying` stays a boolean.
- Take each speed as the derivative of the reported longitude over ±0.001 day.
  The Moon's step error at perigee falls from 7.55″ a day to 0.0015″ a day. The
  true node keeps ±0.25 day. The Saturn return scan takes natal Saturn's
  direction from the same speed as the chart.
- Build the ascendant and midheaven on the true obliquity of date, the one that
  matches apparent sidereal time. Against ERFA on the 3,128-case grid, the
  ascendant's largest error falls from 506.8″ to 6.36″, and within 45° of the
  equator from 14.6″ to 0.36″. The midheaven's falls from 2.25″ to 0.20″.
- Put the Placidus limit at 90° minus the true obliquity, 66.53° to 66.59° over
  1800–2200, where it was 66°. Between the two, Placidus is now computed
  instead of falling back to whole sign.
- Offer `houseSystem: "porphyry"`. It is defined wherever the ascendant and
  midheaven are, including inside the polar circle. Placidus keeps whole sign
  as its polar fallback, now exported as `PLACIDUS_POLAR_FALLBACK` and returned
  as `fallbackSystem`.
- Receipts record the new speed, aspect and angle conventions. The set that
  rc.3 to rc.6 recorded is kept as `CONVENTIONS_RC3`, and their receipts stay
  readable and replay as before. `NATAL_RECEIPT_CONVENTION_SETS` lists both
  sets. A receipt must match one set exactly, and the old set only with an rc.3
  to rc.6 version. Porphyry is accepted only in the new set.

Migration: planetary longitudes are unchanged. Speeds, the angles, Placidus
cusps between 66° and the polar circle, and the applying flag of aspects close
to exact can change. Recorded receipts are immutable and are not rewritten.

## 0.1.1-rc.6 — unreleased candidate

- Compare the complete civil timestamp, including seconds and milliseconds, when
  matching a local HH:MM input. Historical shifts smaller than one minute now
  receive the correct gap/fold flags; neighboring ordinary times lose false
  ambiguity flags. The selected instants in the retained finite controls agree.
- Normalize only floating-point offset conversion to integer milliseconds.
  Preserve historical offset seconds, actual fractional-minute offsets, earlier
  fold selection and the existing forward-gap policy.
- Retain strict date/time/zone guards and the existing three-point offset
  sampling. This is a precision correction, not a proof of complete transition
  discovery, historical source accuracy or broad astronomical coverage.

Recorded receipts are immutable and are not rewritten. Recomputations can have
corrected time flags under this new version. The receipt schema, core numerical
formulas, ownership SDK, site/starter pins and account protocols are unchanged.
SDK #5's explicit merge/publication hold and required review remain.

## 0.1.1-rc.5 — unreleased candidate

- Preserve all five typed birth flags while checking derived echoes against the
  actual result. Correct unknown-time/polar echoes now produce canonical flags
  once and round-trip through the unchanged draft receipt schema.
- Reject unknown, malformed and contradictory claims. Snapshot up to 64 raw
  data entries without custom array iteration or scalar coercion; deduplicate
  valid claims. Canonical input records semantics, not the submitted array.
- Validate supplied Chart flag consistency against its input and house/angle
  metadata. Keep canonical object identity; normalize compatible echoes with a
  shallow metadata copy. This does not authenticate astronomical values.
- Capture validated public/civil settings once. Reject invalid civil settings
  and explicit null local time before Intl resolution. Ordinary Saturn inputs
  remain date-only; an explicit raw polar assertion requires one natal
  calculation before the return scan.

Migration: do not use flags to override timeKnown or the requested house system.
Fix contradictory/missing result claims in supplied Charts. Arrays over 64 raw
entries reject. Historical time flags remain assertions; executable same-realm
getters/proxies are not sandboxed. Internal computation, receipt wire format,
site/starter pins and ownership APIs are unchanged. Required review and SDK #5's
explicit merge/publication hold remain.

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
