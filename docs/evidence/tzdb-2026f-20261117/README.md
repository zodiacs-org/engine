# The shipped zone history from tzdata 2025c to 2026f (ZOD-282), 2026-11-17

The zone history this package ships for wall times before 1970 moves from
IANA tzdata 2025c to 2026f, the newest release on 2026-11-17
(`https://data.iana.org/time-zones/tzdb/version` read "2026f"). This folder
records what moved, from an outside oracle only: zic compiles each release,
zdump reads every name, and the comparisons take zdump's text (and, for the
property check, Python's `zoneinfo` reading the same compiled files) as their
only expectation. Nothing here takes an expected value from the engine, its
shards or the generator. A clock offset is a legal fact with no measurement
error, so every comparison is exact, in seconds.

## Sources

Downloaded by the repository's fetch job to the side branch
`fetched/engine-sources-1-44102962737-1` (`fetched/MANIFEST.tsv`); none of
them is committed here.

| file | URL | bytes | SHA-256 | retrieved (UTC) |
| --- | --- | --- | --- | --- |
| tzdb version | `https://data.iana.org/time-zones/tzdb/version` | 6 | `9f9a9e6bfd18cd6a0a4d65764931072577edcbb731981a068ef52bba6615b1de` | 2026-11-17T14:46:42Z |
| NEWS | `https://data.iana.org/time-zones/tzdb/NEWS` | 264231 | `1b22446d6ac1690fec6fde2ad8283b40ca20ea2ed9607da386a1ecfeb3c13a1d` | 2026-11-17T14:46:45Z |
| tzdata2026f.tar.gz | `https://data.iana.org/time-zones/releases/tzdata2026f.tar.gz` | 483310 | `01b4a91cec5167ed48c11e8ab78f2048cead78ce94b0cafcad0ae8c5a3044d3d` | 2026-11-17T14:46:48Z |
| tzcode2026f.tar.gz | `https://data.iana.org/time-zones/releases/tzcode2026f.tar.gz` | 329832 | `5a18da01393679ef2559214dc687563f7f3d05691f6f58b7fbc0166f3e796cd6` | 2026-11-17T14:46:51Z |
| tzdata2025c.tar.gz | `https://data.iana.org/time-zones/releases/tzdata2025c.tar.gz` | 469363 | `4aa79e4effee53fc4029ffe5f6ebe97937282ebcdf386d5d2da91ce84142f957` | 2026-11-17T14:46:55Z |
| eggert/tz tag 2026f | `https://codeload.github.com/eggert/tz/tar.gz/refs/tags/2026f` | 657534 | `2fe4b4f27f75beea17970dfdd242ffb7f099fad9447950a39d0fe8eae522d8e2` | 2026-11-17T14:47:01Z |

- The NEWS file served on its own is byte-identical to the NEWS in
  tzdata2026f.tar.gz.
- Each of `africa antarctica asia australasia europe northamerica
  southamerica etcetera backward backzone` in tzdata2026f.tar.gz is
  byte-identical to the same file in the `eggert/tz` tag `2026f` tarball
  (`cmp`, all ten identical).
- tzdata2025c.tar.gz has the digest `scripts/build-tz-shards.mjs` pinned
  before this change, and the 2025c generator reproduces the committed
  2025c shards from it (`--check` passed on `main` at `c80fde4`).

## Tools

- zic and zdump built from tzcode2026f.tar.gz (`make zic zdump`,
  `zic (tzcode) 2026f`), as the conformance suite's L3 arbiter builds its
  own from tzcode.
- The generator calls the `zic` on `PATH`; here that was the Ubuntu one
  (`zic (Ubuntu GLIBC 2.39-0ubuntu8.9) 2.39`). Both zics give byte-identical
  zdump output for all eight dumps below, and the generator writes
  byte-identical `src/tzdb/` with either (`--check` passed with each).
- Node 22.22.2 (tzdb 2025c, ICU 78.2) for the engine; Python 3.13 for
  `zoneinfo`.

## How it was run

```sh
node docs/evidence/tzdb-2026f-20261117/oracle.mjs --zic ZIC --zdump ZDUMP \
  --tzdata tzdata2025c.tar.gz --tzdata tzdata2026f.tar.gz --out DUMPS
node docs/evidence/tzdb-2026f-20261117/changes.mjs DUMPS NEWS docs/evidence/tzdb-2026f-20261117/changes.json
node docs/evidence/tzdb-2026f-20261117/transition-count.mjs DUMPS
npm run build
node docs/evidence/tzdb-2026f-20261117/compare.mjs --dumps DUMPS --zic ZIC \
  --tzdata tzdata2026f.tar.gz --geo dist/geo.js [--mutate Europe/Dublin]
```

