# Mundane workbench

A private library and CLI project for classical mundane astrology on top of
the engine in this checkout. Development follows [PLAN.md](PLAN.md). The
current API normalizes inputs and casts charts at supplied instants. Event
searches, traditional factor summaries, and CLI commands are planned and are
not implemented yet.

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
midnight. Event windows will use `(from, to]`, matching the engine crossing
solver: the opening instant is excluded and the closing instant is included.
Date-only input means UTC midnight; local wall time must be resolved before
calling this API. Normalization returns frozen snapshots with ISO UTC strings.
It performs calendar validation only, with no ephemeris calculation or claim
of astronomical coverage. Chart casting preserves engine coverage restrictions
and flags; search implementations will do the same.

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
aspects. Traditional planet selection and angularity summaries are planned
separately. `deltaT` records TT minus UT1 in seconds with its model and
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

Chart factors will be labelled as traditional conventions, not predictions.
This project adds no electional scoring, calendar export, relocation grids,
horary, or HTTP service. Code and documentation follow the repository's MIT
licence; engine data retains the terms and attribution in
[LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE).
