# Optional eclipse instants

`searchEclipseCharts` casts supplied eclipse instants using `castEventChart`,
then reuses `analyzeFactors`. It contains no eclipse solver, shadow geometry,
time-scale conversion, or local-visibility calculation. The geographic place
sets the chart's angles and houses. It does not select an eclipse path or imply
that an eclipse is visible there. The traditional factors are descriptions,
labelled `traditional conventions, not predictions`.

## Pure adapter contract

An `EclipseAdapter` is either unavailable with a reason, or available with a
synchronous `search(window)` method. The window is a frozen record of
`startMs`, `endMs`, and `clock: "utc"`. Requests reuse the year or range
normalization and synthetic-place conventions. The library performs no module
loading. Callbacks are trusted application code, not a sandbox.

An available adapter returns its status, evaluation count, a nonempty
`completeness` statement, JSON `provenance`, and an `events` array. Every
supplied event contains:

| Field | Meaning |
| --- | --- |
| `eclipseKind` | `solar` or `lunar` |
| `contactKind` | Exact nonempty source label, retained without interpretation |
| `atMs` | Integer JavaScript epoch milliseconds |
| `clock` | Must be `utc` for chart casting |
| `provenance` | JSON source metadata retained without authentication |

Completion means the source completed its requested search under its own
assumptions. Its completeness statement is retained; completion does not
establish physical accuracy or exhaustive detection. A `refused` result
must contain an empty event list and a reason of `evaluation-budget` or
`cancelled`. It retains source metadata and casts no charts. Omitting the
adapter yields `unavailable/not-installed`; an incompatible module gives
`unavailable/unsupported-api`. Neither means there were no eclipses.

Returned `EclipseChart` rows contain `kind: "eclipse"`, `eclipseKind`,
`contactKind`, ISO UTC `at`, the complete supplied row in `supplied`, `chart`,
`angularity`, `angleRulers`, and `factors`. Source and chart metadata retain
their separate provenance. The source may use another ephemeris or definition
from the chart caster. Structurally valid metadata does not authenticate its
source or verify that an event occurred.

The ownership window is `(from,to]`. An inclusive source sample at the opening
edge is excluded; instants outside the closed sampling window are rejected.
Instants sort chronologically, retaining source order for ties. Distinct or
duplicate rows at the same instant survive. There is no contact inference,
threshold deduplication, rounding to minutes, or conversion between clocks.
TT, UT1, fractional-millisecond labels, and invalid source rows reject before
any chart is cast. Sources on another clock must supply a documented UTC
conversion themselves. Engine chart coverage refusals and computation errors
propagate. A completed empty source result needs no ephemeris calculation.

Results are detached, deeply frozen JSON snapshots. Finite acyclic JSON
metadata is required; accessors, sparse arrays and executable metadata reject
rather than being serialized or invoked. Source objects remain mutable.
Unknown metadata is retained in `provenance`; labels are data, not executable
descriptions. Adapter methods themselves remain trusted executable code.

## Events workbench bridge

`createEventsEclipseAdapter(module, settings)` wraps the events workbench's
`EvaluationContext` and `searchEclipses`. It searches solar and lunar minima
with a shared context and evaluation budget, delegating all astronomical work.
Cumulative context counts are retained, not added as if they were independent
scans. A refusal from either scan discards all returned chart events.
Source-search summaries retain statuses and counts, without an earlier scan's
event list on refusal. Completed contacts retain each full source event,
including geometry, model, clock, definition, bracket, classification, and
derivative residual, under their provenance.

The explicit settings are `model.sunRadiusAu`, `model.moonRadiusAu`,
`model.earthRadiusAu`, `stepMs`, `derivativeStepMs`, and `maxEvaluations`.
Radii use astronomical units; steps use integer milliseconds; evaluations
are the events context's adapter requests. Chart casting is outside that
budget. No radii, steps, atmospheric enlargement, or budget are guessed.
Settings are snapshotted before loading or searching. The bridge has no
independent source for physical model constants.

