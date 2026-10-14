# Cardinal solar ingress search

`searchIngresses(request, options?)` searches the Sun's tropical geocentric
longitude at the cardinal sign boundaries: Aries at 0 degrees, Cancer at
90 degrees, Libra at 180 degrees, and Capricorn at 270 degrees. The exported
frozen `CARDINAL_INGRESSES` table records those definitions. These are angular
definitions, not predictions or estimates of a chart's strength.

The request accepts a place, an optional house system, and either a calendar
year or resolved `from` and `to` instants. It uses the existing input
normalization and defaults to whole-sign houses. Unsupported settings are
rejected, including time-scale overrides and pinned delta T. The engine
reads both the search and the resulting chart on its UTC input clock. Its
time basis can use modeled UT1 outside the IERS table; each chart preserves
the actual time basis and delta T instead of claiming observed UTC there.

The search calls `src/returns.ts`'s `searchLongitudeCrossings` for the Sun at
each cardinal longitude. It does not implement a root solver, solar-return
routine, or a new ephemeris. Each scan uses a fixed 5-day coarse step. Changing
the step is not supported by this API, so callers cannot silently widen it
beyond the engine's documented sampling assumptions. Search metadata labels
completeness as `engine-sampled-search;not-proven`; `complete` means that all
scans finished within budget, not that physical accuracy is certified.

Event windows use `(from, to]`: an exact root at the opening instant is
excluded and one at the closing instant is included. A year uses January
midnight through the following January midnight with the same rule. There
is no padding or sampling outside the window. The engine uses finite
bisection and JavaScript Date millisecond truncation, so roots and their
membership near an edge have the inherited numerical resolution. Changing
the window can change the sample grid and the last digits of a refined
instant. A refined Date that rounds onto the opening edge is excluded.
Do not treat these instants as exact symbolic roots for window partitioning.

Both endpoints must be evaluable on the engine clock, with the engine's
largest chart speed stencil around them. This requirement ensures search
results can be cast with lunar-node speeds as well as the Sun's position.
It intentionally excludes tiny windows near the ephemeris span's extreme
edges. Endpoint validation calls the engine's `onChartClock`, with no body
evaluation, and runs before a possible budget refusal. A valid range outside
the independent reference span can still be computed; every returned chart
preserves `outside-reference-span` where applicable.

The default budget is 10,000 Sun longitude evaluations across all cardinal
scans, including refinement. `options.maxSamples` can replace it with a
positive safe integer. Unbounded searches via Infinity are rejected. This
is an evaluation budget rather than a time limit: chart casting and analyses
are separate work. If the combined coarse scans cannot fit, the search
refuses before evaluating any Sun positions. Otherwise each scan receives
the remaining budget. A refusal returns `status: "refused"`,
`reason: "sample-budget"`, `ingresses: []`, and the number of evaluations
already used. That number can be below the limit when a later scan's coarse
work cannot fit. Charts are cast only after every scan finishes, so a refused
search never produces charts from a partial result. An empty successful range
has `status: "complete"` and an empty list.

Each event has `kind: "solar-ingress"`, `sign`, `targetLongitude` in degrees,
`at` as a normalized ISO UTC string, and the solver's `retrograde` flag.
Events sort by epoch milliseconds, then by target longitude for a time tie.
`chart` contains the existing cast chart, `angularity` the existing classical
planet analysis, and `angleRulers` the existing essential dignity analysis.
The analyses retain their `traditional conventions, not predictions` label.
House fallback, requested and actual house systems, position rows, flags,
clock metadata, and provenance stay intact. Everything is a detached frozen
JSON-compatible snapshot. Timing is geocentric and place independent; the
place determines angles and houses.

## Evidence and hand derivation

[test/ingresses.test.ts](../test/ingresses.test.ts) enforces the cardinal
definitions, fixed step and default budget for the synthetic place and year
in the README example. It checks shared budgets, no casting on refusal,
endpoint validation, immutable output, ordering, unsupported inputs, polar
fallback, and reference flags. The recorded session checks are in
[evidence/m5/checks.txt](evidence/m5/checks.txt).

The hand-defined motion tests replace only the longitude-search adapter with
the real engine solver on a synthetic function. Longitude is elapsed days
since January midnight in the synthetic year, reduced modulo 360 degrees,
at one degree per day. Its cardinal roots are therefore at elapsed days
0, 90, 180, and 270, with another Aries root at day 360. These are exact
arithmetic expectations derived before searching, not astronomical instants.
They test exact opening and closing roots, adjacent windows, millisecond
windows, and empty ranges. Shifting the sample grid by a day forces the
solver to refine roots and exercises refusal during a later scan. Cast
charts at those artificial instants are ordinary engine charts; they are
not used as references for the synthetic longitude function.

The real Sun tests compare against direct engine crossing searches and
existing chart and analysis APIs for the README's synthetic request and a
year outside the engine's reference span. These are integration checks.
No timing fixture in this milestone is taken from earlier engine output,
and no independent astronomical timing tolerance or accuracy claim is added.
Independent published-time comparisons are documented in
[ingress-references.md](ingress-references.md), with source records and
offline checks in [test/ingress-references.test.ts](../test/ingress-references.test.ts).
