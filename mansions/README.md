# Arabic lunar mansions

This checkout-local project is being developed as a library and CLI for
Arabic lunar mansions (manazil al-qamar) on top of `@zodiacs/engine`.
[PLAN.md](PLAN.md) records the implementation milestones. The first boundary
table, pure longitude classifier, mansion-at API, ingress searches and
range occupancy intervals are available in tropical or explicitly selected
sidereal coordinates. CLI commands are planned in a later milestone.

[src/tables.ts](src/tables.ts) exports the immutable `EQUAL28_ARIES_V1`
table and `getBoundaryTable("equal28-aries-v1")`. Table selection requires
the full versioned identifier. It divides longitude equally from Aries in
the explicitly selected zodiac, using exact rational boundaries. The
tropical zero is the vernal equinox of date. Traditional names follow
al-Biruni, translated by Sachau, with documented editorial Arabic spellings
and Latin transliterations. [SOURCES.md](SOURCES.md) records the definition,
source locators, naming variants and public domain provenance. The table
does not represent the current positions or unequal extents of star groups.

[src/classify.ts](src/classify.ts) exports
`classifyLongitude(longitude, "equal28-aries-v1")`. Longitude is a finite
number in degrees in the caller's chosen zodiac. The function returns
`{ table, mansion }`, containing the immutable table identity, provenance,
names and rational segment boundaries. It accepts positive or negative
turns, includes a segment's exact start and excludes its exact end. Missing
or unsupported table choices and non-finite or nonnumeric longitudes throw
`RangeError`.

Classification treats the supplied binary floating-point number as exact,
reduces it modulo a circle using integer arithmetic, and compares it with
the table's rational boundaries without a tolerance. A decimal approximation
of a nonrepresentable rational boundary may fall on either side; the
classifier does not snap it to that boundary. Negative values arbitrarily
close to Aries remain in the final segment. The classifier selects no
zodiac, evaluates no ephemeris and makes no engine receipt claim. It is a
mathematical helper used by the receipt-bearing astronomical API.

[src/index.ts](src/index.ts) is the library entry. Its synchronous
`mansionAt({ time, table, zodiac? })` calculates the mansion at a resolved
instant, with no I/O:

```ts
import { mansionAt } from "./src/index.js";

const result = mansionAt({
  time: "2001-02-03T04:05:06Z", // Synthetic example instant.
  table: "equal28-aries-v1"
});
if (result.status === "ok") {
  console.log(result.at, result.mansion.index, result.mansion.arabicName,
    result.mansion.latinLabel, result.longitude, result.receipt);
}
```

Successful results contain `at`, the engine's normalized UTC label;
`zodiac`, the selected zodiac; `longitude`, the geocentric Moon longitude
in degrees in that zodiac on the true ecliptic of date; the full immutable `table` and selected
`mansion`; and the engine's unmodified `bounds` and `receipt`. The receipt
records the actual time basis, engine version, ephemeris version and
calculation conventions. Its request can be passed back to the engine's
`calc` for regression replay. Receipt version labels alone do not
authenticate an artifact or guarantee identical calculations on another
runtime. This API returns an instantaneous classification; use `mansionRange`
for occupancy intervals clipped to a requested window.

`time` accepts the engine's `CalcTime`: a valid `Date`, a strict ISO calendar
date or offset-bearing date-time, `{ iso, deltaT? }`, or
`{ jd, scale: "utc" | "ut1" | "tt", deltaT? }`. Calendar dates mean UTC
midnight. Julian dates require an explicit scale; `deltaT`, when present,
pins TT minus UT1 in seconds. The engine retains that choice in the receipt.
Unresolved local times, invalid calendar dates, numeric epoch timestamps,
leap seconds and unsupported object fields throw `RangeError`. Missing or
unsupported table identifiers and extra request options also throw
`RangeError`. Request options are `time`, `table` and optional `zodiac`.
They must be enumerable data properties of a plain object.

Omitting `zodiac`, or setting it to `"tropical"`, preserves the tropical
calculation. Sidereal calculations require an explicit built-in engine
ayanamsa name, using `zodiac: { sidereal: name }`:

