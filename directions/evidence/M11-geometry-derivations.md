# M11 independent directional geometry

[m11-geometry-cases.ts](m11-geometry-cases.ts) constructs invented coordinates
before calling any solver. It has no runtime implementation imports. The
separate [measurement module](m11-geometry.ts) applies the library and records
signed residuals. These are geometric examples in one synthetic equator and
equinox, without a natal epoch, ephemeris or house cusps.

The conventions remain those already read and recorded in
[SOURCES.md](../SOURCES.md): Ptolemy, *Tetrabiblos*, Ashmand (1822), book III,
chapter XIV; Placidus, *Primum Mobile*, Cooper (1814), canons XVII-XIX,
XXIII, XXX-XXXII and XXXVII; and Lilly, *Christian Astrology* (1647), book I,
pp. 108-109. The algebra below supplies new numerical references for the
existing restricted constructions. It adds no historical convention.

## Circle construction

All coordinates and rotations are in degrees. Latitude is `phi`, declination
is `delta`, right ascension is `alpha`, and local sidereal angle is `theta`.
The west-positive hour angle is `H = theta - alpha`, modulo a turn. The
geometric horizon equation derived in [M3](M3-derivations.md) is
`cos(H) = -tan(phi) tan(delta)`. For a desired diurnal semi-arc `D`, use:

| D | Chosen declination | Horizon identity |
| ---: | --- | --- |
| 60 | `atan(-1/(2 tan(phi)))` | `cos(60) = 1/2` |
| 90 | 0 | `cos(90) = 0` |
| 120 | `atan(1/(2 tan(phi)))` | `cos(120) = -1/2` |

The nocturnal semi-arc is `N = 180 - D`. Inputs use observer latitudes
`-60, -30, 30, 60`, so the construction covers both hemispheres with
different declination magnitudes and signs. These trigonometric expressions
define inputs; the expected semi-arcs are the literal integers above.

Let `q` be the library's westward proportional coordinate, assigning
upper meridian, setting, lower meridian and rising to `0,90,180,270`.
Dividing each quadrant into six equal temporal intervals gives the literal
hour-angle table in the fixture. For example, for `D=120,N=60`, successive
values at `q=0,15,...,90` are `H=0,20,...,120`; the next quadrant advances
by `10` degrees each time to the lower meridian. The eastern half reverses
the signs of the corresponding western distances. For `D=60,N=120` the
increments exchange. For `D=N=90`, `H=q` modulo a turn. This table is
independent of the solver's inverse function.

## Mundane contact construction

Select a fixed body's `(q,D)` from
`(15,120), (105,60), (195,120), (285,60)` and the axis cases
`(0,90), (90,90), (180,90), (270,90)`. Interior points cover every quadrant;
axes use a zero-declination fixed body so the supplied horizon angles are
exact. The moving body uses the other oblique circle: `D=60` when the fixed
circle is `120`, `D=120` when it is `60`. For fixed `D=90` it uses `60`
before `q=180` and `120` thereafter.

All supported contacts are selected explicitly. The offset `r` is zero for
conjunction, `180` for opposition, and `+/-60`, `+/-90`, `+/-120` for the
westward/eastward sextile, square and trine. The defining original-role
relation is `qS = qP + r`. Thus direct motion fixes S and targets moving P
at `q-r`; converse fixes P and targets moving S at `q+r`. Obtain the
target hour angle `Ht` from the literal temporal-hour table.

Now choose the desired rotation `a` before constructing the moving input:
`7.5` degrees for fixed `q<180`, otherwise `277.5` degrees. Set
`Hmoving = Ht-a` modulo a turn. At the selected latitude use `theta=359`
in the north and `theta=17` in the south, and construct each RA from
`alpha=theta-H`. These half-integer input angles are exactly represented.
Westward rotation through the chosen `a` necessarily returns the moving
point to `Ht`, and hence to the specified contact. The expected arc is the
chosen rotation, not a subtraction performed by the solver. All contacts
and both role constructions are used at every fixed position and latitude.

[m11-geometry.check.ts](../checks/m11-geometry.check.ts) enforces the resulting
512 cases, their arc and intermediate coordinates, and their exact target
quadrant or boundary labels. The count is the Cartesian product
`4 latitudes * 8 fixed positions * 8 contacts * 2 motions`.

