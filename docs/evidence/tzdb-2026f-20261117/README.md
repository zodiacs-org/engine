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
their zones). Every change below carries its cause; `changes.json` has 0
unexplained and 2 entries waiting for the owner's acceptance (America/Yellowknife's
1947 interval and its era, both from one data change).

### Offsets before 1970

24 names change offset before 1970, in 45 intervals, all after 1920:

| names | interval (UTC) | was | now | hours | cause |
| --- | --- | --- | --- | --- | --- |
| Europe/Dublin, Eire | 1925-09-20T02:00Z to 1925-10-04T02:00Z | +1:00 | +0:00 | 336 | 2026e NEWS: "In 1925 Ireland fell back on 09-20 not 10-04 (thanks to Stan Ulbrych)." |
| 21 Brazilian names (below) | 1965-03-31 local 00:00 to 24:00 | standard | daylight saving, one hour east | 24 each | 2026f NEWS: "In 1965 Brazil ended DST on 03-31 at 24:00 not 00:00, and in 1966 it ended DST on 03-01 at 01:00 not 00:00." |
| the same 21 | 1966-03-01 local 00:00 to 01:00 | standard | daylight saving, one hour east | 1 each | the same sentence |
| America/Yellowknife | 1947-04-27T09:00Z to 1947-09-28T08:00Z | -7:00 | -6:00 | 3695 | data only, no NEWS entry (below); waits for the owner's acceptance |

The 21 Brazilian names: America/Araguaina, Bahia, Belem, Boa_Vista,
Campo_Grande, Cuiaba, Eirunepe, Fortaleza, Maceio, Manaus, Noronha,
Porto_Acre, Porto_Velho, Recife, Rio_Branco, Santarem and Sao_Paulo, and
Brazil/Acre, DeNoronha, East and West. Each interval in UTC is in
`changes.json`.

**America/Yellowknife: a data change with no NEWS entry.** tzdata 2025c's
`backzone` line 930 reads `Zone America/Yellowknife 0 - -00 1935 #
Yellowknife founded?`. In 2026f's `backzone`, line 930 reads "# Commented
out as too wrong to be useful." and line 931 reads "#Zone
America/Yellowknife 0 - -00 1935", with the rest of the zone commented out
too. With no zone of that name, the name follows `backward` line 283, `Link
America/Edmonton America/Yellowknife`, in the pinned build as in the
default one, and Edmonton kept summer time in 1947. No NEWS entry from 2026a
to 2026f mentions Yellowknife. The fetched sources hold only 2025c and
2026f, so they do not show which release made the change. Under the
ticket's rule this interval, and the era change below that comes from the
same lines, wait for the owner's acceptance.

