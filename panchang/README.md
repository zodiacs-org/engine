# Panchang prototype

This private source-checkout project will provide astronomical and calendar
facts for sunrise-to-sunrise days. Implementation follows [PLAN.md](PLAN.md).
It currently exposes the luminary snapshot adapter, instantaneous limbs,
civil-date and sunrise-to-sunrise windows with vara, limb transition
searches with complete surrounding intervals, amanta/purnimanta month
naming with adhika/kshaya detection, sunrise tithi anomaly comparisons,
pure day and date-range assembly APIs, and a source-checkout CLI.

Use Node 22.7.0 or later. From this directory:

```sh
npm ci
npm run check
```

Dependencies install within panchang/. The test runner, typechecker and
source runner map the engine's pinned astronomy dependency to that local
installation. The typechecker resolves declarations and the source runner
resolves JavaScript through separate tsconfig files. No
engine build is required. Nothing here is part of the engine npm package.
Code and documentation are MIT under the repository's [LICENSE](../LICENSE).
The engine retains its own licences and attributions in
[LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE).

```ts
import { luminarySnapshot } from "./src/index.js";

const result = luminarySnapshot("2020-01-01T00:00:00Z", { ayanamsa: "lahiri" });
if (result.status === "ok") {
  console.log(result.utc, result.nakshatra.name, result.nakshatra.pada);
  console.log(result.sun.tropical.receipt, result.moon.sidereal.receipt);
}
```

Run TypeScript scripts from this directory with `npm run source -- path.ts`.
`npm run check` also exercises the source runtime outside the test runner.

`luminarySnapshot` accepts the engine calc instant forms: a resolved ISO
string, Date, ISO object or Julian date with an explicit scale. Date-only
strings mean midnight UTC, not local sunrise. The adapter delegates input
parsing, clock handling and reference-span refusal to calc. Invalid input
throws RangeError; an engine refusal returns `status: "refused"` with the
original refusal and no partial snapshot.
The output `utc` is normalized; receipt requests retain the engine's record
of the supplied ISO spelling and time scale.

A successful snapshot contains geocentric tropical and sidereal Sun/Moon
positions in degrees, full calc receipts and bounds, the chosen ayanamsa's
value at that instant, and the engine's Moon nakshatra/pada. Lahiri is the
default; `PANCHANG_AYANAMSAS` lists selectable engine definitions. The
engine performs sidereal conversion. The adapter does not calculate speeds.

The adapter is synchronous and performs no network or filesystem I/O.
It shares the engine's astronomy dependency state and runtime assumptions.
Receipts report computation conventions; they do not certify accuracy.
See [SOURCES.md](SOURCES.md) for the independent smoke reference and its
limited coverage. No transition-time or complete panchang accuracy claim
has been established yet.

```ts
import { instantaneousPanchang } from "./src/index.js";

const instant = instantaneousPanchang("2020-01-01T00:00:00Z");
if (instant.status === "ok") {
  console.log(instant.tithi.name, instant.tithi.paksha, instant.tithi.pakshaNumber);
  console.log(instant.nakshatra.name, instant.nakshatra.pada);
  console.log(instant.yoga.name, instant.karana.name);
  console.log(instant.ayanamsa, instant.sun.tropical.receipt);
}
```

`instantaneousPanchang` accepts the same instant and ayanamsa options as
`luminarySnapshot`. It retains the complete snapshot and adds tithi,
paksha, yoga and karana. It preserves an engine refusal without partial
limbs. Vara requires the later sunrise-day assignment. This API does not
yet assign a sunrise day, lunar month or transition instants.

The arithmetic helpers `tithiOf(sunTropical, moonTropical)` and
`karanaOf(sunTropical, moonTropical)` accept canonical geocentric degrees;
`yogaOf(sunSidereal, moonSidereal)` accepts engine-created sidereal values
with matching ayanamsa labels and instants. Declared inputs may omit both
instants for arithmetic work. The helpers classify supplied coordinates;
the caller is responsible for their physical conventions and provenance.
The instant API obtains its coordinates and provenance from the engine.

