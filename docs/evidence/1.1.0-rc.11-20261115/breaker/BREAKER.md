# Breaker review of 1.1.0-rc.11 (draft pull request 101)

Written 2026-11-15 (ICT) by a review session that did not build the
candidate. Head reviewed: `7fd719b56a61ecdfa3c36e65583307c7173b289d`, equal
to the pushed head of the pull request's branch after `git fetch`. Every
number below was measured by the tools in `tools/` and is in `results/`.
Unless a line says otherwise the engine is the carried archive
`artifacts/zodiacs-engine-1.1.0-rc.11.tgz` (SHA-256 `d84f3302…5e56`,
2,720,663 bytes), installed with `npm install` into an empty directory, on
Node 22.22.2, with no `ZODIACS_*` variable set.

Independent instruments: NAIF's `de440.bsp` (SHA-256 `a4ce9bf9…c4b5`) read
with jplephem 2.24 and reduced with pyerfa 2.0.1.5 by code written for this
review (`tools/calc_check.py`, not the sweep's), and JPL Horizons (its API,
responses saved in `results/horizons/`).

## Verdict: BLOCKER (two)

### B1. The root's `chartPoints(birth)` and `chartDeclinations(birth)` fall back silently

Both take a `NatalSource`. Given a birth (not a chart) they compute the chart
themselves, so they read positions, and their results carry no `ephemeris`
and no `flags` (`chartPoints`: `sect`, `points`; `chartDeclinations`:
`trueObliquity`, `rows`, `aspects`, `orbPolicy`, `convention`,
`receiptScope`, `utc`, `deltaT`).

- Pack damaged (each of 13 kinds, `tools/damage.mjs`): both results move to
  astronomy-engine's values, equal to the result after
  `setDefaultEphemeris("astronomy-engine")`, and say nothing. For the
  synthetic birth 1991-06-21T14:45Z, 40.4° N, 3.7° W
  (`results/root-silent-*.log`): the Sun's longitude in `chartDeclinations`
  goes from 89.73910891638322° to 89.73915099673542° (0.15″), its
  declination by 0.11″; in `chartPoints` the Lot of Fortune moves 0.057″ and
  the Lot of Eros 2.43″. `natalChart()` of the same birth carries
  `"de440-unavailable"` and names astronomy-engine.
- Outside the pack (1750 and 2230, pack whole): the same, no
  `"outside-de440-span"`, where `natalChart()` carries it.

This is the class the rc.10 review blocked on (`chartAspectPatterns(birth)`
and `compositeChart(birth, birth)` were two of its ten). The rc.10 probe
passed these two functions a chart, which is why it listed them as derived
from a supplied chart. README ("No fallback is silent ... the result says
so"), `docs/de440.md` ("every result is astronomy-engine's and says so";
"every result names its ephemeris") and AGENTS.md's rule do not name them as
an exception, and no test covers them. To close: `ephemeris` and `flags` on
the two results as on `chartAspectPatterns`, or a documented exception if the
owner accepts one. README is packed, so either is a new candidate.

Everything else the hunt found is listed under item 2.

### B2. Behind the Sun's disc the default path is up to 308″ from JPL Horizons, and nothing gates it