`oracle.mjs` compiles each release twice with the generator's zic call
(`zic -d DIR FILES`, no `-b`): "pinned" (the main data, `backzone`, and
`backward`'s Zone and Rule lines with those of its links whose names neither
defines, so zic resolves each name as the generator does) and "default"
(the main data with `backward`, what `Intl` carries). It runs
`zdump -v -c 1800,1970` and `zdump -v -c 1970,2038` on every compiled name.
The dumps are not committed; their digests (`logs/oracle.log`, identical on
two runs and with either zic):

| dump | names | lines | SHA-256 |
| --- | --- | --- | --- |
| 2025c pinned 1800-1970 | 598 | 24294 | `e8610238f2618aa7e4a546586ecc17c5a5c1fabd7dc24a70335dbe98385a84bf` |
| 2025c default 1800-1970 | 597 | 25978 | `5d76f06b81b79df7fd7036166eae65de36d1f37a333d61d4197314c4567ea902` |
| 2026f pinned 1800-1970 | 598 | 24312 | `422e3a0c6e15ee5151d3dff95f7d9e0149076dfa88e86d31de395df6dd66a2c2` |
| 2026f default 1800-1970 | 597 | 25526 | `781ddaa7607f3fc789eeb1f31300109197ef13a2c5dbaac9de4ad347714e108a` |
| 2025c pinned 1970-2038 | 598 | 66480 | `b512502824c04f84157fda71fc77720a560c00d29c2bb623f7f7791ebc7b5b6f` |
| 2025c default 1970-2038 | 597 | 67024 | `719a0af7de1edcd12e25665975e1144a65d9208981dec52c6cb677a565465d09` |
| 2026f pinned 1970-2038 | 598 | 66026 | `bcc546659c52e47ca5957be565657c11fd38078c70f70066ac9f7f95f6907f53` |
| 2026f default 1970-2038 | 597 | 66524 | `ba20a75733d51395a3ce44f4443ef75d9413ff8423da33288e728b62a5334bdd` |

The pinned build's 598th name is Asia/Hanoi, a backzone zone the default
build lacks; the package leaves it out, as before.

## What changes (`changes.json`)

For each name, `changes.mjs` compares the history the package ships for
each release: the pinned build, or the default build for a name whose two
builds differ at any instant from 1970 on (host-legal), with spans zdump
marks `-00` read from the default build, as the engine reads them from
`Intl`. The host-legal names come out of the dumps: 16 for 2025c (the same
16 the committed 2025c shards mark) and 14 for 2026f (Europe/Uzhgorod and
Europe/Zaporozhye leave the list, because 2026f's `backzone` no longer has
their zones).

24 names change offset before 1970, in 45 intervals, all after 1920:

| names | interval (UTC) | was | now | hours | NEWS |
| --- | --- | --- | --- | --- | --- |
| Europe/Dublin, Eire | 1925-09-20T02:00Z to 1925-10-04T02:00Z | +1:00 | +0:00 | 336 | 2026e: "In 1925 Ireland fell back on 09-20 not 10-04 (thanks to Stan Ulbrych)." |
| 21 Brazilian names (below) | 1965-03-31 local 00:00 to 24:00 | standard | daylight saving, one hour east | 24 each | 2026f: "In 1965 Brazil ended DST on 03-31 at 24:00 not 00:00, and in 1966 it ended DST on 03-01 at 01:00 not 00:00." |
| the same 21 | 1966-03-01 local 00:00 to 01:00 | standard | daylight saving, one hour east | 1 each | the same sentence |
| America/Yellowknife | 1947-04-27T09:00Z to 1947-09-28T08:00Z | -7:00 | -6:00 | 3695 | **unexplained** |

The 21 Brazilian names: America/Araguaina, Bahia, Belem, Boa_Vista,
Campo_Grande, Cuiaba, Eirunepe, Fortaleza, Maceio, Manaus, Noronha,
Porto_Acre, Porto_Velho, Recife, Rio_Branco, Santarem and Sao_Paulo, and
Brazil/Acre, DeNoronha, East and West. Each interval in UTC is in
`changes.json`.

**Unexplained: America/Yellowknife.** No NEWS entry of 2026a to 2026f
mentions it. tzdata 2026f's `backzone` comments its Zone out with the line
"# Commented out as too wrong to be useful.", so the name falls to
`backward`'s `Link America/Edmonton America/Yellowknife`. Under the ticket's
rule this interval blocks the change until it is explained or accepted.

