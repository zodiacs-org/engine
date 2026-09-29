# House positions, co-ascendants, speeds and planetary returns: evidence

2026-09-29. Branch `feature-houses-extra`, made from `rc15-work` at
`eb58011` (the 0.1.1-rc.15 candidate). The version is unchanged,
`CHANGELOG.md` has an *Unreleased* entry, and nothing was pushed, packed into
`artifacts/` or published. User documentation: [`docs/houses.md`](../../houses.md).

**What was added.**

- `src/houses-extra.ts`, the new entry point `@zodiacs/engine/houses`:
  `housePosition`, `coAscendants`, `houseSpeeds` and `SIDEREAL_RATE`. One
  file that imports no other module at run time.
- `src/timing/planetary-returns.ts`, exported from `@zodiacs/engine/timing`:
  `planetaryReturns`, `RETURN_BODIES`, `RETURN_STEP_DAYS`. Timing already
  carries the core's graph, so the returns cost only their own code there;
  in the houses entry they would have brought the whole ephemeris with them.
- Tests: `src/houses-extra.test.ts` (22) and
  `src/timing/planetary-returns.test.ts` (36), with the Horizons fixture
  `src/timing/fixtures/planetary-returns-horizons.json`.
- `package.json` (the `./houses` export and the tsup entry),
  `scripts/verify-package-contents.mjs` (its budget),
  `scripts/module-resolution-smoke.mjs` and
  `scripts/verify-packed-consumer.mjs` (checks of both additions),
  `typedoc.json` (the new entry), `docs/houses.md`, `README.md` (two
  paragraphs), `CHANGELOG.md` (*Unreleased*).

No existing module under `src/` changed except `src/timing.ts`, which gains
the new exports and a sentence in its header.

**Use of Swiss Ephemeris.** Swiss Ephemeris 2.10.03 (pyswisseph 2.10.03) was
run only as a comparison instrument, through the tools below. Its values stay
in memory; the committed files hold verdicts, counts and summary statistics.
No constant, tolerance or test expectation was taken from it. Where this
README or `docs/houses.md` quotes Swiss Ephemeris's documentation, it says so.

**Synthetic data.** Every natal chart in the tests, fixtures and documents is
invented. For the return fixtures the natal instants were chosen from JPL
Horizons's longitudes (below); the places are made up.

**Preregistration.** [`PREREGISTRATION.md`](PREREGISTRATION.md) was
committed (`8eb7c9c`) before any code was written or any measurement run. It
fixes the grids, the methods, the tolerances and what counts as a failure. No
gate was changed afterwards.

## Verdicts

| Gate | Verdict |
| --- | --- |
| P: house position within 0.01″ of `swe_house_pos`, L and G, polar status agreeing | **Pass for 11 of 13 systems. Fail: Porphyry** (11 cases of G), **Topocentric** (444 of L, 301 of G, and 519 and 979 cases undefined in the engine alone) |
| A: co-ascendants and polar ascendant within 0.01″ of `ascmc[4..7]` | **Pass**: all four points, both grids, largest 0.0000000047″ |
| S: speeds against `swe_houses_armc_ex2` at 0.004°/day + 10⁻⁶ \|v\| | **Pass** for the ascendant, the midheaven and 8 systems; **fail** for Koch, Placidus, Porphyry, whole sign, and Alcabitius (5 cases of G) |
| F: speeds against a central difference of the engine's own cusps, same tolerance | **Pass**, every system, both grids; largest 0.000348° a day |
| R: planetary returns against JPL Horizons and USNO, verdict on every result | **Pass**, all 10 bodies and the USNO fixture |
| B: root graph unchanged; budgets | **Pass**: the root's 11 files byte-identical (95,273 bytes); `./houses` 13,606 of 15,000; `./timing` 114,646 of 120,000; package 661,209 of 700,000 bytes |

The failures of S are the instrument's: Swiss's speeds disagree with a
central difference of Swiss's own cusps in exactly the same values, checked
value by value (the diagnostics below), while the engine's agree with a
central difference of its own (gate F). The failures of P are explained in
*Diagnostics*.

## Two rounds of gate P

