# Relocation workbench

This isolated project uses the carried engine archive through a relative file
dependency. It does not rebuild the engine. Install dependencies from this
directory with `npm ci --ignore-scripts`, then run `npm run typecheck` and
`npm test`. Use Node from the package's declared runtime range.

`src/index.ts` exports `relocateChart(birth, destination)`. Supply an engine
`BirthInput` with an already resolved instant and a destination containing
`latitude` and `longitude` in geographic degrees. Longitude is east-positive.
The returned `natal` and `relocated` fields are full envelopes created by the
engine's receipt API. Each contains its result, conventions, time basis,
engine identity, requested house system, actual house system and flags.

Relocation preserves the instant, time scale, pinned delta-T and time-known
setting. It changes the geographic coordinates and asks the engine to
recompute the chart. Planetary positions remain geocentric. Local wall times
must be resolved before calling this API. Unknown-time charts keep absent
angles and houses. Polar fallback is the engine's own result; exact geographic
poles are rejected because a rising direction is undefined there.

The synthetic cases in `test/chart.vitest.ts` check equality with direct engine
calls, replay, polar fallback, antimeridian endpoints and input ownership.
They are regression checks, not independent accuracy evidence. Receipt
labels describe the calculation and do not authenticate its physical accuracy.
The remaining geometry and CLI work is listed in `PLAN.md`.

Code and documentation here use the repository's MIT license. The engine is
distributed under MIT AND CC-BY-4.0; retain its LICENSE, LICENSING.md and
NOTICE when redistributing it or its attributed data. Generated grids and
temporary files belong in the ignored `generated/` and `.cache/` directories.