The builder's diagnosis of the failed sweep is right, and the builder reported
the open question (the handoff's "Open for Dias 1"). What this review adds
is its size against the repository's own arbiter and how often it happens.

The pack's reduction bends light by the Sun with a limiter of 1e-14
(`src/de440/reduce.ts`), so the deflection grows as the inverse of the angle
from the Sun's centre, without limit, for a body behind the disc. ERFA's
`eraLdsun` tapers it to zero inside about 0.081°. Horizons does not show it
inside the disc at all (below).

1. **Against Horizons** (apparent RA and Dec, quantity 2, geocentric;
   `calc()` in `equatorial-true-of-date`; `results/horizons-near-sun.json`):

   | body | instant (TT) | Sun to body, Horizons | pack from Horizons | bound `calc()` quotes | astronomy-engine from Horizons |
   | --- | --- | ---: | ---: | ---: | ---: |
   | Mercury | 1954-05-08 23:03:18 | 0.0004° | 307.906″ | 0.0037″ | 0.735″ |
   | Uranus | 2029-06-04 16:24:32 | 0.0022° | 195.452″ | 0.0038″ | 9.048″ |
   | Neptune | 1839-01-30 14:46:58 | 0.0030° | 154.826″ | 0.0035″ | 18.297″ |
   | Jupiter | 2032-01-01 07:42:03 | 0.0071° | 56.254″ | 0.0038″ | 6.908″ |

   In the true ecliptic of date, where the pack's bound is labelled
   `measured`, the same (Mercury 307.934″ from Horizons's quantity 31).
   At these instants the fallback is closer to Horizons than the default.
2. **For how long** (`results/horizons-span.json`, every 15 minutes for 12
   hours each side): Jupiter on 2032-01-01 is more than 1″ from Horizons for
   16.75 hours, more than 5″ for 4.75 hours, more than 30″ for 45 minutes;
   Uranus on 2029-06-04 14.25 hours, 4.75 hours, 45 minutes; Mercury in 1954
   4.5 hours over 1″. Outside the disc (farther than 0.28°) the pack is
   within 0.09″ of Horizons's RA and Dec in all three series.
3. **How often** (`results/behind-sun-summary.json`): from 1800 to 2200, 391
   passages of a planet behind the disc (Mercury 113, Uranus 94, Jupiter 58,
   Neptune 41, Saturn 28, Venus 27, Mars 27, Pluto 3), 86 of them closer than
   0.06° to the centre. Sampled every 30 s for 20 minutes each side of the
   least separation of those 86, the pack's place is from `de440.bsp` without
   the deflection: Mercury 307.90″, Uranus 195.47″, Neptune 154.78″, Jupiter
   56.25″, Venus 35.20″, Saturn 28.90″, Mars 27.69″, Pluto 20.09″; its
   longitude rate is off by up to 117,631″ a day (Mercury; 32.7° a day).
   With the engine's own limiter in the reference the same rows agree
   within 0.017″, so the code does what `docs/de440.md` says it does.
4. **What the candidate says.** README and CHANGELOG give 33.37″ (Neptune,
   1920-08-03T23:48:31Z), measured against astronomy-engine at one instant,
   as an example of "moves more". That figure reproduces on the installed
   tarball (−33.369″ in longitude, 18.149″ in latitude, 0.0234° from the
   centre; `results/ingress-window-and-neptune.log`). It is not the largest,
   and the text presents it as the difference of two ephemerides, where it is
   a difference from Horizons that the fallback does not have. `calc()`
   quotes 0.0034″ to 0.0038″ for these places.
5. **The gate.** The failed check was the only dense measurement of the
   default path. The fix points the workflow at astronomy-engine
   (`--ephemeris astronomy-engine`), and the table's tools now refuse a pack
   run. The pack run is committed as evidence (`../sweep-pack/`) and shows
   17.308″ and 624.5″ a day against the corrected arbiter at noon samples,
   but no check holds it. The cause was found; it was not fixed in the
   engine.

Why it blocks: the candidate's claim is DE440 accuracy against Horizons, the
dense check that found the disagreement was moved off the default path, and
the engine still quotes a bound five orders of magnitude smaller than the
disagreement at those instants. It needs the owner's decision: cut or taper
the deflection inside the disc, or keep the formula and say so where a
caller reads it (a flag or a wider bound within the disc, and README's
figure against Horizons). Either changes packed files. For the choice
(`results/horizons-ref.json`, this review's reduction of `de440.bsp` against
Horizons at the four instants): with no deflection it is within 0.030″ to
0.417″ of Horizons, with `eraLdsun`'s limiter within 0.145″ to 0.612″, with
the engine's limiter 56.254″ to 307.901″. (Horizons's RA and Dec of date
are on its own precession and nutation, so a few tenths of an arcsecond in
1839 are its frame, not the place.)

## Should-fix

- S1. `docs/calc.md` still says of `apparent` "No gravitational
  deflection", "there is never deflection here" and lists `SEFLG_NOGDEFL` as
  "always so", and a pack receipt echoes `flags.deflection: false` beside
  the convention `deflection:sun`. On the pack the default `calc()` applies
  the deflection.
- S2. The sweep evidence in `../sweep/` was measured on 1.1.0-rc.10's build
  (`summary.json`: version 1.1.0-rc.10, dist `4520dc7a…`), as the CHANGELOG
  says. This review's rerun on the rc.11 tarball gives the same bytes
  (item 1), so the figures stand; the folder should say which build.
- S3. `docs/de440.md`: "every result names its ephemeris". The timing and
  vedic results, `moonSignCandidates` and `searchLongitudeCrossings` carry
  the fallback flags and no ephemeris name; after the caller's own choice of
  astronomy-engine they say nothing (by design, but the sentence is wider).
- S4. `saturnReturn` for a birth inside the pack whose search runs past its
  end names `jpl-de440` and carries `"outside-de440-span"` together
  (2195 run in `results/probe-report.md`).
- S5. Size caps raised again without the owner's yes (`./techniques`
  199,900 to 203,800; total 1,225,000 to 1,245,000), as the builder says.
