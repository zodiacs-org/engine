# Relocation and astrocartography workbench

This isolated TypeScript library and offline CLI recompute a resolved natal
chart at another geographic location and return sampled planetary angular
lines, grid crossings, great-circle path crossings and optional local-space
azimuth rays. All charts, planetary directions, observer axes and cusps come
from the engine. The library supplies spherical geometry and explicit sample
provenance. Results retain full engine receipts.

The project depends on the carried engine archive through a locked relative
file dependency. It is private and excluded from the engine npm package.
Install and build only inside `relocation/`; no engine build is needed.

## Start here

Use Node from this project's declared runtime range. Full fixture byte checking
uses the runtime recorded in [the fixture guide](test/fixtures/README.md).
From `relocation/`:

```sh
npm ci --ignore-scripts --cache .cache/npm
npm run verify
node bin/relocation.mjs chart --input examples/chart.json --pretty
node bin/relocation.mjs lines --input examples/lines.json
node bin/relocation.mjs grid --input examples/grid.json
```

`verify` typechecks the library, CLI and examples, builds this project, runs
Vitest and the golden byte check, then verifies project storage, documentation
links, public library imports, carried archive integrity and npm exclusion.
It writes build output and caches only in ignored project folders. It does
not run the engine's build or release gates.
See [validation scope and remaining engine gates](docs/validation.md) for the
checks this session ran and the root package-check limitation.

For a runnable library example, see [examples/workflow.ts](examples/workflow.ts).
It captures a synthetic birth, stores and reloads a natal envelope, recomputes
a chart after polar fallback, and calls each sampling family with bounded
work. [test/workflow.vitest.ts](test/workflow.vitest.ts) runs the compiled example,
replays its engine receipts and tests stored chart-grid envelopes through the
CLI into a path crossing and a new relocated chart. From `relocation/`:

```sh
npm run examples:build
mkdir -p generated
node scripts/run-example.mjs > generated/workflow.json
```

The example's instants and places are invented. Its steps and refinement
settings are demonstration inputs tested in `test/workflow.vitest.ts`, not
accuracy estimates. `npm run example` also prints the workflow, preceded by
npm's build messages; use the command above for a JSON output file.

## Choose an operation

Import public library functions from [src/index.ts](src/index.ts) in TypeScript,
or `build/index.js` after `npm run build`. Paths below are project-relative;
there is no published relocation entry point in `@zodiacs/engine`.

| Need | Library API | CLI request |
| --- | --- | --- |
| A chart at another place | `relocateChart` | `chart`, [chart.json](examples/chart.json) |
| A chart at each point of a bounded grid | `planGrid`, `sampleGrid` | `grid`, mode `charts`, [grid.json](examples/grid.json) |
| Planetary directions and observer residuals at supplied points | `sampleAngles` | Library only |
| Upper and lower meridian polylines | `planMeridianLines`, `meridianLines` | `lines`, mode `angular`, select `MC` and `IC` |
| Rising and setting horizon polylines | `planHorizonLines`, `horizonLines` | `lines`, mode `angular`, select `ASC` and `DSC` |
| Both angular families | Call the two line families with separate budgets | `lines`, mode `angular`, [lines.json](examples/lines.json), shared budget |
| Angular crossings and cell segments on a grid | `planGridCrossings`, `gridCrossings` | `grid`, mode `crossings`, [grid-crossings.json](examples/grid-crossings.json) |
| Angular crossings along a shortest spherical route | `planGreatCircle`, `planPathCrossings`, `pathCrossings` | `lines`, mode `path`, [path.json](examples/path.json) |
| Rays along local planetary azimuths | `planLocalSpaceLines`, `localSpaceLines` | `lines`, mode `local-space`, [local-space.json](examples/local-space.json) |
| Geographic bounds, wrapping and display seams | `geographicBounds`, `containsPoint`, `wrapLongitude`, `splitAntimeridian` | Library only |

Supply an already resolved engine birth input, a full engine chart, or a
decoded natal envelope to the library. CLI sources accept birth inputs and
natal envelopes. Longitude is east-positive; geographic and angular units are
degrees. Relocation preserves the instant, time scale, pinned delta-T,
time-known setting and requested house system. Local wall times must be
resolved before calling it.

## Read results

Use [the API reference](docs/api.md) for options, result fields, indices and
per-operation limits. [The CLI guide](docs/cli.md) covers all request modes,
stdin and file input, errors and exit codes. [Receipts and numerical limits](docs/receipts-and-limits.md)
explains which values can be replayed, how display geometry refers to samples,
and what successful, unresolved and refused results mean.

Engine parity and [golden polylines](test/fixtures/README.md) are regression
checks, not independent astronomical accuracy evidence. Engine receipts cover
engine positions and houses; interpolated seams and derived geometry have
separate provenance. Inspect unresolved regions and undefined directions even
when the result is `ok`. Steps and tolerances bound numerical work rather than
physical location error or completeness.

The CLI writes JSON to stdout and diagnostics to stderr. Save generated grids
and trial outputs in ignored `generated/`; keep temporary consumers and caches
in `.cache/`. No map tiles, geocoding, timezone inference or HTTP chart service
are included.

Code, documentation and local regression fixtures use the repository's
[MIT license](../LICENSE). The engine is distributed under `MIT AND CC-BY-4.0`;
retain its [LICENSE](../LICENSE), [LICENSING.md](../LICENSING.md) and
[NOTICE](../NOTICE) when redistributing it or its attributed data. The completed
milestones and session records are in [PLAN.md](PLAN.md) and [CHANGES.txt](CHANGES.txt).
