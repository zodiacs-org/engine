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
the instant on its own clock. Every result gives the ayanamsa in one shape,
`{ name, mean, nutation, true, subtracted, bound }`, and says which value it
subtracted. `src/calc-sidereal.test.ts` holds it to the Vedic entry:

| Check | Result |
| --- | --- |
| `calc()` against `siderealLongitude()` of the tropical longitude, every body calc gives (15) and every ayanamsa (the nine built-ins and four of a caller's: an epoch on the engine's, Newcomb's and IAU 1976's precession, and a rate), at seven synthetic instants from 1800 to 2199 | equal to the bit |
| `calc()` against `siderealChart()`'s bodies | equal to the bit |
| A caller's ayanamsa stated as Lahiri's own epoch, value and model, against `"lahiri"` | equal to the bit |
| The mean ecliptic of date less the mean ayanamsa, against the true ecliptic of date less the true one | within 10⁻⁶″ |
| The speed, against the tropical speed less the true ayanamsa's change over the same ±0.001 day, divided by the TT that elapsed, at the leap second of 2016 too (where it is 0.002 day and one second) | within 10⁻⁶″ a day |
| A linear ayanamsa's effect on the speed in the mean ecliptic of date, against its stated rate, at 3,600″ and 50.29″ a year, on UTC and UT1 | within 5 × 10⁻⁷″ a day |
| Where a caller's ayanamsa passes ±180°: the longitude, the speed and the cartesian vector | continuous; the speed within 10⁻⁶″ a day |
| A cartesian position's longitude and longitude rate, against `lon` and its speed | within 10⁻⁶″ and 10⁻³″ a day |
| `houses()` against `siderealChart()`'s ascendant, midheaven and cusps, every one of the thirteen systems at three places (one inside the Arctic Circle, where Placidus and Koch fall back to whole signs) | equal to the bit |
| `events()` against a dense scan of `calc()`'s sidereal longitude: the Sun, the Moon (on True Pushya), Mercury through its retrograde loop and Mars, and Venus with each of the four callers' ayanamsas | the same crossings, each within the search's bracket |
| `chart()`'s `sidereal` against `siderealChart()` | equal |
| Every result's receipt request, passed back | the same result |
| Twelve malformed callers' ayanamsas | a RangeError naming the field, under `zodiac.sidereal` |

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
definitions, 16,116 comparisons in two fixtures:

- `tools/ayanamsa_rates.py` writes `src/fixtures/ayanamsa-rates.json` with
  pyerfa 2.0.1.5: 960 rows. It imports the constructions of the Vedic
  evidence's reference tool (`../vedic-2026-09-28/tools/reference_values.py`),
  and adds the rates (central differences over ±0.001 day of TT, the step of
  calc's speeds) and the linear definitions. For the star definitions it
  keeps that tool's ten-year grid, whose 41 instants land near the same date
  each decade and never came within 17° of the Sun (its docstring says it
  adds the instants the reference tool left out within 5° of the Sun; there
  were none), and adds every day of the 21 days and every three hours of the
  two days around each star's conjunction with the Sun in 1801, 1900, 2000,
  2100 and 2199.
- `tools/dense_rates.py` writes `src/fixtures/ayanamsa-rates-dense.json`
  (766,352 bytes): 15,156 rows. For each star, in the year of each of those
  conjunctions, every 5 days through the year and every 0.05 day for 3 days
  either side of its closest approach to the Sun; where the star passes within
  2° of the Sun, every 0.02 day for 3 days and every 0.001 day for 0.3 day
  either side; and where ERFA caps the deflection's denominator (eraLdsun's
  `dlim`), every 0.00001 day for 0.002 day either side of each instant at which
  the cap starts or stops applying, which True Pushya's star reaches in 1801,
  1900 and 2000. Then 90 callers' ayanamsas at the ends of what calc accepts:
  values from −359.9° to 359.9°, epochs at either end of the span and at
  J2000.0, each precession model, and rates of up to 3,600″ a year, each at
  nine instants.
- Both tools take `--check`, which rebuilds the file in memory and compares.
  `tools/differences.ts` runs the engine at each row and writes
  `results/differences.json`; `src/calc-sidereal.test.ts` repeats the
  comparison on every run, holds the engine to the bounds, and holds each
  bound to be its band's largest difference rounded up to two significant
  figures, the rule of the calc entry's other measured bounds. A difference is
  taken to the nearest whole turn, since a caller's ayanamsa need not lie
  within a turn of zero and the engine's is wrapped.

