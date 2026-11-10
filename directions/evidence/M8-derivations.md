# M8 complete hit derivations

These examples combine independently derived sphere arcs with explicit timing
keys. Every coordinate is invented. No example is a person's natal record or
a claim that the engine produced these coordinates. The expected arcs come
from the arithmetic below and the prior sphere derivations, never from a
direction function's current or earlier output.

The definitions follow the sources and restrictions in [SOURCES](../SOURCES.md):
Ptolemy, *Tetrabiblos*, Ashmand (1822), book III chapter XIV, pp. 94-96;
Placidus, *Primum Mobile*, Cooper (1814), p. 57, canons XVII-XIX and XXIII
for the projected body construction, and canons XXVII, XXX, XXXII and
XXXVII for ordinary mundane placement and role exchange. Lilly,
*Christian Astrology* I (1647), pp. 108-109 supplies the zodiacal branch
names. The uniform ordinary semi-arc construction applies to all body
labels; no label silently selects the special solar crepuscular method.

## Common arithmetic

All angles are degrees. RAMC is `theta`, right ascension is `alpha`, and
west-positive hour angle is `H = theta - alpha` in `[-180, 180)`.
For geographic latitude `phi` and declination `delta`,

```text
AD = asin(tan(phi) * tan(delta))
D = 90 + AD
N = 90 - AD
```

`D` and `N` are the diurnal and nocturnal semi-arcs. A direct contact moves
the promissor westward; a mundane converse contact moves the significator
westward. The arc is `H_target - H_initial`, with one turn added when it is
negative. Initial contact gives zero. Labels retain their original roles.

For ordinary body conjunctions a point's meridian distance divided by its
applicable semi-arc is retained at contact. For mundane aspects use the
westward proportional position `q` with axes upper meridian `0`, setting
`90`, lower meridian `180`, and rising `270`. The relation is
`q_significator = q_promissor + r` modulo a turn. Direct motion targets
`q_significator - r`; converse targets `q_promissor + r`. These are the
definitions derived in [M3](M3-derivations.md) and [M6](M6-derivations.md).

## Zodiacal body contacts

The first fixture sets both obliquity and observer latitude to zero. After
the selected zero-latitude projection, right ascension equals longitude and
both semi-arcs are `90`. Significator longitude `350` and promissor longitude
`10` give hour angles `10` and `-10` at RAMC `0`. The target is `10`, so
the arc is `20`. The nonzero original ecliptic latitudes `4` and `-7` remain
input metadata and do not enter this explicitly projected construction.

For the oblique fixtures define `phi = atan(sqrt(3)/2)` and obliquity `30`.
A projected point at longitude `90` has `alpha = 90`, `delta = 30`.
Then `tan(phi) * tan(delta) = 1/2`, so `AD = 30`, `D = 120` and `N = 60`.
A projected point at longitude `0` or `180` is equatorial, with both
semi-arcs `90`. [M5](M5-derivations.md) derives these coordinate identities.

- For `zodiacal-oblique-naibod`, RAMC `150`, significator longitude `90`
  and promissor longitude `180` give `H_S = 60` and `H_P = -30`.
  The fixed meridian fraction is `60/120 = 1/2`. The moving target is
  `(1/2) * 90 = 45`, giving arc `45 - (-30) = 75`.
- For `zodiacal-square-solar`, RAMC is `45` and the projected significator
  longitude is `0`. The original promissor is at longitude `180`; its dexter
  square ray is `180 - 90 = 90`. Thus `H_S = 45`, `H_ray = -45`, and
  the fixed fraction is `45/90 = 1/2`. The target is `(1/2) * 120 = 60`,
  giving arc `60 - (-45) = 105`. Original latitudes `4` and `-7` are
  projected away. This is an aspect to a body, not a ray to an angle.

## Mundane body contacts

Define `d = atan(1/2)`. At geographic latitude `45`, declination `d` has
`AD = 30`, `D = 120`, `N = 60`; declination `-d` has `AD = -30`,
`D = 60`, `N = 120`. At RAMC `0`, the significator with RA `320` and
declination `d` has `H_S = 40` and `q_S = 90 * 40/120 = 30`.
The promissor with RA `30` and declination `-d` has `H_P = -30` and
`q_P = 360 - 90 * 30/60 = 315`.

- Direct conjunction retains the significator fraction `40/120 = 1/3`.
  The promissor's target is `(1/3) * 60 = 20`, so the arc is
  `20 - (-30) = 50`.
- Converse conjunction retains the original promissor's position. Its
  fraction east of the upper meridian is `30/60 = 1/2`. The significator's
  target is `-(1/2) * 120 = -60`, so the arc is `-60 - 40 + 360 = 260`.
