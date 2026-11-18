# Time zone figures on tzdata 2026f, 2026-11-18

Base `709bc813e2ee9de948ef0dcd008c76bf086fe7d4` (`2.0.0-rc.3`).

The guides quote four pre-1970 figures measured on tzdata 2025c
(`docs/time.md`) and an atlas comparison built from tzdata 2025c
(`atlas/README.md`). The package now ships tzdata 2026f, with
America/Yellowknife held at 2025c. This record measures them again on 2026f.

- Three of the four time guide figures were measured on 2026f. They are in
  the table below.
- The fourth, 584 of 597, was not measured. It compares with the tzdb
  Makefile's own build, which runs the archive's `ziguard.awk`, and no
  program from the downloaded archive was run.
- The six atlas zones give the same initial offset and the same transitions
  up to 1920 on 2026f as on 2025c.

The guides still quote the 2025c figures. Publishing the 2026f figures in
their place is the owner's decision.

## Inputs

Each archive's SHA-256 matched `fetched/MANIFEST.tsv` at
`c3377e3a373f8070fb7cb4c803f5fcbe95c25dd9` on
`fetched/engine-sources-1-44102962737-1`. Each was retrieved from
`https://data.iana.org/time-zones/releases/` under its own name.

| Input | SHA-256 | Retrieved (UTC) |
| --- | --- | --- |
| `fetched/003-tzdata2026f.tar.gz` | `01b4a91cec5167ed48c11e8ab78f2048cead78ce94b0cafcad0ae8c5a3044d3d` | 2026-11-17T14:46:48Z |
| `fetched/004-tzcode2026f.tar.gz` | `5a18da01393679ef2559214dc687563f7f3d05691f6f58b7fbc0166f3e796cd6` | 2026-11-17T14:46:51Z |
| `fetched/005-tzdata2025c.tar.gz` | `4aa79e4effee53fc4029ffe5f6ebe97937282ebcdf386d5d2da91ce84142f957` | 2026-11-17T14:46:55Z |
| [`scripts/tzdb-held/yellowknife-2025c.zi`](../../../scripts/tzdb-held/yellowknife-2025c.zi) | `90aedc77e2431ca917137a36a7870a9a9d4f39131da63ad7973f504b65b0575a` | committed |

`zic` was compiled from tzcode 2026f's `zic.c`, `private.h` and `tzfile.h`
only, extracted into an empty directory, with
`cc -O2 -DZIC_BLOAT_DEFAULT='"fat"' -o zic zic.c` and two headers written
locally: `version.h` (`PKGVERSION "(tzcode) "`, `TZVERSION "2026f"`,
`REPORT_BUGS_TO "tz@iana.org"`) and `tzdir.h` (`TZDEFAULT "/etc/localtime"`,
`TZDIR "/usr/share/zoneinfo"`). It reports `zic (tzcode) 2026f`. No
Makefile, shell or AWK program from either archive was run. With this zic,
`node scripts/build-tz-shards.mjs --check` reproduced the committed shards
(597 names). Both outputs below were produced twice and matched byte for
byte. See [the run log](run.log).

## Time guide figures

[`tools/backzone-divergence-2026f.mjs`](tools/backzone-divergence-2026f.mjs)
is an adapted copy of the 2025c script,
[`backzone-divergence.mjs`](../rc15-20260929/backzone-divergence.mjs). It
differs in two ways only:

- The pinned build is compiled from `pinnedSources()` of
  [`scripts/build-tz-shards.mjs`](../../../scripts/build-tz-shards.mjs), the
  same files the shard generator compiles: the main data without `backward`,
  `backzone`, the held Yellowknife file, and `backward`'s zone lines. The
  2025c script compiled the main data and `backzone` only, which on 2026f
  leaves out America/Yellowknife, CST6CDT, EST5EDT, MST7MDT and PST8PDT
  ([first preflight](preflight.log)).
- The two Makefile builds are not made, because they need `ziguard.awk`.
  The output gives their counts as `null`, not measured.