The first run of the measurement (round 1, `results/round-1-swiss.json`,
`results/round-1-finite-difference.json`) was made with Koch undefined for
every body or midheaven that never rises or sets, and Topocentric clamped to
the nearest circle for a circumpolar body that no circle reaches. Round 1
failed gate P for Koch on polar status (L: 2,670 cases undefined in the
engine alone and 4,845 in Swiss alone; G: 2,314 and 1,160), for Topocentric
(963 and 1,280 cases over 0.01″, up to 51.7°) and for Porphyry (11 cases of
G). Gates A, S and F gave the same results as in round 2.

The diagnostic below showed that Swiss's Koch statuses follow exactly one
rule: a position exists where the body's rising (or setting) sidereal time
falls within the midheaven's diurnal semi-arc of the RAMC, the semi-arcs of
bodies and midheavens that never rise or set being taken as Ludwig's, 180° or
0°. That is how Swiss Ephemeris's general documentation §6.5 describes Koch
positions ("For some bodies it may work even beyond the polar circle, but for
some it may fail even for latitudes beyond 60 degrees"), and it is the
geometry of the system, whose house circles are the horizons between the
rising of the midheaven's degree and of the imum coeli's. Round 2 implements
that reading, and a Topocentric position of `null` where no circle of the
family reaches a circumpolar body instead of the arbitrary clamp.
[`round-1-to-2.patch`](round-1-to-2.patch) is the whole change to
`src/houses-extra.ts` from round 1 to the final code (round 1's source,
rebuilt, gives round 1's counts of undefined positions exactly). One further
change came after round 2: a longitude already in [0°, 360°) is no longer
normalized, which added 360° and could round it; positions moved by about
10⁻¹³°, and some of the statistics below 10⁻⁹″ with them. The results here
are the final code's. The tolerances, grids and criteria are the
preregistered ones throughout.

Every result file here but the two of round 1 is reproduced byte for byte by
rerunning its tool on the final build.

## Results

The grids (`tools/grids.mjs`): **L**, every 0.1° of latitude from 55° to
66.6° in both hemispheres at 24 sidereal times, obliquity 23.4392911°, 8
bodies a case (5,616 cases, 44,928 bodies); **G**, 20,000 draws of mulberry32
(seed 20260929) over latitudes −89.9° to 89.9°, all sidereal times,
obliquities 23.41° to 23.47° and one body of latitude −20° to 20°.

### Gate P (results/swiss.json)

Arcseconds of mundane position. n: positions compared; undefined: both sides / engine only / Swiss only.

| System | L n | L median | L 95% | L max | L over | L undefined | G n | G median | G 95% | G max | G over | G undefined | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | --- | --- |
| alcabitius | 44,928 | 0 | 2.05e-10 | 1.84e-09 | 0 | 0 / 0 / 0 | 20,000 | 0 | 3.07e-10 | 4.64e-07 | 0 | 0 / 0 / 0 | pass |
| campanus | 44,928 | 0.001 | 0.001 | 0.001 | 0 | 0 / 0 / 0 | 20,000 | 0.001 | 0.001 | 0.001 | 0 | 0 / 0 / 0 | pass |
| equal | 44,928 | 0.001 | 0.001 | 0.001 | 0 | 0 / 0 / 0 | 20,000 | 0.001 | 0.001 | 0.001 | 0 | 0 / 0 / 0 | pass |
| equal-mc | 44,928 | 0.001 | 0.001 | 0.001 | 0 | 0 / 0 / 0 | 20,000 | 0.001 | 0.001 | 0.001 | 0 | 0 / 0 / 0 | pass |
| koch | 37,413 | 0.001 | 0.001 | 0.001 | 0 | 7,515 / 0 / 0 | 16,502 | 0.001 | 0.001 | 0.001 | 0 | 3,498 / 0 / 0 | pass |
| meridian | 44,928 | 0 | 2.05e-10 | 2.05e-10 | 0 | 0 / 0 / 0 | 20,000 | 0 | 2.05e-10 | 4.09e-10 | 0 | 0 / 0 / 0 | pass |
| morinus | 44,928 | 0 | 2.05e-10 | 2.05e-10 | 0 | 0 / 0 / 0 | 20,000 | 0 | 2.05e-10 | 4.09e-10 | 0 | 0 / 0 / 0 | pass |
| placidus | 44,928 | 0.001 | 0.001 | 0.001 | 0 | 0 / 0 / 0 | 20,000 | 0.001 | 0.001 | 0.001 | 0 | 0 / 0 / 0 | pass |
| porphyry | 44,928 | 0.000831 | 0.00201 | 0.00881 | 0 | 0 / 0 / 0 | 20,000 | 0.00096 | 0.00149 | 0.0507 | 11 | 0 / 0 / 0 | **fail** |
| regiomontanus | 44,928 | 0.001 | 0.001 | 0.001 | 0 | 0 / 0 / 0 | 20,000 | 0.001 | 0.001 | 0.001 | 0 | 0 / 0 / 0 | pass |
| topocentric | 44,409 | 0.00187 | 0.00618 | 0.145 | 444 | 0 / 519 / 0 | 19,021 | 0.00167 | 0.00566 | 0.465 | 301 | 0 / 979 / 0 | **fail** |
| vehlow | 44,928 | 0.001 | 0.001 | 0.001 | 0 | 0 / 0 / 0 | 20,000 | 0.001 | 0.001 | 0.001 | 0 | 0 / 0 / 0 | pass |
| whole | 44,928 | 0.001 | 0.001 | 0.001 | 0 | 0 / 0 / 0 | 20,000 | 0.001 | 0.001 | 0.001 | 0 | 0 / 0 / 0 | pass |

### Gate P, round 1 (results/round-1-swiss.json), the systems that changed or failed

| System | L max | L over | L undefined | G max | G over | G undefined |
| --- | ---: | ---: | --- | ---: | ---: | --- |
| koch | 0.001 | 0 | 2,670 / 2,670 / 4,845 | 0.001 | 0 | 2,338 / 2,314 / 1,160 |
| porphyry | 0.00881 | 0 | 0 / 0 / 0 | 0.0507 | 11 | 0 / 0 / 0 |
| topocentric | 3.26e+04 | 963 | 0 / 0 / 0 | 1.86e+05 | 1280 | 0 / 0 / 0 |

### Gate A (results/swiss.json)

| Point | L median | L 95% | L max | L over | G median | G 95% | G max | G over |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Equatorial ascendant | 0 | 2.05e-10 | 2.05e-10 | 0 | 0 | 2.05e-10 | 3.07e-10 | 0 |
| Koch's co-ascendant | 0 | 4.09e-10 | 8.19e-10 | 0 | 0 | 4.09e-10 | 4.71e-09 | 0 |
| Munkasey's co-ascendant | 0 | 2.05e-10 | 3.07e-10 | 0 | 0 | 2.05e-10 | 1.94e-09 | 0 |
| Polar ascendant | 0 | 3.07e-10 | 8.19e-10 | 0 | 0 | 2.05e-10 | 4.71e-09 | 0 |

### Gate S (results/swiss.json)

Degrees per day. |Δ|: per case, the largest of the twelve cusps; rel: |Δ| / |v′| per value; over: values over the tolerance (cases in brackets).

| System | L median | L max | L rel max | L over | G median | G max | G rel max | G over | undefined (both) | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| alcabitius | 1.24e-07 | 0.000208 | 2.16e-07 | 0 (0) | 1.21e-07 | 0.85 | 6.49e-05 | 42 (5) | 0 / 0 | **fail** |
| campanus | 1.14e-13 | 2.73e-12 | 1.76e-14 | 0 (0) | 1.14e-13 | 3.2e-10 | 6.16e-14 | 0 (0) | 0 / 0 | pass |
| equal | 2.84e-14 | 2.73e-12 | 1.76e-14 | 0 (0) | 2.84e-14 | 3.2e-10 | 6.16e-14 | 0 (0) | 0 / 0 | pass |
| equal-mc | 5.68e-14 | 1.14e-13 | 3.23e-16 | 0 (0) | 5.68e-14 | 2.27e-13 | 6.6e-16 | 0 (0) | 0 / 0 | pass |
| koch | 159 | 1.11e+04 | 0.665 | 44,544 (5,568) | 43.4 | 1.23e+04 | 0.666 | 118,504 (14,815) | 48 / 5,183 | **fail** |
| meridian | 1.27e-07 | 1.27e-07 | 3.25e-10 | 0 (0) | 1.26e-07 | 1.41e-07 | 3.58e-10 | 0 (0) | 0 / 0 | pass |
| morinus | 1.25e-07 | 1.27e-07 | 3.25e-10 | 0 (0) | 1.27e-07 | 1.38e-07 | 3.51e-10 | 0 (0) | 0 / 0 | pass |
| placidus | 11.5 | 399 | 0.683 | 44,544 (5,568) | 0.364 | 494 | 1.04 | 93,984 (12,842) | 48 / 5,183 | **fail** |
| porphyry | 147 | 1.21e+03 | 34.8 | 22,464 (5,616) | 100 | 4.16e+04 | 8.14e+03 | 80,000 (20,000) | 0 / 0 | **fail** |
| regiomontanus | 1.14e-13 | 2.73e-12 | 1.76e-14 | 0 (0) | 1.14e-13 | 3.07e-09 | 3.95e-12 | 0 (0) | 0 / 0 | pass |
| topocentric | 1.14e-13 | 2.73e-12 | 1.76e-14 | 0 (0) | 1.14e-13 | 3.2e-10 | 7.11e-12 | 0 (0) | 0 / 0 | pass |
| vehlow | 2.84e-14 | 2.73e-12 | 1.76e-14 | 0 (0) | 2.84e-14 | 3.2e-10 | 6.16e-14 | 0 (0) | 0 / 0 | pass |
| whole | 383 | 1.55e+03 | 1 | 22,464 (5,616) | 379 | 4.2e+04 | 1 | 80,000 (20,000) | 0 / 0 | **fail** |
| asc | 2.84e-14 | 2.73e-12 | 1.76e-14 | 0 | 2.84e-14 | 3.2e-10 | 6.16e-14 | 0 | — | pass |
| mc | 5.68e-14 | 1.14e-13 | 3.23e-16 | 0 | 5.68e-14 | 2.27e-13 | 6.6e-16 | 0 | — | pass |

Swiss's RAMC speed differs from 360.98564736629° a day by 8.67e-11 of it; every case was rescaled (25,616, none unscaled).

### Gate F (results/finite-difference.json)

| System | L n | L median | L 95% | L max | L over | G n | G median | G 95% | G max | G over | fell back (L / G) | void | Verdict |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: | --- |
| alcabitius | 67,392 | 1.98e-08 | 5.66e-08 | 1.4e-07 | 0 | 240,000 | 2.12e-08 | 7.53e-08 | 0.000348 | 0 | 0 / 0 | 0 | pass |
| campanus | 67,392 | 1.81e-08 | 5.22e-08 | 1.36e-07 | 0 | 240,000 | 1.89e-08 | 5.46e-08 | 6.23e-07 | 0 | 0 / 0 | 0 | pass |
| equal | 67,392 | 1.84e-08 | 5.24e-08 | 9.82e-08 | 0 | 240,000 | 1.86e-08 | 5.35e-08 | 1.22e-06 | 0 | 0 / 0 | 0 | pass |
| equal-mc | 67,392 | 1.29e-08 | 5.03e-08 | 5.03e-08 | 0 | 240,000 | 1.73e-08 | 5.23e-08 | 1.08e-07 | 0 | 0 / 0 | 0 | pass |
| koch | 66,816 | 1.98e-08 | 5.8e-08 | 2.2e-06 | 0 | 177,804 | 1.96e-08 | 5.79e-08 | 1.73e-06 | 0 | 48 / 5,183 | 0 | pass |
| meridian | 67,392 | 1.29e-08 | 5.03e-08 | 5.03e-08 | 0 | 240,000 | 1.63e-08 | 5.18e-08 | 1.3e-07 | 0 | 0 / 0 | 0 | pass |
| morinus | 67,392 | 1.29e-08 | 5.03e-08 | 7.45e-08 | 0 | 240,000 | 1.65e-08 | 5.2e-08 | 1.2e-07 | 0 | 0 / 0 | 0 | pass |
| placidus | 66,816 | 2.27e-08 | 8.2e-08 | 5.55e-05 | 0 | 177,804 | 2.14e-08 | 6.77e-08 | 0.000231 | 0 | 48 / 5,183 | 0 | pass |
| porphyry | 67,392 | 1.9e-08 | 5.5e-08 | 1.12e-07 | 0 | 240,000 | 1.95e-08 | 5.78e-08 | 1.22e-06 | 0 | 0 / 0 | 0 | pass |
| regiomontanus | 67,392 | 1.79e-08 | 5.03e-08 | 1.31e-07 | 0 | 240,000 | 1.86e-08 | 5.43e-08 | 2.47e-06 | 0 | 0 / 0 | 0 | pass |
| topocentric | 67,392 | 1.76e-08 | 5.08e-08 | 1.29e-07 | 0 | 240,000 | 1.86e-08 | 5.43e-08 | 6.23e-07 | 0 | 0 / 0 | 0 | pass |
| vehlow | 67,392 | 1.84e-08 | 5.22e-08 | 9.82e-08 | 0 | 240,000 | 1.85e-08 | 5.34e-08 | 1.22e-06 | 0 | 0 / 0 | 0 | pass |
| whole | 67,392 | 0 | 0 | 0 | 0 | 240,000 | 0 | 0 | 0 | 0 | 0 / 0 | 0 | pass |
| asc | 5,616 | 1.55e-08 | 4.68e-08 | 9.64e-08 | 0 | 20,000 | 1.59e-08 | 4.86e-08 | 1.22e-06 | 0 | 0 / 0 | 0 | pass |
| mc | 5,616 | 1.29e-08 | 5.03e-08 | 5.03e-08 | 0 | 20,000 | 1.57e-08 | 4.98e-08 | 8.45e-08 | 0 | 0 / 0 | 0 | pass |

### Diagnostic: Swiss's speeds against a central difference of Swiss's own cusps (results/swiss-self-difference.json)

| System | L over | L rel median | L rel max | G over | G rel median | G rel max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| alcabitius | 0 | 2.09e-10 | 2.16e-07 | 42 | 2.25e-10 | 6.5e-05 |
| campanus | 0 | 2.89e-11 | 3.91e-10 | 0 | 2.93e-11 | 1.27e-06 |
| equal | 0 | 3.99e-11 | 3.91e-10 | 0 | 4.27e-11 | 1.27e-06 |
| equal-mc | 0 | 2.99e-11 | 1.68e-10 | 0 | 2.69e-11 | 2.89e-10 |
| koch | 44,544 | 0.172 | 1.98 | 118,504 | 0.0259 | 1.99 |
| meridian | 0 | 2.04e-10 | 3.03e-10 | 0 | 2.12e-10 | 5.36e-10 |
| morinus | 0 | 2.2e-10 | 3.79e-10 | 0 | 2.2e-10 | 6.24e-10 |
| placidus | 44,544 | 0.0054 | 0.406 | 93,984 | 2.35e-05 | 0.509 |
| porphyry | 22,464 | 4.85e-11 | 1.65 | 80,000 | 5.58e-11 | 2.8e+03 |
| regiomontanus | 0 | 2.94e-11 | 3.91e-10 | 0 | 3.17e-11 | 1.59e-06 |
| topocentric | 0 | 2.87e-11 | 3.91e-10 | 0 | 3.1e-11 | 1.27e-06 |
| vehlow | 0 | 4.02e-11 | 3.91e-10 | 0 | 4.31e-11 | 1.27e-06 |
| whole | 22,464 | 0 | ∞ | 80,000 | 0 | ∞ |

∞: in 22,464 values of L and 80,000 of G (`relInfinite`), Swiss's whole-sign speed is not 0 where a central difference of its cusps is.

### Gate R (results/returns.json)

| Body | Status | Returns (Horizons) | Directions agree | Largest \|t − t_H\| | As motion, largest | τ | Natal longitude − Horizons's | Verdict |
| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | --- |
| Sun | complete | 3 (3) | yes | 19.9 s | 0.84″ | 6″ | -0.114″ | pass |
| Moon | complete | 4 (4) | yes | 1.6 s | 0.815″ | 8″ | -0.154″ | pass |
| Mercury | complete | 3 (3) | yes | 50.7 s | 2.541″ | 45″ | 4.399″ | pass |
| Venus | complete | 3 (3) | yes | 223.2 s | 5.958″ | 45″ | -0.528″ | pass |
| Mars | complete | 3 (3) | yes | 1,013.4 s | 11.778″ | 45″ | -0.551″ | pass |
| Jupiter | complete | 3 (3) | yes | 438 s | 2.868″ | 45″ | -2.734″ | pass |
| Saturn | complete | 3 (3) | yes | 1,626.8 s | 5.708″ | 45″ | -4.405″ | pass |
| Uranus | complete | 3 (3) | yes | 542.1 s | 1.192″ | 45″ | 0.858″ | pass |
| Neptune | complete | 3 (3) | yes | 2,409.5 s | 3.194″ | 45″ | -1.607″ | pass |
| Pluto | complete | 3 (3) | yes | 25,650.9 s | 22.578″ | 45″ | 17.525″ | pass |

USNO: status complete, 4 returns, differences from the published equinoxes -22.3, -14.2, 11, -49.4 s against 210 s: pass.

## Diagnostics

Not preregistered; they explain the failures above. `tools/diagnose-swiss.py`
→ `results/diagnostics.json`; `tools/swiss-self-difference.py` →
`results/swiss-self-difference.json`; `tools/speed-flags.py` →
`results/speed-flags.json`.

- **Koch.** Of the bodies whose semi-arc and the midheaven's exist, Swiss
  gives a position to all 48,931 that lie within the house circles and to
  none of the 6,005 outside. Of the rest (a body or midheaven that never rises
  or sets), Swiss gives one to all 4,984 within the circles with Ludwig's
  semi-arcs, each within 0.01″ of that formula, and to none of the 5,008
  outside.
- **Topocentric.** For bodies that rise and set (55,997 on both grids), the
  engine's positions satisfy the equation of the circle of their position to
  1.13 × 10⁻⁹″ of ascension (median 4.6 × 10⁻¹¹″); Swiss's leave a median of
  0.00205″ and up to 0.445″. At the cusps themselves (ecliptic points at the
  start of each house, 4,284) the two agree to 1.23 × 10⁻⁹″; an eighth, a
  quarter, half and three quarters of the way through a house they differ by a
  median of 0.00163″ to 0.00173″ and up to 0.0284″. Swiss's positions are near
  the exact solution, not on it.
- **Porphyry.** The exact positions of each body's longitude plus 0.001″
  reproduce Swiss's to 5.01 × 10⁻⁹″ (64,928 bodies). The 11 cases over 0.01″
  are those whose smaller quadrant is 1.78° to 8.67° wide, where the 0.001″
  added before dividing the quadrant is magnified.
- **Speeds.** Swiss's speeds against a central difference of Swiss's own
  cusps (`swe_houses_armc` at RAMC ± 0.001°, Richardson), same tolerance:
  over it in exactly the values where the engine and Swiss disagree (Koch
  44,544 and 118,504; Placidus 44,544 and 93,984; Porphyry 22,464 and 80,000;
  whole sign 22,464 and 80,000; Alcabitius 0 and 42), and within it for every
  other system. `results/speed-flags.json` classifies each value: over in
  both comparisons in those numbers, over in one only in none, and no value
  left without a difference.

## Planetary returns

The Horizons fixtures (`tools/horizons-select.py`, `tools/horizons-returns.py`,
`tools/horizons.py`; `results/horizons-select.txt`): for Mercury to Pluto, the
stations of a retrograde loop in a later year were read from Horizons's daily
longitudes, and the natal instant is the minute, in an earlier year, at which
the body stood at the loop's middle degree. The loops are 2.22° (Pluto) to
16.18° (Venus) wide, so the natal degree is at least 1.1° from either station,
beyond the 0.1° the preregistration asks. The Sun's and the Moon's natal
instants are made up. Each crossing's instant is the root of the 4-point
Lagrange interpolant of Horizons's hourly (Moon: five-minute) longitudes,
bisected to a millisecond; the rows used are kept in the fixture.

`tools/returns-report.mjs` → `results/returns.json` gives, for each return,
the engine's difference from Horizons's instant in seconds and as motion
(|Δt| |v|). τ comes from the engine's measured ephemeris errors (the
preregistration): the pass needs every return found with its direction and
within τ.

The consistency checks in `src/timing/planetary-returns.test.ts` set the
returns against a plain scan of the engine's own longitudes at 0.005 day (the
Moon) and 0.02 day (the rest) over each fixture's window, every sign change
bisected to the millisecond: the same returns, within 1 s. Near a station a
plain scan at a fixed step can miss two returns minutes apart, so for
natal degrees placed 10⁻³° to 10⁻⁶° inside a station of each of Mercury to
Pluto (found on the engine's longitudes by golden-section search) the
reference returns are bisected on each side of the station instead: the
search finds both, within 1 s, and finds none for the same degrees outside the
station.

`tools/stations.mjs` → `results/stations.json`: over 1800–2200 at a
quarter-day step on the engine's longitudes, the shortest time between two
consecutive stations is 19.75 days (Mercury), 40.75 (Venus), 59.75 (Mars),
117.25 (Jupiter), 133.5 (Saturn), 149 (Uranus), 156.25 (Neptune) and 156
(Pluto); two of each body's default steps (4, 8 and 10 days) are shorter. The
fastest motion is 15.396° a day (Moon), so one step never moves a body 90°.

## Bundles and existing behaviour

- `root-graph.log`: the root entry's 11 files, built from `rc15-work` and
  from this branch, are byte-identical, 95,273 bytes. The houses entry
  imports nothing, so no chunk the root loads changes. An earlier trial that
  imported `houses.ts` split the chunk of `signs.ts`, `aspects.ts` and
  `types.ts` and grew the root's graph; that is why the new entry
  carries its own ascendant, midheaven and oblique-ascension expressions,
  which `src/houses-extra.test.ts` checks against the root's (the cusps of
  every system at whole house positions, the equatorial ascendant equal to
  `eastPointOf`).