The inspected events source is
[`events/src/eclipses.ts` at the recorded branch revision](https://github.com/zodiacs-org/engine/blob/bb59f2c23b4c1bf44cdff3e03cd2a6c0539641c7/events/src/eclipses.ts),
with [its search context](https://github.com/zodiacs-org/engine/blob/bb59f2c23b4c1bf44cdff3e03cd2a6c0539641c7/events/src/context.ts).
The bridge preserves `minimum-shadow-axis-distance` as `contactKind`. It
does not relabel it as greatest eclipse, first contact, last contact, or a
local circumstance. The source searches numerical minima of a spherical
shadow model. Its derivative and scan steps can miss minima, including near
window boundaries where its two-sided confirmation does not fit. Adjacent
searches therefore need not find the same set as a single longer search.
A completed scan proves neither contact completeness nor astronomical
completeness. The bridge states this limitation in `completeness`. Unknown
source definitions or clocks reject, so an API change needs bridge review.

Sources that supply limb contacts can instead implement `EclipseAdapter`
directly. The pure API preserves labels such as an entry contact or a
penumbral contact. No real limb-contact fixture or physical accuracy claim
is added by this milestone.

## Optional loading and reports

The Node-only `src/events-loader.ts` exports `loadEventsEclipseAdapter`.
It uses a relative import of the already-built sibling
`events/build/src/index.js` in the same checkout. It writes nothing and does
not inspect, fetch, build, or modify another worktree. A missing entry returns
unavailable. Permission errors, module initialization errors, and broken
nested imports propagate. A trusted import callback supports local embedding
and tests. The root library entry does not import this loader or Node
filesystem modules.

Pass the loaded adapter as `searchMundaneReport(request, { eclipses })` to
opt in. The default report still contains ingress and lunation events only.
Requested eclipse results add `searches.eclipses`, retaining their separate
counts and completeness. The aggregate completeness marker directs callers
to the component searches. Events sort by instant, then ingress, lunation,
and eclipse; eclipse ties retain source order. Factor source pointers remain
relative to each event.

An unavailable requested adapter refuses the report with
`eclipse-adapter-unavailable`; its detailed reason stays under
`searches.eclipses`. Evaluation-budget and cancellation refusals retain those
reasons. If an ingress or lunation sample budget also refuses, `sample-budget`
takes priority. Every refusal returns an empty report event list with the
component outcomes retained. All requested searches run and budgets remain
independent. Exceptions propagate instead of becoming empty reports.

## Validation and scope

[../test/eclipses.test.ts](../test/eclipses.test.ts) uses invented instants and
source labels, checking supplied data and chart integration rather than
astronomical timing. Boundary expectations follow directly from the
open-start, closed-end inequalities. Checks also cover coincident contacts,
stable ordering, missing adapters, refusal, clock validation, detached
metadata, and invalid input. Chart comparisons reuse the engine and are
integration checks, not independent accuracy evidence.

[../test/events-bridge.test.ts](../test/events-bridge.test.ts) supplies a
structural stub of the inspected events API. It verifies shared contexts,
cumulative counts, retained minima and geometry, refusal from either scan,
cancellation, settings capture and errors.
[../test/events-loader.test.ts](../test/events-loader.test.ts) checks the
fixed relative path and missing-entry versus IO-error behavior.
[../test/report.test.ts](../test/report.test.ts) combines supplied contacts
with its existing hand-derived Sun and Moon motion, checking ties, opt-in
metadata and report refusals.

[../scripts/check-events-integration.mjs](../scripts/check-events-integration.mjs)
also reads the events branch through git objects without modifying it. It
materializes the required source modules under ignored `generated/`, bundles
them against this checkout's engine source, and compares the bridge with
direct events searches on the date windows recorded in that script. It
checks nonempty solar and lunar delegation, exact preservation of source
geometry, cumulative counts, and budget refusal. It uses the pinned local
toolchain's esbuild dependency and requires the local remote-tracking ref,
not network access. It creates no engine build or release archive.

These are integration checks against the events implementation, not
independent timing evidence. No new astronomical tolerance, prediction,
independent eclipse reference, or physical accuracy claim is introduced.
The runtime, commands, branch revision, output and scope audit are in
[evidence/m11/checks.txt](evidence/m11/checks.txt).
