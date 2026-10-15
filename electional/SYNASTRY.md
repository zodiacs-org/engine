# Synthetic natal aspect windows

`evaluateSynastryRule(rule, window, natal, runtime, eventsCapability, options)`
evaluates a `synastry-aspect` rule. Load the read-only native bridge with
`loadSynastryRuntime()`. The result is a fact about the selected aspects and
intervals under stated conventions. It does not assign a compatibility score.
These selection conventions are traditional, not predictions.

## Native policy and pair matching

The evaluator calls the engine's `findInterAspects`, the same relationship
helper used by `synastry` and `transits`. It does not build a second aspect
matcher. Native major-aspect definitions are read from the existing engine
metadata. The result records that metadata and every selected moving/natal
pair's effective orb. `maxOrbDegrees` is an additional inclusive cap on the
native orb, including the native luminary allowance. It can narrow that orb;
it cannot widen it. Selected aspect types filter the native result.

This is the native helper's historical floating-point arithmetic, with its
closest eligible aspect and native definition order for ties. It differs from
the engine's configured exact-binary aspect API used for `applying-aspect`.
No applying, separating or stationary filter is imposed by this rule. An
exact contact qualifies, including a same-named body across the two charts.

`match: any` means at least one moving/natal pair has a selected aspect.
`match: all` means every pair in the Cartesian product must have a selected
aspect. The selected types remain alternatives within each pair. It does not
mean that each moving body may choose a different single natal target while
leaving the other pairs unmatched. The hand-derived cases in
[synastry-windows.json](test/fixtures/synastry-windows.json) enforce those
sets and inclusive millisecond ownership.

## Natal resolution, frames and provenance

The input must declare one synthetic natal chart, resolved on UTC with a
location and house system, as [RULES.md](RULES.md) describes. Validation copies
it before any sampling or capability refusal. `synthetic: true` remains a
caller assertion. Use invented inputs only.

The evaluator casts that chart once through the existing `chart` API and
retains the full native receipt, selected natal longitudes, input, actual
house system and flags. A polar house fallback is recorded; it does not affect
this longitude-only rule. Degenerate natal pole locations are refused because
this path requests a chart with angles. The selected natal bodies must each
be present exactly once. Later samples use the existing `calc` API for moving
positions and speeds and retain their full native receipts.

Natal longitudes stay fixed in the tropical ecliptic of their natal date.
Moving longitudes use the tropical ecliptic of the search date. This is the
existing inter-chart helper's astrology convention; neither chart is precessed
into the other's frame. It does not describe two vectors on one inertial
celestial frame. A TT or UT1 moving window keeps that clock throughout its
scans and receipts, while the natal request remains explicitly UTC. A numeric
TT label is never formatted as a UTC time. Native coverage refusals for either
instant are preserved.

`natal.receipt` covers the complete native natal chart. Each remaining receipt
covers one moving `calc` request. The helper has no native receipt of its own;
`policy` records the selection conventions without claiming an authenticated
receipt. Events audits keep the module URL and entry-file digest, with the
same limited identity scope described in [ADAPTERS.md](ADAPTERS.md).

## Boundaries, work and limits

Boundary discovery delegates to the existing events longitude scanner, using
relative longitude to the fixed natal point. Thresholds are both sides of each
selected aspect at the effective orb. Additional delegated speed-zero searches
partition moving turns, so classification can retain sampled tangencies and
exact contacts. Their shifted speed coordinate is explicitly labeled as a
derived scalar in the audit; its placeholder native body is not the rule body.
No second event solver or root refinement is implemented here.

The scan window includes a requested-step pad and a left ownership guard.
Inclusive noncollapsed numerical root brackets become unresolved intervals.
Collapsed roots get a separate integer label so an inclusive orb exit or exact
contact keeps its ownership. Cells between cuts are classified through native
inter-chart analysis at their endpoints and midpoint; disagreements are
unresolved. Unknown spans belong to neither passing nor failing coverage.

Completeness remains conditional on the source scanner's assumptions:
continuous coordinates, less than a half-turn per scan cell, and no hidden
multiple crossings of a threshold in a cell. Speed-zero cuts can reveal some
touches, but they do not prove all extrema, very narrow passages, tangencies
or discontinuities have been found. The engine's finite-difference speed and
its clock seams retain their existing limits. Numerical root brackets do not
enclose physical ephemeris error. These limits apply even when status is
`complete` with `completeness: source-scan-assumptions`.

The natal request, boundary search samples, speed samples and classifications
share one `maxEvaluations` budget. `evaluations` counts native chart/calc API
requests, including failed requests, rather than internal ephemeris samples.
The native synastry helper adds no ephemeris requests. Cancellation is checked
between synchronous requests and cannot interrupt one already in flight.
Budget, cancellation, coverage, missing capability and native refusals return
empty satisfied, failed and covered sets, retaining receipts and completed
audits from prior work. Unexpected source failures throw. All result data is
copied and frozen, leaving caller input and native helper rows mutable.

## Independent reference and reproduction

[synastry-cases.json](references/synastry-cases.json) declares the independent
Moon-to-fixed-Sun/Jupiter comparison from 2023-10-03 to 2023-10-28 TT. Its
invented natal UTC instant maps to the first row of the existing October
Horizons series, using the applicable IERS leap-second row and the published
TT-to-TAI offset. [synastry-horizons.mjs](scripts/synastry-horizons.mjs) verifies
those source digests and clock arithmetic independently, holds the source
natal longitudes fixed, and reduces threshold crossings by hourly short-arc
interpolation. Its interval composition is separate from this library and
imports neither engine nor events. Source, frame, acquisition and
redistribution terms are in [references/README.md](references/README.md).

The selected sextile, square and trine policy has a six-degree user cap. The
native luminary limits make the effective sextile orb five degrees and leave
the other selected orbs at six. The native-policy tests and independent
reducer enforce these choices. They are conventions rather than accuracy
claims. [synastry-references.electional-check.ts](test/synastry-references.electional-check.ts)
checks any/all membership away from independent edges and compares those edges
with the declared 600000 millisecond threshold. That threshold is inherited
from the existing Horizons comparison and covers these cases only; it is not
a general physical error bound. Hand-derived integer-label fixtures establish
exact interval behavior separately.

From this folder on its declared Node runtime:

```sh
npm run typecheck
npm test -- --reporter=default --reporter=json --outputFile=generated/m9-vitest.json
npm run build
node scripts/check-synastry-esm.mjs
node scripts/synastry-horizons.mjs --verify
npm run check:isolation
node scripts/record-m9-tests.mjs
```

The test-run receipt in [docs/evidence/m9-tests.json](docs/evidence/m9-tests.json)
records the runtime, statuses and source digests. Its recording script requires
native synthetic and independent comparisons to pass and refuses to count
skips as evidence. `--reduce` writes reference regeneration into the ignored
`generated/synastry-horizons.json` for review. It never overwrites the committed
reference. No performance, exhaustive completeness or predictive claim is
made beyond the checked cases.
