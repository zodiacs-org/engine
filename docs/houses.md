# House positions, co-ascendants, speeds and planetary returns

`@zodiacs/engine/houses` gives three things the root entry does not: the house
position of a body that has ecliptic latitude, in each of the thirteen house
systems; the co-ascendants and the polar ascendant; and the speeds of the
cusps and the angles. `planetaryReturns`, in `@zodiacs/engine/timing`, gives
the instants a body returns to its natal longitude. The measurements behind
every figure here are in
[`evidence/houses-extra-2026-09-29/`](evidence/houses-extra-2026-09-29/README.md).

```ts
import { coAscendants, housePosition, houseSpeeds, SIDEREAL_RATE } from "@zodiacs/engine/houses";
import { planetaryReturns } from "@zodiacs/engine/timing";

// The AngleInput that computeAngles and computeHouses take: Greenwich apparent
// sidereal time in hours, east longitude, latitude and true obliquity, degrees.
const input = { gastHours: 21.5, longitude: 12.4, latitude: 47.1, obliquity: 23.4362 };

housePosition("placidus", input, { lon: 203.7, lat: 4.9 }); // 5.542…: 54% through the 5th house
coAscendants(input);        // { equatorialAscendant, kochCoAscendant, munkaseyCoAscendant, polarAscendant }
houseSpeeds("koch", input); // { system, fellBack, cusps: [12 speeds], angles: { asc, mc, dsc, ic } }, degrees a day

planetaryReturns({ utc: "1995-04-09T12:04:00Z" }, "Mercury", "2031-02-15", "2031-06-15");
// { status: "complete", returns: [direct, retrograde, direct], … }
```

The houses entry is one file of 13,606 bytes that imports no other module: no
ephemeris and nothing of the root entry. The RAMC is `gastHours × 15 +
longitude`; to start from a RAMC, pass `gastHours: ramc / 15, longitude: 0`.
Invalid input throws `RangeError`.

## House position of a body

`housePosition(system, input, { lon, lat })` returns a number in [1, 13): its
integer part is the house, its fraction how far through the house the body is.
`(position − 1) × 30` is the body's mundane position in degrees. It is `null`
where the system defines no position (below). This is the quantity Swiss
Ephemeris's `swe_house_pos` returns, with its definitions [SE-P §16,
SE-G §6.5]:

> The function returns a value between 1.0 and 12.999999, indicating in which
> house a planet is and how far from its cusp it is. [SE-P §16]

> Because the planets are not always exactly located on the ecliptic but have
> a latitude, they can seemingly be located in the first house, but are
> actually visible above the horizon. In such a case, our program function will
> place the body in the 12th (or 11th or 10th) house, whatever celestial
> geometry requires. [SE-G §6.5]

A body lies on one house circle of the system; its position is that circle's.
Each system's circles, the circle its division is measured along, and so how
the body's latitude enters:

| System | House circles (definition) | Measured along | The body's latitude enters through |
| --- | --- | --- | --- |
| Equal, Vehlow, whole sign, Equal from the midheaven | 30° arcs of the ecliptic from the ascendant, from 15° before it, from the start of its sign, from the midheaven + 90° [SE-G §6.2.5] | the ecliptic | nothing: the body is taken at its longitude |
| Porphyry | each quadrant between the angles in three equal arcs [SE-G §6.2.6] | the ecliptic | nothing: its longitude |
| Morinus | the equator from the RAMC in 30° parts, carried to the ecliptic [SE-G §6.2.8]: circles through the poles of the ecliptic | the equator | nothing: every point of a circle through the ecliptic poles has one longitude |
| Meridian (axial rotation) | the equator from the RAMC in 30° parts [SE-G §6.2.7]: hour circles | the equator | its right ascension |
| Alcabitius | the ascendant's semi-arcs in thirds on the equator, with great circles through the celestial poles [SE-G §6.2.11] | the equator | its right ascension |
| Regiomontanus | great circles through the north and south points of the horizon, dividing the equator into 30° parts [SE-G §6.2.3] | the equator | the circle through the horizon's north and south points and the body |
| Campanus | the same circles, dividing the prime vertical [SE-G §6.2.4] | the prime vertical | the circle through the horizon's north and south points and the body |
| Placidus | thirds of each point's own diurnal and nocturnal semi-arcs [SE-G §6.2.1] | the body's own diurnal circle | its declination and hour angle |
| Koch | "horizon lines at different times": the horizons of the sidereal times dividing the midheaven degree's semi-arc into thirds [SE-G §6.2.2] | sidereal time | its oblique ascension (descension, west of the meridian) under the latitude |
| Topocentric (Polich–Page) | the pole of the 11th cusp has tan φ / 3 for tangent, the 12th's 2 tan φ / 3 [SE-G §6.2.10] | the family of those circles | its right ascension and declination |

