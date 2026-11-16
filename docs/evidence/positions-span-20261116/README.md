# positions() at the edge of the reference span (ZOD-97, T5), 2026-11-16

The rerun of ZOD-97 on 1.1.0 (`../edge-cases-1.1.0-20261116/`) found T5
"fail, narrowed": `calc()` refuses outside the span, but the root's
`positions()` at 2200-01-01T00:00Z and 1799-12-31T23:59Z returned positions
with no flag, where `natalChart()` at the same instant flags
`outside-reference-span`. This folder reruns that part of T5 on the branch
that makes `positions()` carry, on each row, the flags a chart at the same
instant carries.

The pass mark is the one written before the first run
(`../edge-cases-20261111/EDGE-CASES.md`, class Y; ZOD-97's T5): `calc()`
refuses outside the span, and the root, which computes there, flags it. The
arbiter is the span's published definition, 1800-01-01T00:00Z up to
2200-01-01T00:00Z (`docs/calc.md`), not the engine's output. No Horizons
response is needed for this part, and none was asked for.

Synthetic instants only.

## What was run, on what

- Engine: the branch `admin/zod-97-positions-span-flag`, from `main` at
  `c0edf2a` (1.1.0), built with `npm ci && npm run build`, Node 22.23.4.
  `engineVersion` is 1.1.0 in the results, because `version` is not changed
  before the next candidate.
- Tool: `tools/span-edge.mjs`, the part of
  `../edge-cases-1.1.0-20261116/tools/horizons-edge.mjs` that needs no
  Horizons response (its `REFUSED` cases and its root-entry case Y-i), copied
  so that it writes here. Cases and verdicts are that tool's; each Y-i record
  also says whether every row's flags equal the chart's.

## Results (`results/span-edge.json`)

| case | 1.1.0 (`../edge-cases-1.1.0-20261116/results/horizons-edge.json`) | this branch |
| --- | --- | --- |
| Y-f to Y-m, `calc()` outside the span, Sun and Moon | pass, 12 of 12 | pass, 12 of 12 |
| Y-i, 2200-01-01T00:00Z | flagged by `natalChart()` only | flagged: every row `["outside-reference-span", "delta-t-extrapolated"]`, as the chart; `jpl-de440` |
| Y-i, 2250-01-01T00:00Z | flagged by `natalChart()` only | flagged: every row `["outside-reference-span", "delta-t-extrapolated", "outside-de440-span"]`, as the chart; astronomy-engine |
| Y-i, 1799-12-31T23:59Z | flagged by `natalChart()` only | flagged: every row `["outside-reference-span"]`, as the chart; `jpl-de440` |

T5 at the span's edge passes on this branch: `calc()` refuses (12 of 12) and
`positions()` flags each row as `natalChart()` flags the chart (3 of 3).

## Rerunning

```sh
npm ci && npm run build
node docs/evidence/positions-span-20261116/tools/span-edge.mjs
```

`ZODIACS_ENGINE_DIST=<dir>` runs it on another build. Nothing was merged,
tagged, released or published.
