# The calc comparison rerun on 0.1.1-rc.16's build

The comparison `../PREREGISTRATION.md` fixes, rerun unchanged in method on the
integrated 0.1.1-rc.16 candidate after the engine took the full IAU 2000B
nutation (source commit `704cadc`, built with `npm run build`; its `dist/` was
copied aside before the run, SHA-256 of its sorted file digests
`c6df25f6…8b5100c26a`). The first run, on the build of `29679e8` with
astronomy-engine's five-term nutation, stays where it was: `../RESULTS.md` and
`../results/`. Nothing here overwrites it.

Environment: Node.js v22.22.2, Python 3.11.15, pyerfa 2.0.1.5 (ERFA 2.0.1),
numpy 2.4.6, the preregistration's. The Horizons responses are the committed
ones in `../horizons/`, unchanged (their SHA-256 are in `summary.json`,
`inputs`). `run.log` is the run's output.

```sh
export ZODIACS_ENGINE_DIST=<that build's dist> ENGINE_TILT_MODULE=<src/nutation.ts bundled> \
  CALC_API_RESULTS=docs/evidence/calc-api/rc16
node docs/evidence/calc-api/tools/engine_values.mjs > engine.json   # 11,439,117 bytes, SHA-256 1537e382…8668b12
python3 docs/evidence/calc-api/tools/compare.py engine.json        # summary.json
python3 docs/evidence/calc-api/tools/report.py                     # tables.md
python3 docs/evidence/calc-api/tools/diagnostics.py engine.json    # diagnostics.json
node docs/evidence/calc-api/tools/barycentre.mjs                   # barycentre.json
python3 docs/evidence/calc-api/tools/bounds.py                     # src/calc-bounds.ts
```

## What changed in the tools

Nothing in the method. The tools gained overrides whose defaults are the old
behaviour (`bounds.py --check` still passes against `../results/summary.json`
with them unset, and the old `src/calc-bounds.ts` is its output):
`ZODIACS_ENGINE_DIST` for the build, `CALC_API_RESULTS` for the results
directory, `CALC_API_NUTATION_VALUES` for D4's script, and
`ENGINE_TILT_MODULE`, a module whose `tilt(tt)` is the engine's own nutation
and obliquities. Up to 0.1.1-rc.15 the engine's own were astronomy-engine's
`e_tilt`, which the tools called; from 0.1.1-rc.16 they are
`src/nutation.ts`, bundled with esbuild from the same commit for C5b, D1 and
D4. `engine_values.mjs` and `barycentre.mjs` read an instant's UT1 from
`jdUt1`, the name 0.1.1-rc.16's calc vocabulary gives it (it was `jdUt`); the
first attempt of `barycentre.mjs` stopped on that name, and `run.log` keeps
it.

## Frame-transform consistency: 12 pass

| check | tolerance | first run, max | this run, max |
| --- | ---: | ---: | ---: |
| C1, x, y, z against lon, lat, dist | 1e-6″ | 3.1e-10″ | 3.2e-10″ PASS |
| C1dist | 1e-12 | 4.4e-16 | 4.4e-16 PASS |
| C2, frame bias | 1e-5″ | 2.7e-7″ | 2.7e-7″ PASS |
| C3, IAU 2006 precession | 1e-4″ | 6.4e-7″ | 6.4e-7″ PASS |
| C4, true against mean of date through ERFA's IAU 2006/2000A nutation | 5e-3″ | 0.200″ FAIL | 0.00230″ PASS |
| C5a, equator against ecliptic of date, ERFA's true obliquity | 5e-3″ | 0.062″ FAIL | 0.00176″ PASS |
| C5b, the same, the engine's own true obliquity | 1e-6″ | 3.3e-10″ | 3.9e-10″ PASS |
| C6, C7, C8, mean-of-date, J2000.0 and ICRS equator against ecliptic | 1e-6″ | 4.2e-10″ | 4.1e-10″ PASS |
| C9, true of date against J2000.0, the whole chain | 5e-3″ | 0.200″ FAIL | 0.00230″ PASS |
| C10, the true node, equator against ecliptic of date | 5e-3″ | 0.037″ FAIL | 0.00169″ PASS |