With the body's right ascension α, declination δ, md = α − RAMC (east of the
meridian for md in [0°, 180°)), the latitude φ, a = tan φ tan δ, and its
diurnal semi-arc D = 90° + asin a, the mundane positions p (degrees, the 1st
cusp at 0°, the 10th at 270°) are:

- **Equal** p = λ − asc; **Vehlow** p = λ − asc + 15°; **whole sign**
  p = λ − 30° ⌊asc / 30°⌋; **Equal from the midheaven** p = λ − mc − 90°, with
  the ascendant and midheaven of `computeAngles`.
- **Porphyry**: λ against the four quadrants between the angles, each 90°
  of p: from the midheaven p = 270° + 90° (λ − mc) / (asc − mc), and so on.
- **Morinus** p = A − RAMC − 90°, with A = atan2(sin λ, cos λ cos ε) the
  right ascension of the equator point of longitude λ.
- **Meridian** p = md − 90°.
- **Alcabitius**: with D_A the ascendant's diurnal semi-arc, p = 270° + 90°
  md / D_A for md < D_A, else 90° (md − D_A) / (180° − D_A).
- **Campanus** p = atan2(x_E, x_Z) − 90°, and **Regiomontanus**
  p = atan2(x_E cos φ, x_Z) − 90°, where x_E = cos δ sin md and
  x_Z = cos φ cos δ cos md + sin φ sin δ are the body's components toward the
  east point and the zenith. Equivalently tan(p + 90°) = sin md /
  (cos md + tan φ tan δ) for Regiomontanus.
- **Placidus**: p = 270° + 90° md / D above the horizon (md < D), else
  90° (md − D) / (180° − D). For a body that never rises or sets, Otto
  Ludwig's convention: "to start the diurnal motion of a circumpolar body at
  its 'midnight' culmination and its nocturnal motion at its midday
  culmination" [SE-G §6.5], so D = 180° for one that never sets and 0° for one
  that never rises.
- **Koch**: p = 90° (md − D) / D_MC, with D_MC the midheaven's diurnal
  semi-arc (tan δ_MC = tan ε sin RAMC). The body is on the horizon of the
  sidereal time RAMC + p D_MC / 90°, at which it rises. Semi-arcs follow
  Ludwig's convention.
- **Topocentric**: above the horizon, the root s in [0, 1] of
  md = 90° s + asin(s a), and p = 270° + 90° s: the circle of oblique
  ascension RAMC + 90° s under the pole of tangent s tan φ. Below it, the root
  of md = 90° + 90° s + asin((1 − s) a), and p = 90° s. The cusps are s = 1/3
  and 2/3.

West of the meridian, Placidus, Koch, Topocentric and Alcabitius take the
position of the body's antipode (md − 180°, −δ) plus 180°: their cusps k and
k + 6 are opposite, and each circle holds both points.

**Where a position is undefined.** Koch has none where the body's rising
(east) or setting (west) time falls outside the house circles, farther from the
RAMC than D_MC, and none where the midheaven never rises (D_MC = 0). Swiss
Ephemeris says so for the circumpolar case: "The Koch method, on the other
hand, cannot be helped even with this method. For some bodies it may work even
beyond the polar circle, but for some it may fail even for latitudes beyond 60
degrees" [SE-G §6.5]; its programmer's manual gives "if a body has a high
declination and falls within the circumpolar sky" as an example [SE-P §16].
Within 1e-9° of the outermost circles, which hold the midheaven's and imum
coeli's own degrees, a position counts as on them. Topocentric has none for a
body that never rises or sets (|a| > 1) where no circle of its quadrant
reaches it: such a body lies only on circles with |s a| ≤ 1. Every other
system defines every position.

