# Vedic techniques

The engine's root entry computes tropical positions. The separate entry
`@zodiacs/engine/vedic` adds the sidereal zodiac and the core techniques
built on it:

- nine named ayanamsas and user-defined ones;
- sidereal charts;
- nakshatras and padas;
- the sixteen Parashari vargas;
- Krishnamurti Paddhati (KP) sub-lords and sub-sub-lords;
- Vimshottari dashas to five levels, and Yogini and Ashtottari mahadashas.

The functions take explicit inputs, return frozen objects and reject bad input
with a `RangeError`. They add no runtime dependencies, and nothing in the root
entry imports them. The measurements behind the figures below, with every
source in full, are in
[`evidence/vedic-2026-09-28/`](evidence/vedic-2026-09-28/README.md).

```ts
import { chartPoints } from "@zodiacs/engine";
import {
  kpLordsOf, nakshatraOf, siderealChart, siderealLongitude,
  vargaOf, vimshottariAt, vimshottariDasha
} from "@zodiacs/engine/vedic";

const birth = { utc: "1990-05-17T08:30:00Z", latitude: 12.97, longitude: 77.59 }; // synthetic
const chart = siderealChart(birth, "lahiri");
const moon = chart.bodies.find((row) => row.body === "Moon")!;

nakshatraOf(moon);        // { index: 22, name: "Dhanishta", lord: "Mars", pada: 2, … }
vargaOf(moon, "D9");      // { varga: "D9", scheme: "parashari", part: 9, sign: "virgo", … }
kpLordsOf(moon);          // sign, star, sub and sub-sub lords, and the numbered sub
vimshottariDasha(moon);   // mahadashas from the one running at birth
vimshottariAt(moon, "2030-01-01T00:00:00Z"); // the five periods running then

// The chart's North and South Node are the true node. For the mean node:
const meanNode = chartPoints(birth).points.find((p) => p.point === "Mean Node")!;
siderealLongitude(meanNode.lon, chart.ayanamsaValue);
```

## Frames

A sidereal longitude is the tropical longitude minus the ayanamsa. The
engine's tropical longitudes are apparent positions referred to the true
equinox and ecliptic of date. That fixes how the ayanamsa has to be applied.

`ayanamsa(definition, at, options?)` returns an `AyanamsaValue`. It has three
values, all in degrees:

- `mean`: the ayanamsa measured from the mean equinox of date, in (−180, 180].
  This is the value each definition fixes.
- `nutation`: the engine's nutation in longitude Δψ at that instant.
- `true`: `mean + nutation`, measured from the true equinox of date.

