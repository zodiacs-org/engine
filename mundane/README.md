# Mundane workbench

A private library and CLI project for classical mundane astrology on top of
the engine in this checkout. Development follows [PLAN.md](PLAN.md). The
current API normalizes inputs, casts charts at supplied instants, analyzes
classical planet angularity and angle-ruler dignities, produces descriptive
factor lists, and searches cardinal solar ingresses and New and Full Moons.
It also combines these events into chronological year or range reports.
An optional adapter casts supplied eclipse instants and can delegate to the
events workbench's eclipse minimum searches. CLI commands are planned.

From the repository root, using Node.js as required by [package.json](package.json):

```sh
npm ci --prefix mundane
npm run check --prefix mundane
```

The project has its own lockfile, TypeScript configuration, and Vitest
configuration. Dependencies and caches remain inside its ignored folders.
Relative source imports reuse the engine's validators, chart casting, and
receipt metadata without building or changing the released package. The
project installs the engine's exact pinned ephemeris dependency locally.
TypeScript paths and the Vitest alias resolve that dependency for engine
source imports even when dependencies at the repository root are absent.

```ts
import { normalizeRequest } from "./src/index.js";

const request = normalizeRequest({
  place: { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 },
  year: 2000,
  houseSystem: "whole"
});
```

Coordinates use degrees, north and east positive. Both coordinates are
required; exact geographic poles are excluded because angles are undefined.
Names are optional labels, with no geocoding or place database. House systems
are the engine's supported systems, defaulting to whole sign.

Supply either an integer UTC calendar year or `from` and `to` as resolved
instants. A year maps to January midnight through the following January
midnight. Event windows use `(from, to]`, matching the engine crossing
solver: the opening instant is excluded and the closing instant is included.
Date-only input means UTC midnight; local wall time must be resolved before
calling this API. Normalization returns frozen snapshots with ISO UTC strings.
It performs calendar validation only, with no ephemeris calculation or claim
of astronomical coverage. Chart casting preserves engine coverage restrictions
and flags; ingress and lunation searches do the same.

[test/inputs.test.ts](test/inputs.test.ts) checks calendar boundaries, the
Gregorian leap-year rule, UTC offset arithmetic, input detachment, and invalid
input. These are calendar and API checks, not ingress or lunation accuracy
evidence. All places and example inputs are synthetic.

To cast a chart at a supplied resolved instant:

```ts
import { castEventChart } from "./src/index.js";

const chart = castEventChart({
  at: "2000-02-29T12:34:56.789Z",
  place: { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 },
  houseSystem: "placidus"
});
console.log(chart.angles, chart.houses, chart.bodies);
```

This casts the supplied instant without identifying it as an ingress,
lunation, or eclipse. `at` is always a resolved UTC input, with the same
date parsing as normalization. Other options, including time-scale overrides,
are rejected. Convert a contact supplied on another scale to UTC before casting
it. Return values are detached, deeply frozen, and JSON-compatible. The result
records the original ISO spelling in `provenance.sourceInstant` when the caller
supplies a string; Date and numeric inputs have no original spelling.

`angles` holds the engine's `asc`, `mc`, `dsc`, and `ic` ecliptic longitudes in
degrees. `houses` records `requested`, `actual`, and cusp longitudes in degrees,
in house order. Placidus and Koch may fall back to whole signs in polar
regions. The result retains the requested system and the `polar-fallback`
flag. Exact geographic poles are refused, and the engine's receipt coverage
notes its other angle exclusions.

`bodies` preserves the engine's position rows, including the outer planets
and lunar nodes. Longitudes, ecliptic latitudes, and degrees within signs use
degrees; speeds use degrees per day. `aspects` preserves the engine's default
aspects. `analyzeAngularity` selects classical planets for a separate analysis.
`deltaT` records TT minus UT1 in seconds with its model and
uncertainty; `timeScale` preserves the engine's basis for Earth rotation and
planet positions. `flags` retains reference-coverage and fallback information.
An instant the ephemeris cannot evaluate still throws the engine's refusal.

