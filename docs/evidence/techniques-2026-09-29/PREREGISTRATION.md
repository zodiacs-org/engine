# Techniques entry point: preregistered gates

Written and committed on 2026-09-29, on branch `feature-techniques` from
`rc15-work` at `eb58011` (the 0.1.1-rc.15 candidate), before any code of the
new entry point exists and before any of the measurements below has been run.
The gates are not loosened after results are seen. A gate that fails is
recorded as a failure, with its numbers, in this directory's `README.md`.

The work moves six techniques from the Zodiacs.org site into a new opt-in
entry point, `@zodiacs/engine/techniques`:

1. solar and lunar returns;
2. composite charts (midpoints) and Davison charts;
3. the void-of-course Moon;
4. aspect patterns;
5. essential dignities and mutual reception;
6. the Moon signs possible over a date with an unknown birth time.

## Reference code

The site's code is read from a snapshot of the site repository at commit
`67cccac5a19a7779a07f85b09218c1ffbe2300cd`, copied into a scratch directory
outside both repositories. It is bundled and run there, never in the site
tree. SHA-256 of the files the parity runs read:

| File | SHA-256 |
| --- | --- |
| `src/lib/engine/solar-return.ts` | `723b4cb6748b0a9dca7cbb55d4359339434cf69cdf2d6b23d43ed9e99dc6bfc0` |
| `src/lib/engine/lunar-return.ts` | `7ac26ad065eeaa117d852b22165e2b870539c25acba2dfb37073275943876bc5` |
| `src/lib/engine/returns.ts` | `d0eed21f5a213fef3c8576ab5e726f6c27fc00edc95980fabad2843852937cfb` |
| `src/lib/engine/reference-span.ts` | `a71e7f014efab7fad511318aec311abb973181c3abf2f2e60e16720ed0282688` |
| `src/lib/engine/full.ts` | `2f34bf48efd52d47fa9771b2373d4d5f696616b4e3faf6a4ec784190782ae624` |
| `src/lib/engine/chart-adapter.ts` | `12cbde8ea2b1704c1fd5a6a87200621a9719b078e3461a9dcfb506527d6f44f1` |
| `src/lib/engine/types.ts` | `1c5665a9621f78da2c10ce8e17dbeafdb2fdb379faf2c80df5391efab015ad99` |
| `src/lib/engine/aspects.ts` | `0faaa80258494bee18bb5247291a8ecbe0abc9554775c5f0c43b8d0f00c2660f` |
| `src/lib/composite.ts` | `1860ab8de9fca12bc9575c7bbc2c662eb14cb088376f53f03680ee8c37305cd3` |
| `src/lib/engine/void-of-course.ts` | `927ed5b280317085ab963a8b9992b31544470c1dafe0904c9e319ffe569334c0` |
| `src/lib/engine/aspect-patterns.ts` | `df62a2f7b98a6305b79905a6b26a5cf1f2ce98d7df45a7c911c9331eec83f6cb` |
| `src/lib/aspect-pattern-model.ts` | `3718bc63a0c46e7ba099e9233382b94192f65d3b5a49ce9edc3d36cc6eb05455` |
| `src/lib/dignities.ts` | `7e8593064ff20e0229a7701186fc834002988ced88bc58e2701f1ca4081ca5ac` |
| `src/lib/moon-certainty.ts` | `a1786be7d1734b7c58eda862f900a3a1081c944c1e4efc6a131bb0bcdcf3e994` |
| `src/lib/chart-date-certainty.ts` | `2ba8257d01516622ae425b7b6d8a16ff16831f6e6f2fb9b4ad21b3b354afc936` |
| `src/lib/share-card.ts` (`untimedMoonSign` only) | `09448ff3f5625c7c8789434e24fc1f576eb4a7019075850152ce86ef09811af4` |
| `src/lib/share-positions-noon.ts` | `6a006703f49b4d4c53859de4b8d63f5c5ab5aab3ba3c91c3f2c2e9508dc6ef65` |
| `src/lib/signs.ts` | `1c63218d01b33b963106fb1c11030816833b0d6a79f9f765df433830ef5cfaa4` |
| `src/lib/time/localToUtc.ts` | `671b66fdc437f68c543d910b77552d93ca4cba9f10a5a60dd9a2124f6eb1a7c5` |

The site vendors engine 0.1.1-rc.10. For parity the site's modules are run
on the engine the package ports them into: `@zodiacs/engine` and its
subpaths resolve to the carried 0.1.1-rc.15 archive,
`artifacts/zodiacs-engine-0.1.1-rc.15.tgz` (SHA-256
`3651c525e98ff83e20a46bded84ede5ad1465dde22674830347bceed87c31309`), with the
pinned astronomy-engine 2.1.19. A difference in the parity runs therefore
comes from the port, not from the ephemeris. The runs use Node 22.22.2
(tzdata 2025c in its ICU).

## Corpus

A committed script generates every input from a seeded pseudo-random
generator (mulberry32, seeded by the FNV-1a hash of the string
`techniques-2026-09-29` and the corpus name). Birth data are invented:
instants and places drawn at random, not taken from any person. The corpus:

