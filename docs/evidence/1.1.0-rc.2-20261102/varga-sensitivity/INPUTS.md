# P2.B.vargas inputs, fixed in commit I

The inputs F1 to F4 of `PREREGISTRATION.md` beside this file (its section 6)
and the evaluation budget that section leaves to this file, for
`@zodiacs/engine` 1.1.0-rc.2.

- **Status.** Written on 2026-11-02 (ICT) for commit I of the cut, the commit
  after commit P (`beb7b72a9f67e9e6c685c30c81145056b5d129ad`), before any of
  the unit's code exists. Nothing of the unit has run: no `vargaSensitivity`,
  no `run.mjs`, no checker, no arbiter. After this commit these files and
  values are never edited in place. A change to one is an amendment appended
  to the preregistration's section 13 before the formal run it affects, or,
  once a formal run has been seen, a new version (its section 10).
- **Where.** In the isolated clone `engine-rc2`, branch `rc2/main-first`, at
  commit P, whose packed sources are engine main a253973's; never in a plain
  clone. Node 22.22.2 and Python 3.9.6, darwin arm64.
- **Looked at.** Of F2 and F4, only the marginal counts in sections 3 and 4.
  Of F3, every case, since its construction is checked case by case.
- **Synthetic.** Every birth is drawn by a seeded generator and every seam
  case is constructed; no one's birth data is used.
