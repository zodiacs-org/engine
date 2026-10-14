# M3 hand-derived sphere examples

The numerical arbiter for [sphere-examples.ts](sphere-examples.ts) is the
derivation below. These are invented equatorial coordinates, not observations,
historical nativities, engine output or output from an earlier directions
solver. The fixture file imports no implementation. Its only transcendental
evaluation specifies an input declination as `atan(1/2)` in degrees. Expected
angles are authored integers, and expected fractions are authored rational
numbers.

The historical context is Ptolemy, *Tetrabiblos*, Ashmand translation (1822),
book III, chapter XIV, printed pp. 94-96, and Placidus de Titis, *Primum
Mobile*, Cooper translation (1814), theses 40 and 55. Their source links and
the readings that support proportional temporal-hour placement are in
[SOURCES.md](../SOURCES.md) and [source-readings.json](source-readings.json).
The normalized coordinate defined here is project audit notation. This
milestone does not establish a traditional aspect rule or calculate a
directional contact.

## Coordinates and scope

All angles below are degrees. Right ascension `alpha` and the local meridian's
right ascension `theta` (RAMC) share an equator and equinox. The invented
points have no epoch; the examples test geometric identities in that shared
frame. The observer latitude `phi` orients the zenith, and declination
`delta` is north-positive. No refraction, parallax, semidiameter, ecliptic
projection or ephemeris appears in these examples.

The fixture inputs are `ramcDegrees = theta`,
`rightAscensionDegrees = alpha`, `latitudeDegrees = phi` and
`declinationDegrees = delta`. Hour angle `H` is `theta - alpha`, reduced to
`[-180, 180)`. It is positive west of the upper meridian. For a fixed point
on the celestial sphere, westward diurnal motion increases `H` through the
upper meridian, setting horizon, lower meridian and rising horizon, in that
order. `180` and `-180` denote the same lower-meridian axis; this API reports
`-180`.

Zodiacal or mundane direction mode, bodily latitude treatment, direct or
converse construction, contact branch and timing key are inapplicable at
this primitive level. These examples establish no directed age, zodiacal
aspect, mundane aspect, primary direction or predictive claim.

## Horizon equation and semi-arcs

Choose Cartesian equatorial axes so that the zenith vector is
`z = (cos(phi), 0, sin(phi))`. With the local east coordinate positive, the
unit vector to a point at hour angle `H` is
`p = (cos(delta) cos(H), -cos(delta) sin(H), sin(delta))`.
Their scalar product is the sine of altitude:

```text
sin(altitude) = sin(phi) sin(delta) + cos(phi) cos(delta) cos(H).
```

Away from geographic and celestial poles, both cosine factors are positive.
Setting the scalar product to zero gives the horizon equation
`cos(H) = -q`, where `q = tan(phi) tan(delta)`.
For `-1 < q < 1`, the positive solution `D = acos(-q)` is the angular
distance from upper culmination to setting. This is the diurnal semi-arc.
The other horizon solution is `H = -D`, the rising branch. Defining
ascensional difference `AD = asin(q)` on `(-90, 90)` gives

```text
D = 90 + AD.
N = 180 - D = 90 - AD.
```

Here `N` is the nocturnal semi-arc from setting to lower culmination, also
the arc from lower culmination to rising. These are rotation angles on the
equator, not distances along the point's declination parallel. The full
above-horizon rotation is `2 D` and the full below-horizon rotation is
`2 N`; together they account for a full turn.

## Equivalent stable evaluation

The implementation can evaluate these same quantities without forming a
tangent product or clamping an inverse sine argument. Put
`a = max(|phi|, |delta|)`, `b = min(|phi|, |delta|)`, `c = 90 - a`
and `gap = c - b`. After rejecting poles separately, `b = c` is tangency
and `b > c` is the circumpolar domain. Near the boundary `a >= 45`, the
subtraction defining `c` is exact for binary64 inputs by the exact
subtraction property of operands within a factor of two. This avoids
rounding the sum `a + b` into a boundary.

For the valid interior define `X = sin(phi) sin(delta)` and
`R = sqrt(sin(gap)) sqrt(sin(c + b))`. Product-to-sum identities give

```text
R squared = cos(phi + delta) cos(phi - delta)
          = cos(phi) squared cos(delta) squared - X squared.
```

