# The full IAU 2000B nutation: evidence (2026-09-29)

**Branch and base.** `feature-nutation`, from `bcd532c` (the 0.1.1-rc.15
re-cut). The version is unchanged; `CHANGELOG.md` has an "Unreleased" entry
for the next candidate. Nothing was pushed or published.

**What changed.** astronomy-engine 2.1.19's nutation keeps 5 of the 77
luni-solar terms of IAU 2000B (finding production-positions-7 of the Zodiacs
site's engine audit of 2026-09-22). The engine now evaluates the whole series
itself and routes every use of astronomy-engine's nutation through it:

- `src/nutation.ts`: Δψ and Δε from the 77 terms of McCarthy & Luzum (2003)
  on their linear fundamental arguments, with the two fixed planetary offsets
  (−0.135 mas, +0.388 mas), transcribed from `iau2000b` in NOVAS C 3.1 (US
  Naval Observatory, a US Government work; `LICENSING.md`, `NOTICE`); the IAU
  2006 mean obliquity (the polynomial astronomy-engine uses); the true
  obliquity; and the equation of the equinoxes, Δψ cos εA plus the two
  largest IAU 2000 complementary terms.
- `src/frame.ts`: astronomy-engine's precession from J2000.0
  (`precession_rot`), reproduced line for line, and the rotation by εA to the
  mean ecliptic of date; a longitude of date is the mean-ecliptic longitude
  plus Δψ.
- `src/ephemeris.ts` and `src/vedic/ayanamsa.ts` use them for the planets
  (`GeoVector`), the Moon (`GeoMoon`, in place of `EclipticGeoMoon`), the true
  node (`GeoMoonState`), the sidereal time and true obliquity behind the angles
  and houses, the Vertex and East Point, declinations, the mean node and Black
  Moon Lilith, and every ayanamsa. No non-test code calls `e_tilt`,
  `Rotation_EQJ_ECT`, `EclipticGeoMoon` or `SiderealTime` any more.

**Commits.** `3673d20` adds the module and its tests; `f6c7147` routes the
engine through it, with the plumbing proof, the test changes and the
regenerated conformance results; `45bdd34` stores the coefficients as text and
sums the terms from products (smaller, faster, same values); the evidence and
documentation follow.

**Use of Swiss Ephemeris.** pyswisseph 2.10.03 was run as an instrument only.
Its values stayed in memory and in a scratch directory outside the checkout;
`results/` holds statistics only, and no constant, tolerance or expectation
was set from it.

**Birth data.** Every instant and place is synthetic (seeded generators),
apart from the site's rc.9 ladder, whose cases are synthetic too.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Transcription: every multiplier, coefficient, argument and offset against the text of NOVAS's `iau2000b` | equal | `src/nutation.test.ts`, `src/fixtures/novas-c3.1-iau2000b.txt` |
| Δψ, Δε against ERFA `nut00b`, 101 TT instants 1800–2200, tolerance 1e-10″ | largest 5.33e-15″ and 3.55e-15″ | `results/module-against-erfa.json` |
| The series against NOVAS's own loop on its own numbers, 4,001 instants, tolerance 1e-14″ | largest 5.33e-15″ | same |
| Mean obliquity against `obl06`, tolerance 1e-9″ | 2.91e-11″ | same |
| Equation of the equinoxes against `ee00` (obl06, nut00b), tolerance 5e-5″ | 1.50e-5″ | same |
| Sidereal time against gmst06 + ee00 (obl06, nut00b); against `gst06a`; against `gst00b` | 1.50e-5″ (tolerance 5e-5″); 0.00205″ (tolerance 0.00208″); 0.0210″ (no gate; gst00b uses the IAU 2000 GMST) | same |
| J2000 mean equator → true ecliptic of date against Rz(−Δψ) Rx(εA) P (bp06, obl06, nut00b), tolerance 5e-6″ | 7.11e-7″, the IAU 2006 precession's two formulations (P03 angles and bp06) | same |
| Plumbing: this source with astronomy-engine's five terms and no complementary terms against rc.15 as carried, 520 charts, gate 1e-9° | pass: largest 7.96e-13°, speeds 1.14e-10°/day, crossings 0 ms, flags and fallbacks identical | `results/plumbing.json` |
| Longitudes against ERFA's 2006/2000A rotation of the same vectors, 4,001 instants 1800–2200 | before 0.2520″ (p95 0.1486″); after 0.003691″ (p95 0.002011″) | `results/erfa-frame.json` |
| Ascendant and midheaven against ERFA (gst06a, obl06 + nut06a), latitudes within 60° | before 0.8235″ and 0.2457″; after 0.006284″ and 0.003358″ | same |
| The rc.9 house ladder end to end against Swiss, 1850–2049 | Koch before 3.727″ (1 of 353 over 3″), after 0.035″ (0 over 3″); every system after ≤ 0.035″ (ladder), ≤ 0.055″ (3,000 draws) | `results/ladder.json`, `results/worst-koch.json` |
| Conformance (500 vectors) | one verdict moves: `L1-POS-0041` fail → pass | `conformance/RESULTS.md` |
| `npm test` | 3,267 tests in 60 files pass | `logs/full-tests.log` |
| `npm run package:contents` | **fails**: four import graphs over their budgets (below); its other checks pass with the budgets waived | `logs/package-contents.log`, `logs/package-contents-budgets-waived.log`, `results/sizes.json` |
| The Zodiacs site's engine chunk (limit 27,648 gzip bytes; 27,303 on rc.14) | not built; a stand-in grows 1,080 bytes over rc.15, and 5,301 from rc.14 to rc.15 (below) | `results/sizes.json` |
| `node scripts/verify-archive-binding.mjs` | **fails**, as it must: HEAD no longer rebuilds the carried rc.15 archive | `logs/archive-binding.log` |

## The model and its check

The 77 terms were copied mechanically from the two tables of `iau2000b`
(`nals_t`, `cls_t`) into `src/nutation.ts`: the multipliers as digits (the
multiplier plus 2), the coefficients as one line of text per term. The
repository carries the function unchanged, lines 3019 to 3375 of
`Cdist/nutation.c` in the novas 3.1.1.5 package on PyPI
(`novas-3.1.1.5.tar.gz`, SHA-256
`6784780f03589996c2cd0e2b7e68afbec734d953010612ed0a45ace714761935`, the digest
PyPI lists; `nutation.c` SHA-256
`49d193c9e0d6dfb14650ed0b2603e3954ef02ab51f83d66869a769e892e471bb`; the excerpt
SHA-256 `95ba8b40a582a23b5916a5dbb7839650deb9a7f7d9743554cc222f813f56bde5`).
`src/nutation.test.ts` parses it and requires every number to be equal,
evaluates NOVAS's own loop on its numbers and requires the engine to agree
within 1e-14″, and checks the first five terms against astronomy-engine's
`e_tilt` (within 1e-12″). No ERFA, SOFA or Swiss Ephemeris code or table was
copied; ERFA (pyerfa) is the independent check.

`tools/erfa_fixtures.py` wrote `src/fixtures/nutation-erfa.json` from pyerfa
2.0.1.5 (ERFA 2.0.1) at 101 TT instants from 1800-01-01 to 2199-12-30, with
the tolerances and their reasons, before the engine was run against it. The
only measured quantities the tolerances use are differences between ERFA's
own functions, which the file records: the IAU 2006 precession built from the
P03 angles of `p06e`, as astronomy-engine builds it, is within 7.09e-7″ of
`bp06`'s matrix; gmst06 + ee00 (obl06, nut00b) is within 0.00203″ of
`gst06a`; the complementary terms beyond the two the engine keeps reach
1.5e-5″ there (at most 44.0 µas within two centuries, from IERS Conventions
2010 table 5.2e). `--check` rebuilds the file byte for byte.

The series is summed from the smallest term, as NOVAS sums it, but each
term's cos θ and sin θ come from the product of cos kf + i sin kf over its
five arguments: ten calls to `Math.sin` and `Math.cos` in place of 154. The
engine's tilt takes 2.0 µs rather than 3.8 µs, and the result stays within
5.33e-15″ of the direct loop (`results/module-against-erfa.json`).

## The plumbing proof

`tools/plumbing.mjs` bundles this `src/` twice with esbuild: once patched to
astronomy-engine's nutation (the call `nutation(t)` in `tilt` becomes
`nutation(t, 5)`, and the two complementary terms are removed; each patch must
match exactly once), and once as it ships. It unpacks
`artifacts/zodiacs-engine-0.1.1-rc.15.tgz` (checked against its receipt) and
runs the three engines in separate processes over 520 synthetic charts: 480
from 1800 to 2200 read in turn on UTC, UT1, TT and a pinned ΔT, a tenth of
them at 66°–80°, and 40 from 200 to 1800 and 2200 to 3900. It compares every
number: the 12 bodies' longitudes, latitudes and speeds, the four angles, the
cusps of all thirteen house systems, the mean node, Black Moon Lilith, the
Vertex, the East Point and the seven lots, the true obliquity, right
ascensions, declinations and bound margins, the nine built-in ayanamsas and a
user-defined one (mean, nutation, true), the Moon's phase angle and 183
Saturn-return crossings in 31 scans; flags, house systems, the sect, the
aspects' pairs and retrograde flags must be identical.