## Zodiacal cardinal-ray construction

Set obliquity to `epsilon=atan(1/(2 tan(abs(phi))))` at the same observer
latitudes. A projected northern solstice at longitude `90` has RA `90`
and declination `epsilon`; the southern solstice at longitude `270` has
RA `270` and declination `-epsilon`. Their diurnal semi-arcs are `120`
when observer and declination signs match and `60` otherwise.

The fixed significator is the equinox at longitude `0` for northern
observers and `180` for southern observers. Its declination is zero.
Set `qS` to each of `15,105,195,285` and `theta=lambdaS+qS` modulo a
turn. Since S has equal quarter circles, its hour angle is `qS` modulo a turn.
The literal table gives the target hour angle on the chosen solstitial
circle. Its initial hour angle is `theta-alphaRay`. The difference,
reduced into the first turn, is the hand-derived expected rotation.

Every contact uses a promissor longitude constructed from the intended ray:
`lambdaP=lambdaRay-offset`, where the offset is zero, `180`, or the
explicit dexter/sinister `-/+60`, `-/+90`, `-/+120`. These are exactly
represented integer longitudes, including wraparound cases. Supplied body
latitudes `8` and `-11` are retained in input metadata and projected to zero
under the requested policy. The Cartesian product gives 256 cases.

## Noncardinal zodiacal construction

Take projected longitudes `lambdaS=45` and `lambdaRay=135`. Rotation into
the equator gives vectors proportional to
`(1,cos(epsilon),sin(epsilon))` and
`(-1,cos(epsilon),sin(epsilon))`. Consequently their RAs are
`a=atan(cos(epsilon))` and `180-a`, and both declinations equal
`asin(sin(epsilon)/sqrt(2))`. Equal declination circles have equal semi-arcs
at every admissible observer latitude, so the contact requires the same
hour angle as S and the direct arc is exactly `180-2a`.

Adding `180` to both longitudes reverses both declinations and adds `180`
to both RAs. The expected arc stays the same. The fixture uses both
orientations, obliquities `15,30`, observer latitudes `-60,-30,0,30,60`,
RAMCs `5,95,185,275`, and conjunction plus both square branches. These
240 cases extend the cardinal-ray matrix to 496 zodiacal cases. The
independent auxiliary semi-arc reference uses the horizon equation directly:
`D=acos(-tan(phi)tan(delta))`. No engine projection supplies an expectation.

The RAMC grid avoids exact ecliptic-horizon coincidence. Testing the initial
cardinal RAMC grid revealed a known representational limitation at
`phi=-60,epsilon=30,theta=90,lambdaS=225,lambdaP=315`: the ecliptic is the
horizon, but separate rounded projections can classify one point as just
inside a quadrant and transfer the other onto its boundary. The existing
solver refuses that unresolved transfer. A separate numerical-refusal test
preserves this diagnostic; it is not counted as analytic arc agreement.

## Angular construction

At every selected latitude and each circle `D=60,90,120`, take initial
hour angles `-170,-20,20,170`. Construct their RAs from `theta=17`.
The target hour angles for MC, IC, ASC and DSC are, respectively,
`0,-180,-D,D`. Subtract the chosen initial angle and reduce into the first
turn for the expected rotation. These 192 cases cover both horizon
branches, both meridians, and short and long wraparound arcs.

## Acceptance and scope

The regular geometry fixtures set `1e-10` degrees as their absolute
allowance before measuring the implementation. It accommodates input
trigonometric rounding and the independent elementary-function evaluations.
It is an acceptance threshold for these finite cases, not a global bound.
Boundary labels and role identities must agree exactly. No circular
residual normalization can hide a nearly full turn reported as zero.

The expectations come from chosen rotations, literal temporal divisions,
and the noncardinal equal-circle identity. They share JavaScript elementary
functions with the tested runtime, so this does not independently verify
those functions. Exact meridian and aspect-addition collapse checks are
separate from this regular matrix. Near-tangent semi-arcs and timing keys
have their own [latitude](M11-latitude-derivations.md) and
[timing](M11-timing-derivations.md) evidence. None verifies ephemeris
positions, complete scan coverage on a continuous domain, or predictions.