| Name | Site function | Cases | Inputs |
| --- | --- | --- | --- |
| R-SI | `solarReturnInstant` | 300 | natal Sun at a random instant 1850–2150; `near` in 1801–2199 |
| R-SM | `mostRecentSolarReturnInstant` | 300 | as R-SI |
| R-SC | `solarReturnChart` | 60 | random birth and place, 1850–2150; `near` in 1801–2199; cast place none, natal or random; whole sign or Placidus; nearest or most recent |
| R-LI | `lunarReturnInstant` | 300 | natal Moon at a random instant 1850–2150; `after` from 1800-01-02 to 2199-11-21 |
| R-LC | `lunarReturnChart` | 60 | random birth and place, 1850–2150; `after` between the birth and 2199-11-21; cast place natal or random; whole sign or Placidus |
| R-E | the four return functions | 40 | windows that reach outside 1800–2200, where the site clips or refuses |
| C-M | `compositeMidpoints` | 400 | two random subsets of the twelve bodies, random order, longitudes in [0, 360) with exact coincidences, exact oppositions and near-oppositions |
| C-A | `compositeAspects` | 400 | the C-M results |
| V-W | `voidOfCourseWindows` | 20 | 10-day windows starting in 1801–2199: 10 with the modern bodies, 10 with the traditional |
| V-S | `voidStatus` | 40 | random instants in 1801–2199: 20 modern, 20 traditional |
| P-D | `detectAspectPatterns` | 630 | 600 point sets of 3 to 10 bodies placed near multiples of 30° so that patterns occur, with the site's own aspect records; 30 malformed inputs |
| P-C | `patternContainment` | every P-D case that is ready | |
| D-X | `dignityFor`, `dignitiesFor`, `hasClassicalDignities` | 144 | every body and every sign |
| M-A | `untimedMoonSign` | 3,000 | dates from 1800-01-02 to 2199-12-30 |
| M-Z | `moonCandidatesFromEndpoints` of `localDateEndpointsUtc` | 1,542 | 1,500 random dates from 1971 to 2199 in 40 listed zones, and 42 dates at or next to a change of offset at local midnight |
| M-P | as M-Z, before 1970 | 500 | random dates from 1800 to 1969 in the same zones |

## Gates

**G1. Parity.** For every case of R-SI, R-SM, R-SC, R-LI, R-LC, C-M, C-A,
V-W, V-S, P-D, P-C, D-X, M-A and M-Z, the package function gives the site's
result exactly: instants equal to the millisecond, numbers equal as doubles,
signs, bodies, identifiers and lists equal and in the same order, and each
input the site refuses is refused by the package with a `RangeError`. For
return charts, the chart's bodies, angles, cusps, aspects and flags are
compared. Pass: no disagreement in any of these corpora. A failure is
recorded with the number of disagreeing cases per corpus and the largest
difference.

Two corpora are recorded without a pass condition, because the site and the
package are meant to differ there, and the differences are reported:

- R-E: the site clips its scans to 1800–2200 and refuses beyond; the package
  scans without clipping and flags results outside 1800–2200.
- M-P: before 1970 the site reads a date's midnights on the host's `Intl`
  data, the package on its shipped tzdata 2025c with backzone. Pass
  condition for M-P, recorded separately as **G7**: every disagreement
  coincides with a different midnight instant at either end of the date.

M-Z compares the package's local midnights with the site's only on a Node
whose `process.versions.tz` is the one the site's outputs were generated
with (2025c); on any Node, the Moon signs are compared over the site's own
endpoints.

**G2. Solar return instants against published season times.** U.S. Naval
Observatory, *Earth's Seasons* (`https://aa.usno.navy.mil/api/seasons`),
years 1850, 1900, 1950, 2000 and 2022: the 20 equinoxes and solstices,
published in UT to the minute. For each, the solar return to 0°, 90°, 180°
or 270° nearest 00:00 UT of the published date lies within 120 s of the
published time. Pass: all 20.

**G3. Return instants against JPL Horizons positions.** The 24 Sun and 24
Moon apparent longitudes of the conformance suite's L1 vectors
(`conformance/vectors/L1-positions.json`, JPL Horizons DE441, 1851–2148). For
each, the return to that longitude found from 10 days before the vector's
instant lies within 60 s (Sun) or 15 s (Moon) of the vector's instant,
compared in TT with the engine's own time basis. Pass: all 48. The
tolerances come from the engine's committed residuals on these vectors
(`conformance/results/zodiacs-engine.json`: up to 3.9″ for the Moon and 1.4″
for the Sun) divided by the slowest motion of each body (about 0.49″ and
0.040″ per second), with about twice that as margin.

**G4. The span of a date in every time zone.** Over the zone histories the
package ships (`src/tzdb/`, tzdata 2025c with backzone), every offset lies
within UTC−12:00 to UTC+14:00, except in the 16 zone names the site's test
lists (Alaska until 1867-10-19; the Philippines and the Micronesian zones
until 1844-12-31). Pass: the exceptions are exactly those 16 names with those
dates.

**G5. Sizes.**

- The root entry's import graph is unchanged: the same files with the same
  bytes as rc.15's build, 95,273 bytes.
- The package's unpacked size stays within the existing cap of 700,000
  bytes; the cap is not raised.
- The new entry's import graph is at most 150,000 bytes. Its budget in
  `scripts/verify-package-contents.mjs` is set as the other budgets were
  set, the measured size with 5 to 11 per cent of headroom.

**G6. Existing behaviour.** No existing file under `src/` is changed, and
every existing test passes unchanged.

**G7.** See M-P under G1.

## Fixtures that are not measurements

The following are unit tests whose expected values come from the cited
sources or from definitions, not from the engine. They are not gates in the
sense above, but a failing fixture fails `npm test`:

- dignity tables transcribed from Ptolemy (*Tetrabiblos* I.17–I.20),
  Dorotheus (*Carmen Astrologicum* I.1–I.2) and al-Bīrūnī (*Book of
  Instruction* §§440–451); the sums of each planet's Egyptian terms; Lilly's
  examples of reception and of a peregrine planet (*Christian Astrology*,
  1647, p. 112);
- one fixture per aspect pattern definition, and one per missing edge;
- composite midpoints and a Davison chart for invented pairs of births;
- the void-of-course convention on constructed and ephemeris cases;
- the every-time-zone span of a date.

Swiss Ephemeris is not used in this work.
