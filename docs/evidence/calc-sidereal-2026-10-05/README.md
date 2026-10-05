# The sidereal zodiac in the calc entry: evidence (2026-10-05)

`@zodiacs/engine/calc` refused the sidereal zodiac in 0.1.1-rc.16
(`not-in-this-version`), though `@zodiacs/engine/vedic` computed it and the
calc entry's own map of Swiss Ephemeris's `calc_ut` flags typed it in. This
change computes it in `calc()`, `houses()`, `events()` and `chart()`, with the
nine built-in ayanamsas and a caller's own (`SE_SIDM_USER`), and records here
what it was checked against. `docs/calc.md`, *The sidereal zodiac*, is the
reference.

## What a sidereal result is

A sidereal longitude is the longitude in the ecliptic of date less the
ayanamsa: the true ayanamsa in the true ecliptic of date, the mean one in the
mean ecliptic of date. The calc entry subtracts it with the Vedic entry's own
functions (`ayanamsaAt` in `src/vedic/ayanamsa.ts`, which `ayanamsa()` now
calls too, and `wrap360` and `wholeSignCusps` in `src/vedic/sidereal.ts`), at
the instant on its own clock. `src/calc-sidereal.test.ts` holds it to the
Vedic entry:

| Check | Result |
| --- | --- |
| `calc()` against `siderealLongitude()` of the tropical longitude, every body calc gives (15) and every ayanamsa (the nine built-ins and four of a caller's: an epoch on the engine's, Newcomb's and IAU 1976's precession, and a rate), at seven synthetic instants from 1800 to 2199 | equal to the bit |
| `calc()` against `siderealChart()`'s bodies | equal to the bit |
| A caller's ayanamsa stated as Lahiri's own epoch, value and model, against `"lahiri"` | equal to the bit |
| The mean ecliptic of date less the mean ayanamsa, against the true ecliptic of date less the true one | within 10⁻⁶″ |
| The speed, against the tropical speed less the true ayanamsa's central difference over the same ±0.001 day | within 10⁻⁶″ a day |
| A cartesian position's longitude and longitude rate, against `lon` and its speed | within 10⁻⁶″ and 10⁻³″ a day |
| `houses()` against `siderealChart()`'s ascendant, midheaven and cusps, every one of the thirteen systems at three places (one inside the Arctic Circle, where Placidus and Koch fall back to whole signs) | equal to the bit |
| `events()` against a dense scan of `calc()`'s sidereal longitude: the Sun, the Moon (on True Pushya), Mercury through its retrograde loop and Mars | the same crossings, each within the search's bracket |
| `chart()`'s `sidereal` against `siderealChart()` | equal |
| Every result's receipt request, passed back | the same result |

The round-trip fixture (`src/fixtures/calc-roundtrip.json`) gains twelve
cases: sidereal positions with a built-in and a caller's ayanamsa, in both
ecliptics of date, in radians and with a cartesian vector; sidereal houses in
whole signs and Placidus; a sidereal crossing search; four `chart()` requests,
which the fixture had none of; and the two new refusals. Rebuilt from the
build, its 25 earlier cases are unchanged but for the `ayanamsa: null` every
position and houses result now carries, and the one case that was refused as
`not-in-this-version`, the sidereal Moon, which is now computed.

## The ayanamsa's bounds

A sidereal result's bounds add the ayanamsa's own. For that the engine's mean
ayanamsas, and their rates, were compared with ERFA's construction of the same
definitions:

- `tools/ayanamsa_rates.py` writes `src/fixtures/ayanamsa-rates.json` with
  pyerfa 2.0.1.5. It imports the constructions of the Vedic evidence's
  reference tool (`../vedic-2026-09-28/tools/reference_values.py`), and adds
  the rates (central differences over ±0.001 day of TT, the step of calc's
  speeds) and the linear definitions. For the star definitions it keeps that
  tool's ten-year grid, whose 41 instants land near the same date each decade
  and never came within 17° of the Sun, and adds every day of the 21 days and
  every three hours of the two days around each star's conjunction with the
  Sun in 1801, 1900, 2000, 2100 and 2199. `--check` rebuilds the file in
  memory and compares.
- `tools/differences.ts` runs the engine at each row and writes
  `results/differences.json`; `src/calc-sidereal.test.ts` repeats the
  comparison on every run, holds the engine to the bounds, and holds each
  bound to be its band's largest difference rounded up to two significant
  figures, the rule of the calc entry's other measured bounds.

