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
| A linear ayanamsa's effect on the speed in the mean ecliptic of date, against its stated rate, at 3,600″ and 50.29″ a year, on UTC and UT1, from an epoch in 1900, on the first and the last day a Date holds and at the start of the Kali Yuga | within 5 × 10⁻⁷″ a day |
| Where a caller's ayanamsa passes ±180°: the longitude, the speed and the cartesian vector | continuous; the speed within 10⁻⁶″ a day |
| A cartesian position's longitude and longitude rate, against `lon` and its speed | within 10⁻⁶″ and 10⁻³″ a day |
| `houses()` against `siderealChart()`'s ascendant, midheaven and cusps, every one of the thirteen systems at three places (one inside the Arctic Circle, where Placidus and Koch fall back to whole signs) | equal to the bit |
| `events()` against a dense scan of `calc()`'s sidereal longitude: the Sun, the Moon (on True Pushya), Mercury through its retrograde loop and Mars, and Venus with each of the four callers' ayanamsas | the same crossings, each within the search's bracket |
| `chart()`'s `sidereal` against `siderealChart()` | equal |
| Every result's receipt request, passed back | the same result |
| Thirteen malformed callers' ayanamsas, a UT1 epoch whose TT falls past the range of a Date among them | a RangeError naming the field, under `zodiac.sidereal` |

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
definitions, 1,856,820 comparisons in all:

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
- `tools/dense_rates.py --every-year` takes every star definition in every
  year from 1800 to 2199, 1,600 series. For a star and a year it samples
  every 5 days through the year and every 0.05 day for 3 days either side of
  the star's closest approach to the Sun; where the star passes within 2° of
  the Sun, every 0.02 day for 3 days and every 0.001 day for 0.3 day either
  side; where ERFA caps the deflection's denominator (eraLdsun's `dlim`),
  every 0.00001 day for 0.005 day either side of each instant at which the
  cap starts or stops applying; and where ERFA's margin, 1 + p·e less `dlim`,
  comes within 5 × 10⁻⁸ of the cap without reaching it, every 0.00001 day for
  as long as it is below that and 0.001 day either side. Only True Pushya's
  star comes that close: ERFA caps it in 278 of the 400 years, and comes
  within 5 × 10⁻⁸ in 69 more. It then takes 336 callers' ayanamsas at 401
  instants across the span: values from −359.9° to 359.9°; for an epoch
  definition, epochs at both ends of the span, at J2000.0 and at eight steps
  between, and each precession model; for a linear one, those epochs and
  also the first and last days a Date holds and the start of the Kali Yuga,
  with rates of up to 3,600″ a year; and one more linear definition, at the
  instant where its rate comes nearest the floor of the engine's rounding
  (below). Its rows, 94 MB, are not committed; it writes them in about three
  minutes on four cores.
- `tools/differences.ts --every-year` runs the engine at each of those rows
  and at `ayanamsa_rates.py`'s, and writes `results/every-year.json`: each
  band's comparisons and largest differences, from which the bounds are set,
  each star's least angle from the Sun and largest differences by band in
  every year, and each caller's largest differences. For each of True
  Pushya's passes it also finds where the engine itself caps the deflection,
  from its own margin (its angle of the star from the Sun and its Earth's
  distance from the Sun, as `apparentStar` computes them), and checks that
  the rows sample every 0.00001 day through the 0.001 day either side of each
  of those instants, where a rate's central difference straddles one; it
  fails if they do not. The engine caps in 290 years: ERFA's 278 and twelve
  more, 2075, 2077, 2078, 2080 and 2082 to 2089, all among the 69. Where both
  cap, the engine's crossings fall up to 4.2 minutes from ERFA's (in 2068),
  and at a closest approach the engine's margin differs from ERFA's by up to
  1.8 × 10⁻⁸ (in 1804). All 580 of the engine's crossings are covered. In
  the twelve years only the engine caps, the largest differences are 0.0274″
  and 1.57″ a day.