- Converse eastward square has signed offset `r = -90`, measured from the
  original promissor to the original significator. The target is
  `q_P + r = 315 - 90 = 225`, halfway between lower meridian and rising.
  The moving significator's nocturnal semi-arc is `60`, so its target hour
  angle is `-180 + (1/2) * 60 = -150`. Its arc is
  `-150 - 40 + 360 = 170`.

The initial-square fixture instead uses the equator and zero declinations.
Significator RA `330` gives `H_S = q_S = 30`; promissor RA `60` gives
`H_P = -60`, `q_P = 300`. Their westward-square relation already holds:
`300 + 90 = 30` modulo a turn. The direct target remains `H_P = -60`,
so the arc and age are exactly zero. All four constructions are also derived
in the unequal-semi-arc and initial-aspect sections of [M6](M6-derivations.md).

## Angle contacts

Angles are fixed meridian or horizon axes, not body points at an angle's
ecliptic longitude. Each example is a direct conjunction, within the scope
derived in [M4](M4-derivations.md). None enables converse angles or zodiacal
aspect rays to angles.

- At geographic latitude `45`, declination `d = atan(1/2)` has `D = 120`.
  RA `0` and RAMC `180` give initial hour angle `-180`. The ascending
  horizon target is `-120`, giving arc `-120 - (-180) = 60`.
- For the zodiacal MC conjunction use the projected promissor longitude
  `90`, obliquity `30`, and RAMC `45`. Projection gives RA `90` and
  declination `30` despite original latitude `-7`. Initial hour angle is
  `-45`; the upper meridian target is `0`, giving arc `45`. Geographic
  latitude is `atan(sqrt(3)/2)`, with the crossing semi-arcs derived above.
- For the southern setting conjunction change both geographic latitude
  and declination signs to `-45` and `-d`. Their tangent product is still
  `1/2`, so `D` remains `120`. RA `0` and RAMC `60` give initial hour
  angle `60`. The descending horizon target is `120`, giving arc `60`.

## Timing each arc

The timing sources and exact rational conventions are derived in
[M7](M7-derivations.md): Ptolemy supplies the degree-for-a-year key; Kuehr,
*Berechnung der Ereigniszeiten* (1936), pp. 62-63 supplies the adopted Naibod
rate; Lilly, *Christian Astrology* III (1647), pp. 709-710 describes the fixed
solar-equatorial birth-day rate attributed to Maginus. No event prediction
or calendar anniversary is inferred from this arithmetic.

Ptolemy uses rate `1`. Naibod uses rate `354833/360000`. Synthetic solar
samples at TT Julian dates `2451545` and `2451546` give either rate `1/2`
from RAs `359.75` and `0.25` across the seam, or rate `5/4` from RAs `80`
and `81.25`. These solar samples are invented, not actual solar observations.
Converse retains the same forward sample day and positive annual rate.

| Fixture | Arc | Rate | Expected directed age |
| --- | ---: | --- | --- |
| zodiacal-wrap-ptolemy | 20 | 1 | 20 |
| zodiacal-oblique-naibod | 75 | 354833/360000 | 27000000/354833 |
| zodiacal-square-solar | 105 | 1/2 | 210 |
| mundane-direct-ptolemy | 50 | 1 | 50 |
| mundane-converse-naibod | 260 | 354833/360000 | 93600000/354833 |
| mundane-converse-square-solar | 170 | 5/4 | 136 |
| mundane-initial-square-solar | 0 | 1/2 | 0 |
| mundane-rising-naibod | 60 | 354833/360000 | 21600000/354833 |
| zodiacal-meridian-solar | 45 | 5/4 | 36 |
| mundane-southern-setting-ptolemy | 60 | 1 | 60 |

Expected elapsed days are obtained by separately multiplying the table's
expected age fraction by `1826211/5000` for the tropical fixed unit or
`1461/4` for the Julian fixed unit. This independent rational multiplication
must not use the function's computed age as its expected input.

## Acceptance scope

[hit-examples.ts](hit-examples.ts) fixes an absolute arc comparison tolerance
of `1e-10` degrees and a relative age/day comparison tolerance of `1e-11`
before the complete hit API is run against these fixtures. The timing
allowance includes inherited trigonometric arc rounding; it is wider than
the pure rational timing comparison in M7. Zero arc, age and day expectations
require exact positive zero. These allowances concern this finite fixture
table only, not a global accuracy or uncertainty bound.

The fixture's target hour angles provide an intermediate geometry check.
Separate engine-snapshot integration tests verify selection and preservation
of engine values; they do not supply any expected arc in this table or
establish independent ephemeris accuracy.