`provenance` reuses the engine receipt's version, ephemeris identity,
calculation conventions, and coverage statements. Its `relative-checkout`
source label states how the engine was imported; this is no claim of an
authenticated release artifact or astronomical accuracy.

[test/chart.test.ts](test/chart.test.ts) checks these behaviors at synthetic
places and arbitrary supplied instants, including polar places in both
hemispheres and the engine's observed, predicted, and model time bases.
Comparisons with the engine are integration checks. Independent ingress
and lunation timing evidence is documented below.
The recorded M2 checks
are in [docs/evidence/m2/checks.txt](docs/evidence/m2/checks.txt).

To analyze a cast chart's angularity:

```ts
import { analyzeAngularity } from "./src/index.js";

const angularity = analyzeAngularity(chart, { angleOrbDegrees: 5 });
console.log(angularity.angularPlanets, angularity.planets);
```

The output is labelled `traditional conventions, not predictions`. Each
classical planet has its actual house, an `angularHouse` flag, and a
`nearAngles` list of angle names, angle longitudes, and distances in degrees.
`angular` includes either factor; `angularPlanets` selects those planet names.
Results are detached, deeply frozen, JSON-compatible snapshots. The cast chart
remains unchanged.

The convention selects Sun, Moon, Mercury, Venus, Mars, Jupiter, and Saturn,
using the engine's classical planet table. Houses 1, 4, 7, and 10 count as
angular. House assignment reuses the engine's `houseOf` on actual cusps, with
its boundary arithmetic and no cusp orb. Whole-sign house membership can
differ from proximity to the midheaven or another angle. Requested and actual
house systems are both retained, including polar fallback.

Angle proximity uses the short circular distance in ecliptic longitude,
ignoring body latitude. `angleOrbDegrees` defaults to 5 degrees, an explicit
project choice that callers can change from 0 through 180 degrees. The
boundary is inclusive on the exact supplied binary64 values, using the
engine's exact-sum helpers; only the reported distance is rounded. All
matching angles are retained in asc, mc, dsc, ic order. A zero orb permits
only identical longitudes. These definitions and bounds are enforced in
[test/angularity.test.ts](test/angularity.test.ts); they are conventions,
not measured accuracy tolerances or a claim of physical angularity.

`analyzeAngularity` also accepts minimal supplied geometry through
`AngularityGeometry`. It requires valid longitudes, supported house-system
names, actual cusp rows, and a unique row for each classical planet. Valid
outer-planet and node rows are accepted but omitted from the analysis. This
validates the fields used without verifying that supplied geometry represents
a real sky. The hand derivation and scope of the synthetic checks are in
[docs/angularity.md](docs/angularity.md), and the M3 check record is in
[docs/evidence/m3/checks.txt](docs/evidence/m3/checks.txt).

To analyze the traditional domicile rulers of a cast chart's angles:

```ts
import { analyzeAngleRulers } from "./src/index.js";

const analysis = analyzeAngleRulers(chart);
console.log(analysis.sect, analysis.rulers);
```

Each row identifies the angle, its longitude and sign, its domicile ruler,
and the ruler's `condition` at the planet's own longitude. The condition
contains the engine's essential dignities, debilities, and `peregrine` flag.
Repeated rulers retain a row for each angle. Output uses asc, mc, dsc, ic order,
is deeply frozen and JSON-compatible, and carries the label
`traditional conventions, not predictions`.

Sect comes from the engine's `sectOf` on the supplied ascendant and Sun,
independently of house cusps or supplied sect metadata. The dignity analysis
reuses `dignityRulersAt` and `essentialDignities` from
`src/techniques/dignities.ts`: Dorothean triplicity counts the chart sect's
lord, Egyptian terms and Chaldean faces are used, and participating triplicity
lords are not counted. There is no strength score or predictive interpretation.

