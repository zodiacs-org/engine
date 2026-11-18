# Tehran host time zone probe

This follows the [original host probe evidence](../host-zone-probes-20261117/),
which found the missing span in `results/between-releases.txt`. The host
probe generator now compares tzdata 2026f against both 2021a and 2025c.

## Source

The archives came from `fetched/engine-sources-1-44102962737-1`. Its
`fetched/MANIFEST.tsv` records the following provenance for the new input.

| Archive | Source URL | SHA-256 | Retrieved (UTC) |
| --- | --- | --- | --- |
| `005-tzdata2025c.tar.gz` | https://data.iana.org/time-zones/releases/tzdata2025c.tar.gz | `4aa79e4effee53fc4029ffe5f6ebe97937282ebcdf386d5d2da91ce84142f957` | 2026-11-17T14:46:55Z |

## Results

The additional span runs from 1979-05-25T20:30Z to 1979-05-26T20:30Z.
For both Asia/Tehran and Iran, tzdata 2025c gives +03:30 during the
span, and 2021a and 2026f give +04:30. Use `npm run build` and run
`node docs/evidence/host-zone-probes-20261118/check-tehran.mjs` on Node
22.22.2, with the same archive inputs as the generator. The script uses
`zdump` on each default build, then resolves the synthetic wall time
1979-05-26 12:00 through the built geo entry using the runtime's own time
zone data. Both names resolve to 08:30Z and carry
`host-zone-data-differs`. See [the output](results/tehran.txt).

The [generator check](results/generator-check.txt) verifies both generated
files. The new regression cases in `src/geo/host-zone-check.test.ts` fail
against the original table and when the 2025c baseline is removed and the
table regenerated. They pass with the new baseline. See [the test results](results/regression.txt).

The [package measurements](results/package-sizes.txt) are from
`npm run build` and `npm run package:contents` on the same runtime, for
origin/main at `709bc81` and the revised table. The verifier measures raw
bytes in each static JavaScript import graph.
