# Host time zone data that differs from tzdb (ZOD-283), 2026-11-17

From 1970 on the engine reads a wall time on the host's `Intl`. A device
whose time zone data is older than the newest tzdb release gives the older
rules, so the same birth resolves to different instants on different
machines. This folder checks the table the geo entry now carries
(`src/geo/host-probes-data.ts`, written by
`scripts/build-host-zone-probes.mjs`) against zdump, never against the
engine, and records what two real Node hosts say at each probe.

## Sources

Downloaded by the repository's fetch job from their official hosts, branch
`fetched/engine-sources-1-44102962737-1`, `fetched/MANIFEST.tsv`:

| File | URL | SHA-256 | Retrieved (UTC) |
| --- | --- | --- | --- |
| tzdata 2026f | https://data.iana.org/time-zones/releases/tzdata2026f.tar.gz | `01b4a91cec5167ed48c11e8ab78f2048cead78ce94b0cafcad0ae8c5a3044d3d` | 2026-11-17T14:46:48Z |
| tzdata 2021a | https://data.iana.org/time-zones/releases/tzdata2021a.tar.gz | `39e7d2ba08c68cbaefc8de3227aab0dec2521be8042cf56855f7dc3a9fb14e08` | 2026-11-17T14:46:58Z |
| tzdb version (`2026f`) | https://data.iana.org/time-zones/tzdb/version | `9f9a9e6bfd18cd6a0a4d65764931072577edcbb731981a068ef52bba6615b1de` | 2026-11-17T14:46:42Z |
| tzdb NEWS (2026f released 2026-10-27) | https://data.iana.org/time-zones/tzdb/NEWS | `1b22446d6ac1690fec6fde2ad8283b40ca20ea2ed9607da386a1ecfeb3c13a1d` | 2026-11-17T14:46:45Z |

Neither archive is committed. Both the generator and the check refuse an
archive with another digest.

## What was run

- `scripts/build-host-zone-probes.mjs --check`: the committed table and
  `src/geo/host-probes-intervals.json` are what the generator writes from the
  two archives (`results/generator-check.txt`): 703 intervals in 77 names,
  the table's string 7,169 bytes, the generated module 7,274 bytes minified
  (`esbuild --minify --format=esm`, esbuild 0.27.7).
- `tools/zdump-check.mjs`: unpacks each archive, compiles its default build
  (main data files with `backward` and `etcetera`, no `backzone`) with
  `zic -b fat`, reads every one of the 593 names both builds have with
  `zdump -v -c 1970,2030` (and `zdump -i` for the offset on 1970-01-01), finds
  the intervals itself and compares them, to the second, with the spelled-out
  intervals, each probe's place and zdump's 2026f offset there, and the
  shipped table decoded by its own reader (`results/zdump-check.txt`: every
  one matches). zic and zdump: Ubuntu GLIBC 2.39-0ubuntu8.9.
- `tools/host-says.mjs`: what each Node's own `Intl` says at every probe, and
  what the built branch gives for five wall times on that real host,
  unemulated (`results/node-22.22.2.json`, `results/node-22.23.4.json`).
- `tools/earlier-readers.mjs`: a receipt carrying the flag, written by this
  branch on Node 22.23.4, read by the carried 2.0.0-rc.2 and 1.1.0 archives'
  codecs: both refuse it as `invalid_value`, the code an unknown flag gets, and
  the branch reads it back (`results/earlier-readers.jsonl`).
- `tools/between-releases.mjs`: tzdata 2025c (the shipped history's
  archive, also Node 22.22.2's data) against 2026f, with the generator's own
  functions: 70 runs, of which only Asia/Tehran and its link Iran,
  1979-05-25T20:30Z to 1979-05-26T20:30Z (2025c +03:30, 2026f +04:30), are
  not in the 2021a table (`results/between-releases.txt`). A 2025c host is
  wrong there unflagged; `docs/time.md` *Limits* says so.
- `results/mutations.txt`: the check and the tests fail on a changed offset,
  on a missing 36 hour margin, on an inverted comparison and on a span still
  open at the horizon checked without end.

## Results

| Node | `process.versions.tz` | ICU | probes where Intl gives 2026f's offset | 2021a's | neither |
| --- | --- | --- | --- | --- | --- |
| 22.22.2 | 2025c | 78.2 | 635 | 68 | 0 |
| 22.23.4 | 2026e | 78.3 | 701 | 2 | 0 |

Node 22.23.4 differs only for Cuba (`America/Havana` and `Cuba`, probe
2027-01-06T17:00Z), which 2026f changed. Node 22.22.2 also differs for
Morocco and Western Sahara (`Africa/El_Aaiun`) from 2026 to 2029, British
Columbia, Alberta, Manitoba and the Northwest Territories (the winters 2026
to 2029), Moldova (an hour twice a year from 2022, which 2026a moved) and
Bogota 1992-05-02.

On those real hosts the branch gives, for `resolveLocalToUtc`:

| Wall time | Node 22.22.2 (2025c) | Node 22.23.4 (2026e) |
| --- | --- | --- |
| America/Havana 2026-12-15 12:00 | 17:00Z, flagged, host −5:00, 2026f −4:00 | 17:00Z, flagged, the same |
| America/Vancouver 2027-01-15 12:00 | 20:00Z, flagged, host −8:00, 2026f −7:00 | 19:00Z, current |
| Europe/Chisinau 2024-03-31 02:30 | 00:30Z, `dst-gap`, flagged, host +3:00, 2026f +2:00 at 00:30Z | 00:30Z, current |
| Africa/Casablanca 2030-01-20 12:00 (L3-TZ-0045) | 12:00Z, unchecked (past the horizon) | 12:00Z, unchecked |
| Asia/Tehran 1979-05-26 12:00 | 08:30Z, current (2026f gives 07:30Z; not seen, above) | 07:30Z, current |

`main` gives the same five instants with no flag and no `hostCheck`
(`results/main-on-both-hosts.txt`). tzdata 2026f gives 16:00Z for
Havana and 19:00Z for Vancouver: the instant returned stays the host's.

Synthetic wall times only; no birth data.