**Inside the polar circle** the ascendant is taken east of the meridian, as
`computeAngles` takes it; Equal, Vehlow, whole sign, Porphyry and Alcabitius
follow it. Regiomontanus and Campanus positions come from the geometry alone,
which agrees with the root's cusps turning half a circle with the ascendant.
There the Topocentric circles cross near the horizon, so a point on the
horizon can lie on two of them.

A body exactly on a cusp can come out a rounding error below it: just under
13 at the ascendant.

### Agreement with Swiss Ephemeris

Measured against Swiss Ephemeris 2.10.03's `swe_house_pos` given the same
RAMC, latitude, obliquity and body, on the preregistered grids: the ladder L,
every 0.1° of latitude from 55° to 66.6° in both hemispheres at 24 sidereal
times with 8 bodies each (44,928 positions), and the global grid G, 20,000
random cases over latitudes −89.9° to 89.9° with a body of latitude −20° to
20°. Largest difference of the mundane position, arcseconds, with the gate at
0.01″:

| System | L | G | Verdict |
| --- | ---: | ---: | --- |
| Alcabitius, Meridian, Morinus | under 0.000001″ | under 0.000001″ | pass |
| Campanus, Equal, Equal from the midheaven, Placidus, Regiomontanus, Vehlow, whole sign | 0.001″ | 0.001″ | pass |
| Koch | 0.001″ | 0.001″ | pass; undefined on both sides in 7,515 and 3,498 cases, on one side in none |
| Porphyry | 0.0089″ | 0.051″ (11 cases over 0.01″) | **fail** |
| Topocentric | 0.145″ (444 over) | 0.465″ (301 over) | **fail**, and undefined in the engine alone in 519 and 979 cases |

Swiss's positions differ from the exact ones by 0.001″ in most systems. For
Porphyry the 0.001″ is added to the body's longitude before the quadrant is
divided: the exact positions of the longitude plus 0.001″ reproduce Swiss's to
0.000000006″, and in the 11 cases, whose smaller quadrant is 1.78° to 8.67°
wide, the 0.001″ becomes more than 0.01″.
For Topocentric the engine's positions satisfy the defining equation above to
0.000000002″ of ascension; Swiss's leave up to 0.445″, while at the cusps the
two agree to 0.000000002″. Swiss's Topocentric positions for bodies that
never rise or set, where the engine has none, are its own. The first round of
this measurement took Koch as undefined for every body or midheaven that never
rises or sets, and disagreed with Swiss on polar status in 7,515 cases on L
and 3,474 on G; the reading of [SE-G §6.5] above is what the second round
implements.

## Co-ascendants and the polar ascendant

`coAscendants(input)` returns the four points Swiss Ephemeris's `swe_houses`
returns in `ascmc[4]` to `ascmc[7]` [SE-P §15.4], degrees in [0°, 360°):

- **The equatorial ascendant**, the East Point: "the point on the ecliptic
  whose right ascension is equal to ARMC + 90 … identical to the Ascendant at
  a geographical latitude 0" [SE-G §6.3]. It is the root's `eastPointOf`.
- **Walter Koch's co-ascendant**: "To calculate it, one has to take the ARIC
  as an ARMC and compute the corresponding Ascendant for the birth place. The
  'Co-Ascendant' is then the opposition to this point." [SE-G §6.3]
- **Michael Munkasey's co-ascendant**: "the Ascendant computed for the natal
  ARMC and a latitude which has the value 90° − birth_latitude" [SE-G §6.3];
  for a southern latitude −90° − φ, which has the same tangent.
- **Michael Munkasey's polar ascendant**: "the opposition point of Walter
  Koch's version of the 'Co-Ascendant'" [SE-G §6.3].

The last three belong to Munkasey's eight Personal Sensitive Points [SE-G
§6.3]. Each is the ecliptic point of an oblique ascension A under a pole p,
λ = atan2(sin A, cos A cos ε − tan p sin ε): A = RAMC + 90° with p = 0 for the
equatorial ascendant, A = RAMC + 270° with p = φ for the polar ascendant (the
Koch co-ascendant is its opposite), and A = RAMC + 90° with p = 90° − φ for
Munkasey's co-ascendant. Where that point lies west of the meridian (inside
the polar circle, and for Munkasey's within 90° − ε of the equator), it is not
turned east as the ascendant is.