`siderealLongitude(tropical, value)` subtracts `value.true`. The sidereal
longitude is therefore the mean-equinox longitude minus the mean ayanamsa, and
nutation cancels. The engine's nutation is the IAU 2000B series, all 77 of its
terms (the README's *Nutation*), whose Δψ equals ERFA's `nut00b` within
1e-10″ (`src/nutation.test.ts`). Until it took the full series, the engine used
astronomy-engine's five largest terms, which differ from it by up to 0.2701″
sampled every 10 minutes from 1800 to 2200
(`docs/evidence/nutation-2026-09-29/results/nutation-change.json`); either way
the nutation appears in `nutation` and `true` and cancels out of sidereal
longitudes, and `mean` does not involve it.

`AyanamsaValue.flags` is `["outside-reference-span"]` when the instant lies
outside 1800–2200 (`REFERENCE_SPAN`), or when an epoch definition's epoch does,
and empty otherwise. The value is still computed, as charts outside the span
are. An instant is read as a chart reads its own: on UTC and the engine's time
basis ([time.md](time.md)) unless `{ timeScale: "ut1" }` or `{ timeScale:
"tt" }` says otherwise; pass `{ deltaT: seconds }` to pin ΔT, as for a chart
(at most 1e10 s). The value records the `timeScale` and `deltaT` it was read
with, as a chart does. An instant whose TT falls outside `EPHEMERIS_SPAN` is
refused with a `RangeError`, as a chart's is.

Every Jyotish function takes a `SiderealLongitude`, never a bare number. The
engine makes a `SiderealLongitude` only in these ways:

- `siderealLongitude(tropicalLongitude, ayanamsaValue)`: a tropical longitude
  of date for the instant of the `AyanamsaValue`. The value records its
  tropical source, the true ayanamsa subtracted (`trueAyanamsa`) and the
  instant as ISO 8601 UTC (`utc`): for an ayanamsa read on UT1 or TT, the UTC
  instant of its time basis, which is how the timing entry reads a chart's
  instant, and not the UT1 or TT reading that `AyanamsaValue.utc` keeps.
- `siderealChart(natal, ayanamsa)`: see below.
- `declareSiderealLongitude(longitude, { ayanamsa: label, at? })`: a longitude
  you state is already sidereal, for example one produced by another program.
  The engine cannot check that claim, so it records your label. Pass `at` if
  the value will be used for a dasha.

A copied object, a bare number or a look-alike object is rejected with a
`RangeError`.

## Sidereal charts

`siderealChart(natal, ayanamsa)` takes a chart or a `BirthInput` and returns:

- `ayanamsa`: the definition's name, and `ayanamsaValue`: the `AyanamsaValue`
  at the chart's own instant, read on the chart's own time scale and time
  basis, a pinned `deltaT` included;
- `bodies`, `ascendant`, `midheaven` and `cusps` as `SiderealLongitude`
  values (the angles and cusps are `null` when the chart has none);
- `houseSystem`: the system the chart's houses were computed with, after any
  polar fallback; `null` without houses;
- `flags`: the chart's flags, with the ayanamsa's.

The ayanamsa name is checked before the chart is computed. A supplied chart is
checked as `transits` checks one; its tropical positions remain its claim.

Whole-sign houses, asked for or given by the polar fallback of Placidus and
Koch, are rebuilt in the sidereal zodiac: house 1 is the sidereal sign of the
sidereal ascendant, from 0° of that sign, and each cusp lies exactly on a
sign's start. The tropical whole-sign cusps less the ayanamsa would sit about
6° into each sidereal sign. In the example above with
`houseSystem: "whole"`, the sidereal ascendant is Leo 26.25°, so house 1
starts at 120°; the Sun is in house 10 and Saturn in house 6. For every other
system each cusp is the chart's cusp less the ayanamsa: the sidereal longitude
of the same point on the ecliptic.

## Ayanamsas

`AYANAMSAS` holds the nine built-in definitions. Each has a `source` field
with a short citation.

| Name | Kind | Definition |
| --- | --- | --- |
| `lahiri` | epoch | 23°15′00.658″ **true** at 1956-03-21 0h TT, with IAU 1976 precession (Indian Astronomical Ephemeris 1989, p. 556, revising the Calendar Reform Committee's 23°15′00″ of 1955). Stored as the mean 23°14′43.889073″, less the IAU 1980 Δψ at that instant (+16.768927″). |
| `fagan-bradley` | epoch | 24°02′31.36″ **mean** at B1950.0 (JD 2433282.42345905 TT), from the synetic vernal point at 335°57′28.64″, with Newcomb's precession. |
| `krishnamurti` | epoch | 22°21′50″ (22.363889°) at 1900-01-01 0h TT (JD 2415020.5), with Newcomb's precession: a fit to Krishnamurti's own table (see below). |
| `raman` | linear | (year − 397) × 50⅓″ (B. V. Raman, 1935): 0 at J397.0 (JD 1866049.25 TT), increasing by 50⅓″ per Julian year. |
| `yukteswar` | linear | 20°54′36″ at the March equinox of 1894 (1894-03-20 14:59 TT, JD 2412908.1244 TT), increasing by 54″ per Julian year (Sri Yukteswar, 1894). |
| `true-chitra` | star | Spica (α Vir) at 180°. |
| `true-revati` | star | ζ Psc at 359°50′. |
| `true-pushya` | star | δ Cnc at 106°. |
| `galactic-center` | star | Sgr A* at 240° (0° Sagittarius). |

### Epoch definitions: held at J2000.0

An epoch definition gives a mean value `A0` at a TT epoch `t0`, computed with
the precession model of its day: IAU 1976 for Lahiri, Newcomb's for
Fagan–Bradley and Krishnamurti. The engine's tropical longitudes use IAU 2006
precession. The models agree on the equinox at J2000.0 and nowhere else, so a
fixed star's tropical longitude at `t0` differs between them.

The engine keeps each zodiac where the definition's own model puts it at
J2000.0, and carries it from there with IAU 2006 precession, measured on the
mean ecliptic of `t0`:

    ayanamsa(t) = A0 − λ_M(t0; J2000) + λ_2006(t0; J2000) − λ_2006(t0; t)

where `λ_M(t0; t)` is the longitude of the mean equinox of `t` on the mean
ecliptic of `t0`, in model M. This is the construction the Indian
Astronomical Ephemeris itself has used since 2021: it holds Lahiri at
23°51′25.53″ at J2000.0, the value its 1956 definition gives there with IAU
1976 precession (23°51′25.532″), and adds the IAU 2006 precession in
longitude (IAE 2027, p. 382). Swiss Ephemeris has done the same since version
2.09 (its documentation, §2.8.11). It keeps the sidereal longitudes the
definition's own tables imply. The engine's Lahiri is 23°51′25.532″ at
J2000.0. It reproduces IAE 2027's mean values for 2027.0 and 2028.0 to their
printed 0.01″, and its 161 true values for 2027–28, printed to 0.1″, within
0.051″ given the IAU 2000A nutation the edition uses. Over 1800–2200 it stays
within 0.004″ of the IAE's polynomial.

The cost is that no epoch definition returns its defining value at its own
epoch:

| Name | Defined | Engine, at the same instant | Difference |
| --- | --- | --- | --- |
| `lahiri` | 23°15′00.658″ true at 1956-03-21 0h TT | 23°15′00.830″ true (mean 23°14′44.019″) | +0.172″ (mean +0.130″) |
| `fagan-bradley` | 24°02′31.36″ at B1950.0 | 24°02′30.947″ | −0.413″ |
| `krishnamurti` | 22°21′50.000″ at 1900-01-01 0h TT | 22°21′49.170″ | −0.830″ |

Carried with the definition's own model instead, the values would depart from
the engine's by up to 0.623″ for Lahiri and 1.673″ for Fagan–Bradley and
Krishnamurti over 1800–2200, and the sidereal positions with them. The IAE's
editions before 2021 did carry the 1956 value with IAU 1976 precession; the
engine differs from their mean values by +0.073″ (1989.0), +0.044″ (1990.0),
+0.002″ (2000), −0.122″ (2019) and −0.124″ (2020), as quoted in the Swiss
Ephemeris documentation (appendix E).

Newcomb's precession is taken in Kinoshita's (1975) formulation and IAU 1976
in Lieske et al.'s (1977). The Explanatory Supplement's (1961) formulation of
Newcomb would place Fagan–Bradley 4.5–4.8 mas and Krishnamurti 7.7–9.1 mas
lower at J2000.0, depending on the direction it is applied in.

**Krishnamurti.** Krishnamurti's own publications do not give 22°21′50″. KP
Reader 1 (pp. 54–59) gives a zero-ayanamsa year, 291 CE, without a date; a
rate of 50.2388475″ a year; and a table of the ayanamsa for each year
1840–2001 (p. 58), to the minute, without a date within the year. The zero
year and the table disagree by about 1′. The value 22.363889° at 1900 is a
fit to the table, by R. Hand and G. Dawson. The Swiss Ephemeris documentation
(§2.8.6) gives its epoch as 1 January 1900, and Solar Fire, where it comes
from, enters ayanamsas as the sidereal vernal point on 1 January 1900; neither
gives a time. The engine reads it as 0h TT. Read as J1900.0 (noon on
31 December 1899), the epoch Swiss Ephemeris's values correspond to, every
value is 0.069″ larger. The table cannot tell the two readings apart: with
each year's entry taken on 1 January, both match it to the minute in 145 of
161 years, and on 15 April in 110.

### Linear definitions

These are exactly the formula their authors give. A Julian year is 365.25
days of TT. The formula value is used as `mean`, and `true` adds Δψ as for
every other definition.

- Raman's manual (§49) titles the rule "Determination of (Approximate)
  Ayanamsa"; the engine reads it as continuous, as §49's "Ayanamsa for odd
  days" allows. In *Hindu Predictive Astrology* (pp. 378–379) Raman gives 389
  CE, not 397, as the year of zero ayanamsa, as the Swiss Ephemeris
  documentation (§2.8.9) reports; the engine follows the manual's formula.
- Sri Yukteswar's value is the book's 20°54′36″ at the 1894 equinox with 54″
  a year.

### Star definitions

Star definitions place the star's apparent geocentric position of date at a
fixed sidereal longitude. The position is computed from the Hipparcos new
reduction (van Leeuwen 2007): space motion from the proper motion, parallax
and radial velocity, then annual parallax, light deflection by the Sun, annual
aberration, the ICRS frame bias, and the engine's precession. Sgr A* uses its
ICRS radio position with Reid and Brunthaler's (2004) proper motion. It has
no parallax or radial velocity, so it is treated as infinitely distant. For
these definitions, `mean` is measured from the mean equinox, so the star's
apparent longitude of date minus `true` is exactly the anchor longitude.

The catalogue matters more than the computation. Gaia EDR3's values for
ζ Psc and δ Cnc move True Revati and True Pushya by −0.22″ to +0.25″ over
1800–2200 (zero near 2000); Gaia has no usable astrometry for Spica. The engine agrees with ERFA's astrometry on the
same catalogue values within 0.001″ at instants more than 5° from the Sun,
and with Swiss Ephemeris within 0.0044″. That shows the computations agree on
shared inputs, not that either is that accurate.

### User-defined ayanamsas

```ts
import { ayanamsa, userAyanamsa } from "@zodiacs/engine/vedic";

// A value at an epoch, carried by the engine's precession.
const mine = userAyanamsa({ name: "mine", epoch: { julianDateTT: 2451545 }, value: 23.85 });
// A value computed with Newcomb or IAU 1976 precession, held as the epoch definitions are.
const old = userAyanamsa({ name: "old", epoch: { julianDateTT: 2415020 }, value: 22.46, model: "newcomb" });
// A value at an epoch plus a fixed rate, in arcseconds per Julian year.
const linear = userAyanamsa({ name: "linear", epoch: "1900-01-01T00:00:00Z", value: 22.5, rate: 50.25 });

ayanamsa(mine, "2026-09-28T00:00:00Z").true;
```

- `name` must be a lowercase identifier of at most 64 characters and must not
  be a built-in name. The default is `"user"`.
- `epoch` is either `{ julianDateTT }`, a Julian date a JavaScript `Date` can
  hold (JD −97,559,412.5 to 102,440,587.5), or a UTC instant, which is
  converted to TT on the engine's time basis (leap seconds from 1972 to
  2027-10-02, the ΔT model otherwise), not with a pinned value.
- `value` is the **mean** ayanamsa at the epoch, in degrees, in [−360, 360],
  as `model` computes it.
- `model` (default `"engine"`): with `"engine"` the engine returns `value` at
  the epoch. With `"newcomb"` or `"iau1976"` the zodiac is held where that
  model puts it at J2000.0, like the built-in definitions, so the engine's
  value at the epoch differs from `value`: by −0.830″ for Newcomb from J1900.0
  and +0.130″ for IAU 1976 from 1956, for example.
- `rate`, in arcseconds per Julian year in [−3600, 3600], makes the
  definition linear. `rate` cannot be combined with `model`.

`userAyanamsa({ epoch: { julianDateTT: t0 }, value })` behaves like Swiss
Ephemeris's `SE_SIDM_USER` with `t0` in TT. It matched within 0.0013″ at three
epochs.

### Agreement with Swiss Ephemeris

The mean ayanamsa was compared with Swiss Ephemeris 2.10.03
(`swe_get_ayanamsa_ex_ut` with the same named mode) every 10 days from 1800
to 2200. That is 14,647 instants, and the gate is 0.01″.

| Name | Max \|difference\| | Result |
| --- | --- | --- |
| `lahiri` | 0.0013″ | pass |
| `fagan-bradley` | 0.00091″ | pass |
| `true-chitra` | 0.0020″ | pass |
| `true-revati` | 0.0044″ | pass |
| user-defined (J1900, B1950, J2000 epochs) | 0.0013″ | pass |
| `krishnamurti` | 0.0712″ | fail: the engine reads "1 January 1900" as 0h TT, Swiss Ephemeris as J1900.0; with J1900.0 the difference is 0.0024″ |
| `true-pushya` | 0.544″ | fail on 12 instants when δ Cnc is behind the Sun's disk; 0.0021″ at the 14,628 instants when it is more than 0.3° from the Sun |
| `galactic-center` | 0.101″ (median 0.0195″) | fail: Swiss uses different catalogue data for Sgr A* |
| `raman` | 10.14″ | differs by definition: the engine uses Raman's 1935 formula; Swiss uses another epoch value |
| `yukteswar` | 806.16″ | differs by definition: the engine uses The Holy Science's value and 54″/yr; Swiss uses another epoch value |

The evidence README gives the full statistics and what caused each failure.
Given Swiss's own epoch values, the engine's machinery reproduces its Raman,
Yukteswar and Krishnamurti modes within 0.0024″. Those values are not
published here. Agreement with Swiss Ephemeris is a consistency check, not an
accuracy claim.

**Range.** Only 1800–2200 was compared. The engine's IAU 2006 precession
departs from long-term models by about 0.34″ at 0 CE and 10″ at 3000 BCE.
Ayanamsas far from the present inherit that difference.

## Nakshatras and padas

`nakshatraOf(position)` returns `{ index, name, lord, pada, start, elapsed }`:

- There are 27 nakshatras of 13°20′ each, starting at 0° sidereal Aries with
  Ashwini.
- Each nakshatra has four padas of 3°20′.
- The Vimshottari lords run Ketu, Venus, Sun, Moon, Mars, Rahu, Jupiter,
  Saturn and Mercury from Ashwini (BPHS 46.12–15).
- `start` is where the nakshatra begins, in degrees.
- `elapsed` is the fraction of the nakshatra already traversed, in [0, 1).

**Boundaries.** A longitude exactly on a boundary belongs to the nakshatra or
pada that begins there. The comparison is exact: every boundary of every
division here is a whole number of 1/7560°, and the engine computes
`floor(lon × 7560)` on the double's binary value, without rounding error.
Most boundaries are not themselves doubles. The double nearest a boundary
falls on one side of it and is placed on that side: `93 + 20 / 60` is 4.7 ×
10⁻¹⁵° below 93°20′ and is placed in Punarvasu, while a table in degrees and
minutes starts Pushya at 93°20′; `13 + 20 / 60` lies above 13°20′ and is
placed in Bharani. Boundaries that are
whole degrees, such as 40° and 120°, are exact. To place a degree–minute value
the way such a table does, add a margin far below any astronomical precision,
such as 1e-9°, before declaring it.

## Vargas

`vargaOf(position, varga, scheme = "parashari")` returns
`{ varga, scheme, part, sign, signIndex }`. `part` counts from 1 within the
natal sign. `VARGAS` lists the sixteen with their rules and verses (BPHS
ch. 6, Santhanam's translation):

| Varga | Rule |
| --- | --- |
| D1 Rashi | The sign itself. |
| D2 Hora | Odd signs: first half Leo (the Sun), second half Cancer (the Moon). Even signs: the reverse. |
| D3 Drekkana | The sign, then the 5th and 9th from it. |
| D4 Chaturthamsa | The sign, then the 4th, 7th and 10th from it. |
| D7 Saptamsa | Odd signs count from the sign; even signs from the 7th. |
| D9 Navamsa | Movable signs count from the sign, fixed from the 9th, dual from the 5th. |
| D10 Dasamsa | Odd signs count from the sign; even signs from the 9th. |
| D12 Dvadasamsa | Counted from the sign. |
| D16 Shodasamsa | Movable signs count from Aries, fixed from Leo, dual from Sagittarius. |
| D20 Vimsamsa | Movable signs count from Aries, fixed from Sagittarius, dual from Leo. |
| D24 Chaturvimsamsa | Odd signs count from Leo; even signs from Cancer. |
| D27 Saptavimsamsa | Fiery signs count from Aries, earthy from Cancer, airy from Libra, watery from Capricorn. |
| D30 Trimsamsa | Odd signs: 5° Aries, 5° Aquarius, 8° Sagittarius, 7° Gemini, 5° Libra. Even signs: 5° Taurus, 7° Virgo, 8° Pisces, 5° Capricorn, 5° Scorpio. |
| D40 Khavedamsa | Odd signs count from Aries; even signs from Libra. |
| D45 Akshavedamsa | Movable signs count from Aries, fixed from Leo, dual from Sagittarius. |
| D60 Shashtiamsa | Counted from the sign. |

- `"parashari"` is the rule shown above.
- `"cyclic"` is available for D2 and D3 only. It counts the 24 horas or 36
  drekkanas on from Aries, which BPHS 6.5–8 also describes. This scheme is
  also called parivritti.
- Variants from later practice are listed in `VargaDefinition.notImplemented`
  and rejected by name: the Kashinatha hora, and the Jagannatha and Somanatha
  drekkanas.
- Unknown vargas and schemes are rejected with a `RangeError`.

## KP sub-lords

KP cuts each nakshatra into nine subs in Vimshottari proportions (a lord's
years ÷ 120 of 13°20′). The first sub belongs to the nakshatra's own lord,
and the rest follow in dasha order. Each sub is cut into nine sub-subs the
same way, starting with the sub's own lord.

`KP_SUBS` lists the 249 numbered subs from 0° Aries. There are 243 subs in
all, and the six that cross a sign boundary are counted once in each sign.
Each entry holds the sub's sign, star and lords and its start and end in
degrees; the end is exclusive.

`kpLordsOf(position)` returns the sign lord, star lord, sub-lord,
sub-sub-lord and the numbered sub. Boundaries are placed as for nakshatras.
KP practice uses the `krishnamurti` ayanamsa. The function uses whichever
ayanamsa its argument carries.

## Dashas

A dasha starts from the Moon's `SiderealLongitude` at birth. That value
carries the birth instant on UTC, so a chart given on UT1 or TT starts its
dashas from the UTC instant of its time basis, as its timing techniques do; a
declared Moon needs `at`. Time is elapsed-time arithmetic: a dasha year is a
fixed number of days, and calendar dates play no part.

| `yearLength` | Days | Note |
| --- | --- | --- |
| `"julian"` | 365.25 | default |
| `"tropical"` | 365.2422 | |
| `"savana"` | 360 | |

Periods (`DashaPeriod`) have these fields:

- `start` and `end` are ISO 8601 UTC, the boundaries rounded to the
  millisecond. A period runs from `start` (inclusive) to `end` (exclusive).
- `startMs` and `endMs` are the unrounded milliseconds.
- `years` is the length in dasha years.
- `lords` runs from the mahadasha down to the period itself.

Consecutive periods share one boundary value, so they meet exactly, and a
period's last sub-period ends exactly where the period does. A sequence's
first mahadasha starts before birth, at the moment the whole dasha would have
begun.

**Vimshottari** (BPHS 46.12–16 and 51.1–2):

- `vimshottariDasha(moon, { yearLength })` gives the nine mahadashas, 120
  years in all. The lord of the birth nakshatra runs first.
- The balance at birth is the untraversed fraction of that lord's years. The
  fraction is taken from the Moon's longitude, as modern tables do. BPHS's own
  worked examples use the Moon's time in the nakshatra (bhayat/bhabhog)
  instead, which gives a slightly different balance.
- `dashaSubperiods(period)` divides a period of levels 1–4 into nine parts.
  The parts start with the period's own lord, and each lasts period years ×
  its years ÷ 120. The levels are antardasha, pratyantardasha, sookshmadasha
  and pranadasha.
- `vimshottariAt(moon, at, { yearLength, levels })` returns the chain of
  periods running at an instant, from level 1 down to `levels` (default 5).
  It compares the instant, in whole milliseconds, with the periods' `start`
  and `end`, so a period's own `start` finds that period. An instant outside
  the 120-year cycle is a `RangeError`.

**Yogini** (BPHS 46.195–199):

- `yoginiDasha(moon, { yearLength, cycles })` starts from the birth
  nakshatra's number (Ashwini is 1). Add 3 and take the remainder by 8, with 0
  counting as 8. The result is the yogini running at birth: Mangala, Pingala,
  Dhanya, Bhramari, Bhadrika, Ulka, Siddha or Sankata, running 1 to 8 years.
- One cycle is 36 years. `cycles` can be 1 to 10; the default is 1.

**Ashtottari** (BPHS 46.17–23):

- `ashtottariDasha(moon, { yearLength, cycles })` counts 28 nakshatras from
  Ardra, including Abhijit. Abhijit is the last pada of Uttara Ashadha plus
  the first fifteenth of Shravana.
- The nakshatras are grouped 4, 3, 4, 3, … and assigned to the Sun (6 years),
  the Moon (15), Mars (8), Mercury (17), Saturn (10), Jupiter (19), Rahu (12)
  and Venus (21), 108 years in all.
- Each nakshatra of a group carries an equal share of its lord's years: ¼ for
  a group of four, ⅓ for a group of three.
- **When it applies.** BPHS 46.17–20 applies this dasha when Rahu, not in the
  ascendant, is in a kendra or trikona from the ascendant's lord. 46.23 applies
  it for a day birth in the dark fortnight or a night birth in the bright one.
  The engine states these rules but does not test them. Choosing to use the
  dasha is left to the caller.

Yogini and Ashtottari give mahadashas only. `dashaSubperiods` rejects their
periods.

## Errors and flags

These all throw a `RangeError`:

- an unknown ayanamsa, varga, scheme or year length;
- a named variant that is not implemented;
- a definition or value the engine did not make;
- a non-finite or out-of-range number, including a ΔT pin over 1e10 s and a
  user epoch no `Date` can hold;
- an unparseable date;
- a dasha Moon without an instant;
- `levels` outside 1–5 or `cycles` outside 1–10;
- an instant outside the Vimshottari cycle.

Results outside 1800–2200 carry `outside-reference-span`, as charts do.

## Not included

- Yogini and Ashtottari antardashas.
- A helper that tests whether Ashtottari applies.
- Balances computed from the Moon's time in the nakshatra.
- Varga variants beyond those named above, and vargas outside the sixteen
  (D5, D6, D8, D11, D81, D108 and so on).
- Other ayanamsas: Lahiri's original ICRC value (23°15′00″ at 1956-03-21,
  used by the IAE before 1985), Lahiri's 1940 value and his zero point of
  285 CE, the IAE's pre-2021 IAU 1976 carry, the Krishnamurti–Senthilathiban
  ayanamsa (zero at the 291 CE equinox), other star anchors, and
  galactic-equator zodiacs. Any value at an epoch can be given to
  `userAyanamsa`.
- Light deflection for a star behind the Sun's disk (see `true-pushya` above).
- Sidereal house systems (bhava chalit, Sripati). Apart from whole-sign
  houses, `siderealChart` subtracts the ayanamsa from the chart's own cusps.
- Historical reference frames: the FK4 equinox of the Newcomb era is not
  modelled.
- Panchanga, shadbala, ashtakavarga and yogas.
- A sidereal field in the natal receipt, which still records tropical charts.

## Sources

- *Brihat Parashara Hora Shastra*, tr. R. Santhanam (Ranjan Publications,
  1984): ch. 4 (sign lords), ch. 6 (vargas), ch. 46 (dashas), ch. 51
  (sub-periods).
- P. V. R. Narasimha Rao, *Vedic Astrology: An Integrated Approach* (2000),
  §6.2 (varga examples).
- *The Indian Astronomical Ephemeris for the year 1989* (India Meteorological
  Department), p. 556, footnote, as quoted in the Swiss Ephemeris
  documentation, §2.8.5: "According to new determination of the location of
  equinox this initial value has been revised to 23°15′00″.658 and used in
  computing the mean ayanamsha with effect from 1985". *The Indian
  Astronomical Ephemeris for the year 2027* (Positional Astronomy Centre,
  Kolkata, 2026), pp. 381–382 and 423. M. N. Saha and N. C. Lahiri, *Report
  of the Calendar Reform Committee* (CSIR, 1955).
- Michael Erlewine, *Astro\*Index* (1997), "Synetic Vernal Point".
- K. S. Krishnamurti, *KP Reader 1* (*Casting the Horoscope*), pp. 54–59,
  with the table on p. 58 as transcribed by D. Senthilathiban, *Study of KP
  Ayanamsa with Modern Precession Theories* (2019), table 29. The value
  22.363889° at 1900: Swiss Ephemeris documentation §2.8.6 (from G. Dawson's
  Solar Fire, after R. Hand's Nova); *Solar Fire 9 User Guide* (Esoteric
  Technologies, 2014), p. 399, for ayanamsas as the sidereal vernal point on
  1 January 1900.
- B. V. Raman, *A Manual of Hindu Astrology* (1935), §49, and *Hindu
  Predictive Astrology*, pp. 378–379, as cited in the Swiss Ephemeris
  documentation, §2.8.9.
- Sri Yukteswar, *The Holy Science* (1894), Introduction.
- Surya Siddhanta ch. VIII (Burgess tr.) for Chitra at 180° and Revati at
  359°50′. P. V. R. Narasimha Rao, "Introducing Pushya-paksha Ayanamsha"
  (2013), for δ Cnc at 106°.
- F. van Leeuwen, *Hipparcos, the New Reduction* (2007; VizieR I/311).
  Radial velocities: SIMBAD (Spica), Gontcharov 2006 (ζ Psc) and Famaey et
  al. 2005 (δ Cnc). Gaia EDR3 (VizieR I/350) through SIMBAD, for the
  catalogue comparison.
- Sgr A*: SIMBAD ICRS position (Petrov et al. 2011). Proper motion from M. J.
  Reid and A. Brunthaler, ApJ 616, 872 (2004), table 2.
- H. Kinoshita, SAO Special Report 364 (1975), table 3 (Newcomb precession).
  J. H. Lieske et al., A&A 58, 1 (1977) (IAU 1976 precession). N. Capitaine et
  al., A&A 412, 567 (2003) (IAU 2006 precession). IERS Conventions (2010),
  eq. 5.21 (frame bias).
- Swiss Ephemeris documentation, §2.8.5–2.8.11 and appendix E, for the
  history of the Lahiri and Krishnamurti values and its own construction.
