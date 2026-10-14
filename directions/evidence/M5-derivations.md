# M5 hand-derived zodiacal body directions

[zodiacal-examples.ts](zodiacal-examples.ts) contains synthetic coordinate
examples authored independently of this library. No expectation comes from
the engine, a previous solver run, a personal chart or Swiss Ephemeris. The
file imports no implementation. Its only transcendental evaluation defines
the input latitude `phi = atan(sqrt(3)/2)` in degrees. Expected coordinates,
semi-arcs and directional arcs are integers derived below.

## Source and scope

Placidus de Titis, *Primum Mobile*, John Cooper translation (1814),
[printed pages 57-60, 68-69 and thesis 61 on page 23](https://iapsop.com/ssoc/1814__cooper___primum_mobile.pdf),
was fetched and read for this milestone. Page 57 fixes the significator's
mundane position for direct directions. Canon XVII on page 58 uses the
right ascension of the promissor's aspect place at the meridian. Canon XIX
on pages 59-60 multiplies the significator's meridian distance by the ratio
of the aspect place's semi-diurnal arc to the significator's semi-diurnal
arc. This establishes which point supplies each term: the moving point is
the promissor's projected ray; the fixed point is the significator. Moving
the promissor's body to an aspect point of the significator would be a
different calculation.

The initial `zodiacal/zero-both` policy restricts both inputs to their
ecliptic projections. This is a declared project choice. Canon XXIII on
pages 68-69 instead describes a latitudinal significator's changing path,
while omitting the occourse's latitude. Its proportional semi-arc
calculation applies both above and below the horizon. The present policy
does not implement that changing latitude. Canons XX-XXI, pages 61-67,
give the Sun special twilight and obscure-arc treatment below the horizon;
that treatment is also outside this uniformly proportional semi-arc model.
Accordingly this is an explicitly limited Placidus semi-arc construction,
not a reproduction of every method in Cooper's volume.

Thesis 61 excludes zodiacal rays and parallels in converse motion.
Canon XXXVII, pages 104-105, states the role exchange for aspects made in
the world. These passages do not establish a converse version of the
project's projected zodiacal conjunction. This milestone therefore refuses
all zodiacal converse requests, including projected conjunctions. It does
not silently replace them with negated direct arcs or a mundane contact.
Angle targets and zodiacal rays to angles remain outside this body solver.

William Lilly, *Christian Astrology* (1647), book I,
[printed pages 108-109](https://www.worldastrology.net/wp-content/uploads/2008/12/CA-I.pdf),
was fetched and read for branch names. His Aries examples put sinister
sextile, square and trine rays in Gemini, Cancer and Leo, and dexter rays
in Aquarius, Capricorn and Sagittarius. Thus the caster must be named:
here it is always the promissor. These branch names do not describe
direct versus converse motion. The classical aspect magnitudes also appear
in Ptolemy, *Tetrabiblos*, Ashmand translation (1822),
[book I, chapter XVI, printed pages 24-26](https://sacred-texts.com/astro/ptb/ptb19.htm).

Only the specified classical conjunction, sextile, square, trine and
opposition contacts are enabled. Cooper also discusses other aspects;
supporting them would require an explicit extension. Neither the source
citations nor the coordinate fixtures establish predictive validity.

## Ecliptic projection and ray orientation

Angles in the following equations are degrees. Let `lambdaS` and
`lambdaP` be natal ecliptic longitudes and `epsilon` the obliquity of their
common frame. Set both ecliptic latitudes to zero, retaining the input
latitudes in audit metadata. A conjunction uses `lambdaR = lambdaP`.
For an aspect magnitude `a`,

```text
lambdaR = (lambdaP - a) mod 360  for a dexter ray
lambdaR = (lambdaP + a) mod 360  for a sinister ray
a = 60 for sextile, 90 for square, 120 for trine.
```

Opposition uses `(lambdaP + 180) mod 360`; its two possible signs identify
the same point, so it has no branch selector. The zero-latitude ecliptic
vector at longitude `lambda`, rotated about the equinox axis, is

```text
(x, y, z) = (cos(lambda), sin(lambda) cos(epsilon), sin(lambda) sin(epsilon))
alpha = atan2(y, x) mod 360
delta = atan2(z, sqrt(x*x + y*y)).
```

Apply this to `lambdaS` and `lambdaR`. The rotation is coordinate
geometry; it creates neither a natal longitude nor a house cusp. In an
engine-backed calculation, the engine supplies the longitudes, frame and
obliquity before this projection.

## Fixed temporal-hour position

Write `theta` for RAMC, `H = theta - alpha` reduced to `[-180, 180)`
for the west-positive hour angle, and `phi` for geographic latitude.
The horizon derivation in [M3](M3-derivations.md) gives

```text
AD = asin(tan(phi) tan(delta))
D = 90 + AD
N = 90 - AD.
```

Only transverse horizon crossings are supported. Poles, tangent and
circumpolar circles, and unresolved floating-point degeneracies are
refused. Do not clamp an inverse trigonometric argument or choose another
house system. Subscripts `S` and `R` below name the significator and
projected promissor ray. The significator fixes the quadrant and the
fraction of its own semi-arc. The target hour angle `T` of the ray is

| Significator's position | T |
| --- | --- |
| Above west, `0 < H_S < D_S` | `(H_S / D_S) D_R` |
| Above east, `-D_S < H_S < 0` | `(H_S / D_S) D_R` |
| Below west, `D_S < H_S < 180` | `180 - ((180 - H_S) / N_S) N_R` |
| Below east, `-180 < H_S < -D_S` | `-180 + ((180 + H_S) / N_S) N_R` |
| Upper meridian | `0` |
| Lower meridian | `-180` |
| Rising horizon | `-D_R` |
| Setting horizon | `D_R` |

This is proportional meridian distance, not subtraction of ecliptic
longitudes or proportional-position degrees. The ray stays on its own
declination circle as it moves westward. Its hour angle increases, so the
first nonnegative equatorial rotation arc is `(T - H_R) mod 360`.
An existing contact has arc zero; the first forward return of a point
already past contact can exceed a half-turn. This branch notation is a
project API choice, not a historical age limit. The robust turn handling
and the distinction between rounded audit subtraction and returned arc
are the same issues derived in [M4](M4-derivations.md#coordinates-targets-and-arc).
No timing key or age is evaluated here.

## Solstice and equinox examples

Choose `epsilon = 30` and `phi = atan(sqrt(3)/2)`. A projected
significator at `lambdaS = 90` has `alphaS = 90`, `deltaS = 30`.
Since `tan(phi) tan(30) = (sqrt(3)/2)(1/sqrt(3)) = 1/2`,
`AD_S = 30`, `D_S = 120`, `N_S = 60`. A conjunction promissor at
`lambdaP = 180` has `alphaR = 180`, `deltaR = 0`, hence
`D_R = N_R = 90`. Every significator in this table is halfway between
its bounding meridian and horizon.

| RAMC | Significator quadrant | H_S | H_R | T | Arc |
| ---: | --- | ---: | ---: | ---: | ---: |
| 150 | Above west | 60 | -30 | 45 | 75 |
| 240 | Below west | 150 | 60 | 135 | 75 |
| 300 | Below east | -150 | 120 | -135 | 105 |
| 30 | Above east | -60 | -150 | -45 | 105 |

The southern mirror changes latitude to `-phi`, the significator longitude
to `270`, the promissor longitude to `0`, and adds `180` to RAMC modulo
a turn. The significator declination becomes `-30`; both signs in the
tangent product change, preserving `AD_S = 30`. Every hour angle, target
and directional arc in the table therefore remains the same. This proves
the southern fixture family without using a computed solver result.

Changing only geographic latitude to `-phi`, while keeping the northern
solstice significator, makes `AD_S = -30`, `D_S = 60`, `N_S = 120`.
The equatorial promissor still has equal semi-arcs. Taking the halfway
points of the new quadrants gives the opposing-sign family:

| RAMC | Significator quadrant | H_S | H_R | T | Arc |
| ---: | --- | ---: | ---: | ---: | ---: |
| 120 | Above west | 30 | -60 | 45 | 105 |
| 210 | Below west | 120 | 30 | 135 | 105 |
| 330 | Below east | -120 | 150 | -135 | 75 |
| 60 | Above east | -30 | -120 | -45 | 75 |

## Cardinal positions of a body significator

Keep `epsilon = 30` and positive `phi`, but set `lambdaS = 0` and
the conjunction promissor at `lambdaP = 90`. Thus `alphaS = deltaS = 0`,
`D_S = N_S = 90`, `alphaR = 90`, `deltaR = 30`, `D_R = 120`.
These are body-to-body contacts whose significator happens to occupy an
axis; they do not ask for a zodiacal ray to an angular significator.

| RAMC | Significator boundary | H_S | H_R | T | Arc |
| ---: | --- | ---: | ---: | ---: | ---: |
| 0 | Upper meridian | 0 | -90 | 0 | 90 |
| 180 | Lower meridian | -180 | 90 | -180 | 90 |
| 270 | Rising | -90 | -180 | -120 | 60 |
| 90 | Setting | 90 | 0 | 120 | 120 |

The equatorial significator makes its horizon classification exact in
binary64. The tests need not pretend that a mathematically exact oblique
horizon remains exact after trigonometric rounding.

## Aspect rays and discarded latitudes

With the same `epsilon` and positive `phi`, set `lambdaS = 0`,
RAMC `45`, and choose each promissor so that its requested ray is `90`.
The following table fixes the branches independently:

| Contact | Promissor longitude | Ray arithmetic modulo a turn |
| --- | ---: | --- |
| Dexter sextile | 150 | `150 - 60 = 90` |
| Sinister sextile | 30 | `30 + 60 = 90` |
| Dexter square | 180 | `180 - 90 = 90` |
| Sinister square | 0 | `0 + 90 = 90` |
| Dexter trine | 210 | `210 - 120 = 90` |
| Sinister trine | 330 | `330 + 120 = 450`, reduced to `90` |
| Opposition | 270 | `270 + 180 = 450`, reduced to `90` |

Every row then has `alphaS = 0`, `deltaS = 0`, `H_S = 45`,
`D_S = 90`, `alphaR = 90`, `deltaR = 30`, `H_R = -45` and
`D_R = 120`. The target is `T = (45/90)120 = 60`, so the direct
arc is `60 - (-45) = 105`. In these fixtures the original ecliptic
latitudes are `4` and `-7`. The declared `zero-both` policy discards both
before the rotation, and the same arithmetic follows. The nonzero input
latitudes are synthetic policy checks, not physical ephemeris samples.

## Longitude wrap and initial contact

At zero obliquity and geographic latitude, the ecliptic coincides with
the equator: `alpha = lambda`, `delta = 0`, `D = N = 90`.
The fixed position has `T = H_S` in every quadrant. At RAMC zero,
`(lambdaS, lambdaP) = (350, 10)` gives `(H_S, H_R) = (10, -10)`
and arc `20`; `(10, 350)` gives `(-10, 10)` and arc `340`.
The latter must not be replaced by the shortest distance `20`.
Finally `(10, 10)` gives identical projected points, hour angles `-10`,
and arc zero. Zero obliquity is a mathematical test frame, not a claim
about Earth's obliquity at an invented birth instant.

## Tolerance and limits

The extra arithmetic cases in
[zodiacal-evidence.check.ts](../checks/zodiacal-evidence.check.ts) use zero
obliquity, where the expected arc is the forward longitude difference.
A promissor at `2^-45` with significator at zero therefore has that exact
arc, including when RAMC is `180` and the signed hour-angle representatives
straddle the lower meridian. This is the same binary64 cancellation example
proved in M4. At RAMC zero, even `Number.MIN_VALUE` is a representable
positive difference; it is tested exactly, not with an absolute tolerance.

For an opposition ray with natal longitude `180 + 2^-45`, subtracting the
wrap threshold gives the exact ray `2^-45`. On the other side,
`180 - 2^-45 + 180` is halfway between the predecessor of `360` and `360`
and rounds to `360`. That ray is refused instead of normalized to a false
zero-longitude coincidence. The input step is representable because numbers
near `180` have binary64 spacing `2^-45`; near `360` it is `2^-44`.

The remaining cases test conservative numerical refusals. In zero obliquity
and latitude, longitudes zero and `1e-16` require a nonzero arc for every
RAMC. At the tested nonzero RAMCs, subtracting the tiny right ascension
rounds both hour angles to the same value. Distinct projected points with
equal semi-arcs must not become a zero contact through that loss. Likewise,
with nonzero obliquity, a subnormal longitude can underflow while converting
degrees to radians and lose its right ascension; this is refused. A fixed
meridian distance of `Number.MIN_VALUE` can underflow when divided by its
semi-arc and map an interior point onto an axis of a different moving
circle; the quadrant-preserving transfer refuses that case too. These tests
document floating-point failure handling, not an accuracy claim for values
near the representational limit.

`ZODIACAL_FIXTURE_TOLERANCE_DEGREES` is fixed at `1e-10` degrees
before comparisons with the implementation. It is an acceptance allowance
for ordinary binary64 and trigonometric rounding on these regular
examples, not a measured global error bound or an ephemeris accuracy
claim. Input latitudes, contact labels and refusal codes are compared
exactly; approximate angle checks do not authorize snapping near contacts
to coincidence. The fixtures cover authored coordinate examples and do
not establish correctness for polar singularities, latitude variants,
converse zodiacal constructions, historical twilight models, timing keys
or predictive interpretation.