```ts
const result = mansionAt({
  time: "2001-02-03T04:05:06Z", // Synthetic example instant.
  table: "equal28-aries-v1",
  zodiac: { sidereal: "lahiri" }
});
if (result.status === "ok") {
  console.log(result.longitude, result.ayanamsa, result.receipt,
    result.tropicalLongitude, result.tropicalReceipt);
}
```

`MANSION_AYANAMSAS` exports the engine's supported built-in names, including
`lahiri`, `fagan-bradley`, `krishnamurti`, `raman`, `yukteswar`,
`true-chitra`, `true-revati`, `true-pushya` and `galactic-center`.
Their definitions and sources remain in the engine's
[ayanamsa guide](../docs/vedic.md). This project accepts those named
definitions, without custom epoch or rate definitions. A bare `"sidereal"`,
missing name, unknown name or extra zodiac field throws `RangeError`
before evaluation. The selection is copied and frozen for the result.
Table selection remains mandatory and independent of zodiac selection.

For sidereal results, `longitude`, `bounds` and `receipt` come directly
from the engine's sidereal Moon calculation. `ayanamsa` is its unmodified
value, including mean, nutation, true value, subtracted convention and bound.
The true ayanamsa is subtracted on this true ecliptic of date; the receipt
records its definition and zodiac. `tropicalLongitude`, `tropicalBounds`
and `tropicalReceipt` preserve a separate tropical engine calculation at
the same original input time and clock, including any scale or pinned
delta-T. They are not reconstructed by adding a rounded ayanamsa back.
For tropical results, `ayanamsa` is null and the tropical fields reuse
`longitude`, `bounds` and `receipt`. No new astronomical accuracy bound is
introduced by either classification.

Coverage follows the engine's `CALC_SPAN` and its checks on both UT1 and TT.
Even a UTC label inside that span may be refused if its TT is outside.
Unsupported coverage returns the engine's original
`{ status: "refused", reason: "out-of-range", detail, span }`, without a
mansion, longitude or fabricated receipt. Calculation errors propagate.
No fallback to the root engine's broader computation span is attempted.
[test/at.test.ts](test/at.test.ts) checks input validation, named table
selection, receipt preservation and replay, time scales, pinned delta-T,
coverage edges and caller-input preservation. These integration tests make
no new claim about physical accuracy.

`mansionIngresses({ from, to, table, zodiac?, maxSamples? })` searches
mansion changes using the engine's shared solver in
[src/crossings.ts](../src/crossings.ts):

```ts
import { mansionIngresses } from "./src/index.js";

const result = mansionIngresses({
  from: "2001-02-03", // Synthetic example window, UTC midnight endpoints.
  to: "2001-02-06",
  table: "equal28-aries-v1"
});
if (result.status === "ok") {
  for (const ingress of result.ingresses) {
    console.log(ingress.at, ingress.mansion.index,
      ingress.mansion.arabicName, ingress.mansion.latinLabel,
      ingress.longitude, ingress.receipt);
  }
}
```

Search endpoints accept strict ISO strings or valid Dates on the engine's
UTC basis. The engine's parser validates both before calculation; calendar
dates mean UTC midnight and offset-bearing times normalize to UTC. Julian
dates, time-scale objects and pinned delta-T are not accepted by this search
API. These are distinct from the broader `mansionAt` inputs above. The
requested window must have `from <= to` and span no more than
`INGRESS_SEARCH_LIMITS.maxDays` elapsed days. Supplied Dates are copied.

The endpoint convention is `(from,to]`: an ingress at `from` is excluded,
and one at `to` is included. Empty windows return no ingresses but still
validate coverage and carry an endpoint receipt. Results give normalized
`from` and `to`, the explicit table, selected zodiac, endpoint receipts,
and `ingresses` in chronological order. Every ingress includes the same
fields as a successful `mansionAt`, plus `direction`, the exact rational
`boundary`, and `previous`, the classification, longitude, bounds and
engine receipt at the preceding millisecond. The primary `mansion` is the
one entered at `at`; `previous.mansion` is the one left. Reverse changes,
if encountered, retain the same half-open boundary arithmetic.