- **Scope limitation, declared.** The owner's rule for the engine repository:
  never open, read, run, import, grep, search or inspect
  `docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py`; explicitly
  exclude `docs/evidence/calc-sidereal-2026-10-05/` from every recursive scan,
  copy or archive; never pass a revision to `git grep`; add
  `-- . ':(exclude)docs/evidence/calc-sidereal-2026-10-05'` to any git command
  that walks a tree. This commit was made in `engine-rc2`, whose sparse
  checkout leaves that folder off the disk. Every git command that walks a
  tree carried the exclusion pathspec; no `git grep`, `log -p` or `archive`
  ran; directories were listed by name, never the repository root
  recursively; no file inside the folder was opened or read. The generators
  read only named files: `boundary_fixtures.py` (imported by F1's generator),
  F1's output and the build's `dist/` (read by F3's generator). The carried
  1.1.0-rc.1 archive was unpacked into a scratch folder outside the
  repository. The private birth-data search did not run, since the owner has
  not answered OQ14 (the preregistration's scope limitation and section 10,
  step 7).

## 1. The files and their SHA-256

Paths are relative to this folder, except F1's, which is relative to the
repository root (`src/` is not packed).

| input | file | bytes | SHA-256 |
| --- | --- | ---: | --- |
| F1's generator | `tools/varga_changes.py` | 4,425 | `c5fa637151d8407466ead69dad053eb39c04dcff863061ff508ff74501f2ef46` |
| F1 | `src/vedic/fixtures/varga-changes.json` | 57,044 | `2207fbea5b7e02a14f387ab77e76dea4006088ba7baf27c52d29ee8312f82750` |
| F2's and F4's generator | `tools/generate.mjs` | 7,427 | `349c69805fa8d823078d6cd44efbd85a6bd46b825a1ee57babf3ccf626bcbcfd` |
| F2 | `births.json` | 256,109 | `e333a037563d94f1e5b9ed42269166a4024808284b510b7ce199ab6817aff5c7` |
| F4 | `births-erfa.json` | 148,769 | `5c6ddf9d0a3f2325923538b8965bd3acc2a3b4975a96ce502b60c7b488cab6d9` |
| F3's generator | `tools/seams.mjs` | 19,109 | `2c146c35389454182078d6cff8d7081ee4beec2e1b8c9fe6464ccdc88bbb7dac` |
| F3 | `seams.json` | 25,215 | `956a3ad8a9e3d29249b16c55a3f25372e6e42850510e9d31555e86bccb648d70` |

**Unchanged.** `src/vedic/fixtures/boundaries.json` still hashes to its
recorded SHA-256,
`3578be675ddb51bb80ab543431d654c9a6e7bcab4d70d9abcae381ea29dcd51f`
(`docs/evidence/vedic-2026-09-28/README.md:581-583`), and
`docs/evidence/vedic-2026-09-28/tools/boundary_fixtures.py --output`, run to a
scratch path outside the repository, wrote identical bytes.

Each generator, run twice, wrote the same bytes.

## 2. F1, the change fixture

`python3 -I -B tools/varga_changes.py` writes the fixture; with `--check` it
compares its bytes with the file instead, and exits 1 if they differ. It
imports `varga_sign` and `boundary_ticks` (lines 144 to 179 at a253973) and
their tables from `docs/evidence/vedic-2026-09-28/tools/boundary_fixtures.py`,
and nothing from the engine; it writes no bytecode beside that file. For each
of the 18 keys and each part boundary `T` it writes `[T, the sign index at
the exact rational (T - 1) / 7560, the sign index at T / 7560, 1 if they
differ, else 0]`. For `T = 0` the tick below is taken round the circle,
2,721,599 / 7560, just under 360 degrees.

| key | part boundaries | changes | keeps |
| --- | ---: | ---: | ---: |
| D1 | 12 | 12 | 0 |
| D2 | 24 | 12 | 12 |
| D3 | 36 | 36 | 0 |
| D4 | 48 | 48 | 0 |
| D7 | 84 | 84 | 0 |
| D9 | 108 | 108 | 0 |
| D10 | 120 | 114 | 6 |
| D12 | 144 | 144 | 0 |
| D16 | 192 | 192 | 0 |
| D20 | 240 | 240 | 0 |
| D24 | 288 | 282 | 6 |
| D27 | 324 | 324 | 0 |
| D30 | 60 | 60 | 0 |
| D40 | 480 | 480 | 0 |
| D45 | 540 | 540 | 0 |
| D60 | 720 | 720 | 0 |
| D2, cyclic | 24 | 24 | 0 |
| D3, cyclic | 36 | 36 | 0 |
| **all 18** | **3,480** | **3,456** | **24** |

These are the scoping's counts, and the keeps lie where the preregistration
says: the D2 at all 12 sign starts, and the D10 and the D24 at 30, 90, 150,
210, 270 and 330 degrees. No other count needs explaining.

`--check` on the fixture printed `identical` and exited 0. Its control, a
copy with D60's first change row turned into a keep, printed `DIFFERENT` and
exited 1.

## 3. F2, the G-V3 corpus

`node tools/generate.mjs` writes `births.json`: mulberry32, seed 20261102,
1,000 births. Every birth takes 14 draws, all of them whatever its branches,
in this order: `instantHigh`, `instantLow`, `latitudeBand`, `latitude`,
`hemisphere`, `longitude`, `clock`, `pinnedScale`, `deltaT`, `ayanamsa`,
`ayanamsaValue`, `ayanamsaEpoch`, `ayanamsaRate`, `outerPlanets`. Each draw
is uniform in [0, 1) and is named below by its name.

- **Instant**, uniform to the millisecond from 1800-01-02T01:00:00.000Z to
  2199-12-30T23:00:00.000Z inclusive: the first plus
  `floor((instantHigh + instantLow / 2^32) × N)` ms, N the span's number of
  milliseconds. Two draws, because one 32-bit draw puts instants on a grid of
  about 2.9 s over 400 years.
- **Latitude**: `|φ| = 60 latitude` when `latitudeBand < 0.7`, else
  `60 + 6 latitude`; rounded to 1e-6 degree; south when `hemisphere < 0.5`.
- **Longitude**: `-180 + 360 longitude`, rounded to 1e-6 degree (a value that
  rounds to 180 would be written -180).
- **Clock**: UTC when `clock < 0.8`, UT1 below 0.9, TT below 0.95, otherwise a
  pinned ΔT of `floor(120,001 deltaT) / 1,000` s (0 to 120 s to the
  millisecond) on the scale `["utc", "ut1", "tt"][floor(3 pinnedScale)]`.
- **Ayanamsa**: lahiri when `ayanamsa < 0.4`, krishnamurti below 0.8,
  true-chitra below 0.9, a caller's epoch definition below 0.95, otherwise a
  caller's linear one. Both are written as `userAyanamsa` inputs, unrounded:
  names `user-epoch` and `user-linear`; `epoch: { julianDateTT }` with
  `julianDateTT = 2,415,020.5 + 73,049 ayanamsaEpoch`, over 1900-01-01T00:00
  to 2100-01-01T00:00 TT; `value = 22 + 3 ayanamsaValue` degrees; the epoch
  one with `model: "engine"`, the linear one with
  `rate = -3,600 + 7,200 ayanamsaRate` arcseconds a Julian year.
- **Points**: the Ascendant, the Sun to Saturn and the two mean nodes, with
  Uranus, Neptune and Pluto added when `outerPlanets < 0.1`, in row order.
- **Shared by every birth** (the file's `input` and `options`): house system
  whole; all sixteen vargas with `cyclic: true`; horizon 1,440 minutes.

Marginal counts, the only part of F2 looked at:

- clock: UTC 791, UT1 105, TT 43; a pinned ΔT 61 (on UTC 14, UT1 23, TT 24);
- ayanamsa: lahiri 416, krishnamurti 405, true-chitra 87, a caller's epoch
  definition 47, a caller's linear definition 45;
- latitude: 701 within 60 degrees, 299 from 60 to 66; south 524, north 476;
- century of the instant: 1800s 244, 1900s 255, 2000s 254, 2100s 247;
- Uranus, Neptune and Pluto asked for: 103 births.

## 4. F4, the G-V4 corpus

`node tools/generate.mjs --g-v4` writes `births-erfa.json`: mulberry32, seed
20261103, 1,000 births, 8 draws each, in this order: `instantHigh`,
`instantLow`, `latitudeBand`, `latitude`, `hemisphere`, `longitude`,
`deltaT`, `ayanamsa`. Instants, latitudes and longitudes as F2's; every birth
on `timeScale: "ut1"` with a pinned ΔT drawn as F2's; lahiri when
`ayanamsa < 0.5`, else krishnamurti. Shared: house system whole, the
Ascendant only, all sixteen vargas with `cyclic: true` (18 keys), horizon
1,440 minutes.

Marginal counts, the only part of F4 looked at: lahiri 505, krishnamurti 495;
695 within 60 degrees, 305 from 60 to 66; south 496, north 504; 1800s 239,
1900s 234, 2000s 274, 2100s 253.

## 5. F3, the planted seam cases

`npm run build` at commit P on Node 22.22.2, run alone with the clone's
installed `node_modules` (nothing was installed), then
`node tools/seams.mjs` writes `seams.json`. The build's 71 packed files of
`dist/` (48 JavaScript files and 23 declaration files) are byte-identical to
those of the carried archive `artifacts/zodiacs-engine-1.1.0-rc.1.tgz`, whose
SHA-256 `52352d3f8fde4a262483e4a5a6217e02d814aa53269b49c0333325e6c0d6a7b6`
matches its receipt. `seams.json` records the build's version (1.1.0-rc.1,
commit P changes no version), a digest of its 48 JavaScript files
(`43aaeb12c7ad40ad432745efc8756623f1ffbd6545e5e002fb4ef47ad950bb5c`), Node
and the platform.

**How a case is made** (the generator's header says it in full). The
generator uses the public entry points only. On the case's clock it walks
3 s either side of the seam's nominal instant one millisecond at a time and
reads each record of the vedic entry's `ayanamsa` (`timeScale`, `deltaT`),
from which it forms UT1 and TT by the operations of `src/time-scale.ts`. The
seam's first millisecond is the one millisecond over which UT1 or TT advances
by more than 0.01 ms more or less than 1 ms; that advance less 1 ms is the
case's step on each scale. Then:

- where UT1 steps, the Ascendant (lahiri) is planted by the place's
  longitude; where only TT steps, the Moon is planted by the value of a
  caller's epoch ayanamsa (epoch JD 2451545.0 TT, model `engine`, named
  `seam-<year>-<clock>`);
- the boundary is a D60 change boundary that is a part boundary of no other
  key in F1, so that no other row changes there;
- a forward step gets the boundary in the middle of the longitudes the step
  adds, so the change falls on the seam's first millisecond; the birth is
  put after the seam and the change is the row's `previous`;
- a backward step gets a crossing `k = round(|step| / 2)` ms before the seam,
  the boundary midway between the longitudes at that millisecond and the one
  before, which the step then undoes; the birth is put before the crossing
  and the change is the row's `next`;
- the longitude is rounded to 1e-9 degree and the ayanamsa value to 1e-12
  degree, and everything is then checked through the public API with lone
  calls: the D60 sign either side of the change, the longitudes either side
  of the boundary, for a backward step the planted sign at the seam's last
  millisecond and its undoing at the first, and the birth sign at the birth
  and every 1 s (Ascendant) or 10 s (Moon) up to the change.

Each case's call is its birth (latitude 30 degrees; a pinned ΔT of 60 s on the
pinned clock; whole signs), its ayanamsa and the options: its planted point,
all sixteen vargas with `cyclic: true` (18 keys), horizon 1,440 minutes. The
birth lies 30 s (Ascendant) or 10 minutes (Moon) from the change.

| id | seam | clock | first millisecond, on the clock | UT1 step, ms | TT step, ms | planted | expected D60 change |
| ---: | --- | --- | --- | ---: | ---: | --- | --- |
| 0 | leap second before 2017-01-01 | UTC | 2017-01-01T00:00:00.000 | 1,000 | 1,000 | Ascendant | previous at the seam, pisces to aries, 165.5 |
| 1 | leap second before 2017-01-01 | UTC, ΔT 60 s | 2017-01-01T00:00:00.000 | 1,000 | 1,000 | Ascendant | previous at the seam, pisces to aries, 165.5 |
| 2 | 1972-01-01 | UTC | 1972-01-01T00:00:00.000 | -45 | -44.549 | Ascendant | next at 23 ms before the seam, capricorn to aquarius, 164.5 |
| 3 | 1972-01-01 | UTC, ΔT 60 s | 1972-01-01T00:00:00.000 | -45 | -45 | Ascendant | next at 23 ms before the seam, capricorn to aquarius, 164.5 |
| 4 | 1972-01-01 | UT1 | 1972-01-01T00:00:00.000 | 0 | 0.451 | Moon | previous at the seam, gemini to cancer, 78.5 |
| 5 | 1972-01-01 | TT | 1972-01-01T00:00:42.229 | -0.451 | 0 | Ascendant | none: not planted (below) |
| 6 | end of the IERS UT1 table | UTC | 2027-10-02T00:00:00.001 | 148 | 146 | Ascendant | previous at the seam, libra to scorpio, 86.5 |
| 7 | end of the IERS UT1 table | UTC, ΔT 60 s | 2027-10-02T00:00:00.001 | 148 | 148 | Ascendant | previous at the seam, libra to scorpio, 86.5 |
| 8 | end of the IERS UT1 table | UT1 | 2027-10-02T00:00:00.001 | 0 | -2 | Moon | next at 1 ms before the seam, aries to taurus, 189.5 |
| 9 | end of the IERS UT1 table | TT | 2027-10-02T00:01:09.331 | 2 | 0 | Ascendant | previous at the seam, libra to scorpio, 86.5 |
| 10 | ΔT model's handover | UTC | 1940-12-31T18:00:00.000 | 0 | -13.948 | Moon | next at 7 ms before the seam, libra to scorpio, 293 |
| 11 | ΔT model's handover | UT1 | 1940-12-31T18:00:00.000 | 0 | -13.948 | Moon | next at 7 ms before the seam, libra to scorpio, 293 |
| 12 | ΔT model's handover | TT | 1940-12-31T18:00:24.820 | 13.948 | 0 | Ascendant | previous at the seam, pisces to aries, 89 |

Each seam steps on the clocks the preregistration's table names, with the
point it names: UT1 steps wherever the table plants the Ascendant, and only
TT where it plants the Moon (on UT1 input, and at the handover on UTC input
too). Twelve cases are planted and pass every check. The smallest margin is
case 4's: the boundary lies 3.6e-8 degree inside a forward TT step of 0.451
ms, where doubles near 78.5 degrees are 1.4e-14 degree apart.

**Case 5, not planted.** At 1972-01-01 on TT input UT1 steps back by 0.451
ms. A backward step is planted half a step before the seam and undone by it;
half of 0.451 ms is no millisecond before the seam, and a step under a
millisecond leaves the Ascendant still advancing from one millisecond to the
next, so no crossing on the millisecond lattice can be undone. It is the
degenerate plant of `DESIGN-vargas.md` section 9. The case is kept, not
dropped: it has a birth 30 s before the seam (longitude 0, lahiri), so that
M0 to M5 still run on it, and `expected: null`, so that M6 has nothing to
check there. The preregistration's 13 cases are therefore 12 planted cases
and this one.

**The empty cells.** The generator searched them too: the leap second on UT1
and on TT input, where TAI - UTC changes in the record (at
2017-01-01T00:00:00.591 UT1 and 2017-01-01T00:01:09.184 TT) and neither
scale steps; and the handover on the pinned UTC clock, where UT1 passes 1941.0
and nothing steps (`clocksWithoutStep`).

## 6. The evaluation budget

**The constant: 2,000,000 evaluations per call.** One budget covers the whole
request (preregistration, section 6). An evaluation is one computation of one
point's sidereal longitude at one millisecond on the chart's clock, by the
paths of `DESIGN-vargas.md` section 3.1 (the Ascendant, a body or a mean
node). A value already computed and kept in the same call is not counted
again.

**How it was derived.**

1. *What the design bounds, at the largest request the options allow*: 13
   points, 18 keys, 2,880 minutes either side (H = 172,800,000 ms each way),
   any latitude up to 66 degrees, a seam inside the span.
   - *Seams.* The provenance of the time basis changes in `REFERENCE_SPAN` at
     1941.0, 1956.0 (the ΔT model's segment), 1972-01-01, the 27 leap
     seconds from 1972-07-01 to 2017-01-01, the IERS join of observed and
     predicted UT1 on 2026-09-24 and the table's end on 2027-10-02; on UT1
     and TT input at the same dates, moved by under 70 s (and the
     leap-second list's expiry on 2027-06-28, if it counted, is 96 days from
     the nearest). The closest two, 1972-01-01 and 1972-07-01, are 182 days
     apart and a call searches at most 4 days, so a call meets at most one.
     The largest step is a leap second's 1 s (TAI - UTC changes by whole
     seconds, `src/time-scale.ts:112-119`; 1,000 ms in F3), so a seam's walk
     (the step and one second either side, at 1 ms) costs at most 3,001
     evaluations per point.
   - *The Ascendant* (design section 3.4): brackets of at most 330 degrees
     over `R_hi` (the preregistration's section 7, with `a` = 0.0030379
     degree a day, 0.0003 plus a caller's linear rate of 3,600 arcseconds a
     Julian year). `R_hi` is largest at 66 degrees, 16,993.497 degrees a
     day, so a bracket lasts at least 1,677,818 ms and a side needs at most
     103 brackets, one more where the seam splits one: 2 × 104 = 208
     evaluations. A bracket lasts at most 71,715,148 ms (at 0 degrees,
     `R_hi` 397.573), so a bisection takes at most 27 halvings (log2 26.10),
     for each key on each side: 18 × 2 × 27 = 972. With the birth instant and
     the seam's walk, 1 + 208 + 972 + 3,001 = 4,182.
   - *Each mean node* (design section 3.5): one bracket a side, two where the
     seam splits it (4 evaluations); a bisection of a whole side takes at
     most 28 halvings (log2 27.36): 18 × 2 × 28 = 1,008. With the birth and
     the walk, 4,014; for the two, 8,028.
   - *Each of the 10 bodies* (design section 3.6): the birth and the walk,
     3,002; their rate-bounded steps are not bounded by the design.
   - In all, **42,230** evaluations.
2. *The constant.* 2,000,000 is the window entry's `MAX_EVALUATIONS`
   (`src/window.ts:104`), the engine's one stated search budget, which the
   design names as the model for this one (section 3.7). It is more than 47
   times the 42,230 the design bounds and leaves 1,957,770 for the bodies'
   steps.
3. *What the bodies' steps would need to spend it.* From a millisecond at
   distance `d` (degrees) from the nearest end of an open key's birth run, a
   body's next bracket is `floor(d / B)` ms long, at least 1, `B` being its
   bound per millisecond (`WINDOW_RATE_BOUNDS` plus `a`). So it spends about
   `B / d(t)` evaluations per millisecond, `∫ B / d(t) dt` over the span;
   an approach to a run end at speed `r` costs about
   `(B / r) × ln(d0 / (B × 1 ms))`. To spend the 1,957,770 over the 2,880
   minutes a default call searches, a body's distance to a run end would
   have to stay below `172,800,000 × B / 1,957,770` the whole time (each
   figure rounded up): 3.17e-5 degree for the Moon, 4.61e-6 for Mercury,
   2.15e-6 for the Sun, 2.66e-6 for Venus, 1.64e-6 for Mars, 5.04e-7 for
   Jupiter, 2.79e-7 for Saturn, 1.36e-7 for Uranus, 8.18e-8 for Neptune and
   8.69e-8 for Pluto. That no body lingers so close to a run end for so long
   is a premise, like the scanned bounds themselves, not a derived fact;
   G-V3 reports the evaluations per call and per point.
4. *Its rules.* The constant is fixed here, before any of the unit's code
   exists and so before the code runs on F2, and the docs state it as
   `src/window.ts:104` states the window's. It is never chosen or changed
   after a G-V3 result has been seen. A row refused with `evaluation-budget`
   on F2 or F3 is a FAIL under M0 (preregistration, section 8).

## 7. Reproduction

In `engine-rc2` at commit P, or a sparse clone made as the preregistration's
scope limitation says, with every output path outside the repository:

```sh
python3 -I -B docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/varga_changes.py --check
python3 -I -B docs/evidence/vedic-2026-09-28/tools/boundary_fixtures.py --output FILE   # FILE equals src/vedic/fixtures/boundaries.json
node docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/generate.mjs --out FILE  # FILE equals births.json
node docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/generate.mjs --g-v4 --out FILE  # FILE equals births-erfa.json
npm ci && npm run build
node docs/evidence/1.1.0-rc.2-20261102/varga-sensitivity/tools/seams.mjs --out FILE     # FILE equals seams.json on Node 22.22.2, darwin arm64
```

`seams.json` names the Node version and the platform, so on another machine
those two fields differ even where every case is the same.

## 8. Readings and departures

- **"(T - 1) / 7560" for T = 0** is read round the circle (section 2).
- **F2's instant** takes two draws, so that it is uniform to the millisecond
  as section 6 says; one draw would not be.
- **F2's caller's definitions** give their epoch as a TT Julian date, and the
  drawn value, epoch and rate are not rounded; section 6 rounds only
  latitude, longitude and the pinned ΔT.
- **F3** fixes what section 6 leaves to the generator: the latitude, the
  ayanamsas, the pinned ΔT, the boundary, the birth's distance and side, and
  the call's keys and horizon (section 5). Its case 5 is not planted, and is
  kept as section 6 asks of a case whose construction fails.
- **The evaluation budget** is the window entry's figure, adopted with the
  derivation above, as K18 of the cut's plan asks.
- **The private birth-data search with `--staged`**, which the cut's plan
  lists among commit I's checks, did not run: the preregistration runs it on
  the engine only once the owner has answered OQ14. The preregistration wins.
