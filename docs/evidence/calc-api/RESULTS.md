# Results: `@zodiacs/engine/calc` against JPL Horizons and ERFA

Run on 2026-09-28 by the procedure in `PREREGISTRATION.md` (commit `6dc0c47`),
on the calc entry point of commit `29679e8` built with `npm run build`.
`tools/engine_values.mjs` wrote the engine's side (10.8 MB, not committed; on
Node 22 its SHA-256 is
`9275c2b882069182c9dfd9f05702d2306d752d898962e7fc4a015af4ae2d9730`, and the
build after the label corrections below gives the same bytes).
`tools/compare.py` wrote `results/summary.json`, `tools/report.py` wrote
`results/tables.md`, which has every table, and `tools/diagnostics.py` wrote
`results/diagnostics.json`. The Horizons responses are in `horizons/`, with
their URLs and SHA-256 in `horizons/requests.jsonl`.

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
preregistered) measures the engine's own angles against ERFA's: they differ
from IAU 2000B (`nut00b`) by up to 0.201″ in Δψ (median 0.068″) and 0.067″ in
Δε, while IAU 2000B and IAU 2006/2000A differ by only 0.0023″. The
preregistration's 5 mas tolerance rested on the premise that the engine uses
IAU 2000B, taken from the function's name; the premise was false, the
tolerance stands, and so do the four FAILs. The mean obliquity is IAU 2006's to
1.5e-11″.

What it means: every true-of-date position the engine has ever reported
(`positions()`, `natalChart()`, and calc's `*-true-of-date` frames) carries a
nutation error of up to 0.20″ in longitude and 0.067″ in obliquity, and the
angles carry it through the apparent sidereal time and the true obliquity.
It is a tenth of the ephemeris's own error, but it is the largest error of the
frame chain. calc keeps astronomy-engine's nutation, so that its default stays
`positions()` to the bit; the convention id is now
`nutation:iau2000b-five-terms`, which says what it is. Replacing the nutation
would move every chart's positions and angles by up to 0.2″ and belongs in its
own reviewed change.

## Against Horizons (DE441)

The angle between the engine's direction and Horizons's, over the 32 instants
from 1802 to 2188; in arcseconds, median / 95th percentile / maximum, the
bodies pooled. The frames differ only in the last digit: the true-of-date
frames by the nutation above, the others not at all.

| center, correction | ICRS equator | true ecliptic of date | largest, any frame | distance, largest relative | angular rate ″/day, median / 95th / max |
| --- | --- | --- | ---: | ---: | --- |
| geocentric, apparent | 3.00 / 15.5 / 24.6 | 2.99 / 15.5 / 24.5 | 24.6 | 1.3e-4 | 0.031 / 0.73 / 2.10 |
| geocentric, astrometric | 2.88 / 15.5 / 24.6 | 2.86 / 15.5 / 24.4 | 24.6 | 6.7e-5 | 0.031 / 0.73 / 2.10 |
| geocentric, geometric | 2.88 / 15.5 / 24.6 | 2.86 / 15.5 / 24.4 | 24.6 | 6.7e-5 | 0.032 / 0.73 / 2.10 |
| heliocentric (any) | 2.95 / 16.4 / 24.3 | 3.01 / 16.4 / 24.2 | 24.3 | 8.6e-5 | 0.019 / 1.87 / 5.38 |
| barycentric (any) | 3.64 / 75.8 / 519 | 3.69 / 75.8 / 519 | 519 | 4.1e-3 | 0.030 / 2.31 / 12.4 |
| topocentric, apparent (Sun, Moon, Mars) | 1.29 / 5.60 / 7.70 | 1.32 / 5.67 / 7.64 | 7.70 | 5.7e-5 | 0.14 / 0.99 / 1.39 |
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
  its direction by up to 519″ here, and by up to about a degree when it passes
  closest. Every other barycentric body is at least 0.3 au away, where the
  same error is under 8″. The bound on the barycentric Sun's direction is
  measured on 32 instants and can be exceeded; its position, 1.1e-5 au, is the
  meaningful number.
- **Topocentric** positions (two synthetic sites, the Sun, the Moon and Mars,
  ΔT pinned to Horizons's) are as good as the geocentric ones: the topocentric
  reduction adds nothing measurable at this level.

## Speeds

Analytic (the geometric positions on fixed axes, every body but the Moon) and
central differences with h = 0.001 day agree with Horizons's rates to the
table's figures: 0.18″/day for the Sun, 1.1″/day for the Moon, 2.2″/day for
Mercury geocentric and 5.4″/day heliocentric, and under 0.1″/day for Jupiter
to Pluto. These are the ephemeris's own rate errors. The differencing error of
the central difference, estimated on the engine alone by Richardson's rule
(|D(2h) − D(h)| / 3), is at most 1.3e-4″/day geocentric (the Moon) and
0.094″/day for the topocentric Moon, whose parallax turns daily. Pluto's
analytic velocity, from astronomy-engine's integrator, differs from the
derivative of its position by about 5e-4″/day.

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
up to two significant figures, labelled `measured`. `tools/bounds.py --check`
and `src/calc-bounds.test.ts` hold it to `results/summary.json`.

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
6. After the comparison, two labels were corrected and nothing else: the
   convention id `nutation:iau2000b` became `nutation:iau2000b-five-terms`, and
   the `dist` documentation now says that the geocentric apparent Moon's
   distance is geometric. The engine's values are byte for byte the same
   before and after.

## Reproducing

With Node 22 and a Python 3 that has pyerfa and numpy, from the repository
root:

```sh
npm ci && npm run build
python3 docs/evidence/calc-api/tools/fetch_horizons.py      # fetches nothing: every response is here
node docs/evidence/calc-api/tools/engine_values.mjs > engine.json
python3 docs/evidence/calc-api/tools/compare.py engine.json # results/summary.json
python3 docs/evidence/calc-api/tools/report.py              # results/tables.md
python3 docs/evidence/calc-api/tools/diagnostics.py engine.json
python3 docs/evidence/calc-api/tools/bounds.py --check      # src/calc-bounds.ts agrees with the summary
```

`compare.py` records the SHA-256 of each of the 152 responses it reads in
`results/summary.json` (`inputs`); they are the ones `horizons/requests.jsonl`
logged when each was fetched.