The search uses a fixed quarter-day scan step for each table boundary.
The solver takes the rounded numerical target; local refinement then uses
the exact rational classifier to verify membership at adjacent milliseconds.
The reported `resolution: "first-changed-millisecond"` describes the engine's
computed classification, not physical ingress accuracy. The retained engine
`bounds` describe longitude, not a new timing bound. The scan is tested,
not proven complete; interior discontinuities of the engine's time basis
remain part of the planned hardening work.

`INGRESS_SEARCH_LIMITS` defines the quarter-day step, maximum range of
366 elapsed days, default shared budget of 20,000 engine evaluations and
maximum permitted budget of 100,000. `maxSamples` must be a positive finite
integer within that cap. Cached samples are shared across boundaries;
endpoint checks, refinement and output receipts count when they require
an engine evaluation. Successful results report actual `samples`, the
effective `maxSamples` and `stepDays`. Budget exhaustion returns a typed
`{ status: "refused", reason: "sample-budget", samples, maxSamples, detail }`.
Engine coverage refusals pass through unchanged. Refusals contain no partial
ingresses, and unexpected calculation errors propagate.

Sidereal searches accept the same explicit `zodiac: { sidereal: name }`
selection as `mansionAt`. The solver samples sidereal longitude at every
instant with that instant's engine ayanamsa. It does not shift tropical
ingress times or hold an ayanamsa constant over the range. Each ingress and
its `previous` retain the selected and tropical longitude, bounds and
receipts, plus the unmodified ayanamsa value. Endpoint `receipts` refer to
the selected zodiac; `tropicalReceipts` preserve the corresponding tropical
endpoint receipts, even for empty windows. Search limits and endpoint
semantics apply to either zodiac. `samples` and `maxSamples` count actual
engine evaluations: a successful uncached tropical position costs one,
while a sidereal position costs two to retain both calculations. Budget
exhaustion between those calculations returns a refusal without partial
results. These costs are enforced by [test/sidereal.test.ts](test/sidereal.test.ts).

[test/ingresses.test.ts](test/ingresses.test.ts) enforces those limits and
checks a complete synthetic circle and wrap against hand-derived rational
ingress times, exact and rounded window endpoints, reverse membership,
empty windows, shared budget exhaustion, clipping without external samples,
engine refusal propagation and receipt replay. Its real-engine comparisons
use a synthetic window beginning 2001-02-03 and ending 2001-03-05, plus
shorter windows derived from it. These are numerical regression checks,
not independent astronomical accuracy evidence or published ingress samples.

`mansionRange({ from, to, table, zodiac?, maxSamples? })` reports occupancy
intervals within the requested window:

```ts
import { mansionRange } from "./src/index.js";

const result = mansionRange({
  from: "2001-02-03", // Synthetic example window.
  to: "2001-02-06",
  table: "equal28-aries-v1"
});
if (result.status === "ok") {
  for (const interval of result.intervals) {
    console.log(interval.start, interval.end, interval.mansion.index,
      interval.mansion.arabicName, interval.mansion.latinLabel,
      interval.startPosition.longitude, interval.startPosition.receipt);
  }
}
```

Range options, time parsing, coverage checks and search limits are the same
as for `mansionIngresses`. The result's `endpointConvention` is `[from,to)`:
each interval includes `start` and excludes `end`. Intervals appear in
chronological order, cover the requested window without gaps or overlaps,
and have positive duration. A range with identical endpoints returns no
intervals but still checks coverage and records the endpoint receipt.

Each interval carries its named `mansion`, `startPosition` and `endPosition`.
These positions retain the engine's longitude, bounds and receipt at the
respective instants. `endPosition` is sampled at the exclusive end and may
already belong to the next mansion. `entry` and `exit`, when present, are
the full ingress records, including their preceding-millisecond positions
and receipts. An ingress at `to` closes the last interval and supplies its
`exit`; the mansion entered there contributes no interval to this range.

`startClipped` is true when the interval starts at the requested `from`,
where no entry was observed inside the search window; its `entry` is null.
This remains true when `from` happens to coincide with an ingress. The
marker describes the available boundary evidence, not a claim that the
mansion began earlier. `endClipped` is true when an interval ends at `to`
without an observed exit there; its `exit` is null. No calculation before
`from` or after `to` is made to find the full mansion duration. Adjacent
requests can therefore split one mansion into separate clipped intervals.

