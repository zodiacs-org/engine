# Apsides

Private work-in-progress library for geometric orbital distance extrema,
built on `@zodiacs/engine`. The current milestone provides the distance
sampler, a bounded scalar extremum solver, and frozen independent development
references. Astronomical window searches and the CLI are planned in
[PLAN.md](PLAN.md).

Use Node 22.22.2 for the local checks, matching this project's initial test
environment. From this repository:

```sh
cd apsides
npm ci --ignore-scripts --cache=.cache/npm
npm run check
```

The dependency is a relative file reference to the immutable carried engine
archive. Installation stays inside `apsides/node_modules`; it needs no root
install or root build. The package is private. Its source entry is
`src/index.ts`, usable from a TypeScript runner or bundler.

```ts
import { sampleDistance } from "./src/index.js";

const sample = sampleDistance("Moon", "2000-01-01T12:00:00Z");
if (sample.status === "ok") {
  console.log(sample.instant, sample.distanceKm);
  console.log(sample.radialSpeedKmPerSecond, sample.orbitalSpeedKmPerSecond);
  console.log(sample.receipt);
}
```

`sampleDistance` uses geometric positions in the engine's J2000 equatorial
frame. The Moon is geocentric; the planets, including Earth, are
heliocentric. Target metadata discloses the system-barycenter convention for
Mars through Pluto. `radialSpeedKmPerSecond` is signed range rate;
`orbitalSpeedKmPerSecond` is total relative speed. Neither field is a search
for an extremum. Inputs use the engine's `CalcTime` vocabulary and retain
its validation, coverage refusals and time-basis qualifications.

`searchDistanceExtremaWith(distanceAt, options)` is the numerical solver.
The callback returns distance in kilometres; `sampleTimesSeconds` supplies
a grid on a continuous time coordinate, `toleranceSeconds` bounds the final
interval width, and `maxEvaluations` caps all callback calls. It brackets
strict distance turns and refines them with golden-section search, keeping
strict outer witnesses. Ambiguous distances, exhausted work and insufficient
time resolution return a refusal with no partial list. Completion means the
algorithm finished on that grid; it does not prove that every physical
extremum was found. Callers still need time conversion, edge padding and
window filtering, as described in [DESIGN.md](DESIGN.md).

The Vitest files use `.vitest.ts` and a local configuration so the root
test command does not discover a separate project's tests before its local
dependencies are installed. They check integration, units, reference
provenance, source integrity and numerical behavior against analytic
synthetic curves. Engine accuracy has not yet been measured against the
references. [DESIGN.md](DESIGN.md) describes the solver and planned searches;
[references/PREREGISTRATION.md](references/PREREGISTRATION.md) records the
acceptance budgets, reserved cases and collection commands.
[SOURCES.md](SOURCES.md) records definitions and attribution. Ordinary tests
read local fixtures and perform no reference downloads.

`npm run check:isolation` checks authored file sizes and documentation,
checks that npm's root file selection excludes this folder, and runs the
repository's `npm run package:contents` in an ignored temporary copy with
the carried archive's build output. It does not rebuild the engine or
perform the archive history gate. All temporary output is under
`.generated/`; downloads and tool caches belong under `.cache/`.

Original code and documentation follow the repository's MIT license.
The engine dependency retains its own licenses and notices, as detailed in
[SOURCES.md](SOURCES.md). The reference collector is separate from the
library and does not use engine output to generate expected values.