EST5EDT, CST6CDT, MST7MDT and PST8PDT change in the default build (44, 44, 5
and 19 intervals, explained by 2026d's NEWS), but not in the shipped history:
2025c shipped backzone's federal-rules zones, which give the same offsets as
2026f's `backward` zones. They are listed under `defaultBuildOnly`.

### Changes the zdump comparison cannot see

These change published results without changing any zone offset zdump
reports. They come from the zone lines, so they are recorded here from the
data files and from the engine before and after
(`before-after-probe.mjs`, `logs/before-after-probe.log`; engine output, a
regression record, not accuracy evidence):

- **Abbreviations, 1942 to 1945**: EST5EDT, CST6CDT, MST7MDT and PST8PDT now
  say "EDT", "CDT", "MDT", "PDT" where 2025c said "EWT"/"EPT" and the like
  (2026d NEWS: "EST5EDT now always uses the abbreviation "EST" for standard
  time ... and "EDT" for daylight saving time"). Offsets unchanged. `zone.abbreviation` changes.
- **Europe/Uzhgorod, with a longitude**: 2025c ended the birthplace's local
  mean time era at backzone's 1890-09-30T22:30:48Z; 2026f has no Uzhgorod
  zone, so the era is Kyiv's, ending 1879-12-31T21:57:56Z. A birth from 1880
  to September 1890 given with a longitude now reads Kyiv mean time,
  +2:02:04, instead of the birthplace's own mean time (at 22.3 E, +1:29:12):
  32 min 52 s. `zone.dataForm` changes from "main" to "main+backzone".
  Without a longitude the offset does not move.
- **Europe/Zaporozhye, with a longitude**: the era's end moves 1116 s later,
  from 1879-12-31T21:39:20Z to 21:57:56Z; `dataForm` as above.
- **America/Yellowknife before 1935**: 2025c's backzone zone began at "-00",
  so the engine read the host (Edmonton's history); 2026f ships Edmonton's
  history itself. The offsets are the same, but before 1906-09-01T07:33:52Z
  the result now carries `"lmt"`, `zone.source` is "tzdb", and with a
  longitude the birthplace's mean time answers (at 114.37 W, -7:37:29
  instead of Edmonton's -7:33:52).

## The engine against the oracle (`logs/compare.log`)

On this branch's build (Node 22.22.2):

- Every transition before 1970 of all 597 names, 1 s before and 1 s after:
  19,205 instants compared with zdump, 0 mismatches. 25 instants fall in
  "-00" spans, which the engine reads from the host by design; they are
  counted, not compared.
- The host-legal marking: 14 names by the dumps, the same 14 labelled
  `dataForm` "main" by the engine, recomputed by the generator (not carried
  over).
- Property check: 5,000 (name, instant from 1800 to 1970) pairs from a
  fixed seed (0x282), against Python's `zoneinfo` on the compiled 2026f
  trees: 4,868 compared, 0 mismatches, 132 in "-00" spans.
- Mutation (`logs/compare-mutant.log`): moving Europe/Dublin's first
  transition in its built shard by 3600 s makes the comparison fail (93
  mismatches, exit 1). Shard instants are stored as differences, so the move
  shifts every later Dublin transition too.
- Restoring the 2025c digest in the generator makes it refuse the 2026f
  archive ("has sha256 01b4a91c..., expected 4aa79e4e..."); the 2025c
  generator's pinned build, run on 2026f data, stops with "CST6CDT
  (CST6CDT) did not compile".

`transition-count.mjs` (`logs/transition-count.log`) counts, from the dumps,
the offset changes from 1850 to 2037 of the shipped history before 1970 and
tzdb 2025c's default build after (a host whose `Intl` is 2025c): 39,839 with
the 2025c history, as rc.15 recorded, and 39,841 with 2026f (Yellowknife's
1947 summer). `src/geo/roundtrip.test.ts` expects the latter.

## Not moved

- Conformance: every verdict and every value of
  `conformance/results/zodiacs-engine.json` is unchanged (the run's output
  compared field by field); none of the 45 zone vectors falls in a changed
  interval. The vectors stay arbitrated by tzdata 2025c with backzone.
- The time atlas compares with the committed `atlas/tzdb/tzdb-2025c.json`
  and is unchanged; its checks pass. Moving it to 2026f is a follow-up.
- Offsets from 1970 on are the host's, as before.
