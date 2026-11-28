# Library walkthrough

The library entry is [src/index.ts](../src/index.ts). It imports the engine
source by relative path and performs synchronous calculations without file
IO or optional module loading. It is a private source workbench in this
checkout, with no published mundane package or installed global command.
The Node-only CLI and optional events loader are separate consumers.

From the repository root, on the Node runtime required by
[package.json](../package.json):

```sh
npm ci --prefix mundane
npm run check --prefix mundane
npm run check:examples --prefix mundane
npm run build --prefix mundane
npm run check:scope --prefix mundane
```

The complete executable example is [examples/usage.ts](../examples/usage.ts).
The example checker bundles it with the local pinned ephemeris into ignored
`mundane/generated/`, executes it, checks the result shapes and refusal path,
then removes its temporary bundle. Typechecking includes the example source.
It does not require a root engine build or dependencies at the repository root.
It uses invented place coordinates and makes no new timing-accuracy claim.

The `.js` import spellings in TypeScript examples are for TypeScript's ESM
resolution. They do not refer to committed JavaScript beside the source.
Use the checker to run the walkthrough, or a bundler configured like
[check-examples.mjs](../scripts/check-examples.mjs) to consume the library.
That configuration resolves `astronomy-engine` to the exact installed copy
under `mundane/node_modules/`. Plain Node does not resolve an engine source
import through the sibling workbench's dependencies automatically.

## Choose a search and handle its status

These calls illustrate the same inputs used in the checked example:

```ts
import {
  searchIngresses, searchLunations, searchMundaneReport
} from "./src/index.js";
import type { MundaneRequest } from "./src/index.js";

const place = { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 };
const annual: MundaneRequest = { place, year: 2024, houseSystem: "regiomontanus" };
const range: MundaneRequest = { place, from: "2024-03-01", to: "2024-04-01" };

const ingresses = searchIngresses(annual);
const lunations = searchLunations(range);
const report = searchMundaneReport(range);
if (report.status === "refused") {
  console.log(report.reason, report.searches);
} else {
  for (const event of report.events) {
    console.log(event.kind, event.at, event.chart.angles, event.factors);
  }
}
```

Read `ingresses.ingresses` and `lunations.lunations` after checking their
statuses. A complete result may be empty. A refused result has no events;
its metadata explains which budget or requested adapter prevented completion.
Invalid input and calculation errors throw instead of returning a refusal.
Handle those exceptions at your application boundary. Raising a search budget
does not change the solver's sampling assumptions or establish completeness.

Years and ranges use resolved UTC input labels and the ownership window
`(from, to]`. Date-only inputs mean UTC midnight. Resolve a local civil time
before calling the library. The output records the engine's actual clock
basis; a normalized `Z` string alone does not establish observed UTC.
Calendar examples and boundary behavior are enforced by
[inputs.test.ts](../test/inputs.test.ts) and
[cli.test.ts](../test/cli.test.ts). Search and reference qualifications are in
[ingresses.md](ingresses.md) and [lunations.md](lunations.md).

## Read a chart and its traditional factors

Every event retains these structures:

| Field | Use |
| --- | --- |
| `chart.angles`, `chart.houses` | Angle and cusp longitudes in degrees, requested and actual houses |
| `chart.bodies` | Engine position rows, with longitude and latitude in degrees and speed in degrees per day |
| `angularity` | Classical planet house membership and angle proximity |
| `angleRulers` | Angle domicile rulers, chart sect, and each ruler's own essential conditions |
| `factors` | Short descriptions labelled `traditional conventions, not predictions` |
| `chart.flags`, `chart.timeScale`, `chart.deltaT` | Coverage, fallback, clock basis, and TT minus UT1 in seconds |
| `chart.provenance` | Engine identity and inherited calculation conventions and coverage |

Narrow on `event.kind` to read ingress `sign`, lunation `phase`, or eclipse
`contactKind`. Keep structured metadata with text summaries so that house
fallback, clock qualifications, and the source of each factor remain visible.
Factor `source` pointers resolve relative to the containing event or analysis,
rather than the report root. The example checker follows these pointers;
[factors.test.ts](../test/factors.test.ts) enforces wording and traceability.

To choose a different longitude orb, call `analyzeFactors(event.chart,
{ angleOrbDegrees: 3 })` and retain the returned analysis together. The
checked example exercises that option. Search events retain their default
analyses; frozen results must not be edited in place. Custom analysis does
not change the timing search or cast chart. The orb convention and boundary
tests are in [angularity.md](angularity.md).

The example deliberately limits `lunationMaxSamples` to demonstrate a
`sample-budget` report refusal. Component budgets measure different operations;
inspect `report.searches` instead of adding counts into a physical error or
runtime estimate. The report contract is in [reports.md](reports.md).

## Add eclipse instants when available

Pass an explicit `EclipseAdapter` to `searchMundaneReport(request,
{ eclipses: adapter })`, or use `searchEclipseCharts(request, adapter)` alone.
The pure library neither discovers nor loads modules. In a Node application,
`loadEventsEclipseAdapter` from `src/events-loader.ts` can load the already-built
sibling events entry at its fixed relative path. It requires deliberate model
and search settings. The loader does not build or fetch the events project.

The current bridge supplies shadow-axis minima, preserving the source label;
it does not supply first or last limb contact times or local visibility.
A direct adapter may supply other contact labels on UTC. An unavailable
requested adapter refuses a report rather than implying no eclipses occurred.
The complete contract, example loading function, source revision, and validation
scope are in [eclipses.md](eclipses.md) and the
[README eclipse example](../README.md). CLI examples and exit statuses are in
[cli.md](cli.md).
