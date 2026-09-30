# Results: `@zodiacs/engine/calc` against JPL Horizons and ERFA

Run on 2026-09-28 by the procedure in `PREREGISTRATION.md` (commit `6dc0c47`),
on the calc entry point of commit `29679e8` built with `npm run build`, and
revised the same day after an independent review; Deviations 6 to 11 list
every change made after the comparison.
`tools/engine_values.mjs` wrote the engine's side (not committed). As first
run it wrote 10.8 MB whose SHA-256 on Node 22 is
`9275c2b882069182c9dfd9f05702d2306d752d898962e7fc4a015af4ae2d9730`, and the
build after the label corrections below gave the same bytes. At the review it
gained the topocentric astrometric cases and three engine-only measurements
(Deviations 7 and 9) and now writes 11.4 MB,
`fab775f1a603262c43f049276afe5c2babf5dae4a855b4075a7c284a90c6c266`; the
script as it stood before the review still gives `9275c2b8…` on the revised
build, so no compared value moved.
`tools/compare.py` wrote `results/summary.json`, `tools/report.py` wrote
`results/tables.md`, which has every table, `tools/diagnostics.py` wrote
`results/diagnostics.json`, and `tools/barycentre.mjs`, added at the review,
wrote `results/barycentre.json`. The Horizons responses are in `horizons/`,
with their URLs and SHA-256 in `horizons/requests.jsonl`.

## Frame-transform consistency: 8 pass, 4 fail

| check | compares | tolerance | max | verdict |
| --- | --- | ---: | ---: | --- |
| C1 | x, y, z against lon, lat, dist | 1e-6″, 1e-12 | 3.1e-10″, 4.4e-16 | PASS |
| C2 | ICRS against J2000.0 through ERFA's frame bias | 1e-5″ | 2.7e-7″ | PASS |
| C3 | mean of date against J2000.0 through ERFA's IAU 2006 precession | 1e-4″ | 6.4e-7″ | PASS |
| C4 | true against mean of date through ERFA's IAU 2006/2000A nutation | 5e-3″ | 0.200″ | **FAIL** |
| C5a | equator against ecliptic of date, ERFA's true obliquity | 5e-3″ | 0.062″ | **FAIL** |
| C5b | the same, the engine's own true obliquity | 1e-6″ | 3.3e-10″ | PASS |
| C6 | mean equator against mean ecliptic of date | 1e-6″ | 4.1e-10″ | PASS |
| C7 | J2000.0 equator against J2000.0 ecliptic | 1e-6″ | 3.3e-10″ | PASS |
| C8 | ICRS equator against ICRS ecliptic | 1e-6″ | 4.2e-10″ | PASS |
| C9 | true of date against J2000.0, the whole chain | 5e-3″ | 0.200″ | **FAIL** |
| C10 | the true node, equator against ecliptic of date | 5e-3″ | 0.037″ | **FAIL** |

Every check whose arithmetic is the same on both sides agrees to better than
a nanoarcsecond, the frame bias and the precession to under a microarcsecond.
The four failures are the four checks that involve the nutation, and they
fail for one reason: **astronomy-engine's nutation is not IAU 2000B.** Its
`iau2000b()` keeps the five largest luni-solar terms of IAU 2000B and its
fixed offsets, of the series' 77. Diagnostic D1 (after the comparison, not
preregistered) measures the engine's own angles against ERFA's at the 32
instants: they differ from IAU 2000B (`nut00b`) by up to 0.201″ in Δψ (median
0.068″) and 0.067″ in Δε, while IAU 2000B and IAU 2006/2000A differ by only
0.0023″. D4, added at the review, samples the whole span every 0.1 day: up to
0.270″ in Δψ (at JD 2390991.1 TT) and 0.087″ in Δε, and in their rates up to
0.079″ a day in Δψ and 0.026″ a day in Δε. The
preregistration's 5 mas tolerance rested on the premise that the engine uses
IAU 2000B, taken from the function's name; the premise was false, the
tolerance stands, and so do the four FAILs. The mean obliquity is IAU 2006's to
1.5e-11″.

