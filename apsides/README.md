# Apsides

Private work-in-progress library for geometric orbital distance extrema,
built on `@zodiacs/engine`. The current milestone provides the distance
sampler, bounded lunar and heliocentric planetary searches, a combined
window API, motion probes with replayable receipts, and frozen independent
development references. Pluto fails its preregistered distance budget, so
independent validation is not fully passing. The remaining work, including
the CLI, is in [PLAN.md](PLAN.md).

Use Node 22.22.2 for the local checks, matching this project's initial test
environment. From this repository:

```sh
cd apsides
npm ci --ignore-scripts --cache=.cache/npm
npm run check
```

The current check exits with failing Pluto distance assertions. Typechecking,
numerical and integration tests pass; `npm run check:isolation` can be run
separately because the combined command stops at the reference failures.
[VALIDATION.md](VALIDATION.md) records the failing cases and unchanged limits.

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

```ts
import { searchLunarApsides } from "./src/index.js";

const result = searchLunarApsides({ from: "2000-01-01", to: "2000-02-01" });
if (result.status === "complete") {
  for (const event of result.events) {
    console.log(event.kind, event.instant, event.distanceKm);
    console.log(event.orbitalSpeedKmPerSecond, event.radialSpeedKmPerSecond);
    console.log(event.motion.before, event.motion.at, event.motion.after);
    console.log(event.receipt);
  }
} else {
  console.error(result.reason, result.detail);
}
```

The lunar search uses a fixed padded TT grid and golden-section distance
refinement. Returned `instant.jdTt` estimates belong to `(from, to]` on TT;
an event at the start belongs to the preceding window. Resolving adjacent
windows preserves event records, including when splitting at an event's
returned TT coordinate. `refinement` supplies strict distance witnesses
around each estimate. The caller can set `maxEvaluations`; exhausted work,
unavailable padding and ambiguous numerical results return a refusal with
an empty event list. `diagnostics` records the work, grid and
`completeness: "sampled-not-proven"`. Finite sampling does not prove that
every physical extremum was found. Endpoint delta-T pins resolve the
endpoints only; internal samples and event civil labels use the engine's
normal time basis. See [DESIGN.md](DESIGN.md) for the full contract.

```ts
import { searchPlanetaryApsides } from "./src/index.js";

const result = searchPlanetaryApsides("Earth", {
  from: "2000-01-01", to: "2001-01-01"
});
if (result.status === "complete") {
  for (const event of result.events) {
    console.log(event.body, event.kind, event.instant, event.distanceKm);
    console.log(event.target.referencePoint, event.refinement.method);
    console.log(event.orbitalSpeedKmPerSecond, event.radialSpeedKmPerSecond);
  }
} else {
  console.error(result.reason, result.detail);
}
```

Planetary searches accept Mercury through Pluto, including Earth, and use
the same window and budget contract. `PLANETARY_SEARCH_POLICIES` discloses
each body's fixed grid. Mercury through Neptune bisect the engine's
analytic distance rate and check wider distance witnesses. Their narrow
`refinement.lower` and `upper` bracket opposite rates, recorded in
`rateBracket`; near-root distances may tie. Pluto and the Moon refine scalar
distance directly with golden-section search. The `method` field identifies
which interval contract applies. Mars through Pluto use the engine's
system-barycenter reference convention, not validated physical-center
event times. Search completion does not certify the independent accuracy
budgets, which Pluto currently fails. No dates are ranked.

```ts
import { searchApsidesWindow } from "./src/index.js";

const result = searchApsidesWindow({
  from: "2000-01-01", to: "2000-02-01",
  bodies: ["Moon", "Mercury", "Earth"]
});
if (result.status === "complete") {
  for (const event of result.events) {
    console.log(event.body, event.kind, event.instant, event.distanceKm);
  }
} else {
  console.error(result.failedBody, result.reason, result.detail);
}
console.log(result.diagnostics);
```

The combined search defaults to the Moon and every supported planet when
`bodies` is omitted. Explicit selections must be nonempty and unique.
It orders events by TT and uses canonical body order to break equal-time
ties. It preserves each event and the individual searches' `(from,to]`
ownership. `maxEvaluations` is one budget shared across all selected bodies,
including their separate endpoint calls. A refusal from any body discards
all events. `diagnostics.bodies` shows completed, refused and unstarted
work, retaining each started body's search diagnostics and endpoint
receipts. Valid endpoints can still refuse if required padding falls
outside engine coverage. `test/window.vitest.ts` and
`test/window-failures.vitest.ts` check these contracts; they do not extend
the independent accuracy coverage.

Every event's `motion` contains the engine's distance, signed radial speed,
total speed, instant, bounds and receipt before, at and after the extremum.
The `at` sample repeats the event's top-level measurements. The before and
after samples use the wider canonical distance-bracket witnesses; their
`offsetSeconds` values report actual signed TT offsets and can be
asymmetric. These samples can lie outside the requested window. They reuse
cached evaluations, preserving the budget and partition behavior.

Radial speeds are reported as computed, including any nonzero value at the
estimated extremum. Pluto's state rate need not vanish at its scalar
distance extremum. The engine's `bounds.speed` describes angular-rate
metadata, not a km/s or event-time error limit. Records round-trip through
JSON, and each decoded `receipt.request` can be replayed with the engine's
`calc` API on the same engine and runtime. Receipts describe computations;
they do not authenticate imported data. `test/event-records.vitest.ts`
checks these integration contracts over the registered development windows.

The Vitest files use `.vitest.ts` and a local configuration so the root
test command does not discover a separate project's tests before its local
dependencies are installed. They check integration, units, reference
provenance, source integrity and numerical behavior against analytic
synthetic curves. `test/lunar-reference.vitest.ts` also checks lunar events
against the frozen `dev-moon-2000` Horizons DE441 fixture, over
2000-01-01 to 2000-02-01 TT: event counts and kinds, timing and distance,
and distance and speeds at the reference's own TT samples. The registered
Moon limits pass for this development case. `test/planetary-reference.vitest.ts`
checks every registered development planetary fixture: counts, kinds,
timing, event distances, and same-TT distances and speeds. Mercury through
Neptune pass the registered limits; Pluto's distance checks fail. These
failures are ordinary assertions, not skips or expected-failure tests.
Held-out comparisons remain reserved for M10. [DESIGN.md](DESIGN.md) describes the searches;
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
