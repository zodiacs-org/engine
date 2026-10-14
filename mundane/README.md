# Mundane workbench

A private library and CLI project for classical mundane astrology on top of
the engine in this checkout. Development follows [PLAN.md](PLAN.md). The
current API normalizes inputs; event searches, chart summaries, and CLI commands
are planned and are not implemented yet.

From the repository root, using Node.js as required by [package.json](package.json):

```sh
npm ci --prefix mundane
npm run check --prefix mundane
```

The project has its own lockfile, TypeScript configuration, and Vitest
configuration. Dependencies and caches remain inside its ignored folders.
Relative source imports reuse the engine's date and coordinate validators
without building or changing the released package.

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
of astronomical coverage. Search implementations will preserve engine
coverage restrictions and flags.

[test/inputs.test.ts](test/inputs.test.ts) checks calendar boundaries, the
Gregorian leap-year rule, UTC offset arithmetic, input detachment, and invalid
input. These are calendar and API checks, not ingress or lunation accuracy
evidence. All places and example inputs are synthetic.

Chart factors will be labelled as traditional conventions, not predictions.
This project adds no electional scoring, calendar export, relocation grids,
horary, or HTTP service. Code and documentation follow the repository's MIT
licence; engine data retains the terms and attribution in
[LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE).