Consequently `AD = atan2(X, R)` is algebraically the same principal angle
as `asin(q)`. Define `short = atan2(R, |X|)` in degrees. When `X >= 0`,
`D = 180 - short` and `N = short`; when `X < 0`, `D = short` and
`N = 180 - short`. This keeps the shorter semi-arc from being obtained by
subtracting nearly equal angles. It does not invent crossings at a tangent
or clamp an out-of-domain value. This derivation describes an equivalent
evaluation; the fixture's literal expected values remain those obtained
independently from the exact identities below.

## Quadrant fraction and audit coordinate

For an interior point, `quadrantFraction` measures the fraction of its own
quadrant elapsed since the preceding boundary in westward motion. It does
not always equal meridian distance divided by the relevant semi-arc.
`semiArcPositionDegrees` assigns the successive boundaries `0`, `90`,
`180` and `270`, and divides each quadrant in proportion to its own arc:

| Condition on signed H | Quadrant | Preceding boundary | Fraction f | Meridian distance | Relevant semi-arc | Position |
| --- | --- | --- | --- | --- | --- | --- |
| `0 < H < D` | above-west | upper meridian | `H / D` | `H` | `D` | `90 f` |
| `D < H < 180` | below-west | setting | `(H - D) / N` | `180 - H` | `N` | `90 + 90 f` |
| `-180 < H < -D` | below-east | lower meridian | `(H + 180) / N` | `180 + H` | `N` | `180 + 90 f` |
| `-D < H < 0` | above-east | rising | `(H + D) / D` | `-H` | `D` | `270 + 90 f` |

The exact axes have separate boundary labels: `upper-meridian` at `H = 0`,
`setting` at `H = D`, `lower-meridian` at `H = -180` and `rising` at
`H = -D`. Their positions are respectively `0`, `90`, `180` and `270`.
Their quadrant, fraction, meridian distance and relevant semi-arc fields are
null, so an axis is not silently assigned to either adjacent quadrant.
The diurnal and nocturnal semi-arcs themselves are still supplied.

## Equatorial family

Set `phi = 0` and `delta = 0`. Then `q = 0`, `AD = 0` and
`D = N = 90`. At `H = 45`, `135`, `-135` and `-45`, the point lies
halfway through, respectively, the above-west, below-west, below-east and
above-east quadrant. Every meridian distance is `45`, every relevant
semi-arc is `90`, and every quadrant fraction is `1/2`. The corresponding
audit positions are `45`, `135`, `225` and `315`.

The fixtures also give each exact axis. The upper-meridian case sets both
RAMC and right ascension to `25` to verify that the axis follows their
difference. The others set right ascension to `0` and RAMC to `90`, `180`
or `270`. These angles are exactly representable in binary floating point,
and `AD = 0` gives exactly representable horizon hour angles.

## Hour-angle wraparound

At the equator, RAMC `10` and right ascension `350` have the unreduced
difference `-340`, which is `20` after adding a full turn. The point is
above-west, with fraction `20/90 = 2/9` and audit position `20`.
RAMC `350` and right ascension `10` have difference `340`, which reduces
to `-20`. That point is above-east, with fraction
`(-20 + 90)/90 = 7/9` and audit position `270 + 70 = 340`.

Both points have meridian distance `20`. Their fractions differ because the
western quadrant begins at the upper meridian and the eastern quadrant
begins at rising.

## Same-hemisphere oblique family

Let `d = atan(1/2)`, with the angle understood in degrees, and choose
`phi = 45`, `delta = d`. Then `tan(phi) = 1` and `tan(delta) = 1/2`.
Thus `q = 1/2`, `AD = 30`, `D = 120` and `N = 60`, using the exact
identity `sin(30) = 1/2`. The horizon branches are `H = -120` and `120`.

At `H = 60`, the point is midway from upper culmination to setting, with
meridian distance `60` and relevant semi-arc `120`. At `H = 150`, it is
midway from setting to lower culmination, with meridian distance `30` and
semi-arc `60`. At `H = -150`, it is midway from lower culmination to
rising, again with meridian distance `30` and semi-arc `60`. At `H = -60`,
it is midway from rising to upper culmination, with meridian distance `60`
and semi-arc `120`. The quadrant fractions are all `1/2`, and the audit
positions are, in that order, `45`, `135`, `225` and `315`.

