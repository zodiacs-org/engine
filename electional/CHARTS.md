# House, angular and applying-aspect windows

`evaluateChartRule(rule, window, location, houseSystem, runtime,
 eventsCapability, options)` evaluates a `benefic-house`, `benefic-angular`
or `applying-aspect` rule. Load the read-only native bridge with
`loadChartRuntime()`. The rule, location, house system, clock and work options
are validated before work or a capability refusal. Results keep the rule's
mode and preference weight for the later scoring layer. These are traditional
selection conventions, not predictions.

## Definitions and delegation

| Rule | Selected condition | Native APIs |
| --- | --- | --- |
| `benefic-house` | Each selected benefic may occupy any selected house. `match` combines the selected bodies. | `birthWindow` cells, `chart` endpoint provenance and `houseOf` endpoint consistency. |
| `benefic-angular` | Each selected benefic may lie within the inclusive longitude orb of any selected angle. `match` combines the selected bodies. | `chart`, `separation`, and events `searchLongitudeCrossings` over relative body/angle longitude. |
| `applying-aspect` | The moving body has a configured applying aspect to a selected target. `match` combines the targets. | `calc`, `createAspectPolicy`, `findConfiguredAspects`, and events `searchLongitudeCrossings` over relative longitude and relative speed. |

House membership follows the chart's cusp longitudes, without body latitude,
as the engine's birth-window entry defines it. It is different from a spatial
house position computed with the houses entry's latitude-aware API. Angular
means ecliptic longitude distance from an angle, not angular-house membership,
horizon altitude, or a body rising or culminating. `descendant` and
`imum-coeli` use the native chart's opposite axes. Angular distance uses the
engine's existing floating-point `separation` helper; it makes no claim about
an angle's speed.

Applying aspects use the configured API's exact binary arithmetic and closest
eligible aspect per pair, with aspect definition order breaking a tie. The
same declared orb applies to every selected aspect and body; there is no
implicit luminary allowance. The explicit stationary-relative-speed threshold
is zero: equal speeds are stationary and never applying. An exact moving
contact is separating. This is instantaneous decreasing orb, without a
requirement that a contact perfect before ingress, a later station, or a
particular deadline. It does not use the natal chart's default aspect list.

The numerical convention tests in
[chart-rules.electional-check.ts](test/chart-rules.electional-check.ts) enforce
inclusive orb endpoints, exact separating labels, stationary motion, all/any
matching and selected-angle semantics on invented coordinates. Expected sets
and derivations are in [chart-windows.json](test/fixtures/chart-windows.json).
They establish interval logic and API control flow, not sky accuracy.

## Partitions, root brackets and coverage

For houses the evaluator selects existing native window cells, without
searching or refining a house boundary. It chunks a longer request into the
native API's allowed durations and checks that cells tile each request. Its
endpoint charts must agree with the cells' selected-body membership and
actual house system. Every partition audit names the requested and actual
systems, engine version, native flags and verification label. It also retains
the selected-body house rows and actual system in each cell, so an allowed
fallback is traceable to its exact span. A whole-sign
fallback from requested Placidus or Koch is selected only when
`polarFallback: allow`; `reject` leaves those cells unresolved. It is not a
failed membership claim. A native `bound-exceeded` flag makes that partition
unknown. Node-only unresolved cells do not invalidate Venus/Jupiter, while
null membership of a selected benefic does.

House partitions accept UTC only, because native `birthWindow` has no
explicit TT/UT1 input. The evaluator refuses a different clock. Angular and
applying evaluations retain UTC, UT1 or TT coordinates in requests, scans and
receipts. Numeric TT and UT1 labels never become UTC timestamps. The engine's
native coverage refusals are preserved; padding does not extend its supported
span. Degenerate pole locations and unrepresentable padding are coverage
refusals. File configurations still use resolved UTC ranges only.

For angular and applying rules the evaluator searches the relevant threshold
coordinates with the existing events scanner. Angular thresholds are the
selected relative-longitude orb edges. Applying thresholds include exact
contacts, orb edges, circular corners, closest-aspect handoffs for overlapping
orbs, and zero relative speed. A relative-speed search is a scalar coordinate
shifted into the longitude scanner's domain, not a planetary longitude or a
single body's station. Its audit names that coordinate and retains the
native placeholder body label separately from the actual rule bodies. No
angle is assigned an invented physical speed.