The four checks through the nutation, which failed on astronomy-engine's
five-term series, pass: what is left, up to 0.0023″ in longitude and
0.0018″ in obliquity, is IAU 2000B's own difference from IAU 2000A, which
ERFA's `nut06a` gives (D1 below).

## Against Horizons (DE441)

`tables.md` has every table. To the last digit the first run's tables show,
the true-of-date frames now give the figures of the other frames: over the
bodies pooled, geocentric and apparent, 3.00″ / 15.5″ / 24.6″ (median, 95th
percentile, maximum) in the true ecliptic of date against 2.99″ / 15.5″ /
24.5″ before, and in the ICRS equator 3.00″ / 15.5″ / 24.6″ in both runs;
heliocentric 2.95″ / 16.4″ / 24.3″ against 3.01″ / 16.4″ / 24.2″;
topocentric 1.29″ / 5.60″ / 7.70″ against 1.32″ / 5.67″ / 7.64″. The
mean-of-date, J2000.0 and ICRS figures move by at most 0.001″ (the
topocentric ones, whose observer is now turned by the engine's nutation). The angular rates of the outer planets shed the
nutation's rate error: geocentric and apparent, all frames pooled, Jupiter
0.060″ a day at most (0.082″ before), Saturn 0.030″ (0.049″), Uranus
0.019″ (0.043″), Neptune 0.013″ (0.051″), Pluto 0.014″ (0.045″).

The mean nodes and Black Moon Lilith, against their definitions on ERFA's
fundamental arguments: 0.0023″ at most in the true-of-date frames, where
ERFA's definition takes `nut06a`'s Δψ (0.199″ before), and 7.1 × 10⁻⁷″ at
most in the other six frames (6.9 × 10⁻⁷″ before). The true node against the
node of the osculating orbit of Horizons's Moon: 6.59″ median, 15.96″ at
worst in the true ecliptic of date (6.63″ and 15.81″ before), the same as in
the mean-of-date frames.

## The bounds

`src/calc-bounds.ts` is now `bounds.py`'s output from this run's
`summary.json`, and `src/calc-bounds.test.ts` checks it against that. Of 107
rows, 71 change and none rises: the rate bounds of every body whose rate
error the nutation dominated (for example geocentric and apparent Neptune
0.051 to 0.013″ a day, heliocentric Pluto 0.044 to 0.0017″ a day,
barycentric Jupiter 0.051 to 0.025″ a day), the mean nodes' and Lilith's
position bounds, 0.2 to 0.0023″, and their rate bounds, and a few position
bounds by one unit of the second figure (Venus heliocentric 6.7 to 6.6″,
Mercury geocentric 9.4 to 9.3″). The barycentric Sun's bounds are derived,
not measured, and do not change.

## Diagnostics (not preregistered)

- D1: the engine's nutation against ERFA's `nut00b` at the 32 instants:
  3.6e-15″ in Δψ and Δε (astronomy-engine's was 0.201″ and 0.067″ off); against
  `nut06a`, 0.00229″ and 0.00176″, exactly `nut00b`'s own difference. The mean
  obliquity is `obl06`'s to 2.9e-11″.
- D4: the same every 0.1 day from 1800 to 2200: at most 6.0e-11″ in Δψ and
  2.4e-11″ in Δε, the rounding of a Julian date near 2.4 million; the rates
  within 5.5e-9″ a day. astronomy-engine's was up to 0.270″, 0.087″ and
  0.079″ a day off. The engine's Δψ changes by up to 0.246″ a day.
- D2 and D3 (the barycentric Sun and the light path) and `barycentre.json`:
  unchanged; they involve no frame of date.
- Richardson's estimate of the differencing error: at most 1.2e-4″ a day for
  the geocentric apparent Moon (1.3e-4″ before), 0.094″ a day for the
  topocentric Moon, 3.3e-3″ a day for the astrometric Moon. Pluto's analytic
  speed against the derivative of its position: 0.00097″ a day, as before.
- Deviation 9 of the first run stands: the topocentric pins are Horizons's
  TDB − UT, which from 1962 is TDB − UTC, and a pinned ΔT on a TT Julian date
  makes the engine's UT1 that UTC. Moving the pin by UT1 − UTC moves the
  topocentric positions by up to 0.0704″ (0.0704″ before).
