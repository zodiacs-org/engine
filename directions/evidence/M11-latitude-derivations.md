# M11 latitude and near-tangency evidence

[m11-latitude.ts](m11-latitude.ts) constructs synthetic equatorial coordinate
examples and compares `semiArcs` with the independent half-angle derivation
below. No natal chart, ephemeris, stored solver output or external table
supplies an expected value. The geometric horizon and west-positive hour
angle follow [M3-derivations.md](M3-derivations.md). The traditional context
remains Ptolemy's *Tetrabiblos*, Ashmand translation (1822), book III,
chapter XIV, and Placidus's *Primum Mobile*, Cooper translation (1814),
theses 40 and 55, as recorded in [SOURCES.md](../SOURCES.md). The algebra
here is the numerical arbiter, not a claim that either source printed these
synthetic cases.

## Independent half-angle reference

Latitude `phi`, declination `delta` and all reported arcs are degrees. They
refer to one invented equatorial frame without an epoch. No refraction,
parallax, latitude projection, aspect, direction construction or timing key
enters this primitive calculation. The hour angle `H` increases westward.
Choose positive magnitudes `a = |phi|` and `b = |delta|`, each below a pole,
with `a + b < 90`. Put `g = 90 - a - b` and `t = min(a,b)`.
The dot product of point and zenith gives the horizon equation

```text
sin(altitude) = sin(phi) sin(delta) + cos(phi) cos(delta) cos(H)
cos(H) = -tan(phi) tan(delta).
```

Let `q = tan(a) tan(b)` and `S` be the shorter semi-arc. Then
`cos(S) = q`, with `0 < S <= 90`. Since the other magnitude is
`90 - t - g`, `q = tan(t) cot(t + g)`. The addition identities give

```text
1 - q = sin(g) / (cos(t) sin(t + g))
1 + q = sin(2t + g) / (cos(t) sin(t + g))
tan(S/2)^2 = (1 - q) / (1 + q) = sin(g) / sin(2t + g)
S = 2 atan(sqrt(sin(g) / sin(2t + g))).
```

The reference evaluates this last expression. Its denominator's argument
lies between zero and a right angle. No nearly equal products are
subtracted, no inverse sine is evaluated near an endpoint, and no value
from `semiArcs` enters the expression. The library instead uses the
factored discriminant of the horizon equation and `atan2`, so the two
evaluation paths have different operations. Both use JavaScript elementary
functions: this is an algebraically independent reference, not an
independent implementation of the elementary functions or an arbitrary
precision proof.

For equal input magnitudes `a = b = 45 - g/2`, `2t + g = 90` exactly,
so `sin(2t + g) = 1` and `S = 2 atan(sqrt(sin(g)))`.
For matching hemisphere signs, the diurnal semi-arc is `D = 180 - S`,
the nocturnal semi-arc is `N = S`, and ascensional difference is
`AD = 90 - S`. For opposite signs, `D = S`, `N = 180 - S`, and
`AD = S - 90`. The setting and rising horizon branches are `H = D`
and `H = -D`. At zero declination the horizon equation is `cos(H) = 0`;
the authored expected values are `D = N = 90` and `AD = 0` at every
nonpolar latitude.

## Exact input families

The executable fixture exports every input, its gap and expected quantities.
All selected inputs are exact dyadic degrees, including the subtraction
that constructs each latitude or declination. The test checks every stated
gap with exact integer arithmetic on the binary64 inputs.

| Family | Input magnitudes in degrees | Selected gap or pole distance |
| --- | --- | --- |
| Equal magnitudes | `a = b = 45 - g/2` | `g = 2^-k`, `k` in `0, 8, 16, 24, 32, 40, 46` |
| Unequal magnitudes | `a = 60`, `b = 30 - g` | `g = 2^-k`, `k` in `8, 24, 40, 48` |
| Near geographic pole | `a = 90 - p`, `b = p/2` | `p = 2^-k`, `k` in `0, 16, 32, 46`; `g = p/2` |
| Near celestial pole | `a = p/2`, `b = 90 - p` | the same `p` and `g` |
| Zero declination | `b = 0` | `a` in `0, 15, 30, 45, 60, 75, 89, 90 - 2^-46` |

Every nonzero family runs under all latitude and declination sign
combinations. The zero-declination family runs in both observer hemispheres.
The unequal family's last interior point has `60 + (30 - 2^-48)` rounded
to `90` by ordinary addition, although the exact input sum is below it.
The equal family's final input is the representable degree immediately
below `45`; the polar family's final large coordinate is the representable
degree immediately below `90`. These are tests of supplied coordinates,
not uncertainty intervals around a physical observation.

## Refusal boundaries

The same horizon equation requires `a + b < 90` for transverse crossings.
At `a + b = 90` the circle touches the horizon. Greater sums remain above
the horizon for matching signs and below it for opposite signs. The fixtures
therefore require `horizon-tangency`, `circumpolar-above`, or
`circumpolar-below` exactly, under every sign combination, for these pairs:

- Tangent magnitudes `(45,45)` and `(60,30)`.
- Just-outside magnitudes `(45 + 2^-47, 45 + 2^-47)` and
  `(60, 30 + 2^-48)`.
- Near either pole, tangent magnitudes `(90 - 2^-46, 2^-46)` and
  the exchanged pair.
- Near either pole, just-outside magnitudes
  `(90 - 2^-46, 2^-46 + 2^-98)` and the exchanged pair. The increment
  `2^-98` is one binary64 step at `2^-46` degrees.

The exact geographic poles at `phi = +/-90`, `delta = 0` require
`geographic-pole`. The exact celestial poles at `delta = +/-90`, `phi = 0`
require `celestial-pole`. No finite arc or substitute geometry is assigned.

## Acceptance and limits

Before measuring the implementation, the fixture sets an absolute allowance
of `1e-12` degrees for `AD`, `D` and `N`. It separately compares the shorter
semi-arc with a relative allowance of `64 * Number.EPSILON`, where
`Number.EPSILON = 2^-52`. The latter prevents a fixed absolute allowance
from hiding loss of the small positive arc. The allowance accommodates
degree-radian conversion, elementary-function rounding and the separate
evaluation paths; it is a test threshold, not a proven bound. Refusal codes
must match exactly. Residuals are signed `actual - expected` in degrees.

[m11-latitude.check.ts](../checks/m11-latitude.check.ts) enforces the complete
exported family and its domain arithmetic. `measureM11Latitude()` supplies
every numerical residual, allowance and verdict to the M11 report. Agreement
on these inputs does not bound error between them, at other singular
configurations, for ephemerides or for complete directional hits. Near a
tangency the physical result is sensitive to changes in latitude and
declination even when these exact-coordinate computations agree.