- The bundler lists the chunk imports of `dist/geo.js` in another order
  (same files, same size) and re-splits the declaration chunks the entries
  share: `dist/index.d.ts` imports the same house types from a new
  `houses-*.d.ts`.
- `./timing` grows by 2,161 bytes, to 114,646 of its 120,000; no budget or
  cap was raised.
- Every existing test passes unchanged (the environment note below aside).

## Gates

`gates.log` (summary) and `full-tests.log`, on Node 22.22.2 with
`TMPDIR` = the session's `scratchpad/isolated-tmp`:

| Command | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm test` | 3,118 passed; 23 failed, all in `scripts/verify-archive-binding.test.mjs` (environment, below) |
| `npm run build` | pass |
| `npm run exports:smoke` | pass |
| `npm run package:contents` | pass: 57 files, 661,209 bytes unpacked of 700,000 |
| `npm run pack:dry-run` | pass: 185.5 kB packed, 57 files |
| `npm run docs` | the five warnings rc.15 has; none new |

**Environment.** The scratchpad holds `node_modules`, a symbolic link to the
site repository's, so it lies above the prescribed `TMPDIR`. The archive-binding
check refuses such a `TMPDIR` by design, and its 23 tests fail; on the
unchanged `rc15-work` tree, under the same `TMPDIR`, the same 23 fail
(`archive-binding-environment.log`). The packed-consumer check refuses it too.
A copy of `scripts/verify-packed-consumer.mjs` with only its two
environment checks removed (the `TMPDIR` ancestry, and that `react` and
`@zodiacs/sdk` do not resolve) passed on the packed branch, the new checks
of both additions included (`packed-consumer-local.log`). Neither is a
substitute for CI's clean run.

## Rerun

From the repository root, after `npm ci` and `npm run build`, with
pyswisseph 2.10.03 for the Swiss tools and network access for Horizons:

```sh
E=docs/evidence/houses-extra-2026-09-29
node $E/tools/dump-engine.mjs > "$WORK/engine.jsonl"
python3 $E/tools/compare-swiss.py "$WORK/engine.jsonl" > $E/results/swiss.json
node $E/tools/finite-difference.mjs > $E/results/finite-difference.json
(cd $E && python3 tools/diagnose-swiss.py "$WORK/engine.jsonl" > results/diagnostics.json)
(cd $E && python3 tools/swiss-self-difference.py > results/swiss-self-difference.json)
python3 $E/tools/speed-flags.py "$WORK/engine.jsonl" > $E/results/speed-flags.json
(cd $E/tools && HORIZONS_CACHE="$WORK/horizons" python3 horizons-select.py)
(cd $E/tools && HORIZONS_CACHE="$WORK/horizons" python3 horizons-returns.py > ../../../../src/timing/fixtures/planetary-returns-horizons.json)
node $E/tools/returns-report.mjs > $E/results/returns.json
node $E/tools/stations.mjs > $E/results/stations.json
```

`horizons-returns.py` records the date it fetched; Horizons's EOP file
changes daily, which moves nothing after 1962 by more than rounding.

## Sources

As in [`docs/houses.md`](../../houses.md#sources): Swiss Ephemeris's general
and programmer's documentation (SHA-256 recorded there), J. Meeus,
*Astronomical Algorithms* (2nd ed., eq. 12.4), Wikipedia's "Astrological
transit" (wikitext SHA-256 recorded there), JPL Horizons (DE441) and the US
Naval Observatory's `seasons` API (2000–2004 responses, SHA-256
`6d88f397…`, `3ea9a337…`, `a11d8f92…`, `447fa437…`, `8706cbe0…`).