- S6. The Moon's rate on the pack is up to 0.32″ a day from the kernel's
  (item 1); `calc()` quotes no speed bound on the pack (`value: null`), so
  nothing is overstated, but there is no figure either.
- S7. `artifacts/README.md` changed the wording of 1.1.0-rc.10's row (its
  status). The archive, receipt and `archives.json` entry are untouched.

## The items of the brief

### 1. Sweep

- Root cause: correct. The rc.10 run measured the pack's apparent places
  against `src/calc-bounds.ts` (astronomy-engine's limits) and against an
  arbiter without the deflection the pack applies. Every over-limit row of
  `sweep-fail-rc10` is the deflection near the Sun.
- Fixed in the engine: no (B2). Fixed in the tools: yes, with a stated
  reason; `src/calc-bounds.ts` is byte for byte unchanged
  (`git diff d92a2134 -- src/calc-bounds.ts` is empty), no bound loosened.
- Own computation (`tools/calc-sample.mjs`, `tools/calc_check.py`,
  `results/calc-check.json`): 1,500 pseudo-random TT instants from 1800 to
  2200 (not noon), ten bodies, eight frames, 120,000 rows, all named
  `jpl-de440`, none flagged. Against `de440.bsp` with this review's
  reduction (ERFA IAU 2006/2000A frames, `eraLdsun`'s limiter):

  | frame | largest angle | largest longitude rate, Moon | largest longitude rate, others |
  | --- | ---: | ---: | ---: |
  | `ecliptic-true-of-date` | 0.0034″ (Jupiter) | 0.303″/day | 0.0032″/day or less |
  | `equatorial-true-of-date` | 0.0034″ (Jupiter) | 0.320″/day | 0.0032″/day or less |
  | the six other frames | 0.0015″ (Moon) | 0.303 to 0.322″/day | 0.0032″/day or less (Venus, `ecliptic-j2000`) |

  Largest latitude rate 0.101″/day (Moon), 0.0013″/day otherwise; distance
  within 7.6e-9 relative. No sampled instant was within 0.1° of the Sun
  (closest 0.122°, Mercury), so the two limiters give the same figures.
  Without the deflection in the reference the same rows are up to 1.38″
  and 3.6″/day off, which is the rc.10 failure in small.
- `calc()` rates against central differences of `calc()`'s own positions
  (step 0.01 day): within 0.051″/day (Moon), 0.0031″/day (Mercury) and
  less for the rest. `calc()` in its default frame against `positions()` at
  500 UTC instants: equal to the bit in 5,000 of 5,000 rows.
- Bounds regenerated: none were. The table is the committed one, and the
  rc.11 evidence shows astronomy-engine's values byte-identical to
  1.1.0-rc.3's in all eight eras on rc.10's build. On the installed rc.11
  tarball this review reran the sweep's engine side with
  `--ephemeris astronomy-engine` (`tools/sweep-values.sh`,
  `results/sweep-values.txt`): the values of all eight eras, 146,097
  instants, have the same SHA-256 as the committed sweep's
  (1.1.0-rc.3). So the table's measurement holds for this build's
  astronomy-engine results, and the rounding is the committed one.
- Docs: the figures of `docs/de440.md`, `docs/calc.md`, README and
  CHANGELOG that this candidate adds trace to `../sweep/`, `../sweep-pack/`,
  `../results/near-sun.json` and `../results/pack-near-sun.json`. Not backed
  by a gate: anything about the pack near the Sun (B2).

### 2. B1 of rc.10: closed for the twelve; not closed for the root (B1 above)

- `tools/b1.mjs`, 42 checks in each of 15 states (pack whole; 13 kinds of
  damage; after the caller's choice), at 1991, 1750 and 2230: 630 of 630
  pass. Pack whole inside its years: `jpl-de440` with the pack's digest, no
  fallback flag. Damaged: astronomy-engine and `"de440-unavailable"`.
  1750 and 2230: astronomy-engine and `"outside-de440-span"`. Caller's
  choice: astronomy-engine, no flag. Each `…Detailed` value equals the plain
  result. Each element of `moonIngresses`, `moonAspects` and
  `voidOfCourseWindows` (and a window's `lastAspect`) is labelled.
- At the ends of the pack (`tools/edges.mjs`, 806 rows around 1790-01-01
  and 2210-01-01): no result names `jpl-de440` without a flag while resting
  on an instant outside the pack; lists across an end label both sides.
- Signatures: `git diff d92a2134 -- api/` changes `api/techniques.api.md`
  only: 7 exports added, `chartAspectPatterns` now returns
  `ChartAspectPatterns` (extends `AspectPatterns`), two fields added to four
  interfaces. No other report changed; `npm run api:check` passes.
- Tests: `src/ephemeris-fallback-techniques.test.ts` (7 tests) holds the
  twelve whole, damaged, at 1750 and 2230, and after the caller's choice.
  They pass (suite 4,295 passed, 3 skipped).
- The hunt (`tools/probe.mjs`, 77 calls over every entry point;
  `results/probe-report.md`). With the pack damaged, results that moved and
  say nothing:

  | export | status |
  | --- | --- |
  | `chartPoints(birth)`, `chartDeclinations(birth)` (root) | **B1 above** |
  | `findLongitudeCrossings` (root) | documented; labelled form `searchLongitudeCrossings` |
  | `solarReturnInstant`, `mostRecentSolarReturnInstant`, `lunarReturnInstant` (techniques) | documented; `…Detailed` forms |
  | `bodyLongitude`, `longitudeSpeed` (`./internal`) | documented; `…Detailed` forms |
  | `defaultEphemeris()` | reports `opened: false` and the error |
  | `compositeMidpoints(lists)`, `vimshottariAt(longitude)` | moved only because the supplied input moved |

  `moonSignsBetween` did not move in the sample and has its detailed form.
  Unchanged by any damage and naming no ephemeris: the sky entry,
  `ayanamsa()`, `releasingAt`, `releasingPeriods` (astronomy-engine or none
  by design). 50 of the 77 calls carry `"de440-unavailable"`; 5 name
  astronomy-engine by design (calc's other centers and corrections, the mean
  node, `houses()`); no result names `jpl-de440` with the pack damaged.

### 3. Docs

README, CHANGELOG, `docs/de440.md` and `docs/techniques.md` name the same
forms for the techniques entry, and they are the forms the package has. The
29.19″ wording no longer reads as a cap. The Neptune figure is backed by
`../results/near-sun.json` and reproduces on the installed tarball; it is
not the largest (B2). "No fallback is silent" is not true of two root
functions (B1).

### 4. Candidate

`package.json` 1.1.0-rc.11. `git diff d92a2134 -- artifacts/`: adds the
archive, its receipt and one `archives.json` entry; changes
`artifacts/README.md` (new row, new paragraph, and the status text of
rc.10's row, S7). Every receipt in `artifacts/` verifies (`sha256sum -c`,
22 files). The tarball's SHA-256 equals its receipt and its entry.

### 5. NASA suite

Own runner (`tools/l1.mjs`), plain `natalChart()` with `timeScale: "tt"`:
**240 of 240 within 1″**. Worst longitude 0.0126″ (L1-POS-0002, Moon),
worst latitude 0.0010″ (L1-POS-0222, Moon), worst angle 0.0127″; the Sun and
planets within 0.0038″. All 240 name `jpl-de440`, none flagged.

### 6. Gates on `7fd719b`, Node 22.22.2, in a namespace without `/node_modules`

`../tools/gates.sh`: 18 of 18 exit 0 (`results/gates-7fd719b-v22.22.2.log`):
typecheck; suite 4,295 passed, 3 skipped; build; exports smoke; API check;
package contents (rest 1,238,281 of 1,245,000); pack dry run; pack generator
check; archive binding; conformance selftest, validate 500, plain run,
astronomy-engine run, report check; atlas check and selftest; Offline CLI
consumer (both steps, 29 checks). `--rebuild-all`: 26 archives rebuild to
their bytes, exit 0. Packed consumer on the carried tarball: exit 0 on Node
22.22.2, 20.19.0 and 24.21.0. Not run: Node 22.7.0.

### 7. The Sun's ingress into Sagittarius, 2026

Reference from `de440.bsp` by this review's reduction: 2026-11-22
**07:23:20.563 UTC** (TT − UTC 69.184 s), which is 07:23:21 to the second.
From the installed tarball, default path (`results/ingress.json`):

| function | UTC | names |
| --- | --- | --- |
| `positions()`, `natalChart()`, `calc()`, calc `chart()`, `bodyLongitude`, each bisected to 1 ms | 07:23:20.564 | `jpl-de440` |
| `findLongitudeCrossings` | 07:23:20.568 | (bare list) |
| `searchLongitudeCrossings` | 07:23:20.568 | flags `[]` |
| calc `events()` | 07:23:20.568 | `jpl-de440` |
| `solarReturnInstantDetailed(240, …)`, `mostRecentSolarReturnInstantDetailed` | 07:23:20.568 | `jpl-de440` |
| `solarReturn` of a chart with the Sun at 240° | 07:23:20.568 | `jpl-de440` |
| timing `planetaryReturns(…, "Sun", …)` | 07:23:20.568 | flags `[]` |
| `birthWindow` 07:00 to 08:00, the Sun's sign switch | 07:23:20.564 | `jpl-de440` |

Every default-path function gives 07:23:21 to the nearest second, within
5 ms of the kernel. None gives 07:23:38. After
`setDefaultEphemeris("astronomy-engine")` every one gives 07:23:38.235 to
.242 and names astronomy-engine. The sky entry has no ingress function. Only
`calc()` with another correction answers differently by design (astrometric
or geometric: 07:15:25, named astronomy-engine), which is not the apparent
ingress.

### 8. State

Pull request 101: open, draft. No tag with 1.1.0 on the remote; newest
release v0.1.1-rc.15; npm `latest` 1.0.0, `next` 0.1.1-rc.16. The four
commits since `d92a213` are by Zodiacs Admin <admin@zodiacs.org>, no
trailers, no model names; the branch's pushes are fast-forward
(`d92a213`, `38584f7`, `7fd719b`). No other branch moved after this one.

CI: not waited; the coordinator will check.