EST5EDT, CST6CDT, MST7MDT and PST8PDT change offsets in the default build
(44, 44, 5 and 19 intervals, explained by 2026d's NEWS), but not in the
shipped history: 2025c shipped backzone's federal-rules zones, which give
the same offsets as 2026f's `backward` zones. They are listed under
`defaultBuildOnly`. Their transitions do change; see the next section.

### Changes an offset comparison cannot see

`changes.mjs` reads these from the same dumps (`transitionsOnly`,
`eraEnds`, `fromHistoryEnd` in `changes.json`), and they match, name for
name and instant for instant, the differences between the 2025c and 2026f
shards and `LATER_CAUSES`. The engine's results before and after are in
`logs/before-after-probe.log` (`before-after-probe.mjs`, run on hosts with
tz 2025c and 2026e; engine output, a regression record, not accuracy
evidence).

- **EST5EDT, CST6CDT, MST7MDT, PST8PDT: abbreviations and one transition,
  1942 to 1945.** 2026d NEWS: "The backward-compatibility names EST5EDT,
  CST6CDT, MST7MDT, and PST8PDT now conform better to POSIX. For example,
  EST5EDT now always uses the abbreviation "EST" for standard time (now
  always 5 hours behind UT) and "EDT" for daylight saving time, whereas it
  formerly had different UT offsets before standard time was introduced and
  sometimes used abbreviations like "LMT", "EWT" and "EPT", all contrary to
  POSIX." In the data: 2025c's `backzone` zones (lines 1840 to 1845) follow
  rule US, whose `northamerica` line 180 (`Rule US 1945 only - Aug 14
  23:00u 1:00 P # Peace`) turns War time into Peace time with no change of
  offset; 2026f's `backward` zones (lines 372 to 375) follow rule USback,
  whose line 340 writes the same rule with letter D ("this copy uses D
  instead of W for War and P for Peace", line 335), so zic records no
  transition there. For each of the four names:
  - From 1942-02-09 to 1945-09-30, `zone.abbreviation` is EDT, CDT, MDT or
    PDT where it was EWT/EPT, CWT/CPT, MWT/MPT or PWT/PPT.
  - The 1945-08-14T23:00Z transition (offset unchanged, cause
    "legal-change") is gone. From then until the fall back on 1945-09-30
    (06:00Z, 07:00Z, 08:00Z and 09:00Z for EST5EDT, CST6CDT, MST7MDT and
    PST8PDT), `transition` was that one and is now the 1942-02-09 spring
    forward (07:00Z, 08:00Z, 09:00Z, 10:00Z), with `offsetBeforeMinutes`
    one hour behind `offsetAfterMinutes` and cause "dst".
  - Offsets are unchanged.
- **Europe/Uzhgorod and Europe/Zaporozhye: no backzone zone, so Kyiv's.**
  tzdata 2025c's `backzone` line 1588, `Zone Europe/Uzhgorod 1:29:12 - LMT
  1890 Oct`, and line 1631, `Zone Europe/Zaporozhye 2:20:40 - LMT 1880`,
  are deleted in 2026f with the rest of both zones, so each name follows
  `backward` lines 295 and 296, `Link Europe/Kyiv Europe/Uzhgorod` and
  `Link Europe/Kyiv Europe/Zaporozhye`. The only NEWS entry that mentions
  either name is 2022d's: "Move Europe/Uzhgorod and Europe/Zaporozhye to
  'backzone'; backward-compatibility links still work, albeit with
  different timestamps before October 1991." No entry from 2026a to 2026f
  mentions their removal from `backzone`. The results that change:
  - Both names, every wall time before 1970, with or without a longitude:
    `zone.dataForm` changes from "main" to "main+backzone", because the
    names are no longer host-legal. Without a longitude the offsets do not
    move: in 2025c the shipped history of both was already Kyiv's.
  - Uzhgorod, with a longitude: the birthplace's mean time era ended at
    backzone's 1890-09-30T22:30:48Z (era offset +1:29:12) and now ends at
    Kyiv's 1879-12-31T21:57:56Z (+2:02:04). A birth from then to September
    1890 given with a longitude now reads Kyiv mean time, +2:02:04, instead
    of the birthplace's own mean time (at 22.3 E, +1:29:12): 32 min 52 s
    earlier in UTC, with no `"lmt"` flag. The jump at the era's end moves
    from 1890 to 1880 with it.
  - Zaporozhye, with a longitude: the era's end moves 1116 s later, from
    1879-12-31T21:39:20Z (era offset +2:20:40) to 21:57:56Z (+2:02:04).
    Between the two instants the result now reads the birthplace's own mean
    time instead of Kyiv's, and the fold at the era's end moves with it: at
    35.17 E, 1879-12-31 23:50 was a `"dst-fold"` with `transition` at
    21:39:20Z and is now a plain `"lmt"` reading with no `transition`.
- **America/Yellowknife before 1935.** From the same data change as its
  1947 interval: 2025c's backzone zone began at "-00", so the engine read
  the host (Edmonton's history); 2026f ships Edmonton's history itself.
  The offsets are the same, but before 1935 `zone.source` is "tzdb"
  instead of "intl" and `zone.dataForm` "main+backzone" instead of "host";
  before 1906-09-01T07:33:52Z the result also carries `"lmt"`, and with a
  longitude the birthplace's mean time answers (at 114.37 W, -7:37:29
  instead of Edmonton's -7:33:52). Waits for the owner's acceptance with
  the 1947 interval.
- **Africa/Casablanca and Africa/El_Aaiun from 1970: `LATER_CAUSES`.** 2026c
  NEWS: "Morocco plans to move back to permanent UTC, without daylight
  saving time transitions, on 2026-09-20 at 02:00. This also affects
  Western Sahara." 2026f's default build has a change of standard offset
  at 2026-09-20T01:00Z (+01 to +00, daylight saving off on both sides), so
  the generator adds that instant to both names' `LATER_CAUSES` rows. On a
  host whose tz data has the change (2026c or later), a wall time at that
  instant reads `transition.cause` "legal-change" where it read "dst"
  (and `jump.cause`, which repeats it) (the log shows 2026-09-20 01:30, a fold, on a 2026e
  host). On a host with older data the instant is not a transition and
  nothing changes. Offsets from 1970 on are the host's in both cases.

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
