# New and Full Moon search

`searchLunations(request, options?)` finds geocentric New and Full Moon charts
using directed Moon-minus-Sun ecliptic longitude, reduced modulo a circle.
The frozen exported `LUNATION_PHASES` table defines `"new"` at 0 degrees and
`"full"` at 180 degrees. These definitions and the API behavior below are
enforced by [test/lunations.test.ts](../test/lunations.test.ts). The session
check record is [evidence/m7/checks.txt](evidence/m7/checks.txt).

The library reuses `bodyLongitude` in the engine's `src/ephemeris.ts` for
both bodies, `normalizeLongitude` for the difference, and
`searchLongitudeCrossingsWith` in `src/crossings.ts` for root searching.
There is no new root solver, lunar series, or phase ephemeris. Longitudes
have the same corrections and true-of-date frame as the cast chart. This is
a longitude conjunction or opposition, ignoring ecliptic latitude, rather
than a minimum or maximum of illuminated fraction or spatial separation.
It does not identify eclipses or eclipse contacts.

The request accepts a place, an optional house system, and either a UTC
calendar year or resolved `from` and `to` instants, using `normalizeRequest`.
The default house system is whole sign. Unsupported settings are rejected,
including time-scale and delta T overrides. Both the search and cast charts
use the engine's UTC input clock. The engine can read that clock as modeled
UT1 outside its IERS coverage; actual time-basis and delta T metadata remain
on each chart. A normalized ISO string alone does not establish observed UTC
or astronomical accuracy.

Each phase scan uses a fixed quarter-day step (`stepDays: 0.25`), the engine
README's documented Moon sampling step. Callers cannot change it. Search
metadata reports `completeness: "engine-sampled-search;not-proven"`.
`status: "complete"` means both sampled scans finished within budget; it is
not a proof of completeness or physical timing accuracy. The engine's
smooth-motion assumptions and discontinuities in its time basis remain
limitations of this search too.

Windows use `(from, to]`: an exact opening root is excluded and an exact
closing root is included. A year uses January midnight through the following
January midnight with the same rule. There is no padding or longitude
sampling beyond the supplied endpoints. Both endpoints are first checked
by the engine's `onChartClock`, allowing its largest chart speed stencil,
so found charts can include lunar-node speeds. This validation performs no
body evaluations and happens before any budget refusal. Invalid inputs or
unsupported ephemeris endpoints throw `RangeError`. Charts outside the
engine's independent reference span preserve `outside-reference-span`.

The solver uses finite bisection and JavaScript Date millisecond truncation.
The returned instant and membership near a window edge inherit that
resolution. Changing the window can change the coarse grid and final digits
of a refined instant. A refined Date that lands on the excluded opening
edge is removed. Exact synthetic roots test adjacent-window semantics;
returned astronomical dates are not exact symbolic roots for arbitrary
window partitioning.

## Budget and output

The default shared budget is 10,000 elongation evaluations. Supply a positive
safe integer in `options.maxSamples` to replace it; Infinity is rejected.
Only that option is supported. Each elongation evaluation calls both Moon
and Sun longitudes at the same instant, so there are two body longitude
evaluations per sample. Metadata records `bodyLongitudesPerSample: 2` and
`budgetUnit: "elongation-evaluations;chart-casting-excluded"`. No cache or
previous search output affects these counts. Root refinement and edge
probes consume this budget; chart casting and analyses do not. It is a
sample budget rather than a time limit.

If the combined coarse work cannot fit, the search returns a refusal before
any body evaluations. Each scan then gets the remaining budget. If a later
scan's coarse work cannot fit, the used sample count can be below the limit.
A refinement exhausting the remaining budget uses the full limit. All these
refusals return `status: "refused"`, `reason: "sample-budget"`, and
`lunations: []`. Charts are cast only after both scans finish; no partial
event list is exposed. An empty successful range has `status: "complete"`
and `lunations: []`.

Each event has `kind: "lunation"`, `phase`, `targetElongation` in degrees,
`at` as a normalized ISO UTC string, and the solver's `retrograde` flag.
Here direction describes Moon-minus-Sun longitude, not the Moon's own
longitude. `chart`, `angularity`, and `angleRulers` reuse the existing APIs.
Their house fallback, time basis, flags, provenance, and labels
`traditional conventions, not predictions` are retained. These factors do
not assert predictive validity. Timing is place independent; angles and
houses use the supplied place. Events sort by epoch milliseconds, with
target elongation breaking time ties. Results are detached, deeply frozen,
and JSON-compatible.

## Hand derivation and check scope

The synthetic timing tests use elapsed days `d` since the arbitrary epoch
`2000-01-01T00:00:00Z`. Sun longitude is `350 + d`, Moon longitude is
`350 + 13d`, each reduced modulo 360 degrees. Subtraction gives directed
elongation `12d` modulo 360. New Moons therefore occur at `d = 30k`, Full
Moons at `d = 15 + 30k`, for integer `k`. The tests compare the resulting
instants over adjacent windows through elapsed day 60. Both individual
longitudes wrap within this span. Reverse synthetic motion uses Moon
longitude `350 - 11d`, giving elongation `-12d`, to check that Full Moon
searches use directed longitude and preserve crossing direction.

These functions are hand-defined geometry, not astronomical references.
Only the two-body longitude export is mocked; the engine solver, chart
casting, house calculation, angularity, and dignities still run. Chart
positions are ordinary engine charts at the synthetic root times, not
expected values for the artificial motion. A separate submillisecond
synthetic function checks integer-Date behavior. Shifting the sample grid
forces refinement to exercise shared-budget refusal. Other tests enforce
coarse refusal, exact budget exhaustion, no casting on failure, and that
every sampled instant stays inside the window.

Real ephemeris comparisons cover the README's synthetic annual request and
a short range outside the engine's reference span at ordinary and polar
synthetic places. They compare against direct calls to the same engine
solver and existing chart and factor APIs. They establish integration,
immutability, validation, and metadata preservation only. No prior engine
output supplies a timing fixture. Independent USNO phase-time fixtures and
their limited timing agreement checks are documented separately in
[lunation-references.md](lunation-references.md) and enforced by
[test/lunation-references.test.ts](../test/lunation-references.test.ts).
