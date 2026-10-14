# Mundane workbench

A private library and CLI project for classical mundane astrology on top of
the engine in this checkout. Development follows [PLAN.md](PLAN.md). The
current API normalizes inputs, casts charts at supplied instants, analyzes
classical planet angularity and angle-ruler dignities, and searches cardinal
solar ingresses. Lunation and eclipse searches, prose factor summaries, and
CLI commands are planned and are not implemented yet.

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
and flags; ingress searches do the same.

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
Comparisons with the engine are integration checks. Independent ingress and
lunation timing evidence belongs to later milestones. The recorded M2 checks
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
engine integration behavior. Independent ingress timing validation remains
the next milestone; this implementation makes no measured accuracy claim.

Chart factors are labelled as traditional conventions, not predictions.
This project adds no electional scoring, calendar export, relocation grids,
horary, or HTTP service. Code and documentation follow the repository's MIT
licence; engine data retains the terms and attribution in
[LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE).