| band (the star's angle from the Sun, by the engine) | comparisons | largest, ayanamsa | where | largest, rate | where | bound |
| --- | ---: | ---: | --- | ---: | --- | --- |
| epoch and linear definitions | 906 | 4.50 × 10⁻⁷″ | a caller's 359.9° on the engine's precession from 1800, in 2050 | 1.02 × 10⁻⁷″ a day | the same at −359.9° | 4.5 × 10⁻⁷″; 1.1 × 10⁻⁷″ a day |
| star definitions, 2° or more | 4,510 | 0.00101″ | True Chitra, 2100, 7.7° | 0.000335″ a day | True Revati, 2100, 9.7° | 0.0011″; 0.00034″ a day |
| star definitions, 0.3° to 2° | 3,120 | 0.00338″ | True Revati, 2199, 0.30° | 0.0217″ a day | True Revati, 2199, 0.30° | 0.0034″; 0.022″ a day |
| star definitions, within 0.3° | 7,580 | 0.0352″ | True Pushya, 1801, 0.082° | 17.1″ a day | True Pushya, 1801, 0.080° | 0.036″; 18″ a day |

The engine and ERFA deflect a star's light by the Sun with the same formula,
p + (2GM/c²E)(e − (p·e)p)/(1 + p·e), and both cap its denominator at
10⁻⁶/max(E², 1). Their Earth positions differ slightly (ERFA's `epv00` and
astronomy-engine's), so they put the star at slightly different angles from
the Sun. The deflection grows as that angle falls, and its rate faster still,
so the difference grows with them; and where the cap starts and stops
applying, which only True Pushya's star reaches, about 0.08° from the Sun's
centre, the two computations do so at instants a little apart, and their
rates part by up to 17″ a day. ERFA documents `epv00` for 1900 to 2100; the
largest near-Sun differences are in 1801 (in 1900 and 2000 the largest rate
differences there are 4.6″ and 2.6″ a day). Within 0.3° the star is on or
beside the Sun's disc, whose radius is about 0.27°. The bound says how far
apart the two computations of that definition are, not that such a star is
seen.

For the epoch and linear definitions the two constructions are the same
model, so the comparison measures rounding, and the largest differences come
from values near ±360°. Measuring them turned up one engine change. A linear
ayanamsa's value was computed from a Julian date rebuilt from TT days, which
near 2.4 million is held only to about 5 × 10⁻¹⁰ day; at 3,600″ a year that
put up to 2 × 10⁻⁶″ a day of noise into the rate calc subtracts. The fixture's
comparison could not see it, since ERFA's side rounds the same Julian dates;
the speed test above did. The engine now counts days from the epoch from TT
days since J2000.0. Raman's and Sri Yukteswar's ayanamsas move by less than
10⁻¹³° with the change, and a caller's at 3,600″ a year by less than 10⁻¹²°.

### Correction to this record's first version

The first version of this change measured the star definitions on the rows
of `ayanamsa_rates.py` alone and set two star bands at 1°: 0.0011″ and
0.00039″ a day a degree or more from the Sun, 0.022″ and 0.40″ a day within a
degree. An independent review re-ran the same ERFA construction densely around
each conjunction and found larger differences: up to 0.0352″ and 17.1″ a day
within a degree, and rates up to 0.00075″ a day out to 1.43°. The first
version also put the near-Sun maxima down to the two computations' caps on the
deflection, but its own maxima, 0.0214″ at 0.11° and 0.396″ a day at 0.08°,
lay where neither cap applied; the cap is where the larger, dense extremes
lie. The epoch and linear rate bound, 6.4 × 10⁻⁹″ a day, covered values near
today's only. The bands, the bounds and the explanation above replace them.

The Vedic guide said the engine agrees with ERFA "within 0.001″ at instants
more than 5° from the Sun". That was true of the 164 comparisons it made, but
none was within 17° of the Sun: its filter at 5° left nothing out.
`docs/vedic.md` now gives both comparisons and the figures near the Sun.

## Faults

Twenty-nine faults were planted in a throwaway copy of the change, one at a
time, and the calc and Vedic tests run against each (`results/faults.txt`):
the mean ayanamsa subtracted in the true ecliptic of date; the speed taken
from the tropical longitude; the cartesian vector turned the wrong way;
whole-sign cusps shifted rather than rebuilt; a crossing search on tropical
longitudes; the J2000.0 ecliptic offered; no refusal for an epoch outside the
span; no near-Sun bands; bound sums rounded down; a caller's model default
left out of the receipt; a UT1 epoch read as TT; the chart's sidereal
ascendant left tropical; the mean ayanamsa left in degrees under radians; the
star's angle measured from the anti-Sun; the far star bound lowered below its
measurement; the latitude zeroed; the Vertex left tropical; `zodiac:sidereal`
left out of the receipt; the near-Sun edge moved to 1.5°; the edge of the
Sun's disc moved to 0.25°; the bound there lowered to 1″ a day; a linear
ayanamsa computed from a rebuilt Julian date; `subtracted` always `"true"` in
calc and always `"mean"` in houses; the chart's bound taken without the
star's angle; the name and the TT epoch's range left to `userAyanamsa`, whose
messages name its own fields; the epoch and linear rate bound back at
6.4 × 10⁻⁹″ a day; and the nutation left out of `true`. All twenty-nine fail
a test. The first version's run of nineteen is kept beside them: there the
near-Sun band survived at first, because the bounds test took its expected
value from `ayanamsaBound()` itself and no tested instant had a star near the
Sun, and a first version of the receipt fault changed nothing and was
replaced.

## Sizes

The calc entry now imports the ayanamsas (`src/vedic/ayanamsa.ts`, with its
star catalogue and its apparent places) and the sidereal chart
(`src/vedic/sidereal.ts`, `src/vedic/grid.ts`). esbuild puts those three
modules, whole, in a chunk the calc and Vedic entries share. The calc entry's
import graph grows from 113,904 to 139,426 bytes: 17,413 in the shared chunk
and 8,109 in `calc.js` itself. The root entry's graph is unchanged, every file
of it byte for byte (103,537 bytes), and so are the other ten entries'. The
Vedic entry's is 1,325 bytes larger, 122,131 to 123,456: its three modules
moved into the shared chunk, with the `ayanamsaAt`, `outsideSpanEpoch`,
`wrap360` and `wholeSignCusps` the calc entry now imports from them, and the
star's angle from the Sun. The calc entry's budget is raised from 115,000 to
145,500 (`scripts/verify-package-contents.mjs`).

## Replication

```sh
python3 docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py --check   # numpy, pyerfa 2.0.1.5
python3 docs/evidence/calc-sidereal-2026-10-05/tools/dense_rates.py --check
npx vite-node docs/evidence/calc-sidereal-2026-10-05/tools/differences.ts
npx vitest run src/calc-sidereal.test.ts src/calc-fixtures.test.ts src/calc.test.ts
```

No Swiss Ephemeris code, data or output was used. Every instant and place is
synthetic.