Additional points separate the quadrant fraction from the meridian ratio.
At `H = 40`, the above-west fraction is `40/120 = 1/3`, meridian
distance is `40`, and audit position is `30`. At `H = 140`, the
below-west fraction is `(140 - 120)/60 = 1/3`, while meridian distance is
`180 - 140 = 40`; audit position is `120`. At `H = -160`, the below-east
fraction is `(-160 + 180)/60 = 1/3`, meridian distance is `20`, and audit
position is `210`. At `H = -80`, the above-east fraction is
`(-80 + 120)/120 = 1/3`, while meridian distance is `80`; audit position
is `300`. The below-west and above-east cases have meridian ratio `2/3`
but fraction `1/3`, which detects confusing the two definitions.

The southern mirror `phi = -45`, `delta = -d` has both tangent signs
reversed, so their product remains `1/2`. The same hour angles, semi-arcs,
quadrants, distances, fractions and audit positions therefore apply.

## Opposite-hemisphere oblique family

Retain `phi = 45` and replace `delta` by `-d`. Now `q = -1/2` and
`AD = -30`, hence `D = 60` and `N = 120`. The horizon branches are
`H = -60` and `60`. The four quadrant midpoints are `H = 30`, `120`,
`-120` and `-30`. The above-horizon midpoints have meridian distance `30`
and semi-arc `60`; the below-horizon midpoints have meridian distance `60`
and semi-arc `120`. In westward order the fractions remain `1/2` and the
audit positions remain `45`, `135`, `225` and `315`.

The southern observer with `phi = -45` and `delta = d` also has
`q = -1/2`, and gives the same results. The fixtures author both sign
choices independently in their rows so a hemisphere-dependent branch error
cannot hide behind a single northern case.

## Tangencies, circumpolar points and poles

The semi-arc construction requires two transverse horizon crossings.
For interior latitudes and declinations, the condition `|q| < 1` is
equivalent to `|phi| + |delta| < 90`. Equality is a horizon tangency;
a greater sum has no crossing. These domain decisions follow the exact
input angles, without rounding a tangent product into the domain.

At `phi = 60`, `delta = 30`, the product is
`tan(60) tan(30) = sqrt(3) / sqrt(3) = 1`. At lower culmination the two
terms in the altitude expression cancel: `sqrt(3)/4 - sqrt(3)/4 = 0`.
At all other hour angles altitude is positive. There is no rising and
setting pair, and the nocturnal semi-arc collapses. Reversing only the
declination makes the tangency occur at the upper meridian, with the point
otherwise below the horizon and the diurnal semi-arc collapsed. Reversing
both latitude and declination preserves the same tangency; reversing only
latitude exchanges it. The `45`, `45` and `45`, `-45` examples give the
same two cases because the tangent magnitudes are both `1`.
All of these fixtures expect `horizon-tangency`, with no assigned quadrant.

At `phi = 60`, `delta = 45`, `q = sqrt(3) > 1`. Even the lower
culmination has sine altitude `(sqrt(3) - 1)/(2 sqrt(2)) > 0`, so the
point is always above the horizon and the expected refusal is
`circumpolar-above`. At `phi = 60`, `delta = -45`, even the upper
culmination has sine altitude `-(sqrt(3) - 1)/(2 sqrt(2)) < 0`, so the
expected refusal is `circumpolar-below`. Reversing both signs preserves
these results. These mirrored fixtures cover both observer hemispheres.

At geographic latitude `90` or `-90`, altitude is independent of hour
angle, and the local rising/setting construction is undefined. At
declination `90` or `-90`, right ascension itself is undefined and the
declination parallel is a point. The fixtures require, respectively,
`geographic-pole` and `celestial-pole`; they do not assign finite semi-arcs
to these degenerate inputs.

## Tolerance and limits

The constants in `SPHERE_FIXTURE_TOLERANCES` were chosen before comparing
the implementation with these fixtures: absolute angle error at most
`1e-10` degrees and absolute fraction error at most `1e-12`. They allow
binary floating-point representation and elementary trigonometric rounding
in the regular oblique cases. They are acceptance thresholds for these
examples, not measured errors, a global error bound or a claim about any
ephemeris. Quadrant names, boundary labels, null fields and refusal reasons
must match exactly. The tests enforce the tolerances.

The exact boundary examples here are equatorial. The oblique examples are
interior midpoints and one-third points; they do not establish exact oblique-boundary detection
when the computed horizon hour angle differs from its analytic value by
roundoff. No tolerance may turn an interior point into an axis. The cases
near a polar or tangent singularity need separate conditioning checks; these
regular examples and exact refusal cases do not establish their accuracy.
