# Planetary-hour windows

`evaluateHourRule(rule, window, location, skyRuntime, options)` selects durations
whose native planetary-hour ruler is in the rule's `rulers` list. It returns
`satisfied`, `failed`, `covered` and `unresolved` interval sets, the copied rule
and location, native day audits and engine receipts. The rule's mode and weight
remain available for later scoring. Planetary-hour selection is a traditional
convention, not a prediction about an activity.

The evaluator calls `planetaryHours` from the existing engine sky entry through
the local source bridge. It selects and clips the hours that API supplies; it
does not calculate rise/set events, divide the solar day itself, or search for
roots. `planetaryHourAt` remains available in the bridge for checking an instant
against the native API. The delegation tests use it to check ownership.

## Date ownership and clocks

The native convention divides sunrise to sunset and sunset to the next sunrise
into twelve hours each, in Chaldean order. A planetary day owns its sunrise
and excludes the next sunrise. The historical references and definition are
in the parent [sky guide](../docs/sky.md), including Chaucer, *Treatise on the
Astrolabe*, II.10, and Cassius Dio, *Roman History*, 37.18-19. The hand-derived
fixture [hour-windows.json](test/fixtures/hour-windows.json) and its
[tests](test/hour-rule.electional-check.ts) enforce the selection and boundary
ownership on invented solar-day marks.

`utcOffsetMinutes` is required by the rule schema and defines the calendar
date used for the weekday ruler. It is a fixed offset in minutes east of UTC,
independent of the location's longitude. It does not consult a timezone,
infer local mean time, or adjust for daylight saving. Fractional minutes are
accepted when their millisecond coordinate is an integer; otherwise the
evaluator refuses coverage rather than rounding a calendar boundary. The
offset cases and validation tests enforce this behavior.

Before sunrise, hours belong to an earlier solar day. The evaluator includes
the two calendar dates before the request's first fixed-offset date, then
every date through its last owned instant. This follows the native API's
three-day rise/set search span: a complete earlier day can continue across a
calendar date with no sunrise. The scan-domain and clock-gap tests enforce
this lookback, including a supplied day starting two dates before the request.
An hour's source marks stay intact in its audit even when clipping shortens
the returned window.

The sky entry accepts the engine's UTC input convention only. TT and UT1
windows produce `status: refused`, `reason: unsupported-clock`, before work.
They are never relabelled as UTC. UTC input retains the parent engine's time
basis, including its treatment outside the IERS table, as described in
[README.md](../README.md). No physical time-scale conversion is performed by
this evaluator.

## Missing hours, refusals and uncertainty

The union of complete native hour durations supplies covered intervals. Gaps
outside that union are unresolved with `reason: no-complete-solar-day`, and
belong to neither passing nor failing sets. A missing-sunrise date can still
be covered by an earlier complete day; it does not erase established hours.

Native `no-sunrise`, `no-sunset` and `no-next-sunrise` statuses and the
`never-rises` and `never-sets` flags remain in day audits. These may describe
polar day, polar night, their onset, or a date boundary next to sunrise. The
evaluator never fabricates equal clock hours when the native API supplies no
solar day. Stub tests establish the set logic and native tests establish
status routing. The native tests are delegation checks, not independent
accuracy evidence for polar events.

Native hour marks are the sky API's integer millisecond results. That API
returns no rise/set root brackets or physical error bounds, so the evaluator
cannot construct numerical boundary uncertainty from them. A complete result
uses the native marks under `completeness: source-scan-assumptions`; it proves
neither exhaustive event discovery nor physical certainty at a boundary.
The evaluator records upper solar limb and standard refraction explicitly.
Atmospheric conditions and terrain can move actual sunrise and sunset, as
the [USNO definition](https://aa.usno.navy.mil/faq/RST_defs) explains.

Cancellation, request-budget exhaustion, native sample-budget exhaustion,
unrepresentable calendar padding and engine coverage refusals refuse the
whole rule. Refused results have empty satisfied, failed and covered sets,
with audits and receipts retained for work already performed. Unexpected
source errors and malformed native partitions throw. Completed days with
overlapping hours from different date owners also throw. Returned data is
detached and frozen, without freezing inputs or retaining mutable native Dates.

## Budgets and receipt scope

`options` requires positive integer `maxEvaluations` and `maxSamples`, with an
optional `signal`. The evaluation budget counts requests: two endpoint `calc`
checks and one native sky call per attempted day. The scan-domain tests verify
that the endpoint checks include the native scanner's extra hour on either
side of its three-day scan. All dates share the request budget. `samples`
retains the native scanner's accounting; the remaining `maxSamples` is passed
to each subsequent day. It is a separate budget, not a count of all requests,
unique ephemeris calculations, or elapsed time. Budget tests enforce both
totals, including refusal and early exhaustion.

The sky API has no native receipt. Each day audit records this explicitly as
`receiptScope: scan-endpoint-calc-provenance;sky-api-has-no-native-receipt`.
Native Sun `calc` receipts at scan guards name the injected engine, ephemeris,
resolved instants, time basis and calculation conventions, and check the
calculation API's coverage. They describe those endpoint position calls; they
do not attest to intervening sky samples or to the authenticity of an imported
runtime. The audit retains the location, source scan domain, solar marks,
hours, flags, status, requested offset and native sky conventions separately.
Interrupted endpoint checks remain visible in the result receipts even if a
sky call never runs. Cancellation is checked around indivisible synchronous
calls; a running call cannot be interrupted.

## Independent reference and executable example

[hour-cases.json](references/hour-cases.json) binds its independent reference
to the parent US Naval Observatory ephemeris fixture by SHA-256, with the
original source URL, acquisition date, clock and terms. The reference is
sunrise and sunset at Greenwich on 2000-09-22, reduced by hand into Venus's
first and eighth day hours and clipped to the declared range. The
[reference test](test/hour-references.electional-check.ts) verifies the source
digest and arithmetic before comparing native windows.

The acceptance threshold is 60000 milliseconds for these boundaries on this
date only, enforced by the committed case and test. Published UT minute
labels retain their clock and have no Z suffix; the comparison measures their
nominal coordinate differences from native UTC results, allowing for the
different clocks and solar-disc conventions. It does not assert an exact
physical conversion between UT and UTC. This is finite comparison evidence,
not a general accuracy bound. Raw test output stays in gitignored `generated/`.
The reviewed run receipt in [m6-tests.json](docs/evidence/m6-tests.json) records
the runtime, statuses and source digests. Reproduce its generated summary with
[record-m6-tests.mjs](scripts/record-m6-tests.mjs) after the command recorded in
that receipt. It contains test-run evidence, not engine sky values used as
expectations.

After building from this directory, the following use is checked by
[check-hour-esm.mjs](scripts/check-hour-esm.mjs):

```js
import { evaluateHourRule, loadSkyRuntime } from './build/index.js';

const result = evaluateHourRule(
  { id: 'hour', kind: 'planetary-hour', mode: 'require',
    options: { rulers: ['Venus'], utcOffsetMinutes: 0 } },
  { startMs: Date.parse('2000-09-22T06:00:00Z'),
    endMs: Date.parse('2000-09-22T14:00:00Z'), clock: 'utc' },
  { latitude: 51.48, longitude: 0 }, await loadSkyRuntime(),
  { maxEvaluations: 20, maxSamples: 10000 },
);
console.log(result.status, result.explanation);
```

These dates are arbitrary calculation inputs, not a person's birth data.
Other rule composition, ranking and streaming remain later milestones.