Indices are zero-based within each full angular cycle. Tithi also has a
one-based `pakshaNumber`, with Purnima ending shukla and Amavasya ending
krishna. Karana reports `kind` (`fixed` or `moving`) and `half` (first or
second half of the tithi). The fixed-karana order follows the later order
in the Calendar Reform Committee's footnote, documented in
[SOURCES.md](SOURCES.md#m3-instantaneous-limb-definitions-and-arithmetic).
Names are plain traditional labels and carry no quality classification.

Boundaries belong to the interval starting there. Sum and difference
classification uses exact arithmetic on the supplied binary floating-point
coordinates, with no epsilon. Yoga uses its rational angular width;
nakshatra and pada use the engine's existing classifier. Invalid tropical
coordinates and unbranded or mismatched yoga inputs throw `RangeError`.
The complete-cycle and adjacent-boundary arithmetic checks are in
[test/limbs.test.ts](test/limbs.test.ts), with their independent integer
oracle described in [SOURCES.md](SOURCES.md). They establish classification
of supplied values, without establishing astronomical accuracy.

Civil-date helpers accept strict Gregorian `YYYY-MM-DD` strings.
`nextCivilDate` advances the calendar date independently of elapsed UTC
duration. Parsing does not establish astronomical coverage. A date without
a representable calendar successor is rejected by the day resolver.

```ts
import { prepareCivilDay, resolveCivilDay } from "./src/index.js";

const input = {
  date: "2024-03-10",
  timeZone: "America/New_York",
  observer: { latitude: 12.5, longitude: 75.25 } // Invented coordinates.
};
await prepareCivilDay(input);
const civil = resolveCivilDay(input);
if (civil.status === "ok") console.log(civil.start.utc, civil.end.utc);
```

`prepareCivilDay` delegates history loading to the engine for the written
date and its calendar successor. `resolveCivilDay` then runs synchronously
and returns a half-open civil-date interval for a later sunrise search.
It uses the requested zone, including supported aliases, without inferring
a zone from coordinates. Empty zones, raw numeric offsets, unsupported
identifiers, invalid dates and unknown input fields throw `RangeError`.
An unprepared history raises the engine's `ZoneHistoryNotLoadedError`.

Observers use geodetic latitude and east-positive longitude in degrees,
and optional `height` in metres above the WGS84 ellipsoid. The validator
uses the engine sky observer domain and defaults height to zero. Supplied
longitude also reaches the engine's historical local mean time resolver.
The tests in [test/civil.test.ts](test/civil.test.ts) enforce these input
domains and defaults.

Each civil boundary retains the complete original engine midnight
resolution. An ordinary midnight is used directly, a repeated midnight
uses the engine's earlier occurrence, and a missing midnight uses the clock
transition where the date starts. `boundary.utc` can therefore differ from
`boundary.resolution.utc`, which retains the engine's shifted wall-time
answer. Timezone metadata continues to distinguish shipped history from
the host's data.

A skipped date returns `status: "refused", reason: "skipped-date"`.
A date-line fold or midnight fold crossing between calendar dates returns
`reason: "date-boundary-fold"`. The latter policy also conservatively
refuses a neighbouring date whose endpoint is affected. Refusals retain
both midnight resolutions and supply no `start` or `end` window. These
policies avoid representing disjoint or repeated dates as an ordinary
sunrise search interval. They are tested against the independent clock
rules and constructed cases recorded in [SOURCES.md](SOURCES.md).

```ts
import { prepareSunriseDay, resolveSunriseDay } from "./src/index.js";

const input = {
  date: "2024-03-20",
  timeZone: "Asia/Kolkata",
  observer: { latitude: 12.5, longitude: 75.25 } // Invented coordinates.
};
await prepareSunriseDay(input);
const day = resolveSunriseDay(input, { ayanamsa: "lahiri" });
if (day.status === "ok") {
  console.log(day.start.utc, day.end.utc, day.vara.name);
  console.log(day.conventions, day.start.snapshot.sun.tropical.receipt);
}
```

`resolveSunriseDay` is synchronous and performs no filesystem or network
I/O. For historical clocks, first call `prepareSunriseDay`, which prepares
the boundaries of both local civil dates. Input validation and history
load errors propagate from the existing civil resolver.

The window includes its starting sunrise and excludes the following local
date's sunrise. Each civil date must contain a unique sunrise. Vara is the
Gregorian weekday of the local date containing the starting sunrise,
retained through the window's end even after local midnight. Its index is
Sunday-based; traditional ASCII names are in `VARA_NAMES`.

Both boundaries retain the original engine rise event, including altitude
and azimuth, and a complete luminary snapshot with calc receipts and the
ayanamsa value at that boundary. Lahiri is the default. Changing ayanamsa
affects these sidereal snapshots, while the horizon search uses the Sun's
topocentric place. Original civil windows and sky searches are retained.

`SUNRISE_CONVENTIONS` records the upper solar limb, standard refraction,
distance-dependent solar radius and level horizon on WGS84. Height moves
the observer without horizon dip. Terrain and weather are not modelled.
The engine returns the first whole millisecond of its computed crossing;
this numerical resolution does not establish physical accuracy. The
independent reference protocol and its limited coverage are in
[SOURCES.md](SOURCES.md#m4-sunrise-reference-protocol).

The sky searches share `maxSamples`, defaulting to 20,000 evaluations; this
budget excludes the separately calculated luminary snapshots. The input
accepts a positive integer or `Infinity`, following the engine. Returned
`samples` sums the original search counts. These budget rules and the
default are enforced by [test/sunrise.test.ts](test/sunrise.test.ts).

Refusals contain no `start`, `end` or `vara`. The reason distinguishes a
refused civil date, missing or multiple sunrises, exhausted search budget
and an engine calculation refusal. `endpoint` identifies the affected
local date; original civil/search diagnostics and any engine refusal are
retained. A skipped following calendar date is refused. Polar dates do
not borrow a sunrise from another season. This API resolves sunrise
boundaries; the separate transition search below resolves limb intervals.
The month search below separately resolves lunar months.

```ts
import { resolveSunriseDay, searchLimbTransitions } from "./src/index.js";

const day = resolveSunriseDay({
  date: "2024-03-20",
  timeZone: "Asia/Kolkata",
  observer: { latitude: 12.5, longitude: 75.25 } // Invented coordinates.
}, { ayanamsa: "lahiri" });
if (day.status === "ok") {
  const limbs = searchLimbTransitions(day.start.utc, day.end.utc, { ayanamsa: day.ayanamsa });
  if (limbs.status === "ok") {
    for (const event of limbs.transitions) console.log(event.at, event.kind);
    for (const interval of limbs.intervals) {
      console.log(interval.kind, interval.index, interval.start.at, interval.end.at);
    }
  }
}
```

`searchLimbTransitions(from, to, options)` accepts resolved instant inputs
through the engine date parser: ISO strings, Dates or epoch milliseconds.
Date-only strings mean UTC midnight. Use the sunrise resolver's endpoints
for a sunrise day. The transition API takes no observer or timezone because
its limbs use geocentric longitudes. Select the same ayanamsa explicitly
when connecting these APIs; both default to Lahiri.

The search returns changes in the half-open requested window. A change at
the starting instant is included; one at the ending instant belongs to
the following window. Simultaneous changes sort in `LIMB_KINDS` order.
`startState` is the classified snapshot at the starting instant.
Vara comes from the sunrise window. A pada change is reported separately
from a nakshatra change, including when both occur together.

Each `LimbTransition` holds the full classified snapshots `before` and
`after`, at the preceding millisecond and the change instant, with the
original calc receipts, bounds and instantaneous ayanamsa values.
`intervals` lists every limb interval overlapping the window, ordered by
its actual start. Each interval retains its complete start and end
transition, including boundaries outside the requested window. Its index
is within the full angular cycle; the pada index includes its nakshatra.
Read traditional names and paksha from the start transition's `after`
snapshot. Interval endpoints are computed first milliseconds of changes,
not a physical accuracy claim.

`TRANSITION_CONVENTIONS` records the fixed search settings. The engine
crossing solver scans sector phases at a quarter-hour step. The search
pads each endpoint by three elapsed days and accepts windows of at most
two elapsed days. It confirms candidate instants with the exact existing
classifiers and the engine's first-millisecond helper. It assumes forward
sector motion resolved by the sampling step; it is not a proof of
completeness. The analytical trajectory tests in
[test/transitions.test.ts](test/transitions.test.ts) enforce these settings,
boundary ownership and rational reference instants. They establish no
astronomical transition-time accuracy, as [SOURCES.md](SOURCES.md) explains.

All streams, endpoint checks and millisecond checks share `maxSamples`,
defaulting to 10,000 unique instantaneous snapshots. A positive integer
or `Infinity` is accepted. Cached timestamps count once in `samples`;
`longitudeSamples` separately counts solver callbacks, including cache
hits. The fixed window and padding also bound the scan when the sample
budget is unlimited. These rules are enforced by
[test/transitions.test.ts](test/transitions.test.ts).

A refusal contains diagnostics without `startState`, `transitions` or
`intervals`. Reasons distinguish budget exhaustion, original engine
refusals, an unconfirmed crossing, an unbracketed limb, and a discontinuity
in the engine's time basis. Coverage checks apply to the entire padded
span, so windows close to a reference-span edge can refuse. Searches whose
padded spans cross a time-basis discontinuity also refuse, including a
leap-second boundary or the model/table handovers. This conservative
restriction applies even if the discontinuity lies outside the requested
window. Invalid windows/options throw `RangeError`; unexpected engine
errors propagate.

```ts
import { panchangDay, prepareSunriseDay } from "./src/index.js";

const input = {
  date: "2024-03-20",
  timeZone: "Asia/Kolkata",
  observer: { latitude: 12.5, longitude: 75.25 } // Invented coordinates.
};
await prepareSunriseDay(input);
const day = panchangDay(input, { monthConvention: "amanta", ayanamsa: "lahiri" });
if (day.status === "ok") {
  console.log(day.sunriseMonth.name, day.sunriseState.ayanamsa, day.sunriseState.sun.tropical.receipt);
  for (const segment of day.segments) {
    console.log(segment.start, segment.end, segment.vara.name,
      segment.tithi.name, segment.tithi.paksha,
      segment.nakshatra.name, segment.nakshatra.pada,
      segment.yoga.name, segment.karana.name);
    console.log(segment.intervals.tithi.start.at, segment.intervals.tithi.end.at);
  }
} else {
  console.log(day.reason, day.sunrise);
  if (day.reason === "transitions-refused") console.log(day.timeline.reason);
}
```

`panchangDay(input, options)` assembles the sunrise window, limb transitions
and lunar months synchronously without I/O. It accepts the same explicit civil
date, timezone and observer as the sunrise resolver. Historical clocks
need `prepareSunriseDay(input)` before the call. Lahiri is the default;
`ayanamsa` selects an existing engine definition for every snapshot and
transition calculation. `day.ayanamsa` is its name, while
`day.sunriseState.ayanamsa` retains the engine's value and bounds at the
starting sunrise. Later snapshots retain their own instantaneous values.
`monthConvention` is required: choose `amanta` or `purnimanta`. Earlier
prototype calls without that choice must now supply it.

`sunriseState` contains all instantaneous limbs and the full Sun/Moon
positions and calc receipts at the included sunrise. `sunrise` retains
the original civil resolutions, rise searches and boundary snapshots;
`timeline` retains the original chronologically ordered limb changes and
full surrounding intervals. `DAY_CONVENTIONS` records the day and segment
ownership policies and includes the existing horizon and transition
conventions without replacing them.

`months` retains the month search and `sunriseMonth` is its interval at
the starting sunrise. Every segment has a `month` linking to the complete
interval, naming lunation, phase boundaries and solar ingresses. Month
boundaries use the same tithi classification as the limb search.

`segments` is a chronological, contiguous partition of the sunrise
window. Each segment includes its start and excludes its end, both ISO
UTC strings at whole-millisecond resolution. A simultaneous group of
changes creates one segment boundary. A change exactly at sunrise owns
the new day; the following sunrise belongs to the following day. Vara
stays with the starting local sunrise date through every segment.

Each segment contains constant discrete tithi/paksha, nakshatra/pada,
yoga and karana labels. The segment's nakshatra deliberately omits the
continuously changing elapsed fraction. Its `intervals` record links each
limb and pada to the original complete `LimbInterval`, with true computed
start/end transitions and their full before/after receipts. Segment
endpoints are clipped to the day; those underlying limb endpoints retain
their times outside it. A pada-only change starts a new segment even
when the nakshatra name stays the same.

Options `sunriseMaxSamples`, `transitionMaxSamples` and `monthMaxSamples`
independently configure the resolvers' budgets with the same positive-integer
or `Infinity` domain. Omitted values retain the resolver defaults and
sample accounting described here. All options are validated before
any search. Returned diagnostics retain each resolver's budget and sample
counts separately; sky evaluations and unique snapshots are different
units and are not added together.

A refused sunrise yields `reason: "sunrise-refused"` and its original
diagnostics, without running a transition search. A refused transition
search yields `reason: "transitions-refused"`, the successful sunrise
diagnostics and the original transition refusal. Neither exposes
`segments` or `sunriseState`. A refused month search yields
`reason: "months-refused"` with its original diagnostics in `months`,
the successful sunrise and timeline, and no assembled labels. Invalid
inputs, unloaded historical clocks and unexpected engine failures
propagate as before. The padded search's
coverage and time-basis restrictions continue to apply to the whole day.

[test/day.test.ts](test/day.test.ts) verifies partition arithmetic with
independently prescribed trajectories and artificial sunrise boundaries.
Real-engine checks verify receipt retention and wiring; no physical
transition-time accuracy claim follows. The evidence and scope are in
[SOURCES.md](SOURCES.md#m6-day-assembly-arithmetic-and-integration).
Sunrise tithi comparisons and lunar-month anomaly policies are described below.

```ts
import { searchLunarMonths } from "./src/index.js";

const months = searchLunarMonths("2024-03-20", "2024-03-21", {
  monthConvention: "purnimanta", ayanamsa: "lahiri"
});
if (months.status === "ok") {
  for (const month of months.intervals) {
    console.log(month.name, month.start.at, month.end.at);
    console.log(month.namingLunation.start.at, month.namingLunation.ingresses);
  }
}
```

`searchLunarMonths(from, to, options)` resolves complete month intervals
overlapping a resolved UTC window. Like the limb search, it accepts a
positive window no longer than two elapsed days. Date-only strings mean
UTC midnight. The required `monthConvention` has no default; ayanamsa
defaults to Lahiri. No observer or timezone enters these geocentric events.

An amanta interval runs from new moon to new moon. Its name comes from the
sidereal solar sign at the initial new moon, with Pisces corresponding to
Chaitra and Aries to Vaisakha. An ordinary purnimanta interval starts at
the full moon preceding the naming new moon and ends at the next full moon. It takes the
name of that new moon's amanta lunation. Thus the conventions share the
waxing fortnight's name; the waning fortnight uses the following amanta
lunation's name. Names use the ASCII labels in `MONTH_NAMES`, including
Margasirsha for Agrahayana. The primary definitions are documented in
[SOURCES.md](SOURCES.md#m7-lunar-month-conventions-and-independent-arithmetic).

`intervals` and `startMonth` retain full computed phase boundaries without
day clipping. Each `namingLunation` includes its bounding new moons, enclosed
full moon, initial sidereal solar sign and solar ingresses. An ingress
reports the sign entered, with Aries indexed from zero. Each event keeps
the complete snapshots and calc receipts at the preceding millisecond and
the event millisecond, including instantaneous ayanamsa values. New moon
is the change from Amavasya to Shukla Pratipada; full moon is the change
from Purnima to Krishna Pratipada. The new month owns the boundary.

`events` lists new/full moons and solar ingresses inside the half-open
requested window, chronologically, with a phase event before an ingress
when simultaneous. For anomaly counting, ingresses belong to the
right-closed interval `(newMoon,nextNewMoon]`. Initial solar sign is read
after any simultaneous ingress. This corrects M7's start-inclusive count
to keep it consistent with the after-ingress initial sign. Display month
intervals and the event window remain half-open. These explicit millisecond
tie rules are tested conventions, without an astronomical precision claim.

The engine longitude-crossing solver scans phase and sidereal solar-sector
streams at quarter-day steps with 64 elapsed days of padding on each side.
This padding supplies the next naming lunation for a waning purnimanta
fortnight. Classifiers and the engine's first-millisecond helper confirm
each root locally. This sampled search assumes forward motion at its step;
it does not prove completeness. [test/months.test.ts](test/months.test.ts)
enforces the operational settings and tests rational roots independently.

`maxSamples` defaults to 5,000 unique luminary snapshots shared across the
streams, refinements and endpoint checks; a positive integer or `Infinity`
is accepted. `longitudeSamples` separately counts solver callbacks,
including cache hits. The tests enforce budget accounting and the default.
Every refusal omits `intervals`, `events` and `startMonth`. Reasons cover
budget exhaustion, retained engine refusals, time-basis discontinuity,
unconfirmed crossings and missing surrounding month boundaries. Coverage
and time-basis checks apply to the entire padded span, so their refusal
region is broader than the limb search's. More than two ingresses in a
scanned lunation yield `unsupported-ingress-count`; an inconsistent sign
sequence yields `unresolved-crossing`. Tests enforce both conditions.
The independent references below have limited coverage and establish no
general physical error bound.


Month results now include `kind` and `omittedMonths`, both on the display
interval and its `namingLunation`. No ingress means `adhika`; one means
`ordinary`; two mean `kshaya`. In a kshaya lunation the library retains
the name from the initial solar sign and lists the intervening missing
name in `omittedMonths`. It does not create a zero-duration month or omit
any astronomical time. These counts and naming decisions are enforced in
[test/months.test.ts](test/months.test.ts), against independent constructed
trajectories and the references in [SOURCES.md](SOURCES.md#m8-anomaly-definitions-and-reference-cases).

For purnimanta, an inserted adhika month runs from new moon to new moon,
matching the amanta insertion. The regular month's waning half precedes
it and its waxing half follows it. They are separate complete display
intervals with `kind: "ordinary"`; they do not form a continuous month
through the insertion. The preceding regular dark half derives its name
from the upcoming adhika `namingLunation`, so the interval's `kind` can
intentionally differ from that name source's `kind`. Use the interval's
fields for the label being displayed and the name source for its
underlying phase/ingress evidence. Ordinary months without this exception
keep the full-moon-to-full-moon interval described above.

```ts
if (day.status === "ok") {
  console.log(day.sunriseMonth.name, day.sunriseMonth.kind,
    day.sunriseMonth.omittedMonths);
  const comparison = day.tithiComparison;
  console.log(comparison.from, comparison.to, comparison.kind);
  for (const tithi of comparison.skipped) {
    console.log(tithi.start.after.tithi, tithi.start.at, tithi.end.at);
  }
  if (comparison.repeated) console.log(comparison.repeated.start.after.tithi);
}
```

`day.tithiComparison` compares the starting and following sunrises. A
complete tithi strictly after the first sunrise and ending at or before
the next is `kshaya`, listed in chronological `skipped` intervals. If the
same full tithi interval contains both sunrises, it is `vriddhi`, retained
as `repeated`. Otherwise the comparison is `ordinary`. A boundary exactly
at the following sunrise belongs to the new tithi, so the preceding
complete tithi can be skipped but cannot be repeated. The tests in
[test/anomalies.test.ts](test/anomalies.test.ts) enforce these rules using
independent interval arithmetic, including fortnight and cycle wrapping.

This is a forward comparison: a vriddhi result identifies the first
sunrise of the repeated pair and names the second endpoint explicitly.
It does not suffix the second day's date or infer a previous sunrise.
Both endpoints retain their original snapshots, receipts and ayanamsa;
skipped/repeated rows retain complete transition intervals. The pure
`compareSunriseTithis(sunrise, timeline)` helper is also exported for
matching successful resolver results. It performs no new searches and
throws `RangeError` for inconsistent windows or partitions. Day refusals
expose no tithi comparison and do not substitute a missing sunrise.

The M8 reference checks cover calendar interiors from the PAC's published
2026 regional tables and the 1983 lunation with an omitted Magha, using
USNO phases, JPL DE441 Sun longitudes and an independent ERFA Lahiri
reduction. Their instants, acceptance limits, retrieval tool, licensing
basis and precise scope are recorded in [SOURCES.md](SOURCES.md#m8-anomaly-definitions-and-reference-cases).
They do not validate every tithi boundary, every anomalous year or other
regional calendar conventions. Wider physical transition comparisons
remain M11's work.

```ts
import { panchangRange, preparePanchangRange } from "./src/index.js";

const input = {
  from: "2024-03-20", to: "2024-03-22", timeZone: "Asia/Kolkata",
  observer: { latitude: 12.5, longitude: 75.25 } // Invented coordinates.
};
await preparePanchangRange(input);
const result = panchangRange(input, { monthConvention: "amanta", ayanamsa: "lahiri" });
if (result.status === "ok") {
  for (const day of result.days) {
    console.log(day.date, day.sunrise.start.utc, day.sunrise.vara.name,
      day.sunriseMonth.name, day.sunriseMonth.kind);
  }
} else {
  console.log(result.failedDate, result.reason);
  if (result.reason === "day-refused") console.log(result.day);
}
```

`panchangRange(input, options)` is synchronous and performs no I/O. Both
`from` and `to` are included civil dates. It requires the same explicit
month convention as `panchangDay` and defaults to Lahiri. The observer and
timezone apply to the entire range. `preparePanchangRange(input)` explicitly
loads the engine histories for all required midnight boundaries first;
unprepared history errors otherwise propagate.

`civilDatesInRange(from, to)` returns the included Gregorian dates. It
advances calendar dates across month, year and daylight-saving changes,
independently of elapsed UTC time. Dates skipped by a zone remain requested
dates and cause a refusal. Date ranges must be forward, contain at most
31 dates, and have representable successors for the final sunrise search.
[test/range.test.ts](test/range.test.ts) enforces these limits and the
calendar rules with independent arithmetic and M2's clock references.

A successful range contains chronological `days`, each with the complete
day result, unchanged limb boundaries, ayanamsa, engine receipts and
conventions. A failed day refuses the entire range: `failedDate` names the
first affected date and `day` retains its original refusal diagnostics.
No partial `days` array is returned. Polar sunrises, skipped dates, repeated
date boundaries, padded time-basis discontinuities and coverage refusals
retain the day API's existing policies. An affected following date can
therefore refuse the preceding sunrise day too.

`maxSamples` defaults to 100,000 and must be a positive finite safe integer.
It limits uncached luminary snapshots plus actual sky-search evaluations
across the entire call. A snapshot is one adapter request for Sun/Moon
tropical/sidereal positions; the engine's internal work is not counted
individually. `samples` is the sum of `snapshotSamples` and `skySamples`.
The range never exceeds that budget. A global budget refusal reports
`reason: "sample-budget"`, the affected `stage`, and the original sky
search when a reduced sky budget caused its refusal. It returns no partial
days. The accounting, default and exact-budget behavior are enforced by
[test/range.test.ts](test/range.test.ts).

Within a call, matching civil resolutions, completed sunrise searches and
same-instant luminary snapshots are reused. Cached objects keep their
original receipts. `snapshotCacheHits` and `skyCacheHits` report reuse.
The existing `sunriseMaxSamples`, `transitionMaxSamples` and
`monthMaxSamples` options still apply to each day search, counting its
logical samples including cache hits. Those counters cannot be added to
measure actual range work; use the range counters instead. No calculation
cache persists between range calls. Reuse and standalone-day equivalence
checks are integration evidence, without a physical accuracy claim.

## Command line

After `npm ci` in this directory, run the source-checkout command directly:

```sh
./bin/panchang.mjs day --date 2024-03-20 \
  --latitude 12.5 --longitude 75.25 --time-zone Asia/Kolkata \
  --month-convention amanta --format text

./bin/panchang.mjs range --from 2024-03-20 --to 2024-03-21 \
  --latitude 12.5 --longitude 75.25 --time-zone Asia/Kolkata \
  --month-convention purnimanta --ayanamsa lahiri --format json

./bin/panchang.mjs --help
```

These coordinates are invented. They identify an observer independently of
the supplied zone. The examples share the synthetic site and dates tested in
[test/cli.test.ts](test/cli.test.ts). The launcher resolves this project's
TypeScript configuration and local dependencies from its own location, so it
also works by absolute path from another directory. The private package's
`panchang` bin points to this launcher. `npm run --silent panchang -- day ...`
is an equivalent invocation; `--silent` suppresses npm's banner for JSON
consumers. Keep the source checkout and its development dependencies present;
this command is not a standalone distributed executable.

Both commands require explicit latitude, longitude, IANA timezone and month
convention. Coordinates are geodetic degrees, north/east positive; optional
`--height` is WGS84 metres and defaults to zero. `--ayanamsa` accepts the
engine names shown by `--help` and defaults to Lahiri. `--format` is `text`
by default or `json`. Range endpoints are both included, with the library's
existing range and search limits. Historical timezone data is prepared
locally before calculation. No network lookup or place database is used.

Options take separate values, as shown above. Unknown options, extra
positionals, repeated options, empty or missing values and control characters
are rejected. Coordinates and height require finite plain decimal notation;
exponential and hexadecimal forms are refused. Dates use the strict civil
date validation described above. `--help` works alone or immediately after
the command, without other options.

`--sunrise-max-samples`, `--transition-max-samples` and `--month-max-samples`
set the corresponding per-day library budgets. `--max-samples` is accepted
only by `range` and limits its total actual work. CLI budgets must be positive
finite safe integers; omitted budgets retain the library defaults. The
parser validates the entire request before history loading or calculation.
Library calls retain their existing budget domains.

JSON output is the complete original day or range result, including nested
diagnostics, conventions, full boundaries, engine receipts, time-basis facts,
bounds and instantaneous ayanamsa values. Dates inside engine objects use
their standard ISO serialization. JSON output is compact and can be large
because the library repeats complete endpoint evidence in several places.
Stream it to a consumer when appropriate and keep any generated files in
ignored directories, with each file below the project size limit.

Plain text shows each civil day in order, with vara and lunar month at
sunrise, forward kshaya/vriddhi tithi comparisons, and chronological segments
with all limb labels. Separate chronological sections list full limb/month
intervals, including boundaries outside the sunrise day, and phase/ingress
events inside it. Intervals include their start and exclude their end.
The final provenance ledger contains original civil resolutions and
snapshots ordered by instant, each serialized as a JSON line with original
positions, bounds, calc receipts and ayanamsa values. Equal serialized
snapshots are included once across the whole output. Text labels do not
round or replace the receipt values. Use JSON for the full library structure
and search accounting.

All instants retain the engine's UTC labels and time basis, including its
historical UT1 assumptions. The horizon convention remains upper limb,
standard refraction and a level plane without horizon dip. The output states
the existing millisecond calculation resolution without claiming physical
accuracy at that scale. Independent reference coverage remains as recorded
in [SOURCES.md](SOURCES.md); the CLI adds no astronomical accuracy evidence.

Exit statuses, enforced in [test/cli.test.ts](test/cli.test.ts), are:

| Status | Meaning | Output |
| --- | --- | --- |
| `0` | Complete result or help | stdout |
| `1` | Unexpected calculation/runtime failure | stderr, no partial result |
| `2` | Invalid command or input | stderr, no partial result |
| `3` | Calculation refused by the library | stdout with original diagnostics, no partial days or segments |

An explicit `--format json` also selects a JSON error object on stderr for
parsing/input errors. An invalid format choice uses the default text error.
Refused plain text includes the reason and the full original refusal as
JSON. A refusal in either format remains a refusal of the whole requested
day or range. Unexpected failures receive a neutral error message without
raw exception details.