The range uses the existing ingress search and its cached endpoint samples.
Interval construction consumes no additional engine evaluations. Results
retain the search's table identity, zodiac, numerical resolution, endpoint
`receipts`, `samples`, `maxSamples` and `stepDays`. Engine and budget
refusals return without partial intervals; errors propagate. A detected
disagreement between endpoints and the observed ingress sequence returns
an `unsupported-combination` refusal. This check does not prove the search
complete; the ingress search's numerical and time-basis limitations above
also apply to occupancy intervals.

The optional zodiac selection applies to the entire range, its interval
membership and all entry/exit positions. Both sets of engine receipts and
the per-position ayanamsa values are retained exactly as for ingress results.

[test/range.test.ts](test/range.test.ts) checks interval edges against
hand-derived rational times for synthetic constant motion over a full
circle and wrap. It covers stationary motion, reverse crossings, empty and
adjacent windows, exact and rounded ingress endpoints, clipping, strict
budgets, refusal propagation, input preservation and bounds/receipt replay.
Its real-engine integration window runs from 2001-02-03 to 2001-02-06.
Those engine comparisons are regression checks, not independent evidence
of astronomical ingress accuracy.

The internal adapters in [src/engine.ts](src/engine.ts) read the
engine's tropical or selected sidereal geocentric Moon position on the true
ecliptic of date and retain its unmodified calculation receipt. Invalid dates throw the engine's
`RangeError`; unsupported coverage returns the engine's typed refusal. The
adapter does not calculate an ephemeris itself.

Use Node.js 22 from this directory:

```sh
cd mansions
npm ci --ignore-scripts
npm run check
```

Dependencies and the lockfile are local to this private project. Engine
source is imported by relative path. TypeScript and Vitest resolve the
engine's pinned `astronomy-engine` dependency from this directory, so no
root dependency installation or root build is needed. Vitest uses the
engine's ESM dependency entry. Future runtime tooling must use the same
local dependency resolution.

The tests check integration, receipt replay, validation, and hand-derived
synthetic motion through the existing crossing solver. Engine-to-engine
comparisons are regression checks, not independent astronomical accuracy
evidence. The solver's endpoint convention is `(from, to]`. Its numerical
resolution does not establish physical accuracy or search completeness.
The table tests check exact boundary arithmetic and the naming witness.
[test/sidereal.test.ts](test/sidereal.test.ts) checks every offered ayanamsa
against engine calls at the synthetic instant 2001-02-03T00:00Z, receipt
replay on scaled and pinned clocks, selected-zodiac ingress membership
and range receipt replay from 2001-02-03 to 2001-02-06. These are integration
checks. Separate synthetic varying-ayanamsa motion tests check ingress times
by independent rational arithmetic over a full circle and wrap, including
reverse membership, clipping and budgets. Neither type of test establishes
physical accuracy against an independent ephemeris or historical source.
[test/classify.test.ts](test/classify.test.ts) checks classification against
independent integer fractions throughout the circle and on both sides of
every boundary, including adjacent representable values, signed turns,
subnormal values and the largest finite inputs. These are arithmetic checks,
not astronomical accuracy evidence. Any usable independently published
mansion ingress samples will be checked in a later milestone.

`npm run check:isolation` checks the project file constraints and an engine
package dry-run with lifecycle scripts disabled. It asserts that no file
under `mansions/` enters that package. It creates no archive and does not
run the full engine package-content gate, which requires an existing engine
build. Generated files and caches belong in `.generated/` or `.cache/`,
both ignored here. No generated data is committed.

New code and documentation here use the repository's [MIT license](../LICENSE).
The engine keeps its own [licensing and attribution](../LICENSING.md),
including the CC BY attribution for its delta-T data. This project does not
relicense the engine or redistribute its source as a new package. Table
provenance and third-party source terms are recorded in
[SOURCES.md](SOURCES.md).

Output contains astronomical facts only, in time order, with
explicit table selection and engine receipts. It contains no auspicious or
inauspicious labels, date ranking, predictions, weather or travel advice.