The patched engine against rc.15: largest difference 7.96e-13° (the lots),
3.41e-13° in the angles and cusps, 2.27e-13° in longitudes, 1.14e-10°/day in
speeds; the mean points and every ayanamsa value exactly equal; every
crossing at the same millisecond; nothing else differs. The proof was run
before any test was changed for the full series, and rerun on the final source
(`results/plumbing.json` records the git tree of `src/` it read,
`4e477243…`, which is `45bdd34`'s).

The same run gives what the full series changes (not gated): longitudes by up
to 0.2380″ (latitudes not at all), speeds by up to 0.0725″/day, the angles by
up to 1.62″ and Koch cusps by up to 3.88″ at 66°–80°, the lots by up to
3.34″, the true obliquity by up to 0.0782″, declinations by up to 0.0974″,
the ayanamsas' `nutation` and `true` by up to 0.2380″ with `mean` unchanged,
the Moon's phase not at all, and Saturn-return crossings by up to 257 s
(median 20 s) near stations. No flag, fallback, aspect pair or retrograde
flag changed at those 520 charts.

## The equation of the equinoxes

The IAU 2000 complementary terms add at most 2.65 mas to the equation of the
equinoxes. `tools/ee-choice.py` sets three choices beside ERFA at 200,000
instants from 1800 to 2200 (milliarcseconds, `results/ee-choice.json`); it
writes the engine's formula with ERFA's own `nut00b` and `obl06`, which the
engine's equal to 5.3e-15″ and 2.9e-11″, so it does not run the engine:

| Choice | against gmst06 + ee00 (obl06, nut00b) | against `gst06a` | against `gst00b` |
| --- | ---: | ---: | ---: |
| none (astronomy-engine's) | 2.651 (p95 2.637) | 5.786 (p95 3.339) | 22.37 |
| 2640.96 µas sin Ω | 0.092 (p95 0.075) | 3.590 (p95 1.855) | 22.16 |
| and 63.52 µas sin 2Ω (**chosen**) | 0.035 (p95 0.024) | 3.599 (p95 1.846) | 22.10 |

What remains against `gst06a` is IAU 2000B's own difference from IAU 2000A
(Δψ cos εA up to 3.615 mas over 1800–2200). `gst00b` is not a fair arbiter
for this engine: it uses the IAU 2000 GMST, which differs from the IAU 2006
GMST the engine uses by up to 22.05 mas there. The engine keeps the two
terms: the definition of the sidereal time includes them, they cost two
sines, and with them the sidereal time is within 0.035 mas of the IAU 2000B
value built on the IAU 2006 GMST. At the fixture's 101 instants the engine's
own sidereal time is within 1.50e-5″ of that value and 0.00205″ of `gst06a`.

## Against ERFA, before and after

`tools/erfa-dump.mjs` takes 4,001 TT instants from 1800-01-01 to 2200-01-01
(every 36.525 days plus a varying fraction of a day), read as TT with a pinned
synthetic ΔT so that both sides know UT1 and TT exactly, at synthetic places
within 60° of the equator. It writes the vectors both engines rotate
(astronomy-engine's `GeoVector` with aberration, `GeoMoon`, the Moon's
orbital angular momentum) and each engine's longitudes and angles.
`tools/erfa-compare.py` rotates the same vectors with ERFA: Rz(−Δψ) Rx(εA) P,
with P from `bp06`, εA from `obl06` and Δψ from `nut06a` ("2000A") or `nut00b`
("2000B"); the angles from `gst06a` (or gmst06 + ee00 on nut00b) and obl06 +
Δε. Absolute differences, arcseconds (`results/erfa-frame.json`):

| Quantity | rc.15 vs 2000A: max / p95 / p50 | this build vs 2000A | rc.15 vs 2000B | this build vs 2000B |
| --- | --- | --- | --- | --- |
| The ten bodies' longitudes (largest of the ten) | 0.2520 / 0.1486 / 0.05245 | 0.003691 / 0.002011 / 0.0006008 | 0.2521 / 0.1482 / 0.05244 | 4.4e-7 / 3.7e-7 / 7.2e-8 |
| True node | 0.2520 / 0.1486 / 0.05245 | 0.003690 / 0.002013 / 0.0006002 | 0.2521 / 0.1482 / 0.05244 | 7.7e-6 / 4.9e-6 / 1.2e-6 |
| Ascendant | 0.8235 / 0.1512 / 0.0458 | 0.006284 / 0.002176 / 0.0005494 | 0.8240 / 0.1517 / 0.0459 | 8.1e-5 / 2.5e-5 / 7.7e-6 |
| Midheaven | 0.2457 / 0.1335 / 0.04861 | 0.003358 / 0.001878 / 0.0005498 | 0.2460 / 0.1331 / 0.04868 | 3.7e-5 / 2.4e-5 / 8.1e-6 |

This measures the rotation to the ecliptic of date and the sidereal time and
obliquity, not the series that give the vectors, whose errors are far larger
(below). Latitudes are the same on both builds; longitudes differ between the
builds by up to 0.2521″. Sampled every 10 minutes from 1800 to 2200, the
change in Δψ reaches 0.2701″ (1834-03-18) and the change in the true
obliquity 0.08654″ (2114-04-28) (`results/nutation-change.json`).

## Against Swiss Ephemeris (statistics only)

`tools/swiss-dump.mjs` and `tools/swiss-compare.py`; every Swiss call uses
`FLG_SWIEPH` with `sepl_18.se1` and `semo_18.se1`, and its returned flags are
checked (all SWIEPH). Absolute differences, arcseconds (`results/swiss.json`):

| Quantity | Instants | rc.15: max / p95 / p50 | this build |
| --- | --- | --- | --- |
| Nutation in longitude, against Swiss's `ECL_NUT` | 2,000, 1850–2049 | 0.2431 / 0.1436 / 0.05104 | 0.001303 / 0.0009804 / 0.0001513 |
| Nutation in obliquity | same | 0.07829 / 0.04884 / 0.01771 | 0.001123 / 0.0008676 / 0.000388 |
| Ascendant, `houses_ex2` from the same UT1 | 1,529, 1850–2049, latitudes within 60° | 0.5292 / 0.1579 / 0.04882 | 0.00394 / 0.001141 / 0.0003112 |
| Midheaven | same | 0.2177 / 0.1395 / 0.04952 | 0.001503 / 0.0009055 / 0.0002314 |
| Ascendant, outside 1850–2049 | 1,471 | 7.101 / 2.317 / 1.202 | 6.948 / 2.294 / 1.214 |
| Midheaven, outside 1850–2049 | same | 2.223 / 1.992 / 1.337 | 2.080 / 1.993 / 1.354 |
| Mean node against `SE_MEAN_NODE` | 2,000, 1800–2199 | 0.6091 / 0.4342 / 0.1935 | 0.4503 / 0.4023 / 0.1945 |
| Black Moon Lilith against `SE_MEAN_APOG` | same | 0.6785 / 0.4547 / 0.1891 | 0.4887 / 0.4485 / 0.1948 |

Outside 1850–2049 Swiss uses its long-term sidereal time, so those rows
measure Swiss, not the change. Swiss's nutation differs from this engine's by
about 1 mas: it is not IAU 2000B's (the size is that of IAU 2000A's
difference; Swiss's source was not read to say which model it uses).

Body longitudes against `swe.calc` at the same TT, 2,000 instants 1850–2049,
largest before → after: Sun 2.100 → 2.083″, Moon 6.427 → 6.497″, Mercury
10.77 → 10.63″, Venus 19.35 → 19.24″, Mars 11.80 → 11.82″, Jupiter
10.10 → 10.17″, Saturn 12.87 → 12.74″, Uranus 12.02 → 12.04″, Neptune
18.50 → 18.37″, Pluto 9.939 → 9.916″, true node 19.65 → 19.82″. These are
astronomy-engine's series errors, and Swiss applies gravitational deflection
the engine does not; the nutation's change is below them, and moves the
largest either way.

## The rc.9 house ladder, end to end

The Zodiacs site's record of rc.9's house systems
(`docs/platform/evidence/houses-2026-09-26/` in zodiacs-org/site, commit
`5df5567d`) found Koch 3.73″ from Swiss's `swe_houses_ex` in one case of 353
on its 55°–66.6° ladder from 1850 to 2049, 2004-01-08T16:35:29Z at 65.6° N,
and 0.0000000004″ given Swiss's own sidereal time and obliquity there; the
programme's unit P2.A.house.koch asks for 3″ end to end. `tools/ladder-dump.mjs`,
`tools/ladder-compare.py` and `tools/worst-koch.mjs` are that record's tools
with the same generator, seed, cases and Swiss calls, and two changes: all
thirteen systems (`equal-mc` is Swiss's `D`), and the instant read as UT1
(`timeScale: "ut1"`), as Swiss and rc.9 read it. Largest of the twelve cusps
per case, arcseconds (`results/ladder.json`):

| System | Ladder 1850–2049, rc.15 → this build | Draws 1850–2049, rc.15 → this build |
| --- | --- | --- |
| Koch | 3.727 (1 over 3″) → 0.035 (0) | 1.947 → 0.055 |
| Placidus | 1.276 → 0.007 | 1.146 → 0.024 |
| Porphyry, Equal, Vehlow, Alcabitius, Regiomontanus, Campanus, Topocentric | 1.276 → 0.010 | 1.146 → 0.024 |
| Meridian, Morinus | 0.251 → 0.001 | 0.256 → 0.002 |
| Equal from the midheaven | 0.247 → 0.001 | 0.231 → 0.001 |
| Whole sign | 0 → 0 | 0 → 0 |

rc.15's figures reproduce the rc.9 record's. At the Koch case the cusps are
now 0.035″ from Swiss's, and 4.1e-10″ given Swiss's inputs
(`results/worst-koch.json`). **Koch is within 3″ end to end on the ladder
from 1850 to 2049: pass**, with every system within 0.035″ there. Outside
1850–2049 the ladder reaches 15.60″ (Regiomontanus; 31.36″ for Koch) and the
draws 31.41″, where rc.15 reached 15.18″ (31.57″) and 32.88″: Swiss's
long-term sidereal time, not counted against the change.

## Declinations and the out-of-bounds bound

`tools/declination-truth.py` and `tools/sun-solstices.py` run the rc.14
evidence's scripts (`docs/evidence/rc14-20260928/`) unchanged, through
`tools/engine-at-tt.mjs`, which reads each instant as UT1 with a pinned ΔT so
that an engine from rc.15 on gets exactly the intended TT (rc.15 adds UT1 −
UTC to a UTC instant from 1972). At 20,000 TT instants from 1850 to 2150,
against JPL's DE440s (SHA-256
`c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2`), with
ERFA's IAU 2006/2000A frame (`results/declination-truth.json`,
`results/declination-truth-rc15.json`):

- the true obliquity was within 85.6 mas of obl06 + nut00b and 85.41 mas of
  obl06 + nut06a; it is within 0.00 mas and 1.63 mas;
- the largest declination errors, rc.15 → this build: Sun 2.727 → 2.688″,
  Moon 3.408 → 3.375″, Mercury 12.159 → 12.166″, Venus 14.728 → 14.706″,
  Mars 14.534 → 14.501″, Jupiter 16.101 → 16.095″, Saturn 21.583 → 21.573″,
  Uranus 19.274 → 19.264″, Neptune 15.435 → 15.473″, Pluto 4.551 → 4.532″;
  the counts of flags that disagree with DE440s do not change;
- the three review examples' margins: Mars on 2022-10-22 −1.570″ before and
  after (DE440s +1.046″), Venus on 2029-10-09 −1.864″ → −1.854″ (DE440s
  +1.243″), Mercury on 2021-05-30 +2.096″ → +2.103″ (DE440s −1.395″).

rc.15's figures equal rc.14's, which the README cited. At the 800 solstices
of 1800–2199 the engine's margin has ERFA's sign at 404, as before
(`results/sun-solstices.json`): there the margin is the Sun's latitude, which
the nutation does not move.

## Receipts

No conventions set changes: none names the nutation model, and the engine
version tells results apart. Receipts written before this change carry
astronomy-engine's five-term nutation. The rc.15 candidate's own tools rerun
against this build (`results/receipt-replay.json`,
`results/rc14-comparison.json`, `results/rc15-comparison.json`; each reports
this build's version as 0.1.1-rc.15, unchanged):

- 16,218 rc.14 receipts from 1972 to 2027-10-02, replayed on UT1 with their
  recorded ΔT pinned, now differ from their results by up to 0.2554″ in the
  bodies, 3.022″ in the angles and cusps and 2.76e-5 °/day in the speeds,
  where rc.15 reproduced the angles and cusps exactly. Replayed as the UTC
  requests they record, the midheaven moves by up to 12.81″ and the
  ascendant and cusps by up to 12.9″ at the equator, 20.15″ at 45°, 40.69″
  at 60° and 129.9″ at 65°; the Moon by up to 0.5981″, the other planets by
  up to 0.2717″, the true nodes by up to 0.2545″.
- Ordinary charts against rc.15, 9,697 from 1850 to 2150 at four places up to
  60.17° N with Placidus: longitudes by up to 0.2635″, latitudes by less than
  1e-10″, the ascendant and cusps by up to 0.8003″, the midheaven by up to
  0.2576″, no house system changed. Against rc.14 before 1972 and after
  2027-10-02 (7,896 charts) the same: 0.2635″, 0.8003″, 0.2576″.

`docs/time.md` states these in place of rc.15's figures.

## Conformance

`conformance.yml`'s steps on Node 22.22.2 (`logs/conformance-*.log`): the
self-test and the 500 vectors validate; after regenerating this engine's
results and the report (`run.mjs --out`, `report.mjs`) the checks pass. One
verdict moved: `L1-POS-0041`, the Sun at 1908-05-30T15:23 TT, was 1.076″ off
in longitude, over the 1″ tolerance, and passes. The L2 residuals shrink: the
ascendant's largest from 0.182″ to 0.019″, the midheaven's from 0.178″ to
0.0081″, the Vertex's from 0.285″ to 0.013″, the cusps' from 0.489″ to 0.071″.
The L1 longitude median moves from 2.067″ to 2.083″ and its largest from
18.85″ to 18.77″: those are astronomy-engine's series against DE441.
`conformance/results/zodiacs-engine.notes.md` says so. The vector generators
(the workflow's second job) do not read the engine and were not rerun.

## Tests whose expectations changed

Each now says where its expectation comes from.

- `src/nutation.test.ts` (new): the transcription, ERFA and NOVAS-loop checks
  above.
- `src/crossings-ephemeris.test.ts`: the February 2026 Mercury station moves
  5.94 s, to 06:47:13.822Z. On ERFA's 2006/2000A ecliptic of date the same
  astronomy-engine vectors put it at 06:47:13.971Z; a fit to this engine's
  longitudes puts it 0.047 s from that, to rc.15's 6.156 s
  (`results/test-expectations.json`; the golden-section search itself can
  locate so flat a maximum only to about 0.1 s). The audit's target was
  astronomy-engine's nutation reused from 1 ms away, 2.3e-11° above the
  station sample; the engine computes its nutation afresh, so the test now
  adds those 2.3e-11° itself: still no crossing, and one touch at the sample's
  own longitude.
- `src/receipt.test.ts`: the polar-fallback chart's ascendant, read as UT1,
  is pinned at the new value, 0.0003″ from ERFA's (gst06a, obl06 + nut06a),
  where the five-term value was 0.039″ away.
- `src/placidus-limit.test.ts`: the review's latitude, 66.56186339751429°, was
  1.07e-5″ below the polar limit on the five-term obliquity. ERFA's true
  obliquity there is 0.00498″ larger, and the full series' 0.00030″ larger
  still, so that latitude is inside the polar circle; the test keeps it
  1.07e-5″ below the engine's limit, at 66.56186193124925°, and Placidus holds
  at all 2,201 milliseconds. The call that flushed astronomy-engine's
  nutation cache is gone.
- `src/replay-time-basis.test.ts`: the 1973 rc.14 receipt's time-basis
  effect (12.02″ of sidereal time, 11.03″ of ascendant, 0.408″ of Moon) is
  now measured against the same request read on UT1 with the recorded ΔT
  pinned, and the recorded angles and Placidus cusps are shown to be exactly
  astronomy-engine's five-term sidereal time and obliquity at that clock,
  with every longitude differing from this engine's by the change in Δψ
  (−0.023″ there) and every speed by that change's rate.
- `src/declination.test.ts`, `src/vedic/ayanamsa.test.ts`: the true
  obliquity and Δψ the chart uses are the engine's `tilt` at the chart's TT
  (`src/nutation.test.ts` checks it against ERFA); they were astronomy-engine's
  `e_tilt`, and two passed only because `e_tilt` reused a value from up to
  1e-6 day away.
- `src/speed.test.ts`: the longitudes at the speed samples' TT come from the
  engine's frame, not astronomy-engine's rotation.
- `src/ephemeris-errors.test.ts`: the Moon's failure is injected in
  `GeoMoon`, which the engine now calls, in place of `EclipticGeoMoon`.

## Size and time

`results/sizes.json` (esbuild 0.27.7, gzip -9):

| | rc.15 | this build | growth |
| --- | ---: | ---: | ---: |
| Main chunk (the one with `src/ephemeris.ts`), bytes | 23,963 | 29,776 | 5,813 |
| Main chunk, gzip | 7,364 | 9,792 | 2,428 |
| Main chunk minified, gzip | 5,656 | 7,764 | 2,108 |
| `./internal` bundled and minified, astronomy-engine bundled, gzip | 32,506 | 33,595 | 1,089 |
| `./internal` bundled and minified, astronomy-engine external, gzip | 10,714 | 12,877 | 2,163 |
| Stand-in for the Zodiacs site's engine chunk, gzip | 32,051 | 33,131 | 1,080 |

With astronomy-engine bundled and tree-shaken, its own nutation code drops
out, which is why those growths are the smallest. The coefficients are text
because the unminified build prints a multi-line array one number to a line
and keeps comments inside it: as a commented array, the main chunk grew by
8,270 bytes.

The site's budget `engine-chunk` (its `scripts/report-bundles.mjs`) is the
gzip -9 size of its `full.*.js` chunk with the chunks that chunk imports
statically: its `src/lib/engine/full.ts`, which imports `bodyLongitude`,
`computeBodies`, `computeChart` and `longitudeSpeed` from `./internal` (site
commit `a9d3d9e8`, the rc.14 adoption record), built by Vite 6.4.3. The
stand-in builds those four imports as Vite does, Rollup 4.63.4 with the
packages' `"sideEffects": false` and then esbuild's minifier at Vite's
default target less Safari 14 (which this esbuild declines to lower
astronomy-engine's destructuring for), without the site's own adapter. On
rc.14 it gives 26,750 bytes where the site recorded 27,303 against its limit
of 27,648; on rc.15, 32,051, since rc.15's time basis (leap seconds, IERS UT1,
the time-scale code) adds 5,301 bytes before this change; with this change,
33,131. Carried onto the site's recorded figure, the site's chunk would be
about 32,604 bytes on rc.15 and 33,684 with this change, over its limit by
about 4,956 and 6,036 bytes. Only a site build can say exactly; this record
did not make one.

The package's import-graph budgets (`scripts/verify-package-contents.mjs`)
are exceeded, so `npm run package:contents` fails: `.` 103,517 bytes against
100,000, `./internal` 64,810 against 60,000, `./timing` 120,729 against
120,000, `./vedic` 122,111 against 120,000. `./internal` had 1,003 bytes to
spare; the 77 terms with the precession cannot fit that honestly. The
repository raises a budget only in a candidate that says why, so this branch
leaves them; the candidate that carries it has to raise those four.

Time, medians of seven rounds with each engine in its own process
(`results/performance.json`; a shared machine, so read the ratios): a natal
chart 0.792 → 0.819 ms (×1.03); one longitude, Sun 6.44 → 7.72 µs (×1.20),
Moon 10.47 → 12.45 µs (×1.19), Saturn 11.03 → 13.26 µs (×1.20), true node
20.02 → 21.27 µs (×1.06); a Saturn-return scan 62.2 → 73.9 ms (×1.19).

## Gates

On Node 22.22.2 with the installed lockfile (`logs/`): `npm run typecheck`,
`npm test` (3,267 tests in 60 files), `npm run build`, `npm run
exports:smoke`, `npm run pack:dry-run`, the four conformance steps and the two
atlas steps pass. `npm run package:contents` fails on the budgets above, at
its first budget, before its other checks; a copy of the script with only the
budget assertion waived (not committed) passes all the rest: 54 files,
684,329 bytes unpacked of 700,000, the licence expression and the ΔT
attribution in `LICENSING.md`, `NOTICE` and `README.md`, and the Node range
(`logs/package-contents-budgets-waived.log`).
`node scripts/verify-archive-binding.mjs` fails because HEAD, rebuilt from its
own git objects, is no longer the carried rc.15 archive (`LICENSING.md`,
`NOTICE` and `dist/` differ): the rule that packed files change only with a
new candidate, which this branch is meant to feed.

## Environment

Node v22.22.2, npm 10.9.7, tsup 8.5.1, TypeScript 5.9.3, Vitest 2.1.9,
esbuild 0.27.7, astronomy-engine 2.1.19. Python 3.11.15 with pyerfa 2.0.1.5
(ERFA 2.0.1) and numpy 2.4.6; jplephem 2.24 for DE440s; pyswisseph 2.10.03
(package 2.10.3.2) with `sepl_18.se1` (SHA-256
`ca1393ceab3a44fbc895887cf789c68819ae6a1cbc9b22225872dbe4ccd99a66`) and
`semo_18.se1` (`1ca07bd67c24374d77226180c20a4f9996cba013697894810518e7eb582ca4f7`).

## Rerun

`tools/run-all.sh`, from the checkout, with `ERFA_PYTHON`, `DE440S_PYTHON`,
`DE440S`, `SWISS_PYTHON` and `SE_EPHE_PATH` set and `TMPDIR` outside the
checkout, rebuilds and rewrites every file in `results/`. Each tool's header
gives its own command.

## Not established

- Node 20 and 24, and the packed-consumer job on Node 20.19.0 and 22.7.0,
  were not run; only Node 22.22.2.
- The Zodiacs site's engine chunk (budget 27,648 bytes gzipped, 27,303 on
  rc.14) was not rebuilt; its growth, 1,080 bytes, is a stand-in's, not
  measured. By the same stand-in, rc.15 alone would already take it over its
  limit.
- Which nutation model Swiss Ephemeris 2.10.03 uses by default was not read
  from its source; the 1 mas residual only suggests IAU 2000A.
- IAU 2000B itself is up to 3.7 mas from IAU 2000A in longitude over
  1800–2200 (`results/erfa-frame.json`); IAU 2000A, some 1,300 terms, was not
  considered.
- The precession is still astronomy-engine's; it agrees with ERFA's `bp06` to
  7.1e-7″ at the fixture's instants, which says nothing about its use outside
  1800–2200.
- Whether a receipt's conventions should name the nutation model is left to
  the candidate; this branch adds no conventions set.
- Positions against Swiss and DE440s remain dominated by astronomy-engine's
  series; this change does not touch them.
