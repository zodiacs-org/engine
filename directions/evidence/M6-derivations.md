# Mundane Placidus semi-arc body contacts

The fixtures in [mundane-examples.ts](mundane-examples.ts) contain authored
synthetic equatorial coordinates and hand-derived expectations. They import
no implementation and contain no person's chart. All angular quantities
below are degrees unless described as proportional coordinate degrees.

## Source and scope

Placidus de Titis, *Primum Mobile*, John Cooper translation (1814),
[printed pp. 72-77, 87-91 and 104-105](https://iapsop.com/ssoc/1814__cooper___primum_mobile.pdf),
was fetched and its PDF text read on 2026-10-14. Printed page numbers are
the PDF page numbers minus 17. Part III, pp. 72-73, describes mundane
aspects through proportional diurnal and nocturnal arcs independently of
the ecliptic. Canon XXVII, pp. 74-76, identifies sextile, square and trine
with separations of two, three and four mundane houses. Canon XXX,
pp. 87-88, retains both bodily latitudes for conjunction. Canon XXXII,
pp. 89-91, proportions distance within a house by the bodies' horary times,
using the promissor's diurnal or nocturnal time according to where it stands
when the contact completes. Canon XXXVII, pp. 104-105, exchanges the moving
and fixed roles for converse directions.

The equations below express that method in this library's westward
coordinate. `westward` and `eastward` are explicit project branch labels
from the original promissor to the original significator. They do not claim
that Placidus named branches this way or that zodiacal ray signs carry over
without a coordinate definition. There is no longitude ray, latitude
projection, great-circle interpolation or invented ecliptic house cusp.

This is the ordinary body horary-position construction. It excludes the
special Sun-below-horizon treatment of canon XXXVI, pp. 98-104, mundane
parallels, minor aspects and moving both bodies at once. A body on a
cardinal position is still a body; these fixtures do not enable converse
directions of angular significators, which Placidus rejects on p. 105.

## Coordinate and contact equations

Let `H` be signed westward hour angle, `D` the diurnal semi-arc, and `N`
the nocturnal semi-arc, with `D + N = 180`. The
[M3 derivation](M3-derivations.md) obtains these from the geometric horizon.
Normalize each quadrant to a proportional span of 90, defining `q`:

| Part of the diurnal circle | Range of `H` | `q` |
| --- | --- | --- |
| Above west | `0 <= H <= D` | `90 H / D` |
| Below west | `D <= H < 180` | `90 + 90 (H-D) / N` |
| Below east | `-180 <= H <= -D` | `180 + 90 (H+180) / N` |
| Above east | `-D <= H < 0` | `360 + 90 H / D` |

Thus upper meridian, setting, lower meridian and rising have `q` equal to
0, 90, 180 and 270. Endpoints are single positions, with upper meridian
canonically 0. Within each quadrant the three equal mundane-house spans
have length 30 in `q`. Sextile, square, trine and opposition therefore
have magnitudes 60, 90, 120 and 180 in this coordinate. These are normalized
temporal-hour distances, not equatorial rotation angles or separations
along a great circle.

Use `r = +A` for a westward branch, `r = -A` for an eastward branch,
`r = 0` for conjunction, and `r = 180` for the unbranched opposition.
Keep the original body names `P` and `S` throughout. Every contact means

```text
qS = qP + r (modulo 360).
```

For direct motion, `S` stays fixed and `P` moves westward. Therefore
`qTarget = qS - r`. For converse role exchange, `P` stays fixed and `S`
moves westward, so `qTarget = qP + r`. The branch continues to mean
original `P` to original `S`. Keeping the same subtraction after exchanging
the roles would silently select the opposite branch.

The target hour angle on the moving body's own diurnal circle is:

| Target range | Target `H` |
| --- | --- |
| `0 <= q <= 90` | `D q / 90` |
| `90 <= q < 180` | `D + N (q-90) / 90` |
| `180 <= q <= 270` | `-180 + N (q-180) / 90` |
| `270 <= q < 360` | `D (q-360) / 90` |

The arc is `(Htarget - Hmoving) modulo 360`, choosing the first
nonnegative westward rotation and preserving an initial contact as zero.
That single-turn choice is a project rule. Both roles require crossing
semi-arcs. A geographic or celestial pole, horizon tangency or circumpolar
body is refused; it is not assigned another house or direction system.

## Unequal semi-arc aspect matrix

Set latitude to 45 and let `d = atan(1/2)`. Since
`sin(AD) = tan(latitude) tan(declination)`, declination `+d` gives
`AD = 30`, `D = 120`, `N = 60`; declination `-d` gives
`AD = -30`, `D = 60`, `N = 120`. This defines the synthetic inputs;
it is not a computation of expected values by the library.

Set RAMC to 0, `S` right ascension to 320 and declination to `+d`,
and `P` right ascension to 30 and declination to `-d`. Then
`HS = 40`, `qS = 30`, `HP = -30`, `qP = 315`. Substitution in the
piecewise linear equations gives every row below. In each cell the entries
are target `q`, target `H`, and arc.

| Contact | `r` | Direct `(q,H,arc)` | Converse `(q,H,arc)` |
| --- | ---: | --- | --- |
| Conjunction | 0 | `(30,20,50)` | `(315,-60,260)` |
| Sextile westward | 60 | `(330,-20,10)` | `(15,20,340)` |
| Sextile eastward | -60 | `(90,60,90)` | `(255,-130,190)` |
| Square westward | 90 | `(300,-40,350)` | `(45,60,20)` |
| Square eastward | -90 | `(120,100,130)` | `(225,-150,170)` |
| Trine westward | 120 | `(270,-60,330)` | `(75,100,60)` |
| Trine eastward | -120 | `(150,140,170)` | `(195,-170,150)` |
| Opposition | 180 | `(210,-140,250)` | `(135,150,110)` |

For example, direct eastward square targets `q = 30 - (-90) = 120`,
below the western horizon. It uses the moving promissor's nocturnal
semi-arc: `H = 60 + 120/3 = 100`; the arc is `100 - (-30) = 130`.
Its natal place was above the eastern horizon. Using its natal diurnal
semi-arc in the target quadrant would be wrong. Converse eastward square
instead targets `q = 315 - 90 = 225` on `S`, yielding
`H = -180 + 60/2 = -150`, and arc `-150 - 40 + 360 = 170`.

Direct and converse conjunction arcs are 50 and 260. They are not mutual
negations: each construction uses a different moving declination circle.
The square rows demonstrate why the branch must remain tied to the original
labels. None of these oblique cases requires an exactly zero arc: the
transcendental input declination is only represented approximately.

## Quadrants and hemisphere mirror

Keep `S` at declination `+d`, give `P` declination zero, and keep RAMC
zero and latitude 45. Thus `S` has `D = 120`, `N = 60`, while `P`
has `D = N = 90`. Input right ascensions in the fixtures encode these
four signed-hour-angle pairs. Conjunction sets the moving target `q` equal
to the fixed body's natal `q`.

| Natal quadrant of both | `(HS,HP)` | `(qS,qP)` | Direct `(Htarget,arc)` | Converse `(Htarget,arc)` |
| --- | --- | --- | --- | --- |
| Above west | `(40,60)` | `(30,60)` | `(30,330)` | `(80,40)` |
| Below west | `(140,150)` | `(120,150)` | `(120,330)` | `(160,20)` |
| Below east | `(-160,-120)` | `(210,240)` | `(-150,330)` | `(-140,20)` |
| Above east | `(-80,-30)` | `(300,330)` | `(-60,330)` | `(-40,40)` |

For each row, simultaneously negate geographic latitude and `S`
declination. The product of the tangents stays the same and every
semi-arc, hour angle, proportional position and contact arc is unchanged.
The fixtures include those southern-hemisphere mirrors for both motions.

## Fixed axes

Put an equatorial fixed body on each axis and a moving body of declination
`+d` on the upper meridian at latitude 45. The fixed body's right ascension
is respectively 0, 270, 180 and 90, with RAMC zero. These fixed axes are
exactly representable; the fixture does not depend on classifying a
rounded oblique horizon as an exact boundary.

| Fixed axis | Target `q` | Target `H` | Arc |
| --- | ---: | ---: | ---: |
| Upper meridian | 0 | 0 | 0 |
| Setting | 90 | 120 | 120 |
| Lower meridian | 180 | -180 | 180 |
| Rising | 270 | -120 | 240 |

The fixtures assign these fixed/moving roles once to direct motion and
once to converse motion. The bodies exchange their original labels but
the physical conjunction problem stays the same.

## Exact initial aspects

At geographic latitude zero and declination zero, both semi-arcs are
exactly 90, so `q` equals the normalized hour angle. Put `S` at `H = 30`,
then put `P` at `H = -60` for a westward square or `H = 120` for an
eastward square. In both cases `qS = qP + r` holds with exact integer
coordinates. The initial arc is zero for direct and converse motion. These
examples establish coincidence without treating a rounded oblique
declination as an exact symbolic input or applying an epsilon at the seam.

## Acceptance and limits

[mundane-numerical.check.ts](../checks/mundane-numerical.check.ts) separately
checks the following arithmetic consequences of the same sphere equations.
At observer latitude zero, `D = N = 90` for every nonpolar declination,
so `q = H modulo 360` and the inverse is the identity. These expectations
are derived from the inputs, not recorded outputs.

| Fixed and moving geometry | Required arithmetic behavior |
| --- | --- |
| Same point in any quadrant | Exact positive zero for conjunction, without a `q` round trip. |
| RAMC zero, fixed RA zero, moving RA `g` | Arc exactly `g` for `g = Number.MIN_VALUE` and `2^-49`. |
| The preceding fixed and moving roles exchanged | Arc `360-g`; refuse when it rounds to `360`. |
| RAMC zero, fixed RA `180`, moving RA `180 + 2^-45` | Arc `2^-45` through the lower-meridian cut, even when the unreduced difference rounds to `-360`. |
| RAMC zero, fixed RA `149.984375`, moving RA `59.984375`, target offset `+90` | Target H `-59.984375`, q `300.015625`, and exact zero arc for the selected square. |
| RAMC `90`, fixed RA `29.953125`, moving RA `89.953125`, target offset `-60` | Fixed H `60.046875`, target H `0.046875`, and exact zero arc for the selected sextile. |

The tests assign those physical fixed/moving roles to both motion
constructions and adjust the original-promissor branch explicitly.
The dyadic fractions in the table are exactly representable in binary64.
Computing an equatorial proportional coordinate by dividing then
multiplying by `90` can perturb them. The operative aspect coordinate uses
the hour-angle identity on equal quarter circles, and its inverse uses
`meridian distance * (semiArc / 90)`. Conjunction uses the original meridian
fraction and reuses the fixed hour angle when the selected semi-arcs match.

Additional checks enforce conservative refusals where subtraction or
coordinate scaling cannot resolve the intended distinction. At RAMC `90`,
right ascensions zero and `Number.MIN_VALUE` round to the same hour angle;
their equal-circle conjunction must not become a computed zero contact.
At RAMC `180` the same collapse occurs at the lower meridian even if the
moving declination is `10` and latitude is `45`, giving unequal semi-arcs.
Meridian coincidence still requires equality of the original right ascensions.

An aspect has the same risk: at latitude zero and RAMC `90`, a fixed RA
of `1e-16`, moving RA `90` and target offset `-90` imply the unrepresentable
arc `360 - 1e-16`. The rounded fixed H is `90`, which would falsely give
zero after the offset. For computed equatorial aspect coincidences the
solver checks the original RA difference, including the residual of that
subtraction, against the required aspect offset modulo a turn.

The remaining cases cover a fixed interior `q` rounding onto an axis and
an aspect offset losing its small addition at an apparent coincidence.
The solver refuses those detected losses. A compensated addition records
the offset residual; it does not measure the preceding coordinate error.
These are selected arithmetic boundary checks, not exact predicates for
every unequal-semi-arc contact or a global numerical-error guarantee.

`MUNDANE_FIXTURE_TOLERANCE_DEGREES` is fixed at `1e-10` degrees before
comparing these examples with the implementation. It allows ordinary
binary64 and trigonometric rounding on the authored regular examples.
It is not a measured global error bound, an ephemeris accuracy claim,
or permission to snap nearby contacts to zero. Input preservation, branch
labels and refusal codes are compared exactly. These examples do not
validate predictive interpretation, timing keys, historical twilight
models or geometry near floating-point singularities.
