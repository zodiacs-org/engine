# Golden polyline regressions

These JSON files contain outputs of the relocation library using the carried
engine archive. All natal instants and places are invented. The fixtures are
regression checks, not independent astronomical accuracy evidence. They use no
external ephemeris or network service.

`scripts/golden-data.ts` defines the inputs and the compact output projection.
`scripts/generate-golden.mjs` calculates the outputs, checks the carried
archive against its receipt and the dependency lock, and writes the fixtures
and their manifest. The manifest records engine and ephemeris identities,
runtime, archive digest and each fixture's byte count and digest. There is no
generation timestamp. Do not edit the JSON by hand.

From `relocation/`, use the manifest's Node runtime, then run:

```sh
npm run fixtures:generate
npm run fixtures:check
npm run typecheck
npm test
```

Both fixture commands compile only this isolated project's sources into
ignored `.cache/fixtures-build/`. The check recalculates outputs and compares
every JSON byte without writing fixture files. Generation and byte checking
require Node 22.22.2; `test/golden.vitest.ts` checks that recorded runtime.
Numerical results can vary across JavaScript runtimes and processors. On
another supported runtime, integration tests still compare structure and
numbers, but skip the generator's byte check. Review actual geometry and
metadata differences before regenerating to accept a change.

| Case | Regression scope |
| --- | --- |
| `meridians-poles` | MC and IC, undefined endpoints at both geographic poles, source polar house fallback |
| `horizons-tangencies` | ASC and DSC, both hemispheres, circumpolar gaps, tangent insertion and seam interpolation |
| `horizons-wrapped-clipping` | Wrapped longitude bounds, clipped rows, outside lines and seam splits |
| `grid-seam-crossings` | Refined horizon roots, brackets, observer indices and a cell segment across the seam |
| `grid-budget-stop` | Coarse receipts retained after the refinement budget is exhausted, unresolved edges and cells |
| `path-seam-crossing` | Shortest spherical path, refined angular root, arc bracket and seam provenance |
| `path-polar-gap` | Inserted geographic pole, undefined observer, unresolved adjoining intervals and Koch fallback |
| `local-space-seam-tt` | Forward and opposite rays, changing course, seam interpolation, TT clock and pinned delta-T |

Each fixture retains geometry, sample indices, crossing brackets, unresolved
metadata, the source natal receipt, full planetary position results with their
receipts, and compact observer summaries. Full observer receipts remain in
library and CLI results. The integration tests replay every full receipt
through the engine, resolve all geometry indices to their observers, and
check the structured results against these fixtures through birth, chart,
envelope and real CLI inputs. They also feed a wrapped chart grid's stored
natal receipts into angular generation and relocate sampled crossings.
Interpolated seam vertices do not receive invented engine receipts.

Over these synthetic cases, `test/golden.vitest.ts` requires exact structure,
metadata, counts, indices and integer values. Other finite numeric values may
differ by at most 1e-9 in their recorded units. This comparison tolerance
allows small arithmetic differences; it does not establish astronomical or
geographic accuracy. Each fixture is capped at 100,000 UTF-8 bytes, enforced
by the generator and the manifest test. This is a storage cap, not a sampling
resolution claim. Large grids, trial outputs and caches belong in the ignored
`generated/` or `.cache/` directories.

These locally generated regression fixtures and their generator use the
repository's MIT license. The engine retains its own licensing and attribution
requirements in the root `LICENSING.md` and `NOTICE`.
