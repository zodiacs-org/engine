# Basic rule windows

`evaluateBasicRule(rule, window, engine, eventsCapability, options)` evaluates
a Moon sign, Moon phase or direct-motion rule. It returns separate `satisfied`,
`failed` and `unresolved` spans on the input window's declared clock. It does
not combine rules, apply preference weights, rank candidates or predict an
activity's outcome. The returned rule keeps its validated mode and weight for
the factual composition layer. These are traditional selection conventions.

The function validates and copies the rule through the configuration schema.
It validates the explicit clock, integer endpoints, positive scan step and
evaluation budget even when the events capability is missing. It accepts the
same explicit UTC, UT1 and TT coordinates as the adapters. Configuration files
still accept resolved UTC ranges only. No location or natal chart is required
by these geocentric rules.

## State assembly

The engine `calc` API supplies the initial tropical longitude and, for motion,
longitude speed. All requests declare apparent, geocentric, true ecliptic of
date, degree conventions. The events package supplies the transitions:

| Rule | Transition source | Eligibility |
| --- | --- | --- |
| `moon-sign` | `searchSignIngresses` for Moon | Any selected sign. Source title-case sign names map to the schema's lowercase slugs. |
| `moon-phase` | `searchExactAspects` for Moon relative to moving Sun with custom phase-sector angles | Any selected named elongation sector. |
| `direct-motion` | `searchStations` for each selected body | All selected bodies in the direct segment. |

Moon phase names use the engine's `moonPhase` sector convention: successive
sectors change at 22.5 degrees plus multiples of 45 degrees. New Moon wraps
through zero elongation. These are named ranges, not isolated exact new or
full Moon instants, and not illumination thresholds. The custom aspect policy
uses the unsigned angles and the events package supplies both relative-longitude
branches. The boundary and complete-cycle membership tests in
[basic-rules.electional-check.ts](test/basic-rules.electional-check.ts) enforce
these definitions on the hand-derived labels in
[basic-windows.json](test/fixtures/basic-windows.json). The independent dates
for the same boundaries come from [JPL Horizons](references/README.md).

Direct segments start at the source's station to direct motion and stop at its
station to retrograde motion. A collapsed numerical station belongs to the
outgoing segment. This is an interval convention, not a claim of strictly
positive speed at an exact zero or a claim that stations are desirable.
Station-avoidance margins belong to their later evaluator. A zero-speed
initial sample establishes no motion direction and leaves the requested
window unresolved for that body.

For each state rule the scan is padded by its explicit `stepMs` on either side,
then assembled states are clipped to the requested half-open window. This
retains root brackets near either requested endpoint. Stations also need
incoming and outgoing motion to confirm a change. The adapter adds its usual
left ownership guard to the padded domain. Unrepresentable padding or native
calculation refusal produces a refusal; padding never extends native coverage.
Seeds and all delegated scans share the same evaluation budget, including
both phase bodies and all selected motion bodies.

There is no sampling loop, bisection, numerical derivative or event solver in
the evaluator. It sorts returned transitions, assembles constant states,
intersects selected-body motion windows, and checks state continuity. Repeated
transitions at the same label, invalid directions, unexpected bodies and
malformed brackets throw as incompatible source results.

## Results and uncertainty

Every result includes the copied rule, input window, plain-language convention
explanation, evaluation count, full native engine receipts for successful
calculations, and delegated search audit results. Search audits retain the
source module URL and entry-file digest, padded source windows, events,
coverage and refusals. As in [ADAPTERS.md](ADAPTERS.md), an entry-file digest
does not authenticate its dependencies or a published build.

A result with `status: complete` partitions the window into satisfied and
failed spans under the source scan assumptions. A result with
`status: unresolved` additionally contains unknown spans, excluded from both
satisfied and failed lists. `covered` is the input domain outside these unknown
spans. A noncollapsed numerical root bracket excludes every integer label
between its inclusive endpoints. This is numerical boundary uncertainty only;
it does not enclose physical ephemeris or frame error. A collapsed bracket
uses the source transition's exact coordinate label and outgoing ownership.

If a source reports unresolved transitions, the evaluator conservatively
leaves that rule's whole domain unresolved: an unobserved transition can
change a later state. It does not infer persistence through a gap. For selected
motion bodies, unknown coverage from any body excludes that coverage from
passing and failing claims for their conjunction.

A `status: refused` result has no satisfied, failed or covered windows. It
retains receipts and audit records for work already performed and distinguishes
missing capability, cancellation, budget exhaustion, coverage and native
engine refusals. Missing capability fabricates no receipt. Unexpected source
errors throw. Cancellation is checked between indivisible synchronous engine
calls, as described by the adapter contract.

All returned data is detached and frozen. `completeness` remains
`source-scan-assumptions`. A small root bracket or completed scan proves
neither exhaustive event discovery nor physical accuracy over an arbitrary
range. Callers must choose a scan step appropriate to the source's assumptions.

## Using the local build

After `npm run build`, a trusted application can load the default fixed sibling
events build as follows. A missing build gives a refusal from the evaluator.
The example uses arbitrary astronomical dates and no birth data; the smoke
test in [scripts/check-basic-esm.mjs](scripts/check-basic-esm.mjs) checks this
public usage and missing-capability behavior without pinning sky output.

```js
import {
  evaluateBasicRule, loadEngineRuntime, loadEventsCapability,
} from './build/index.js';

const result = evaluateBasicRule(
  { id: 'moon-sign', kind: 'moon-sign', mode: 'require',
    options: { signs: ['taurus', 'cancer'] } },
  { startMs: Date.parse('2000-01-01T00:00:00Z'),
    endMs: Date.parse('2000-01-02T00:00:00Z'), clock: 'utc' },
  await loadEngineRuntime(), await loadEventsCapability(),
  { stepMs: 21600000, maxEvaluations: 2000 },
);
console.log(result.status, result.explanation);
```

The integration suite additionally imports an already built events checkout
at the fixed relative worktree path `../wt-events/events/build/src/index.js`
from this repository checkout. It reads that module only and never builds,
installs or edits there. This test path is not a configuration or HTTP option.
An absent build explicitly skips those native event comparisons; independent
fixture verification and hand-derived rule tests still run. The default
library loader continues to use the sibling path described in ADAPTERS.md.
