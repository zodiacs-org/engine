# 1.1.0-rc.12: no deflection behind the Sun's disc, the pack swept again, two root results labelled

The candidate for 1.1.0 on draft pull request 101, cut on 2026-11-15 after
the review of 1.1.0-rc.11 (`../1.1.0-rc.11-20261115/breaker/BREAKER.md`),
which found two blockers. It replaces 1.1.0-rc.11, whose checks are in
`../1.1.0-rc.11-20261115/`. Nothing here was tagged, published or merged.

Machine: one Linux x86-64 host shared with other jobs, Node 22.22.2 unless a
line says otherwise. The host has a root-owned `/node_modules`, so every
command that the archive-binding check or a consumer check runs was started
in a mount namespace without it (`tools/gates.sh` has the command).

Every measurement below except the gates was made on one build of the
candidate's source, `dist/` with `sha256sum *.js *.d.ts | sha256sum` =
`32a2c2ce5435c1e462737aca3e524735e600b1ae27c7d970aed134b06f0f90a6`, the
`dist/` of the carried archive (*The archive*, below, checks that).

## What changed against 1.1.0-rc.11

- B2 of the rc.11 review: behind the Sun's disc the pack's place was up to
  308″ from JPL Horizons. The reduction now bends no light from a planet
  behind the disc, as Horizons does not (`src/de440/reduce.ts`;
  `docs/de440.md`, *Behind the Sun's disc*). The brief asked for ERFA's
  `eraLdsun` limiter; measured against Horizons it is up to 5.77″ off inside
  the disc (below), so the candidate follows Horizons instead. One constant
  and one function in `reduce.ts` make the rule; it is the owner's to keep
  or change.
- A speed's two samples take the decision of their middle instant on the
  disc, so a speed never holds the step at the limb.
- The window search takes the deflection near the Sun as a displacement of
  at most 1.8″ (`Sky.bend`), in place of rc.10's inverse-square rate raise.
- `calc()` quotes 1.8″ (estimated) within 3″ of the limb, and its pack
  bounds are now the larger of the L1 vectors' and the dense sweep's.
- The DE440 sweep workflow runs the pack too and holds it to
  `src/calc-bounds-de440.ts` (`tools/check_pack.py` in the sweep's tools).
- B1 of the review: `chartPoints` and `chartDeclinations` carry `ephemeris`
  and `flags`; S4: a flagged `saturnReturn` names astronomy-engine; S3: the
  docs say which results name an ephemeris and which only flag; S1:
  `docs/calc.md` on the deflection.

## Behind the Sun's disc, against JPL Horizons (`near-sun/`)

`near-sun/tools/`: `passages.mjs` (engine side), `horizons.py` (340 queries
to the Horizons API, QUANTITIES 2 and 31, TLIST of at most 40 TT instants,
each response's SHA-256 and URL kept in `horizons.json`), `compare.py`
(differences, and four reductions of `de440.bsp` with pyerfa 2.0.1.5, numpy
2.4.6, jplephem 2.24), `fixture.py` (the test's fixture), `limb.py` with
`horizons_span.py` (where Horizons's edge lies). The large outputs are
gzipped (`gzip -n -9`): `passages.json.gz`, `horizons.json.gz`,
`near-sun.json.gz`; `summary.json` is near-sun.json without its rows.

448 passages of Mercury to Pluto closer than 0.3° to the Sun from
1800-01-01 to 2199-12-31 (393 behind the disc), 15 instants each: 3,490
inside the disc, 66 within 3″ of the limb, 3,164 outside. Largest difference
from Horizons as the planet's offset from the Sun:

| | inside | limb | outside |
| --- | ---: | ---: | ---: |
| calc() on this build | 0.002239″ | 0.000498″ | 0.004613″ |
| de440.bsp, no deflection behind the disc | 0.002239″ | 0.000496″ | 0.004605″ |
| de440.bsp, limiter 1e-14 (rc.11's formula) | 333.476″ | 1.699″ | 0.004605″ |
| de440.bsp, erfa.ldsun's limiter | 5.761″ | 1.699″ | 0.004605″ |
| de440.bsp, no deflection | 0.002239″ | 1.694″ | 1.693″ |

calc() against the first `de440.bsp` reduction, same rule: 0.003715″ at
most over all 6,720 instants. In Horizons's RA and Dec of date (its IAU
1976/1980 frame) calc() is within 0.520576″, the frames' difference.
`results/limb.txt`: Horizons's edge lies 0.063″ to 0.167″ inside the
engine's at five limb crossings. `results/fixture.json`: 168 rows of the
three passages of each planet nearest the centre, held by
`src/de440-behind-sun.test.ts` to 0.0047″.

## Nothing else moved (`results/unchanged.json`, `tools/unchanged.mjs`)

`positions()` of this build against the carried 1.1.0-rc.11 archive at
20,000 pseudo-random UTC instants (1800-01-02 to 2199-12-30) and the 6,720
near-Sun instants: 317,057 of 320,640 rows identical to the bit; the other
3,583 are all a planet behind the disc (largest change 48.78″ in
longitude); none elsewhere.

## The dense sweep on the pack (`sweep-pack/`)

`tools/run-sweep.sh de440` with the sweep's tools as committed here,
kernel `a4ce9bf9…c4b5`, 146,097 instants, eight frames. `check.log` is
`check_pack.py`'s output: every body within its bound in
`src/calc-bounds-de440.ts`; largest angle the Moon 0.004422″, the others
0.003898″ (Saturn) to 0.003948″ (Mars), near the Sun too (rc.11's run:
17.308″). Largest rate differences, apparent: the Moon 0.426″ a day, the
others 0.00170″ to 0.0384″ a day (before a speed's samples took the
instant's side of the disc, Uranus was 831″ a day at a noon sample within
0.001 day of a limb crossing). The sweep's own build digest (`summary.json`,
`build.distSha256`, which hashes every file of `dist/`) is `a8eac44d…d673`.
Six of the eight eras were run a second time after the disk filled during
the first run; the eras are independent and the merge read all eight.

## The window search (`window/`)

`../birth-window/rate-bounds.mjs` on this build: bound over largest rate
plus what the grid can miss, 1.634 (Uranus) to 2.057 (the Sun); rc.10's
0.395 (Neptune) is gone. `windows-1000-de440.summary.json` and
`.results.jsonl` (`../birth-window/run.mjs` on the 1,000 preregistered
windows, two workers, 24.8 minutes): PASS, 1,000 of 1,000; 12,259,372
whole-second samples with no disagreement; 24,188 sampled transitions, all
matched, none missed, none extra; 20,026 switches with 24,217 changes;
1,441,872 millisecond checks, none failed; no window flagged
`bound-exceeded`. Run after the cut, so the README and CHANGELOG do not cite
it; the same figures as rc.10's run on its own search.

## Every export (`probe/`)

The rc.11 review's probe (`../1.1.0-rc.11-20261115/breaker/tools/probe-all.sh`,
77 calls on every entry point, the pack whole at 1991, 1750, 2230, 1785 and
2195, damaged 13 ways, and after the caller's choice) on an installed
packing of this build: with the pack damaged, 38 results flag and name
astronomy-engine, 14 flag; the results that change and say nothing are the
documented bare forms (`findLongitudeCrossings`, `bodyLongitude`,
`longitudeSpeed`, `solarReturnInstant`, `mostRecentSolarReturnInstant`,
`lunarReturnInstant`), `defaultEphemeris()` (which reports `opened: false`)
and two that echo a supplied input that moved (`compositeMidpoints`,
`vimshottariAt`). The 163 function exports the probe does not call take no
instant and no birth (houses, aspects, dignities, lots, dashas from a
supplied longitude, codecs, time and zone functions, the pack's openers).
`chartPoints(birth)` and `chartDeclinations(birth)` now flag and name, 13 of
13. At 1785 (birth outside, later date inside) `solarReturn` and
`lunarReturn` carry `"outside-de440-span"` and their return chart, inside
the pack, names `jpl-de440`; the result itself names no ephemeris.

## The archive

`artifacts/zodiacs-engine-1.1.0-rc.12.tgz`: SHA-256
`4577e2ff924ab1a5f5f6ffc52f7ce595c0e08e4f2cd6cd58d64f7e7bdf020297`,
2,723,759 bytes, 98 files, 4,572,747 bytes unpacked (the pack 3,319,552,
unchanged; the rest 1,253,195), source commit `d35343a`. Clean clones of
`d35343a` packed on Node 22.22.2, 20.19.0 and 24.21.0 give these bytes, and
their `dist/` has the digest above.

## The 240 L1 vectors on the installed package (`results/l1-installed.log`)

`tools/l1-installed.sh` on the carried archive, Node 22.22.2, no `ZODIACS_*`:
plain `natalChart()` 240 of 240 within 1″ of the vectors, worst 0.0126″ in
longitude (L1-POS-0002, the Moon), 0.0010″ in latitude (L1-POS-0222);
`calc()` 240 of 240 (0.0128″) and within its own bound 240 of 240;
`birthWindow` signs 240 of 240; after `setDefaultEphemeris("astronomy-engine")`
48 of 240 (worst angle 19.0384″).

## The 2026 Sagittarius ingress

`src/de440-ingress.test.ts`: a bisection of `positions()`,
`findLongitudeCrossings`, `searchLongitudeCrossings`,
`solarReturnInstantDetailed` and calc's `events()` each give
2026-11-22T07:23:21 UTC within 1 s, on the pack; the rc.11 review's kernel
reference is 07:23:20.563.

## Gates (`results/`)

`tools/gates.sh` on `4436223`, clean tree: 18 of 18 exit 0
(`gates-4436223-v22.22.2.log`): typecheck; suite 4,309 passed, 3 skipped;
build; exports smoke; API check; package contents (rest 1,253,195 of
1,265,000; root 150,170 of 151,700); pack dry run; pack generator check;
archive binding; conformance selftest, validate 500, the plain run (459
pass, 0 fail, 41 unsupported; L1 240 of 240) and the astronomy-engine run
(267, 192, 41), report check; atlas check and selftest; Offline CLI
consumer (29 checks). `--rebuild-all`: 27 recorded archives (23 carried, 4
superseded) rebuild to their bytes, rc.11 and rc.12 among them. Packed
consumer on the carried archive: exit 0 on Node 22.22.2, 20.19.0 and
24.21.0. Conformance results are byte-identical to rc.11's. Not run: Node
22.7.0 (not on the machine), and the DE440 sweep workflow's CI run, which
this candidate's head triggers.

## For the owner

- Horizons's rule behind the disc, not ERFA's `eraLdsun` as the brief
  named: `eraLdsun` is 5.761″ from Horizons inside the disc.
- The research runtime (zodiacs.org check C9) differs from this reduction
  for a planet behind the disc and in a speed within 0.001 day of a limb
  crossing; elsewhere they agree as before.
- Budgets raised without approval (`scripts/verify-package-contents.mjs`).


