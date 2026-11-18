# Time zone measurement rerun, 2026-11-18

Base: `709bc81` (2.0.0-rc.3). Source: `fetched/MANIFEST.tsv` on
`fetched/engine-sources-1-44102962737-1` at
`c3377e3a373f8070fb7cb4c803f5fcbe95c25dd9`. Both archives passed SHA-256
verification before separate extraction into empty directories.

| Source file | Verified SHA-256 |
| --- | --- |
| `003-tzdata2026f.tar.gz` | `01b4a91cec5167ed48c11e8ab78f2048cead78ce94b0cafcad0ae8c5a3044d3d` |
| `004-tzcode2026f.tar.gz` | `5a18da01393679ef2559214dc687563f7f3d05691f6f58b7fbc0166f3e796cd6` |

Only the compiled `zic` and `zdump` were executed from these sources.
Both reported tzcode 2026f. See [the compiler and rerun log](rerun.txt).

## Pre-1970 figures

[The original report](../rc15-20260929/backzone-divergence.json) and
[its script](../rc15-20260929/backzone-divergence.mjs) cover all three
figures. The original report records 597 names and 13 differences from
the Makefile's all-backzone build, giving 584 matches. It also records 122
names where the shipped answer differs from the default build and 136 where
the pinned and default builds differ with no-local-time spans skipped.

The unchanged script compiled its first two trees and stopped at the call
to run the archive's `ziguard.awk`. A guard on `PATH` prevented that
execution. The script's pinned compile also leaves out the held source and
the Zone and Rule lines now supplied by `backward`. The current generator's
`pinnedSources` includes both. The script imports a name resolver that knows
about the held zone, so the pinned tree would need to contain the held
America/Yellowknife for the comparison to work. The script writes its report
only after the Makefile comparisons, so the attempt produced no new figures.

As a separate input check, the current shard generator's `--check` with
the built zic stopped at its assertion about the first difference between
held Yellowknife and the default build. The log records the assertion
output. The generator wrote no shards.

## Atlas

[`tzdb-extract.mjs`](../../../atlas/tools/tzdb-extract.mjs) takes a compiled
tree via `--zoneinfo`, labels it from the [conformance source
record](../../../conformance/sources/l3/tzdata.json), and writes to a fixed
2025c path. [`compare-tzdb.mjs`](../../../atlas/tools/compare-tzdb.mjs)
and [`check.mjs`](../../../atlas/tools/check.mjs) consume that extract.
The documented atlas build uses `PACKRATLIST=zone.tab` and archive
scripts `ziguard.awk` and `zishrink.awk`. The rerun stopped at these
requirements. Feeding a 2026f tree to the unchanged extractor would attribute
its offsets to 2025c. The existing comparison check passed with 108
differences on the committed 2025c extract.
