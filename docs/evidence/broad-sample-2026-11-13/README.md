# Broad sample against JPL DE421, 13 November 2026

A read-only comparison of the engine with JPL DE421 on many more instants
than the preregistered calc corpus (`docs/evidence/calc-api/rc16`, 32
instants from 1802 to 2188). It changed no computed value, bound, output or
conformance vector. `summary.json` holds the per-body figures.

## What ran

- **Build:** the carried `artifacts/zodiacs-engine-1.1.0-rc.3.tgz` (source
  commit `cc910b3`; `src/` is unchanged at `bc0b5a7`), with
  astronomy-engine 2.1.19.
- **Reference:** JPL DE421, read with jplephem 2.24 and reduced with pyerfa
  2.0.1.5 to the apparent geocentric place: light time, solar deflection,
  annual aberration, then IAU 2006/2000A to the true ecliptic of date. Mars to
  Pluto are system barycentres, as in the conformance suite. Every reference
  evaluation uses the engine's own TT and UT1, so the differences are
  ephemeris and reduction only. Against the 140 committed Horizons DE441 L1
  vectors inside 1900 to 2050 the reference agrees within 0.008″ for the Sun
  to Saturn and 0.26″ for Uranus to Pluto.
- **Positions:** 1,711 instants per body. 604 from 1900 to 2050, four a year
  at seeded random days and seconds; 1,096 from 2020 to 2031, every four
  days; and 11 edge instants (1900-01-01, both sides of 1972-01-01 and of the
  2016 leap second, J2000, the end of the IERS table in October 2027,
  2030-12-31 and 2050-12-31).
- **Events:** the Sun's 1,812 sign changes from 1900 to 2050, the Moon's
  4,169 (2020 to 2031 and every tenth year from 1900 to 2050), 3,736 new and
  full Moons from 1900 to 2050 and 297 quarter Moons from 2020 to 2031. The
  reference finds its own events by a daily scan and bisection.

## What it found

Six of the published geocentric apparent position bounds and six of the speed
bounds, each the largest difference seen on the 32-instant corpus, are
exceeded somewhere in this sample: positions for Venus (20.54″ against 11″),
Mars (14.05″ against 6.6″), Saturn (21.96″ against 18″), Mercury (11.91″
against 9.3″), Jupiter (13.86″ against 13″) and the true node (19.2″ against
16″); speeds for the Moon (1.62 against 1.1″ a day), Saturn (0.043 against
0.03), Neptune (0.015 against 0.013), Venus (0.667 against 0.64), Mars (0.59
against 0.45) and Jupiter (0.062 against 0.061). `docs/calc.md` (Bounds)
gives them beside the published values.

The Sun's sign changes are within 50.3 s of DE421 (42.8 s from 2026 to 2030)
and the Moon's within 7.64 s, inside the 60 s and 15 s gates that
`docs/techniques.md` records.

## Limits

- The speeds compare the rate of longitude against a reference without solar
  deflection, the ephemeris's difference alone. With deflection, as Horizons
  applies it, the differences near conjunction with the Sun are larger,
  because the engine applies none (`docs/calc.md`).
- The true node is compared with the ascending node of the osculating
  geocentric orbit of the DE421 Moon. How that orbit's frame is taken moves
  the node by several arcseconds, so the 19.2″ is plausible, not confirmed.
- DE421 ends in 2053, so nothing here is outside 1900 to 2050.
- The comparison scripts are not in this repository; this folder records the
  method and the results.
