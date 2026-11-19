# The dense DE440 sweep: report

Engine @zodiacs/engine 1.1.0-rc.3 (commit `3cb8aee8f68f766df99a95293a7a29c17928dc21`) against NAIF's `de440.bsp` (SHA-256 `a4ce9bf9b3282becc9f4b2ac3cebe03a2ae7599981aabd7265fd8482fff7c4b5`), geocentric, at 146,097 instants: noon TT of every day from 1800-01-01 to 2199-12-31. Workflow run 43037857931 (attempt 1) of `zodiacs-org/engine`. Written by `tools/dry_run.py`; the method is `PLAN.md`'s, every table is in `tables.md`, and every number here is in `summary.json`.

## The largest differences, beside the review's and the limits a receipt quotes now

Arcseconds. "Longitude" is the difference of the apparent ecliptic longitudes of date, which is what a zodiac position is; "any frame" is the largest angle between the two directions over all eight frames, which is what the bounds rule takes. The review's figures are the ones ZOD-65 quotes, measured on 1.1.0-rc.2; its data is not in this repository. The limit now is `src/calc-bounds.ts`, from 32 instants against Horizons (DE441).

| body | review, as quoted | sweep, longitude | sweep, any frame | limit now | limit by the same rule from the sweep |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sun | 2.4 | 2.38 | 3.33 | 3 | 3.4 |
| Moon | 12 | 11.92 | 11.88 | 8.3 | 12 |
| Mercury |  | 14.12 | 16.91 | 9.3 | 17 |
| Venus | 22.9 | 22.91 | 23.31 | 11 | 24 |
| Mars |  | 14.32 | 22.91 | 6.6 | 23 |
| Jupiter |  | 10.64 | 16.81 | 13 | 17 |
| Saturn |  | 13.09 | 23.21 | 18 | 24 |
| Uranus |  | 12.08 | 19.64 | 20 | 20 |
| Neptune |  | 19.71 | 21.28 | 21 | 22 |
| Pluto | 29.2 | 29.19 | 29.86 | 25 | 30 |
| North Node | 32.4 | 32.64 | 32.64 | 16 | 33 |

## The 30 arcsecond sentence

Over the 146,097 instants the largest difference in apparent ecliptic longitude of date among the Sun, the Moon and Mercury to Pluto is 29.19 arcseconds (Pluto); with the Sun's light deflection in the reference, which the engine's apparent place leaves out, 29.19 arcseconds (Pluto). Both are within 30 arcseconds. The true node's largest is 32.64 arcseconds, over 30. Mars to Pluto are the planets' system barycentres, on both sides.

## The self-checks

- S1: apparent places with deflection, and the osculating node, formed here from the kernel, against the ERFA chain's oracles (docs/evidence/de440-20261110/oracles/), angle between directions; the node as a longitude difference. Largest 0.00291469 arcseconds, gate 0.01: PASS.
- S2: geocentric ICRF vectors formed here from the kernel (DE440) against Horizons's committed vectors (DE441, docs/evidence/calc-api/horizons/) at the 32 instants of docs/evidence/calc-api/PREREGISTRATION.md. Largest 0.0216393 arcseconds, gate 0.05: PASS.

## The dry run

The unmodified `docs/evidence/calc-api/tools/bounds.py --check`, with `CALC_API_RESULTS` naming these results, says:

```
exit status 1
src/calc-bounds.ts differs from <RESULTS_DIR>/summary.json; run tools/bounds.py
```

That tool writes the whole table from one summary, and this summary holds the geocentric rows only, so its output says that the file would differ and not how. Row by row, by the preregistered rule (the largest over every instant and frame, rounded up to two significant figures): of the 32 rows swept, 32 would change, and no value would fall. The 75 rows not swept (heliocentric, barycentric, topocentric, the mean points) would stay as they are. `calc-bounds.dry-run.diff` is the same change as a diff of the file's numbers.