```sh
TZDATA_TARBALL=<tzdata2026f.tar.gz> ZIC=<zic from tzcode 2026f> \
  node docs/evidence/tzdb-2026f-20261118/tools/backzone-divergence-2026f.mjs \
  docs/evidence/tzdb-2026f-20261118/backzone-divergence-2026f.json
```

Output: [`backzone-divergence-2026f.json`](backzone-divergence-2026f.json).
Each count compares UTC offsets at every instant before `1970-01-01T00:00Z`.

| Figure | 2025c, in the guide | 2026f, measured | Field |
| --- | --- | --- | --- |
| Shipped names that give another offset than the default build | 122 of 597 | 118 of 597 | `shippedVersusDefault.count` |
| Of those, names that differ at an instant from 1850 on | 122 | 118 | `shippedVersusDefault.from1850` |
| Names whose history differs between the pinned and default builds | 136 | 130 | `pinnedVersusDefault.count` |
| Of those, names that ship the default build's history (host-legal) | 15 | 13 | `pinnedVersusDefault.notShippedBecauseHostLegal` |
| Names in the shipped list only | America/Pangnirtung | America/Pangnirtung | `pinnedVersusDefault.shippedOnly` |
| Pinned build matches the Makefile's all-backzone build | 584 of 597 | not measured | `pinnedVersusMakefileAll` |

No name joined either list on 2026f. CST6CDT, EST5EDT, MST7MDT and PST8PDT
left both lists. Europe/Uzhgorod and Europe/Zaporozhye left the pinned list;
on 2025c they were among the 15 host-legal names. Against the audit's list
of 98 zones, 24 of the 118 names are not on it (28 of 122 on 2025c), and the
same 4 listed zones do not change.

An earlier run of the same script with Ubuntu glibc 2.39's `zic` gave the
same counts and the same name lists.

## Atlas

[`tools/atlas-zones-2026f.mjs`](tools/atlas-zones-2026f.mjs) compiles
`pinnedSources()` of tzdata 2025c and of tzdata 2026f with the same zic. It
reads the atlas zones from each tree with `buildExtract()` of
[`atlas/tools/tzdb-extract.mjs`](../../../atlas/tools/tzdb-extract.mjs). It
writes nothing under `atlas/`.

```sh
ZIC=<zic from tzcode 2026f> node docs/evidence/tzdb-2026f-20261118/tools/atlas-zones-2026f.mjs \
  <tzdata2025c.tar.gz> <tzdata2026f.tar.gz> \
  docs/evidence/tzdb-2026f-20261118/atlas-zones-2026f.json
```

Output: [`atlas-zones-2026f.json`](atlas-zones-2026f.json).

| Zone | Transitions to 1920 | Initial offset and transitions to 1920 |
| --- | --- | --- |
| America/Chicago | 5 | same on 2025c and 2026f |
| America/Indiana/Indianapolis | 5 | same on 2025c and 2026f |
| America/Kentucky/Louisville | 5 | same on 2025c and 2026f |
| America/New_York | 5 | same on 2025c and 2026f |
| Europe/Berlin | 7 | same on 2025c and 2026f |
| Europe/Paris | 10 | same on 2025c and 2026f |

The compared values are each offset, abbreviation, DST flag and instant. On
both releases they also equal those in the committed extract,
[`atlas/tzdb/tzdb-2025c.json`](../../../atlas/tzdb/tzdb-2025c.json). With
the same zic, the six TZif files are identical byte for byte on both
releases. Their SHA-256 differ from those in the committed extract, which
zic 2025c compiled from the L3 recipe's tree, built with `ziguard.awk` and
`zishrink.awk`. The extract records each file's SHA-256, so it was not
rewritten. The atlas comparison reads only the offsets, so its 108
differences would be the same on 2026f.

## Checks

The atlas data check, the atlas self-test and `compare-tzdb.mjs --check`
passed on the committed 2025c extract. See [the preflight log](preflight.log)
and the pull request for the gate results.
