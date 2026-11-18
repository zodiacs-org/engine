# Time zone figure rerun, 2026-11-18

Base `709bc813e2ee9de948ef0dcd008c76bf086fe7d4` (`2.0.0-rc.3`). The preflight
confirmed that the checked-in scripts cannot produce these measurements for
the shipped 2026f history as written. The guides retain their 2025c figures
and reference. See [preflight output](preflight.log).

## Inputs

Both archive hashes were verified against `fetched/MANIFEST.tsv` at
`c3377e3a373f8070fb7cb4c803f5fcbe95c25dd9` on
`fetched/engine-sources-1-44102962737-1`.

| Input | SHA-256 |
| --- | --- |
| `fetched/003-tzdata2026f.tar.gz` | `01b4a91cec5167ed48c11e8ab78f2048cead78ce94b0cafcad0ae8c5a3044d3d` |
| `fetched/004-tzcode2026f.tar.gz` | `5a18da01393679ef2559214dc687563f7f3d05691f6f58b7fbc0166f3e796cd6` |
| [`scripts/tzdb-held/yellowknife-2025c.zi`](../../../scripts/tzdb-held/yellowknife-2025c.zi) | `90aedc77e2431ca917137a36a7870a9a9d4f39131da63ad7973f504b65b0575a` |

Each archive was extracted into its own empty directory. Extraction accepted
only unique, flat regular files and did not carry over archive permissions.
The `zic` and `zdump` binaries were compiled directly with `cc -O2` from
`zic.c` and from `zdump.c localtime.c strftime.c`, respectively, using
locally written `version.h` and `tzdir.h` headers. The archived Makefile,
shell and AWK programs were not executed.

## Time guide

[`backzone-divergence.mjs`](../rc15-20260929/backzone-divergence.mjs) produced
the [2025c report](../rc15-20260929/backzone-divergence.json). Its three
fields count names based on offsets before `1970-01-01T00:00Z`.

| Figure in the guide | Field in the 2025c report |
| --- | --- |
| 584 of 597 match the Makefile's all-backzone build | `names - pinnedVersusMakefileAll.count`, comparing the pinned build before any runtime fallback |
| 122 of 597 shipped names differ from the default build | `shippedVersusDefault`, from the shards with `-00` spans filled by the default clock |
| 136 names differ between the pinned and default builds | `pinnedVersusDefault`, with `-00` spans skipped |

The legacy script's pinned compile includes `backzone` and omits all of
`backward`. Compiling that exact input list with 2026f zic left out the
held `America/Yellowknife` zone and the compatibility zones `CST6CDT`,
`EST5EDT`, `MST7MDT` and `PST8PDT` that moved to `backward`. The current
[shard generator](../../../scripts/build-tz-shards.mjs) includes the held
file and the non-Link lines of `backward`. The old script reads the current
generator's zone-name resolution but cannot find these zones in its own
compiled tree.

The script also runs the archive's `ziguard.awk` to make the comparison
trees. A preflight with `awk` excluded from `PATH` stopped at that call and
produced no report. The script's `shippedVersusDefault.meaning` string
still describes a 2025c baseline even when the 2026f archive is supplied.

As a separate check, the shard generator's `--check` reproduced the
committed shards with the verified archive, the Yellowknife hold and the
locally built 2026f zic using `-DZIC_BLOAT_DEFAULT='"fat"'`. The default
slim build failed the generator's Yellowknife guard. That guard compares the
explicit transitions in the TZif files, which slim output can leave to the
POSIX footer. The shard check establishes which data ships. It supplies no
replacement agreement or divergence counts.

## Atlas

[`tzdb-extract.mjs`](../../../atlas/tools/tzdb-extract.mjs) accepts a
compiled tree but stamps it with the 2025c L3 source record and writes to
`atlas/tzdb/tzdb-2025c.json`. [`compare-tzdb.mjs`](../../../atlas/tools/compare-tzdb.mjs)
and [`check.mjs`](../../../atlas/tools/check.mjs) read that fixed path. The
documented L3 recipe also runs the archives' `ziguard.awk` and `zishrink.awk`.
The 2026f replay stopped before any of those runs. The atlas data check,
tool self-test and comparison freshness check passed on the committed 2025c
extract, with output in [the preflight log](preflight.log).