Against Swiss's `swe_houses_armc` given the same RAMC, latitude and obliquity,
the largest difference for any of the four points is under 0.00000001″, on L
(5,616 cases) and on G (20,000); the gate is 0.01″. **Pass.**

## Speeds of the cusps and the angles

`houseSpeeds(system, input)` returns the speeds of the twelve cusps
`computeHouses` returns and of the four angles, in degrees per day. Each is
the derivative with respect to the RAMC, found analytically, times
`SIDEREAL_RATE`, 360.98564736629° of sidereal time per day of UT1, the rate
of J. Meeus's expression for mean sidereal time [Meeus, eq. 12.4]. The
latitude and the obliquity are held fixed, as Swiss Ephemeris's
`swe_houses_armc_ex2` holds the obliquity it is given.

With θ the RAMC, every cusp that is the ecliptic point of an oblique ascension
A(θ) under a fixed pole of tangent t has

  dλ/dθ = (cos ε − k cos A) / (sin² A + (cos A cos ε − k)²) · dA/dθ,
  k = t sin ε,

which gives the ascendant (A = θ + 90°, t = tan φ), the midheaven (A = θ,
t = 0), Meridian, Regiomontanus, Campanus and Topocentric, whose A moves with
θ. The other systems:

- Equal and Vehlow move with the ascendant, Equal from the midheaven with the
  midheaven, and Porphyry's cusps with their thirds of the quadrants.
- Morinus: dλ/dA = cos ε / (cos² A + sin² A cos² ε).
- Koch: A = θ + 90° + k D_MC / 3 for k = ±1, ±2, where the midheaven's
  semi-arc moves with θ: dA/dθ = 1 + (k / 3) q cos θ / √(1 − q² sin² θ), with
  q = tan φ tan ε.
- Alcabitius: the ascendant's semi-arc D_A moves with the ascendant, and
  dA/dθ = 1 + (share) dD_A/dθ for the cusp's share of it.
- Placidus: the cusp's right ascension solves α = θ + c + m asin(q sin α)
  (c = 30°, 60°, 120°, 150°; m = 1/3, 2/3), so dα/dθ =
  1 / (1 − m q cos α / √(1 − q² sin² α)), and the cusp moves at
  cos ε / (sin² α + cos² α cos² ε) times that.
- Whole-sign cusps have speed 0.

Where Placidus or Koch falls back to whole signs inside the polar circle,
`fellBack` is true and the cusp speeds are 0, as whole-sign cusps are.

**Against the engine's own cusps.** A central difference of `computeHouses`
and `computeAngles` at the RAMC ± 0.001° with Richardson's extrapolation
agrees with every analytic speed on both grids to 0.00035° a day (Placidus
0.00024°, the others 0.0000025° or less), against a preregistered tolerance of
0.004° a day plus one part in a million. **Pass**, every system.

**Against Swiss Ephemeris** (`swe_houses_armc_ex2`, same inputs, Swiss's
speeds rescaled by the rate it reports for the RAMC; the same tolerance):
**pass** for the ascendant, the midheaven, Campanus, Equal, Equal from the
midheaven, Meridian, Morinus, Regiomontanus, Topocentric and Vehlow (at most
0.00000015° a day), and Alcabitius on L (0.00021°); **fail** for Koch (up to
67% of the speed), Placidus (up to 104%), Porphyry, whole sign, and
Alcabitius on G in 5 cases. Swiss's own speeds disagree with a central
difference of Swiss's own cusps in exactly those values, compared value by
value, and in no other: there they are not the derivatives of its cusps.

## Planetary returns

`planetaryReturns(natal, body, from, to, options?)` in
`@zodiacs/engine/timing` returns every instant in (from, to] at which `body`
stands on the longitude it has in the natal chart.

- "The planetary return in astrology is when the transiting planet returns to
  the precise position it was in at the moment of a person's birth."
  "Returns apply also to the sun and moon" [WP, *Planetary returns*, citing
  D. and J. Parker, *The New Compleat Astrologer*, 1990, pp. 176–7].