| band (the engine's angle from the Sun) | comparisons | largest, ayanamsa | where | largest, rate | where | bound |
| --- | ---: | ---: | --- | ---: | --- | --- |
| epoch and linear definitions | 96 | 4.30 × 10⁻⁷″ | a caller's IAU 1976 epoch, 1800 | 6.40 × 10⁻⁹″ a day | Fagan–Bradley, 2026 | 4.4 × 10⁻⁷″; 6.4 × 10⁻⁹″ a day |
| star definitions, a degree or more from the Sun | 741 | 0.00101″ | True Chitra, 2100, 7.7° from the Sun | 0.00038″ a day | True Revati, 2199, 1.4° | 0.0011″; 0.00039″ a day |
| star definitions, within a degree of the Sun | 123 | 0.0214″ | True Pushya, 1801, 0.11° | 0.396″ a day | True Pushya, 2000, 0.08° | 0.022″; 0.40″ a day |

Within a degree of the Sun the star is near or behind the Sun's disc (its
radius is about 0.27°). The light deflection is largest there, and the
engine and ERFA each cap the deflection's denominator, `1 + p·e`, at a small
number, where the two computations part. Both move True Revati's and True
Pushya's true ayanamsas by several arcseconds over the day the Sun passes
the star; the bound says how far apart the two computations of that
definition are, not that a star behind the Sun is seen.

The Vedic guide said the engine agrees with ERFA "within 0.001″ at instants
more than 5° from the Sun". That was true of the 164 instants it compared,
but none of them was within 17° of the Sun: its filter at 5° left nothing
out. On this comparison the largest difference a degree or more from the Sun
is 0.00101″, at an instant 7.7° from the Sun, and within a degree it is
0.0214″. `docs/vedic.md` now gives both comparisons and the near-Sun figure.

## Faults

Nineteen faults were planted in a throwaway copy of the change, one at a
time, and the calc and Vedic tests run against each (`results/faults.txt`):
the mean ayanamsa subtracted in the true ecliptic of date; the speed taken
from the tropical longitude; the cartesian vector turned the wrong way;
whole-sign cusps shifted rather than rebuilt; a crossing search on tropical
longitudes; the J2000.0 ecliptic offered; no refusal for an epoch outside the
span; no near-Sun band; bound sums rounded down; a caller's model default
left out of the receipt; a UT1 epoch read as TT; the chart's sidereal
ascendant left tropical; the ayanamsa left in degrees under radians; the
star's angle measured from the anti-Sun; the star bound lowered below its
measurement; the latitude zeroed; the Vertex left tropical; `zodiac:sidereal`
left out of the receipt; and the near-Sun threshold moved. All nineteen fail
a test. In the first run the near-Sun band survived, because the bounds test
took its expected value from `ayanamsaBound()` itself and no tested instant
had a star near the Sun; a test now checks True Pushya on the day its star
passed the Sun. A first version of the receipt fault changed nothing and was
replaced.

## Sizes

The calc entry now imports the ayanamsas (`src/vedic/ayanamsa.ts`, with its
star catalogue and its apparent places) and the sidereal chart
(`src/vedic/sidereal.ts`, `src/vedic/grid.ts`). esbuild puts those three
modules, whole, in a chunk the calc and Vedic entries share. The calc entry's
import graph grows from 113,904 to 138,580 bytes: 17,411 in the shared chunk
and 7,265 in `calc.js` itself. The root entry's graph is unchanged, every
file of it byte for byte (103,537 bytes). The Vedic entry's is 1,323 bytes
larger, 122,131 to 123,454: its three modules moved into the shared chunk,
with the `ayanamsaAt`, `outsideSpanEpoch`, `wrap360` and `wholeSignCusps` the
calc entry now imports from them, and the star's angle from the Sun. The
calc entry's budget is raised from 115,000 to 145,500
(`scripts/verify-package-contents.mjs`).

## Replication

```sh
python3 docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py --check   # numpy, pyerfa 2.0.1.5
npx vite-node docs/evidence/calc-sidereal-2026-10-05/tools/differences.ts
npx vitest run src/calc-sidereal.test.ts src/calc-fixtures.test.ts src/calc.test.ts
```

No Swiss Ephemeris code, data or output was used. Every instant and place is
synthetic.