What it means: every true-of-date position the engine has ever reported
(`positions()`, `natalChart()`, and calc's `*-true-of-date` frames) carries a
nutation error of up to 0.27″ in longitude and 0.087″ in obliquity from 1800
to 2200 (0.20″ and 0.067″ at the 32 instants), and its speeds up to 0.079″ a
day; the angles carry it through the apparent sidereal time and the true
obliquity. It is about a tenth of the ephemeris's median error, but it is the
largest error of the frame chain. calc keeps astronomy-engine's nutation, so
that its default stays `positions()` to the bit; the convention id is now
`nutation:iau2000b-five-terms`, which says what it is. Replacing the nutation
would move every chart's positions and angles by up to 0.27″ and belongs in
its own reviewed change.

## Against Horizons (DE441)

The angle between the engine's direction and Horizons's, over the 32 instants
from 1802 to 2188; in arcseconds, median / 95th percentile / maximum, the
bodies pooled. The frames differ only in the last digit: the true-of-date
frames by the nutation above, the others not at all.

| center, correction | ICRS equator | true ecliptic of date | largest, any frame | distance, largest relative | angular rate ″/day, ICRS equator, median / 95th / max |
| --- | --- | --- | ---: | ---: | --- |
| geocentric, apparent | 3.00 / 15.5 / 24.6 | 2.99 / 15.5 / 24.5 | 24.6 | 1.3e-4 | 0.031 / 0.73 / 2.10 |
| geocentric, astrometric | 2.88 / 15.5 / 24.6 | 2.86 / 15.5 / 24.4 | 24.6 | 6.7e-5 | 0.031 / 0.73 / 2.10 |
| geocentric, geometric | 2.88 / 15.5 / 24.6 | 2.86 / 15.5 / 24.4 | 24.6 | 6.7e-5 | 0.032 / 0.73 / 2.10 |
| heliocentric (any) | 2.95 / 16.4 / 24.3 | 3.01 / 16.4 / 24.2 | 24.3 | 8.6e-5 | 0.019 / 1.87 / 5.38 |
| barycentric (any) | 3.64 / 75.8 / 519 | 3.69 / 75.8 / 519 | 519 | 4.1e-3 | 0.030 / 2.31 / 12.4 |
| topocentric, apparent (Sun, Moon, Mars) | 1.29 / 5.60 / 7.70 | 1.32 / 5.67 / 7.64 | 7.70 | 5.7e-5 | 0.14 / 0.99 / 1.39 |
| topocentric, astrometric (added at the review) | 1.29 / 5.60 / 7.70 | 1.32 / 5.67 / 7.64 | 7.70 | 5.7e-5 | 0.13 / 0.99 / 1.39 |
| topocentric, geometric | 1.29 / 5.60 / 7.70 | 1.32 / 5.67 / 7.64 | 7.70 | 5.7e-5 | 0.13 / 0.99 / 1.45 |

By body, geocentric and apparent, all eight frames pooled (256 values each):

| body | position ″ | distance, largest | angular rate ″/day |
| --- | --- | ---: | --- |
| Sun | 0.98 / 2.68 / 2.94 | 1.4e-5 | 0.12 / 0.17 / 0.18 |
| Moon | 1.76 / 6.88 / 8.29 | 1.3e-4 | 0.40 / 0.88 / 1.01 |
| Mercury | 3.05 / 8.38 / 9.32 | 3.5e-5 | 0.70 / 2.09 / 2.11 |
| Venus | 1.89 / 8.70 / 10.0 | 3.1e-5 | 0.12 / 0.55 / 0.64 |
| Mars | 1.34 / 5.85 / 6.58 | 5.7e-5 | 0.063 / 0.27 / 0.44 |
| Jupiter | 3.07 / 10.9 / 12.7 | 4.7e-5 | 0.023 / 0.049 / 0.082 |
| Saturn | 6.41 / 16.5 / 17.6 | 6.7e-5 | 0.018 / 0.033 / 0.049 |
| Uranus | 6.20 / 15.4 / 19.5 | 4.1e-5 | 0.009 / 0.032 / 0.043 |
| Neptune | 11.2 / 19.4 / 20.1 | 4.2e-5 | 0.008 / 0.034 / 0.051 |
| Pluto | 5.95 / 21.0 / 24.6 | 6.2e-5 | 0.004 / 0.030 / 0.045 |

This is the engine's known ephemeris error: astronomy-engine's truncated
VSOP87, its lunar series and its Pluto. The conformance suite's L1 vectors
(24 instants, true ecliptic of date) put it at a median of 2.07″ in longitude
and a maximum of 18.8″; here the median angle is 2.99″ and the maximum 24.6″
(Pluto, 2144), over a wider corpus. The corrections change little: light
time and aberration are computed the same way on both sides, so the
differences left are the ephemeris's.

- **The Moon.** The engine's geocentric apparent Moon is its series at the
  instant (its convention). Against Horizons's apparent Moon it is 1.76″ /
  6.85″ / 8.23″ in the true ecliptic of date; against Horizons's geometric Moon,
  like for like, 1.76″ / 6.15″ / 7.53″. The light-time term it leaves out,
  measured on the engine alone, is 0.667″ to 0.731″. Its distance is the
  series's geometric one, and Horizons's light path differs from the geometric
  distance by up to 9.8e-5 (38 km: during the 1.3 s of light time the Moon
  moves about 40 km with the Earth around the Sun; D3), which is why its
  apparent distance bound, 1.4e-4, is four times its astrometric one.
- **Heliocentric Mercury** is 23″ at worst, against 9.3″ geocentric: the same
  error in au, seen from 0.31 to 0.47 au instead of 0.5 to 1.4.
- **The barycentric Sun** passes the preregistered sanity limit of 60″: 87″
  median, 519″ largest. Diagnostic D2 explains it. astronomy-engine's
  barycentre is the Sun and the four giant planets, each weighted
  m / (m + M☉); evaluated on Horizons's own heliocentric vectors, that formula
  is 1.1e-5 au (1,650 km) from Horizons's barycentric Sun, and the full
  Newtonian formula 9.1e-7 au. The engine's barycentric Sun is 1.1e-5 au from
  Horizons's, of which its series account for 3.7e-7 au. The Sun is only
  0.0006 to 0.0093 au from the barycentre in this corpus, so 1.1e-5 au turns
  its direction by up to 519″ here. It passes much closer: the review found it
  2.66° from Horizons's, and its distance 1.8% off, at 2130-03-05T00:00 UT,
  1.07e-4 au from the barycentre, and a daily scan puts its closest approach
  at 1.02e-4 au (2130-03-11). Near the barycentre the error turns its
  direction by several degrees, so its bounds are now derived from the
  barycentre's error (up to 1.26e-5 au from 1800 to 2200) and not measured:
  Deviation 8. Every other barycentric body is at least 0.3 au away, where the
  same error is under 10″.
- **Topocentric** positions (two synthetic sites, the Sun, the Moon and Mars,
  ΔT pinned to Horizons's) are as good as the geocentric ones, in all three
  corrections: the topocentric reduction adds nothing measurable at this
  level. The astrometric ones were added at the review (Deviation 7). The pin
  leaves the engine turning the Earth by UTC where Horizons uses UT1 after
  1962, which moves these positions by up to 0.070″ (Deviation 9).

## Speeds

Analytic (the geometric positions on fixed axes, every body but the Moon) and
central differences with h = 0.001 day agree with Horizons's rates to the
table's figures: 0.18″/day for the Sun, 1.1″/day for the Moon, 2.2″/day for
Mercury geocentric and 5.4″/day heliocentric. These are the ephemeris's own
rate errors. For Jupiter to Pluto, geocentric and apparent, the largest rate
difference is 0.013 (Neptune) to 0.060″/day (Jupiter) in the mean-of-date,
J2000.0 and ICRS frames, and 0.043 to 0.082″/day in the true-of-date frames;
the rise, Neptune's 0.013 to 0.051″/day for one, is the five-term nutation's
rate error (up to 0.079″/day over the span, D4), not the ephemeris's. The
differencing error of the central difference, estimated on the engine alone by
Richardson's rule (|D(2h) − D(h)| / 3), is at most 1.3e-4″/day for the
default geocentric positions (the Moon), 3.2e-3″/day for the astrometric Moon,
whose light-time solution stops at a tolerance that leaves a small jitter in
each position, and 0.094″/day for the topocentric Moon, whose parallax turns
daily (Deviation 9; the first version measured the default positions only).
Pluto's analytic velocity, from astronomy-engine's integrator, differs from
the derivative of its position by up to 9.7e-4″/day (the first version said
about 5e-4″/day).

## The lunar points

- **True node** (the engine's, from the series's state) against the ascending
  node of the osculating orbit of Horizons's geometric Moon, in the IAU
  2006/2000A true ecliptic of date: 6.6″ / 13.7″ / 15.8″. Its speed was not
  compared.
- **Mean node and Lilith** against the same definitions evaluated with ERFA's
  fundamental arguments: 1e-9″ in the mean-of-date frames and 5e-7″ on the
  J2000.0 and ICRS axes, which checks the implementation; 0.199″ in the
  true-of-date frames, which is the nutation above. Speeds: 0.044″/day.

## The bounds table

`src/calc-bounds.ts` is the rule's output: for each center, correction and
body, the largest difference over the instants and the eight frames, rounded
up to two significant figures, labelled `measured`, but for the barycentric
Sun, which `tools/bounds.py` leaves out and calc derives from the barycentre's
error (Deviation 8). `tools/bounds.py --check` and `src/calc-bounds.test.ts`
hold it to `results/summary.json`.

## Deviations from the plan

1. **Horizons truncated the time lists.** Every 96-entry list returned only its
   first 80 entries, without a message. The 16 missing entries of each of the
   57 such requests were asked for again and kept beside the first response as
   `NAME.2.txt`; `compare.py` reads both. Every instant and step is covered and
   nothing was dropped.
2. The ΔT table (`deltat.txt`) comes back in date order, not in the order
   asked; both scripts key it by date.
3. The barycentric apparent correction is compared with Horizons's `LT`: the
   plan requested only `NONE` and `LT` at the barycentre, where apparent and
   astrometric are the same by definition.
4. The distance-rate statistic is taken relative to the distance, per day,
   since the rate itself passes through zero.
5. The engine-only Richardson script first offset its instants by 2 days
   instead of 0.002 day; the bug was fixed before these results were read.
6. After the comparison, and before these results were first written, these
   edits were made (the first version of this list named only the first and
   the fourth); the engine's values are byte for byte the same before and
   after:
   - the convention id `nutation:iau2000b` became
     `nutation:iau2000b-five-terms` in the calc() and houses() receipts, and
     the comment in `calc-frames.ts` names the five-term nutation;
   - `events()` receipts name the body's position conventions as calc() does,
     where they had named five fixed ids, `moon:series-at-instant` among them,
     for every body; `chart()` receipts add `light-time:newtonian`,
     `deflection:none`, `aberration:backdated-observer`, `precession:iau2006`,
     `nutation:iau2000b-five-terms`, `obliquity:iau2006` and the true node's
     `speed:central-difference-0.25d`, and name the house system, the angles
     and the sidereal time only when houses were computed, with
     `polar-fallback:whole` when they fell back;
   - `src/calc-bounds.ts`, empty until then, was filled by `tools/bounds.py`,
     grouped by center and correction, and calc() reads it that way;
   - the `dist` documentation says that the geocentric apparent Moon's
     distance is geometric;
   - `src/calc-bounds.test.ts` and a `calc.test.ts` case for the receipts'
     shared ids were added, and `docs/calc.md` and `CHANGELOG.md` describe the
     nutation, the barycentre, the Moon's distance and these results.
7. **Topocentric astrometric positions.** The plan requested `NONE` and `LT+S`
   at the two sites, yet calc returned astrometric topocentric positions with
   the geocentric astrometric bound and a basis saying the topocentric
   reduction had been compared, which was true of the apparent correction
   only. At the review, `LT` was requested at both sites for the Sun, the
   Moon and Mars at the 96 instants (twelve responses, the list truncated as
   in Deviation 1); `engine_values.mjs` computes the cases and `compare.py`
   compares them like the others: 1.29″ / 5.60″ / 7.70″ in the ICRS equator,
   the Moon at worst, the same as the apparent ones. The bounds table gains
   `topocentric/astrometric` rows (the Moon 7.8″, Mars 6.6″, the Sun 3.0″). A
   topocentric body not compared still takes its geocentric bound for the same
   correction, labelled `estimated`, and its basis now says that only the Sun,
   the Moon and Mars were compared.
8. **The barycentric Sun's bounds.** The rule gave it 520″, 0.0042 and 13″ a
   day, measured on 32 instants at which it was 0.00064 to 0.0093 au from the
   barycentre. The review found it 2.66° (9,593″) from Horizons, and its
   distance 1.8% off, at 2130-03-05T00:00 UT, 1.07e-4 au from the barycentre:
   no sample of instants bounds it. `tools/barycentre.mjs` (added) compares
   astronomy-engine's barycentric Sun every day from 1800 to 2200 with the full
   Newtonian barycentre of astronomy-engine's own heliocentric states and
   DE440's masses: they differ by up to 1.26e-5 au (1804-10-02) and
   1.15e-7 au/day (1866-12-10), the Sun comes within 1.02e-4 au of the
   barycentre (2130-03-11), and the largest difference in direction is 2.41°
   (2130-03-05). Two more Horizons requests, with velocities, cover the
   review's instant and the scan's 55 worst days (the 25 largest peaks of the
   difference in position, the 20 closest approaches and the 10 largest peaks
   of the difference in velocity). At those and the 32 corpus instants the
   Newtonian barycentre is within 1.10e-6 au and 7.8e-10 au/day of DE441's,
   and the engine's within 1.26e-5 au and 1.16e-7 au/day. calc takes
   e = 1.4e-5 au and ė = 1.2e-7 au/day, which cover the scan's largest
   differences plus the Newtonian barycentre's own, and gives the barycentric
   Sun, labelled `estimated`, the widest angle, relative distance and rate of
   direction they allow at its distance r and speed v: asin(e / r),
   e / (r − e) and ė / r + (v + ė) e (1 / r² + 1 / (r (r − e))), rounded up to
   two significant figures. At the 88 Horizons instants the differences reach
   0.49 of the angle bound, 0.87 of the distance bound and 0.70 of the rate
   bound (`results/barycentre.json`); at 2130-03-05 the bounds are 27,000″,
   0.15 and 3,400″/day. `bounds.py` leaves the rule's barycentric Sun rows out
   of `src/calc-bounds.ts`, and `calc-bounds.test.ts` repeats the scan and the
   Horizons check. The first version said the direction could be off by about
   a degree near the barycentre; it is several.
9. **Engine-only measurements added at the review.** `engine_values.mjs`
   also writes, and the summary and tables report: the Richardson estimate for
   geocentric astrometric positions (the Moon's is 3.2e-3″/day); Pluto's
   analytic speed against a fourth-order derivative of its position
   (9.7e-4″/day at most); and what UT1 − UTC does to the pinned topocentric
   positions. The plan pinned the engine's ΔT to Horizons's TDB − UT so that
   both sides would turn the Earth by the same UT1, but from 1962 Horizons's
   TDB − UT is TDB − UTC, so the pin makes the engine take UTC for UT1 where
   Horizons uses UT1 from its Earth-orientation file. With UT1 − UTC from IERS
   EOP 20 C04 at the five corpus instants from 1962 to 2026 (−0.020 to
   +0.355 s), the topocentric positions move by up to 0.070″ (the Moon, site
   S2, 2000-01-01); after 2026, where that file has no data, 0.1 s moves them
   by up to 0.019″. That is inside every topocentric bound, and the comparison
   was not rerun.
10. **D4**, the engine's nutation against `nut00b` every 0.1 day over the span
    (`tools/nutation_values.mjs`, run by `diagnostics.py`), was added: the
    first version quoted the 32-instant maxima, 0.20″ and 0.067″, where the
    span's are 0.27″ and 0.087″.
11. **Code changed at the review** that moves no compared value (the SHA-256
    at the top):
    - The span is checked on TT as well as UT, and an instant is refused
      unless both are in it. Before, a ΔT pin of up to ±10¹⁰ s could put the
      ephemeris's TT centuries outside the span with a `measured` bound (TT in
      2516 for UT in 2199), and a TT Julian date was refused at
      1800-01-01T00:00 TT, whose UT is in 1799, but computed at and after
      2200-01-01T00:00 TT, whose UT is still in 2199. The refusal's detail says
      so, and UT instants in the last 126 s of 2199, whose TT is in 2200, are
      refused.
    - A TT Julian date is converted by calc's own copy of astronomy-engine's
      `AstroTime.FromTerrestrialTime`, stopped after ten steps and keeping the
      closest: the original can alternate forever between two neighbouring
      doubles, and did, on the engine's ΔT, at JD 2386009.0 TT, where calc()
      never returned.
    - The nodes' and Lilith's receipts name `precession:iau2006` and
      `obliquity:iau2006` in every frame, since they are found in the ecliptic
      of date and turned from there; the nutation in their definition cancels
      the one in the turn outside the true-of-date frames (to 1e-10″), so it
      is named only in those.
    - The barycentric Sun's bounds (Deviation 8) and the topocentric
      estimate's basis (Deviation 7). `src/fixtures/calc-roundtrip.json` was
      updated where these touch its text: that basis, the North Node's
      conventions in `equatorial-true-of-date` and the out-of-range detail;
      no number in it changed.
    - `bounds.py` writes a group that equals another once, as a constant both
      name (the barycentric and heliocentric astrometric groups equal the
      apparent ones), to keep the package small; `compare.py` keeps the new
      entries' Julian dates to full precision.

## Reproducing

With Node 22 and a Python 3 that has pyerfa and numpy, from the repository
root:

```sh
npm ci && npm run build
python3 docs/evidence/calc-api/tools/fetch_horizons.py      # fetches nothing: every response is here
node docs/evidence/calc-api/tools/engine_values.mjs > engine.json
python3 docs/evidence/calc-api/tools/compare.py engine.json # results/summary.json
python3 docs/evidence/calc-api/tools/report.py              # results/tables.md
python3 docs/evidence/calc-api/tools/diagnostics.py engine.json   # runs node for D4
node docs/evidence/calc-api/tools/barycentre.mjs            # results/barycentre.json
python3 docs/evidence/calc-api/tools/bounds.py --check      # src/calc-bounds.ts agrees with the summary
```

`compare.py` records the SHA-256 of each of the 166 responses in `horizons/`
in `results/summary.json` (`inputs`): the 152 of the plan and the 14 fetched
at the review; they are the ones `horizons/requests.jsonl` logged when each
was fetched.

## Rerun on 0.1.1-rc.16's build

The same comparison, rerun unchanged in method on the integrated 0.1.1-rc.16
candidate after the engine took the full IAU 2000B nutation, is in `rc16/`
(`rc16/README.md`): all twelve consistency checks pass there, and calc's
bounds now come from that run. This document and `results/` are the first
run's, unchanged.