Searches are padded by the requested step and a left ownership guard. Returned
root brackets are validated, retained in audits, and clipped to the requested
window. Every label in an inclusive noncollapsed bracket is unresolved. A
collapsed root is classified as its own integer label so inclusive orb entry
and exact separating contacts keep their actual ownership. Between roots the
engine classifies endpoint and midpoint samples; disagreement makes the
whole cell unknown rather than choosing one sample's answer.

`completeness: source-scan-assumptions` is conditional. The source scanner
needs continuous scalar coordinates, less than a half-turn per scan cell,
and at most one crossing of a target within a cell. Same-side excursions,
unobserved tangencies, steps in the native time basis, and discontinuous polar
axes can violate those assumptions. Classifying endpoints and a midpoint
can detect some violations, not all. Choose the step for the bodies, angles
and location, and treat polar angular scans and exact tangencies with that
limitation. Neither a small numerical bracket nor a completed scan encloses
physical ephemeris error or proves exhaustive event discovery.

## Work and provenance

All native chart/calc requests, classifications and delegated searches share
`maxEvaluations`; every underlying chart/calc call is charged individually.
Each successful chart/calc request contributes its complete native engine
receipt. Applying results also retain the resolved configured-aspect policy.
Unexpected source errors throw. Budget, cancellation, missing capability and
native refusals return an empty satisfied/failed/covered result, preserving
receipts and completed audits from work already performed.

Native `birthWindow` is a synchronous API with its own fixed internal sample
budget. It neither accepts a caller sample budget nor reports samples spent.
Here `evaluations` counts that call as an API request, alongside its endpoint
charts; `evaluationScope` explicitly excludes internal window samples.
`partitions[].internalWork` records that separate limit. Native budget
exhaustion becomes a refusal. Cancellation is checked between synchronous
calls, including the partition call, and cannot interrupt one in flight.
The hand-derived chunk and budget tests enforce this request accounting,
not a runtime or ephemeris-sample limit.

The window API supplies no native receipt. Its audits state
`partition-endpoint-chart-provenance;window-api-has-no-native-receipt`:
endpoint receipts do not attest to every internal partition sample. Events
audits retain their source URL and entry-file digest, which does not
authenticate dependencies or a published artifact. All result data is copied
and frozen, including policies, receipts and numerical event brackets.

## Independent references and reproduction

[chart-cases.json](references/chart-cases.json) declares a Moon-to-Sun/Jupiter
applying comparison over the TT coordinates 2023-10-03 to 2023-10-28. It uses
an inclusive five-degree orb for the major aspects and a boundary acceptance
threshold of 600000 milliseconds, enforced by
[chart-references.electional-check.ts](test/chart-references.electional-check.ts).
This is the existing Horizons comparison threshold, not a general error
bound. The reference is NASA/JPL Horizons DE441, apparent geocentric
longitude of date, with the clock, frame, attribution, acquisition and terms
recorded in [references/README.md](references/README.md).

[chart-horizons.json](references/chart-horizons.json) binds the already
committed Moon/Sun and additional planetary response files by digest.
[scripts/chart-horizons.mjs](scripts/chart-horizons.mjs) verifies those inputs
and reduces applying windows independently. Relative lunar motion is checked
as strictly increasing in each hourly cell. Entries are interpolated at the
incoming orb edge; exits at the exact aspect. It assembles any/all sets with
its own small reference-only union/intersection arithmetic, outside the
library. It imports neither the engine nor events, and the reference contains
no expected value derived from their outputs.

The reference test compares boundaries and Boolean membership away from the
declared tolerance around independent edges. It covers only this span,
target selection and policy. Separate native chart/house and synthetic
scanner comparisons are delegation checks, not astronomical accuracy evidence.
When the read-only events build is absent those native comparisons are skipped;
missing capability does not become passing evidence. The run receipt is
[docs/evidence/m7-tests.json](docs/evidence/m7-tests.json), generated from
Vitest's JSON report by [record-m7-tests.mjs](scripts/record-m7-tests.mjs).

From this folder using its declared runtime:

```sh
npm run typecheck
npm test -- --reporter=default --reporter=json --outputFile=generated/m7-vitest.json
npm run build
node scripts/check-chart-esm.mjs
node scripts/chart-horizons.mjs --verify
npm run check:isolation
node scripts/record-m7-tests.mjs
```

The ESM smoke script executes native fallback handling and explicit clock and
capability refusals. Reference regeneration writes only the ignored
`generated/chart-horizons.json` with `node scripts/chart-horizons.mjs --reduce`
for review. Generated outputs are not distributed in the engine package.
