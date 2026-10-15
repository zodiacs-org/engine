# Panchang prototype

This private source-checkout project will provide astronomical and calendar
facts for sunrise-to-sunrise days. Implementation follows [PLAN.md](PLAN.md).
It currently exposes the luminary snapshot adapter, instantaneous limbs and
civil-date search windows. Sunrise day/range calculations and the CLI are
planned milestones.

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
