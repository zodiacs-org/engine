# Tehran host time zone probe, 2026-11-18

The original comparison identified a span for `Asia/Tehran` and its link
`Iran` from 1979-05-25T20:30Z inclusive to 1979-05-26T20:30Z exclusive.
During that span, tzdata 2025c gives UTC+03:30, and 2021a and 2026f give
UTC+04:30. The original evidence folder records the result before this
change. [Original comparison](../host-zone-probes-20261117/results/between-releases.txt)

## Source

The repository's fetch job retrieved `tzdata2025c.tar.gz` at
2026-11-17T14:46:55Z from
`https://data.iana.org/time-zones/releases/tzdata2025c.tar.gz`. Its SHA-256 is
`4aa79e4effee53fc4029ffe5f6ebe97937282ebcdf386d5d2da91ce84142f957`.
The archived manifest rows for all compared releases come from
`fetched/MANIFEST.tsv` on `fetched/engine-sources-1-44102962737-1`. Each
archive's digest was checked before extraction into its own empty directory.
[Manifest rows](results/tzdata-sources.tsv)

## Verification

- Run `node scripts/build-host-zone-probes.mjs --check` with
  `TZDATA_2026F_TARBALL`, `TZDATA_2021A_TARBALL` and `TZDATA_2025C_TARBALL`
  pointing to the verified archives. Both generated files match. The table
  now has 705 intervals across 77 names, with a shared probe at
  1979-05-26T08:30Z for Tehran and Iran. [Generator result](results/generator-check.txt)
- Run `bash docs/evidence/host-zone-probes-20261118/tools/verify-tehran.sh 709bc81`
  with the same tarball variables. The script compiles each default build
  using `zic -b fat`, records `zdump` transitions and reads the compiled
  offsets at the span's boundaries and probe. The generated rows differ
  from `709bc81` only by the added interval for each name.
  [Offsets and table comparison](results/tehran-offsets.txt)
- Run `npm test -- src/geo/host-zone-check.test.ts -t 'on a 2025c host'`.
  Both cases fail on `709bc81` with the new test applied and pass with the
  regenerated table. Removing the 2025c baseline from the generator and
  regenerating the files reproduces both failures.
  [Regression and mutation results](results/regression.txt)
- After building, run `npx -y -p node@22.22.2 node docs/evidence/host-zone-probes-20261118/tools/host-says.mjs`.
  On this host, the synthetic wall time of 1979-05-26 12:00 resolves to
  08:30Z with `hostCheck.status` set to `"differs"` and the
  `"host-zone-data-differs"` flag for both names. The 2026f offset would
  put that wall time at 07:30Z.
  [Host results](results/node-22.22.2.json) and [compiled offsets](results/tehran-offsets.txt)

## Package size

On Node 22.22.2, `npm run build` followed by `npm run package:contents`
measured the `./geo` static import graph at 47,715 bytes on `709bc81` and
47,724 bytes with the new probe. The unpacked package grew by the same
9 bytes, and the other entry points had identical sizes. The package check
passed within the existing budgets. [Before and after](results/package-contents.txt)