Like angularity, `analyzeAngleRulers` accepts minimal supplied geometry,
through `AngleRulerGeometry`. It requires valid angle and body longitudes and
unique rows for every classical planet. Valid outer-planet and node rows are
accepted but do not rule angles. Other chart metadata, including annotations
of sign and degree, does not enter the calculation. Shape validation does
not verify that the geometry describes a real sky. Calculation flags,
requested and actual houses, and astronomical provenance stay on the original
chart. The convention sources, synthetic derivations, and limitations are in
[docs/angle-rulers.md](docs/angle-rulers.md). Checks are enforced by
[test/angle-rulers.test.ts](test/angle-rulers.test.ts), with a session record in
[docs/evidence/m4/checks.txt](docs/evidence/m4/checks.txt).

To find cardinal solar ingress charts for a synthetic place:

```ts
import { searchIngresses } from "./src/index.js";

const result = searchIngresses({
  year: 2000,
  place: { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 },
  houseSystem: "whole"
});
if (result.status === "complete") {
  for (const event of result.ingresses) {
    console.log(event.sign, event.at, event.angularity, event.angleRulers);
  }
}
```

`searchIngresses` reuses the engine's crossing solver for tropical geocentric
Sun longitudes, then casts charts and applies the existing analyses. Results
include the normalized request and search metadata, and are deeply frozen and
JSON-compatible. A sample-budget refusal returns an empty ingress list and
casts no charts. Invalid input or an unsupported ephemeris endpoint throws
`RangeError`. Callers can supply `maxSamples` in a separate options object.
The budget is shared across the cardinal searches and includes root refinement;
chart casting is excluded from this evaluation count.

Range semantics, budget defaults, hand-derived synthetic solver checks, and
accuracy limitations are documented in [docs/ingresses.md](docs/ingresses.md).
The tests in [test/ingresses.test.ts](test/ingresses.test.ts) establish API and
engine integration behavior. Independent season-time fixtures, derivation,
time-scale qualifications, and the limited timing agreement checks are in
[docs/ingress-references.md](docs/ingress-references.md) and
[test/ingress-references.test.ts](test/ingress-references.test.ts). These
checks do not establish accuracy outside the selected published events or
independently validate the chart factors.

To find New and Full Moon charts for a synthetic place:

```ts
import { searchLunations } from "./src/index.js";

const result = searchLunations({
  year: 2000,
  place: { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 },
  houseSystem: "whole"
});
if (result.status === "complete") {
  for (const event of result.lunations) {
    console.log(event.phase, event.at, event.angularity, event.angleRulers);
  }
}
```

`searchLunations` uses the engine crossing solver on directed Moon-minus-Sun
longitude. Events identify `phase` as `"new"` or `"full"` and retain the chart
and the existing factor analyses. Timing is geocentric; the place determines
angles and houses. Results use the same window, refusal, immutability, and
coverage contracts as ingress searches. Here `samples` counts elongation
evaluations, each requiring both body longitudes; casting is separate.

Definitions, budget units, synthetic derivations, and limits are documented
in [docs/lunations.md](docs/lunations.md), with checks in
[test/lunations.test.ts](test/lunations.test.ts). Those checks establish
synthetic solver behavior and engine integration. Independent published
phase-time fixtures, their derivation and clock qualifications, and the
limited timing agreement checks are in
[docs/lunation-references.md](docs/lunation-references.md) and
[test/lunation-references.test.ts](test/lunation-references.test.ts).
They do not establish accuracy outside the selected events or independently
validate the chart factors.

To produce short factor descriptions with their supporting analyses:

```ts
import { analyzeFactors } from "./src/index.js";

const analysis = analyzeFactors(chart);
console.log(analysis.factors.label);
for (const factor of analysis.factors.items) {
  console.log(factor.text, factor.source);
}
```

`analyzeFactors` reuses the angularity and angle-ruler helpers and returns
`angularity`, `angleRulers`, and `factors`. It accepts the same geometry and
optional `angleOrbDegrees` setting as angularity. Ingress and lunation events
include `factors` alongside their existing analyses, using the default orb.
Each factor has a stable id, a kind, short text, and a `source` JSON pointer
relative to the containing analysis or event. These pointers identify the
structured fields that support the text. The output is detached, deeply
frozen, and JSON-compatible.