- "A transiting planet may pass over a particular spot in a natal chart and
  then turn retrograde, passing over the same spot again before it then goes
  'direct' again, passing over the spot for a third time." [WP, *Retrograde
  motion*] Every crossing is a return; `retrograde` marks the backward one,
  and `pass` numbers the passes from 1 in the window: a direct return after a
  direct one starts a new pass, as the body has gone round the circle between
  them.

`body` is the Sun, the Moon or Mercury to Pluto (`RETURN_BODIES`). `natal` is
a `Chart` or a `BirthInput`; the natal longitude is the chart's own apparent
geocentric longitude of the body. The returns are found by
`searchLongitudeCrossings` on the engine's longitudes, read as UTC on its time
basis, so the result carries the search's verdict: `status: "complete"` with
every return it found, or `status: "refused"` with none when
`options.maxSamples`, a budget of longitude evaluations, runs out. Each body
is searched at its own step, `RETURN_STEP_DAYS`: 5 days for the Sun, 1 for the
Moon, 2 for Mercury, 4 for Venus and 5 for the rest. From 1800 to 2200 two
steps are shorter than the shortest time between two stations of the engine's
longitudes (19.75 days for Mercury, 40.75 for Venus, 59.75 for Mars, 117.25
or more for the others), and one step moves the Moon at most 15.4°. The
search finds a pair of returns around a station that falls between two
samples; it assumes smooth motion with at most one station in two steps, and
it is tested, not proven, complete. Results carry `outside-reference-span`
when the birth or the window lies outside `REFERENCE_SPAN`, and are frozen.

Against JPL Horizons (DE441), with invented natal charts whose windows hold a
direct, retrograde and direct return for each of Mercury to Pluto, three solar
and four lunar returns: every result complete, every return found with its
direction, and each within τ / |v| of Horizons's instant, τ being 6″ for the
Sun, 8″ for the Moon and 45″ for the planets. The largest differences, as
motion: 0.84″ (Sun), 0.82″ (Moon), 11.8″ (Mars) and 22.6″ (Pluto, whose natal
longitude in 1804 is itself 17.53″ from Horizons's). Against the US Naval
Observatory's published March equinoxes of 2001 to 2004, the solar returns of
a native invented as born at the equinox of 2000 fall within 49.4 s of them;
USNO gives each instant to the minute. **Pass.**

## Sources

Access date for every URL: 2026-09-29. SHA-256 values identify the copies
read.

- [SE-G] Astrodienst, *Swiss Ephemeris: Computer ephemeris for developers of
  astrological software* (the general documentation, for version 2.10.03),
  <https://www.astro.com/swisseph/swisseph.htm>, §6.2 (house systems), §6.3
  (Vertex, Antivertex, East Point and Equatorial Ascendant etc.), §6.4 (house
  cusps beyond the polar circle), §6.5 (house position of a planet). SHA-256
  `7ca3f8863d31001f3a1411139d4759813cc8c3d3c51312fbc45aa84382f05aa2`.
- [SE-P] Astrodienst, *Swiss Ephemeris: Programming interface*,
  <https://www.astro.com/swisseph/swephprg.htm>, §15.4 (`swe_houses_ex`,
  the `ascmc` array), §16 (`swe_house_pos`). SHA-256
  `8fe1629b648eb86420f1ee80b1061c03c99e2d68c5b03c22fedc16819bdebff3`.
- [Meeus] J. Meeus, *Astronomical Algorithms*, 2nd ed., Willmann-Bell, 1998,
  chapter 12, eq. 12.4: mean sidereal time at Greenwich, whose linear term is
  360.98564736629° a day.
- [WP] Wikipedia, "Astrological transit", sections *Retrograde motion* and
  *Planetary returns*, <https://en.wikipedia.org/wiki/Astrological_transit>,
  wikitext SHA-256
  `e355067682fb5ef2852c014075d47e620064ae1de7e97efab5d3855dcf337c44`.
- JPL Horizons API 1.2, <https://ssd.jpl.nasa.gov/api/horizons.api>, DE441;
  the query and the rows used are in
  `src/timing/fixtures/planetary-returns-horizons.json`.
- US Naval Observatory, Astronomical Applications API, `seasons`,
  <https://aa.usno.navy.mil/api/seasons?year=2001> (and 2000, 2002 to 2004).

Swiss Ephemeris was used only as a comparison instrument. No Swiss Ephemeris
code, data or output is in this repository.