| row | position, arcseconds: now | from the sweep | relative distance: now | from the sweep | rate, arcseconds a day: now | from the sweep | change |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| geocentric/apparent/Jupiter | 13 | 17 | 4.7e-05 | 7.9e-05 | 0.061 | 0.11 | position up, relative distance up, rate up |
| geocentric/apparent/Mars | 6.6 | 23 | 5.8e-05 | 8.7e-05 | 0.45 | 0.74 | position up, relative distance up, rate up |
| geocentric/apparent/Mercury | 9.3 | 17 | 3.6e-05 | 7.8e-05 | 2.2 | 3.6 | position up, relative distance up, rate up |
| geocentric/apparent/Moon | 8.3 | 12 | 0.00014 | 0.00015 | 1.1 | 2.9 | position up, relative distance up, rate up |
| geocentric/apparent/Neptune | 21 | 22 | 4.2e-05 | 4.7e-05 | 0.013 | 0.019 | position up, relative distance up, rate up |
| geocentric/apparent/North Node | 16 | 33 | none | not measured | none | not measured | position up |
| geocentric/apparent/Pluto | 25 | 30 | 6.3e-05 | 6.3e-05 | 0.014 | 0.018 | position up, rate up |
| geocentric/apparent/Saturn | 18 | 24 | 6.8e-05 | 7.7e-05 | 0.03 | 0.06 | position up, relative distance up, rate up |
| geocentric/apparent/South Node | 16 | 33 | none | not measured | none | not measured | position up |
| geocentric/apparent/Sun | 3 | 3.4 | 1.5e-05 | 1.7e-05 | 0.18 | 0.24 | position up, relative distance up, rate up |
| geocentric/apparent/Uranus | 20 | 20 | 4.2e-05 | 5.6e-05 | 0.02 | 0.03 | relative distance up, rate up |
| geocentric/apparent/Venus | 11 | 24 | 3.2e-05 | 8.3e-05 | 0.64 | 1.4 | position up, relative distance up, rate up |
| geocentric/astrometric/Jupiter | 13 | 17 | 4.7e-05 | 7.9e-05 | 0.061 | 0.11 | position up, relative distance up, rate up |
| geocentric/astrometric/Mars | 6.6 | 23 | 5.8e-05 | 8.7e-05 | 0.45 | 0.74 | position up, relative distance up, rate up |
| geocentric/astrometric/Mercury | 9.3 | 17 | 3.6e-05 | 7.8e-05 | 2.2 | 3.6 | position up, relative distance up, rate up |
| geocentric/astrometric/Moon | 7.6 | 12 | 3.6e-05 | 4.8e-05 | 1.1 | 2.9 | position up, relative distance up, rate up |
| geocentric/astrometric/Neptune | 21 | 22 | 4.2e-05 | 4.7e-05 | 0.013 | 0.019 | position up, relative distance up, rate up |
| geocentric/astrometric/Pluto | 25 | 30 | 6.3e-05 | 6.3e-05 | 0.014 | 0.018 | position up, rate up |
| geocentric/astrometric/Saturn | 18 | 24 | 6.8e-05 | 7.7e-05 | 0.03 | 0.06 | position up, relative distance up, rate up |
| geocentric/astrometric/Sun | 3 | 3.4 | 1.5e-05 | 1.7e-05 | 0.18 | 0.24 | position up, relative distance up, rate up |
| geocentric/astrometric/Uranus | 20 | 20 | 4.2e-05 | 5.6e-05 | 0.02 | 0.03 | relative distance up, rate up |
| geocentric/astrometric/Venus | 11 | 24 | 3.2e-05 | 8.3e-05 | 0.64 | 1.4 | position up, relative distance up, rate up |
| geocentric/geometric/Jupiter | 13 | 17 | 4.7e-05 | 7.9e-05 | 0.061 | 0.11 | position up, relative distance up, rate up |
| geocentric/geometric/Mars | 6.6 | 23 | 5.8e-05 | 8.7e-05 | 0.45 | 0.74 | position up, relative distance up, rate up |
| geocentric/geometric/Mercury | 9.3 | 17 | 3.6e-05 | 7.8e-05 | 2.2 | 3.6 | position up, relative distance up, rate up |
| geocentric/geometric/Moon | 7.6 | 12 | 3.6e-05 | 4.8e-05 | 0.97 | 2.9 | position up, relative distance up, rate up |
| geocentric/geometric/Neptune | 21 | 22 | 4.2e-05 | 4.7e-05 | 0.013 | 0.019 | position up, relative distance up, rate up |
| geocentric/geometric/Pluto | 25 | 30 | 6.3e-05 | 6.3e-05 | 0.014 | 0.018 | position up, rate up |
| geocentric/geometric/Saturn | 18 | 24 | 6.8e-05 | 7.7e-05 | 0.03 | 0.06 | position up, relative distance up, rate up |
| geocentric/geometric/Sun | 3 | 3.4 | 1.5e-05 | 1.7e-05 | 0.18 | 0.24 | position up, relative distance up, rate up |
| geocentric/geometric/Uranus | 20 | 20 | 4.2e-05 | 5.6e-05 | 0.02 | 0.03 | relative distance up, rate up |
| geocentric/geometric/Venus | 11 | 24 | 3.2e-05 | 8.3e-05 | 0.64 | 1.4 | position up, relative distance up, rate up |