The list describes angular planets and each angle's domicile ruler, including
essential dignities, debilities, and the meaning of peregrine. It retains
simultaneous conditions and repeated rulers. When actual houses differ from
the requested system, a leading factor explains which system the angular
house descriptions use. Convention details, source pointers, and the scope
of wording tests are in [docs/factors.md](docs/factors.md), enforced by
[test/factors.test.ts](test/factors.test.ts). The session check record is in
[docs/evidence/m9/checks.txt](docs/evidence/m9/checks.txt).

To combine ingress and lunation charts into a chronological report:

```ts
import { searchMundaneReport } from "./src/index.js";

const report = searchMundaneReport({
  year: 2000,
  place: { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 }
});
if (report.status === "complete") {
  for (const event of report.events) {
    console.log(event.kind, event.at, event.factors.items);
  }
}
console.log(report.searches);
```

The API also accepts `from` and `to` in place of `year`, with the existing
window semantics. Coincident events remain separate entries, with ingress
charts before lunation charts at a time tie. Search budgets and sample counts
remain separate under `searches.ingresses` and `searches.lunations`; optional
`ingressMaxSamples` and `lunationMaxSamples` settings replace their respective
budgets. If either search refuses, the report contains no events and records
the component outcomes. Each event retains its chart, analyses, flags,
provenance, and factor source pointers. Output is deeply frozen and
JSON-compatible. Definitions, synthetic derivations, and limitations are in
[docs/reports.md](docs/reports.md), enforced by
[test/report.test.ts](test/report.test.ts), with the session record in
[docs/evidence/m10/checks.txt](docs/evidence/m10/checks.txt).

To include optional eclipse charts, load the sibling events workbench outside
the pure report API and pass its adapter explicitly:

```ts
import { searchMundaneReport } from "./src/index.js";
import type { MundaneRequest, EventsEclipseSettings } from "./src/index.js";
import { loadEventsEclipseAdapter } from "./src/events-loader.js";

async function reportWithEclipses(request: MundaneRequest, settings: EventsEclipseSettings) {
  const eclipses = await loadEventsEclipseAdapter(settings);
  return searchMundaneReport(request, { eclipses });
}
```

Settings require explicit spherical radii in au, scan and derivative steps in
milliseconds, and an evaluation budget. The loader reads only an already-built
`events/build/src/index.js` in this checkout; it does not build or fetch it.
Missing and incompatible adapters remain distinguishable from completed empty
searches. A requested unavailable or refused adapter produces a refused report
with no events. Omitted adapters leave the ingress and lunation report unchanged.

`searchEclipseCharts(request, adapter)` provides the separate pure eclipse API.
Supplied contacts retain their source labels and provenance, and receive charts
and the same traditional factor analyses. UTC instants are required; TT and UT1
labels are not silently read as UTC. The current events bridge preserves the
definition `minimum-shadow-axis-distance`: these are eclipse minima, not limb
contact instants or local visibility claims. The supplied-adapter contract also
accepts contacts from a source that can provide them, without solving contacts
here. Contracts, source limitations, and validation evidence are in
[docs/eclipses.md](docs/eclipses.md), with checks in
[test/eclipses.test.ts](test/eclipses.test.ts),
[test/events-bridge.test.ts](test/events-bridge.test.ts),
[test/events-loader.test.ts](test/events-loader.test.ts), and
[test/report.test.ts](test/report.test.ts). The session record is in
[docs/evidence/m11/checks.txt](docs/evidence/m11/checks.txt).

Factor lists and reports are labelled `traditional conventions, not predictions`.
This project adds no electional scoring, calendar export, relocation grids,
horary, or HTTP service. Code and documentation follow the repository's MIT
licence; engine data retains the terms and attribution in
[LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE).