- `tools/dense_rates.py`, without `--every-year`, writes
  `src/fixtures/ayanamsa-rates-dense.json` (1,657,923 bytes): the same series
  for 1801, 1900, 2000, 2100 and 2199 and for the years that hold a band's
  largest difference (True Chitra's 1825 and 2197, True Revati's 2196, True
  Pushya's 1804 and 1821), 25 series and 28,964 rows (True Pushya's 2100 is
  one of the 69), and every caller at nine instants, the one that holds the
  largest difference of the position at all 401, and the definition at the
  rounding's floor at its instant, 3,417 rows.
  `src/calc-sidereal.test.ts` repeats the comparison on it and on
  `ayanamsa_rates.py`'s rows on every run (33,341 comparisons, with each
  band's largest among them), holds the engine to the bounds, and holds each
  bound to be its band's largest difference rounded up to two significant
  figures, the rule of the calc entry's other measured bounds; without
  arguments `tools/differences.ts` writes the same comparison to
  `results/differences.json`. Both Python tools take `--check`, which rebuilds
  the fixture in memory and compares. A difference is taken to the nearest
  whole turn, since a caller's ayanamsa need not lie within a turn of zero and
  the engine's is wrapped.

| band (the star's angle from the Sun, by the engine) | comparisons | largest, ayanamsa | where | largest, rate | where | bound |
| --- | ---: | ---: | --- | ---: | --- | --- |
| epoch and linear definitions | 134,833 | 4.53 × 10⁻⁷″ | a caller's −180° on the engine's precession from 1800, in 2055 | 1.52 × 10⁻⁷″ a day | a caller's −359.9° at 3,599.999734″ a year from 1800, in 1802: the rounding's floor (below) | 4.6 × 10⁻⁷″; 1.6 × 10⁻⁷″ a day |
| star definitions, 2° or more | 306,850 | 0.00123″ | True Chitra, 2197, 2.4° | 0.000384″ a day | True Chitra, 1825, 2.04° | 0.0013″; 0.00039″ a day |
| star definitions, 0.3° to 2° | 238,364 | 0.00471″ | True Revati, 2196, 0.30° | 0.0256″ a day | True Pushya, 1821, 0.30° | 0.0048″; 0.026″ a day |
| star definitions, within 0.3° | 1,176,773 | 0.0574″ | True Pushya, 1821, 0.080° | 27.0″ a day | True Pushya, 1804, 0.080° | 0.058″; 27″ a day |

The engine and ERFA deflect a star's light by the Sun with the same formula,
p + (2GM/c²E)(e − (p·e)p)/(1 + p·e), and both cap its denominator at
10⁻⁶/max(E², 1). Their Earth positions differ slightly (ERFA's `epv00` and
astronomy-engine's), by an amount that changes from year to year, so they put
the star at slightly different angles from the Sun. The deflection grows as
that angle falls, and its rate faster still, so the difference grows with
them; and where the cap starts and stops applying, about 0.08° from the Sun's
centre, the two computations do so at instants a little apart (up to 4.2
minutes, in 2068; and in twelve years only the engine's caps), and their
rates part by up to 27″ a day. How far apart the two come changes from one pass to
the next: within 0.3° the largest rate differences are 17.1″ a day in 1801,
27.0″ in 1804, 4.6″ in 1900 and 2.6″ in 2000. ERFA documents `epv00` for 1900
to 2100; inside that range the largest differences are smaller, but not by
much: 0.0415″ and 13.4″ a day, both in 1915. Within 0.3° the star is
on or beside the Sun's disc, whose radius is about 0.27°. The bound says how
far apart the two computations of that definition are, not that such a star
is seen.

For an epoch definition the comparison takes ERFA's precession from the
epoch and adds the value to it exactly, in rational arithmetic, its rate the
exact central difference of that precession over the same two instants; for
a linear one it is the definition computed exactly, in rational arithmetic
on the same binary inputs, its mean reduced to (−180°, 180°] and its rate the
exact central difference over the same two instants. Neither adds rounding
of its own, so the comparison measures the engine's rounding, and for an
epoch definition the two programs' precessions as well, which part by up to
4.53 × 10⁻⁷″ over the span.

The rate's rounding has a floor. A linear ayanamsa's mean is its value at
J2000.0, less whole turns, plus the rate times the time, and in the span the
second stays below 256° and the sum below 512°; the engine rounds both, which
puts at most one and a half units of 2⁻⁴⁴°, the last place of a value below
512°, into the difference of two means, and 1.535 × 10⁻⁷″ a day into the
rate, over its 0.002 day. `tools/rounding_floor.py` replicates that
arithmetic and searched for where it comes nearest: at 3,599.999734″ a year
from 1800, at an instant in 1802, the engine's rate is 1.525 × 10⁻⁷″ a day
from the definition's. The comparison includes that definition and instant,
and they set the bound, 1.6 × 10⁻⁷″ a day. An epoch definition's rate
carries at most one such unit and its precession's rounding; its largest
difference is 1.02 × 10⁻⁷″ a day.

Measuring these differences turned up two engine changes, both in the
linear ayanamsa. Its value was computed from
a Julian date rebuilt from TT days, which near 2.4 million is held only to
about 5 × 10⁻¹⁰ day; at 3,600″ a year that put up to 2 × 10⁻⁶″ a day of noise
into the rate calc subtracts. And it was counted from the epoch, so that from
an epoch far from the span, which a linear ayanamsa may have, the value ran
to hundreds of thousands of degrees before it was wrapped, whose rounding put
up to 2 × 10⁻⁴″ a day into the rate at the first day a Date holds, and
2 × 10⁻⁶″ a day from the start of the Kali Yuga. The engine now takes the
value at J2000.0, less whole turns, and adds the rate times TT days since
J2000.0. Raman's and Sri Yukteswar's ayanamsas move by less than 10⁻¹³° with
the two changes, and the speed test holds a linear ayanamsa's rate within
5 × 10⁻⁷″ a day of its definition from every one of those epochs.

### Corrections to this record's first three versions

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
today's only.

The second version sampled densely, but in five years only, 1801, 1900, 2000,
2100 and 2199, and its callers at nine instants, with linear epochs inside
the span: 16,116 comparisons, bounds of 4.5 × 10⁻⁷″ and 1.1 × 10⁻⁷″ a day,
0.0011″ and 0.00034″ a day, 0.0034″ and 0.022″ a day, and 0.036″ and 18″ a
day. A second independent review ran the same construction in other years and
found every star band exceeded: in 74 of the 1,600 star-years now compared,
up to 0.0574″ and 27.0″ a day within 0.3°; and at 401 instants an epoch
caller over its bound. It also found the linear ayanamsa's rounding from far
epochs, and that the cap's windows, 0.002 day either side of ERFA's
crossing, could miss the engine's own, up to 2.1 minutes away. Its
"every star's passes near the Sun" and "every value, epoch and rate calc
accepts" were five passes and nine instants. The bands, the bounds, the
comparison and the explanation above replace them.

The third version set the rate bound for epoch and linear definitions at the
largest difference it found at 401 instants, 1.5 × 10⁻⁷″ a day, and took an
epoch definition's reference as ERFA's construction computed in floating
point, which rounds the sum of the value and the precession as the engine
does. A third independent review sampled ten times as densely and found
2.05 × 10⁻⁷″ a day, the two roundings together; a search then found a linear
definition at which the engine's own reaches 1.525 × 10⁻⁷. The reference now
adds an epoch definition's value exactly, and the bound is set at the
rounding's floor. The review also found that the twelve passes the engine
caps and ERFA does not were sampled every 0.001 day only; that over all the
years both cap, the engine's crossings fall up to 4.2 minutes from ERFA's,
not the 2.1 the second review saw in the years it sampled; and that the third
version's count of 78 star-years over the second version's bounds counted a
star-year once for each band it exceeded: they are 74.

The Vedic guide said the engine agrees with ERFA "within 0.001″ at instants
more than 5° from the Sun". That was true of the 164 comparisons it made, but
none was within 17° of the Sun: its filter at 5° left nothing out.
`docs/vedic.md` now gives both comparisons and the figures near the Sun.

## Faults

Thirty-seven faults were planted in a throwaway copy of the change, one at a
time, and the calc and Vedic tests run against each (`results/faults.txt`,
the fifth run): the mean ayanamsa subtracted in the true ecliptic of date;
the speed taken from the tropical longitude; the cartesian vector turned the
wrong way; whole-sign cusps shifted rather than rebuilt; a crossing search on
tropical longitudes; the J2000.0 ecliptic offered; no refusal for an epoch
outside the span; no near-Sun bands; bound sums rounded down; a caller's
model default left out of the receipt; a UT1 epoch read as TT; the chart's
sidereal ascendant left tropical; the mean ayanamsa left in degrees under
radians; the star's angle measured from the anti-Sun; the far star bound
lowered below its measurement; the latitude zeroed; the Vertex left
tropical; `zodiac:sidereal` left out of the receipt; the near-Sun edge moved
to 1.5°; the edge of the Sun's disc moved to 0.25°; the bound there lowered
to 1″ a day; a linear ayanamsa's instant rebuilt from a Julian date;
`subtracted` always `"true"` in calc and always `"mean"` in houses; the
chart's bound taken without the star's angle; the name and the TT epoch's
range left to `userAyanamsa`, whose messages name its own fields; the epoch
and linear rate bound lowered to 6.4 × 10⁻⁹″ a day; the nutation left out of
`true`; a UT1 epoch's range checked before its TT; a linear ayanamsa counted
from a far epoch without reducing it; a caller's name in capitals let
through; each band's bounds put back at the second version's values; and the
epoch and linear rate bound put back at the third version's. All thirty-seven
fail a test. The earlier versions' runs, of nineteen, twenty-nine and
thirty-six, are kept beside them: in the first the near-Sun band survived
at first, because the bounds test took its expected value from
`ayanamsaBound()` itself and no tested instant had a star near the Sun, and a
first version of the receipt fault changed nothing and was replaced.

## Sizes

The calc entry now imports the ayanamsas (`src/vedic/ayanamsa.ts`, with its
star catalogue and its apparent places) and the sidereal chart
(`src/vedic/sidereal.ts`, `src/vedic/grid.ts`). esbuild puts those three
modules, whole, in a chunk the calc and Vedic entries share. The calc entry's
import graph grows from 113,904 to 139,821 bytes: 17,596 in the shared chunk
and 8,321 in `calc.js` itself. The root entry's graph is unchanged, every file
of it byte for byte (103,537 bytes), and so are the other eleven entries'. The
Vedic entry's is 1,508 bytes larger, 122,131 to 123,639: its three modules
moved into the shared chunk, with the `ayanamsaAt`, `isUserAyanamsaName`,
`outsideSpanEpoch`, `wrap360` and `wholeSignCusps` the calc entry now imports
from them, and the star's angle from the Sun. The calc entry's budget is raised from 115,000 to
145,500 (`scripts/verify-package-contents.mjs`).

## Replication

```sh
python3 docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py --check   # numpy, pyerfa 2.0.1.5
python3 docs/evidence/calc-sidereal-2026-10-05/tools/dense_rates.py --check
python3 docs/evidence/calc-sidereal-2026-10-05/tools/rounding_floor.py
python3 docs/evidence/calc-sidereal-2026-10-05/tools/dense_rates.py --every-year <rows> --jobs 4
npx vite-node docs/evidence/calc-sidereal-2026-10-05/tools/differences.ts --every-year <rows>
npx vite-node docs/evidence/calc-sidereal-2026-10-05/tools/differences.ts
npx vitest run src/calc-sidereal.test.ts src/calc-fixtures.test.ts src/calc.test.ts
```

`<rows>` is a file outside the repository.

No Swiss Ephemeris code, data or output was used. Every instant and place is
synthetic.
