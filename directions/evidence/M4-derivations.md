# M4 hand-derived angular conjunctions

[angle-examples.ts](angle-examples.ts) contains authored synthetic sphere
coordinates and expected direct conjunction arcs. The arbiter is the algebra
below, with the horizon equation already derived in
[M3-derivations.md](M3-derivations.md). No fixture comes from an engine, an
earlier solver run, a historical chart or a person's birth record. The fixture
file imports no implementation. Its only transcendental evaluation defines
the input declination `d = atan(1/2)` in degrees; expected values are authored
integers or finite dyadic fractions.

## Historical construction and project choices

Ptolemy, *Tetrabiblos*, J. M. Ashmand translation (1822), book III, chapter
XIV, [printed page 94](https://sacred-texts.com/astro/ptb/ptb58.htm), measures
arrival at the eastern horizon by ascensional times, at the meridian by
right ascension, and at the western horizon by descensional times. This
supports distinguishing the horizon branches and measuring rotation on the
equator. The source does not give the synthetic numerical examples below.
Their lower-meridian target follows from the antipodal meridian geometry.

Placidus de Titis, *Primum Mobile*, John Cooper translation (1814),
[printed page 57 and canon XXXVII, pages 104-105](https://iapsop.com/ssoc/1814__cooper___primum_mobile.pdf),
describes direct motion as carrying the promissor westward to the
significator's fixed position. Converse exchanges those roles. Theses 60-61,
printed page 23, reject converse angular directions and converse zodiacal
aspects. Accordingly the explicit `placidus-role-swap` construction refuses
all angular targets here. Negating a direct arc would implement a different
construction and is not offered by this milestone. The readings and their
scope are recorded in [the source register](../SOURCES.md) and
[source-readings.json](source-readings.json).

The branch convention here is the first nonnegative westward arrival within
one rotation, including a contact already present. Choosing this normalized
branch is project API notation, not a claim that the sources prescribe a
particular age window. The primitive returns an equatorial rotation arc;
there is no timing key, directed age, planetary orbital motion or ephemeris
calculation at this level.

## Coordinates, targets and arc

Every angle below is in degrees. RAMC `theta` and the moving point's right
ascension `alpha` share an equator and equinox. The observer's geographic
latitude is `phi`; the point's declination is `delta`. Hour angle is
`H = theta - alpha`, reduced into `[-180, 180)`, west-positive. During
the direct primary rotation, the point's declination remains fixed and its
hour angle increases by the equatorial rotation arc `A`.

From the geometric horizon equation of M3,

```text
q = tan(phi) tan(delta)
AD = asin(q)
D = 90 + AD
N = 90 - AD
```

Here `D` is the diurnal semi-arc and `N` the nocturnal semi-arc. The
crossing domain has `-1 < q < 1`. There are two horizon solutions:
`H = -D` at rising and `H = D` at setting. Upper culmination has
`H = 0`; lower culmination has `H = -180`, equivalent to `180`.

| Target identifier | Fixed angular position | Target hour angle T |
| --- | --- | --- |
| `mc` | Upper meridian | `0` |
| `ic` | Lower meridian | `-180` |
| `asc` | Eastern geometric horizon, rising | `-D` |
| `dsc` | Western geometric horizon, setting | `D` |

These target identifiers mean angular positions on the local sphere. The
point's own declination determines the horizon crossing. They are not
invented ecliptic cusp longitudes or bodily longitude conjunctions with a
natal angle. A caller must first supply the coordinates appropriate to its
latitude and zodiacal or mundane policy; the primitive does not select that
policy from missing input.

Set the raw signed difference `B = T - H`. Since both representatives lie
within one turn, the desired arc is

```text
A = B         if B >= 0
A = B + 360   if B < 0.
```

Exact coincidence gives `A = 0`, not the next revolution. Arcs greater than
`180` stay greater than `180`: the requested direct rotation does not become
the shortest separation. `wholeTurnsAdded` records whether the second line
added `360` to the signed representatives. It is not the number of physical
revolutions completed on the way to contact. For example, an IC contact just
ahead of `H = 180` uses the representative `T = -180`; one turn is added
algebraically even though the physical arc is very small.

The fixture records `H`, `T`, `AD`, `D`, `N`, `A` and
`wholeTurnsAdded` independently. This lets a failure distinguish hour-angle
wrapping, horizon selection and final arc normalization.

The displayed subtraction and turn addition are equations over real
numbers. Floating-point evaluation must preserve their branch meaning.
The branch test compares `T < H`, and coincidence compares `T === H`,
without relying on a rounded subtraction. For a short wrapped arc, the
equivalent expression `(180 - H) + (T + 180)` adds two nonnegative gaps
through the lower meridian. It avoids cancellation of a small positive arc
when a rounded `T - H` equals `-360`. The returned raw signed difference,
when supplied as audit metadata, is still a rounded binary64 value and may
not reproduce the final arc by adding a turn to it.
For long wrapped arcs (`B > -180`), the implementation uses `360 + B`
directly. Splitting a nearly complete turn at the lower meridian can round
twice and lose a representable distance below a complete turn.

## Equatorial contacts

At `phi = delta = 0`, the tangent product vanishes, so `AD = 0` and
`D = N = 90`. Choose `theta = 315`, `alpha = 0`; then `H = -45`.
For the targets in order `mc`, `ic`, `asc`, `dsc`, the signed differences
are `45`, `-135`, `-45`, `135`. The direct arcs are therefore `45`,
`225`, `315`, `135`, with turn additions `0`, `1`, `1`, `0`.
The ASC case has already risen and must travel through upper culmination,
setting and lower culmination before rising again. Reporting `45` would
reverse the requested rotation.

The coincident examples set `(theta, alpha)` to `(25, 25)` for MC,
`(180, 0)` for IC, `(270, 0)` for ASC and `(90, 0)` for DSC.
Their initial hour angles equal the respective target representatives
`0`, `-180`, `-90`, `90`. Every raw difference and arc is exactly zero,
and no whole turn is added. These axes and input differences are exactly
representable in binary64, so coincidence is checked without a tolerance.

## Right-ascension wraparound

At the equator, `theta = 10`, `alpha = 350` gives the raw hour-angle
difference `-340`, normalized to `H = 20`. Its MC difference is `-20`,
giving arc `340`; its ASC difference is `-110`, giving arc `250`.
Both require an algebraic turn addition.

With `theta = 350`, `alpha = 10`, the raw hour-angle difference is `340`,
normalized to `H = -20`. MC is reached after `20`, and DSC after
`90 - (-20) = 110`, with no turn addition. The cases distinguish the
initial RA/RAMC normalization from the subsequent normalization of the
directional arc.

## Oblique contacts

Let `d = atan(1/2)` in degrees. At `phi = 45`, `delta = d`,
`q = 1/2`, so `AD = 30`, `D = 120`, `N = 60`. The southern mirror
`phi = -45`, `delta = -d` has the same tangent product and semi-arcs.
Opposite signs, `(45, -d)` and `(-45, d)`, give `q = -1/2`,
`AD = -30`, `D = 60`, `N = 120`. These are the exact identities
`tan(45) = 1` and `sin(30) = 1/2`, not measured solver outputs.

For each row family the fixture holds `alpha = 0`; RAMC is the
nonnegative representative of `H`. The following arithmetic gives every
oblique arc in the fixture. Each parenthesized tuple orders targets as
`(mc, ic, asc, dsc)`.

| Latitude, declination | RAMC | H | Targets T | Raw differences B | Direct arcs A | Turn additions |
| --- | ---: | ---: | --- | --- | --- | --- |
| `45, d` | `300` | `-60` | `(0, -180, -120, 120)` | `(60, -120, -60, 180)` | `(60, 240, 300, 180)` | `(0, 1, 1, 0)` |
| `-45, -d` | `150` | `150` | `(0, -180, -120, 120)` | `(-150, -330, -270, -30)` | `(210, 30, 90, 330)` | `(1, 1, 1, 1)` |
| `45, -d` | `330` | `-30` | `(0, -180, -60, 60)` | `(30, -150, -30, 90)` | `(30, 210, 330, 90)` | `(0, 1, 1, 0)` |
| `-45, d` | `120` | `120` | `(0, -180, -60, 60)` | `(-120, -300, -180, -60)` | `(240, 60, 180, 300)` | `(1, 1, 1, 1)` |

Changing the signs of latitude and declination together preserves `D`.
Changing only one sign exchanges the lengths of day and night and changes
both horizon targets. Meridian targets remain independent of declination
within the accepted domain. The different hour-angle choices also exercise
positions above and below the horizon in both eastern and western halves.

## Boundary neighbours

The boundary cases use the equatorial family and the dyadic step
`s = 1/1024 = 0.0009765625` degrees. Every input and expected value is
exactly representable in binary64. For each target, choose an initial point
one step before contact in westward motion and one step after it. The
expected arc before contact is `s`; after contact it is
`360 - s = 359.9990234375`. These are separate contacts, never zero.

| Target | H before | H after | T | Turn addition before, after |
| --- | --- | --- | --- | --- |
| `mc` | `-s` | `s` | `0` | `0, 1` |
| `ic` | `180 - s` | `-180 + s` | `-180` | `1, 1` |
| `asc` | `-90 - s` | `-90 + s` | `-90` | `0, 1` |
| `dsc` | `90 - s` | `90 + s` | `90` | `0, 1` |

The IC pair crosses the signed hour-angle seam. Its before value has raw
difference `-360 + s`, and its after value has raw difference `-s`.
Adding a turn gives the expected arcs above on both sides. This prevents
confusing the discontinuity in the coordinate representative with a
discontinuity in physical rotation.

One further IC example uses `s = 2^-45 = 1/35184372088832` degrees.
Immediately below `180`, a binary64 step is `2^-45`, since this binade
starts at `128 = 2^7` and binary64 has `52` stored fraction bits.
Thus input RAMC `179.99999999999997` is exactly `180 - 2^-45`, and
right ascension zero gives the same hour angle. The expected direct IC arc
is exactly `2^-45`, with one algebraic turn addition. The conceptual raw
difference `-360 + 2^-45` is halfway between binary64 values around
`-360`, so ordinary subtraction rounds to `-360` under ties-to-even.
Subsequently adding `360` would incorrectly erase the contact arc.
The two nonnegative gaps preserve it as `s + 0`. This fixture's arc must
also be compared exactly, because the general absolute tolerance would
otherwise admit an erroneous zero.

The dedicated near-full-turn check starts just west of MC with hour angles
`3e-14` and `4e-14`. The spacing of binary64 values around `360` is
`2^-44`; each gap is greater than half that spacing and less than one and
a half spacings. Hence the correctly rounded first forward arc is the
predecessor `360 - 2^-44` in both cases. The long-arc evaluation preserves
that result. A gap of `Number.MIN_VALUE` is instead too small to distinguish
the first forward arc from `360` in binary64, and the solver refuses it.
For a point the same tiny distance east of MC the short forward arc itself
is representable, so the solver retains it and does not call it coincident.
These exact arithmetic checks are in [angles.check.ts](../checks/angles.check.ts).

## Domain and refusal scope

This milestone accepts only points whose diurnal circle crosses the
geometric horizon transversely. It reuses the sphere primitive's pole,
tangency, circumpolar and numerical-degeneracy refusals for every target.
The crossing restriction for MC and IC is a project limitation: a
circumpolar point can still cross a meridian mathematically. No claim is
made that meridian rotation itself requires rising and setting.

The independent refusal examples and their proofs remain those in
[M3-derivations.md](M3-derivations.md#tangencies-circumpolar-points-and-poles).
The M4 tests apply them to each angular target, and separately verify that
`converse` with `placidus-role-swap` is refused for every angle. No house
fallback, inverse-trigonometric clamping or unrequested converse convention
may supply a result for a refused request.

## Tolerance and limits

`ANGLE_FIXTURE_TOLERANCES.angleDegrees` was fixed at `1e-10` degrees
before solver comparisons. It applies to arc, hour-angle, semi-arc and
ascensional-difference comparisons on these authored examples. The allowance
covers ordinary floating-point and trigonometric rounding in the regular
oblique examples. It is an acceptance threshold, not a measured error, a
global bound or an ephemeris accuracy claim. Turn additions, target labels
and the exactly representable equatorial coincidences are compared exactly,
as is the IC example at one binary64 step below the lower meridian.

The oblique inputs are interior points, away from tangent or polar
singularities. These fixtures do not establish exact recognition of an
analytic oblique horizon after floating-point evaluation, and a tolerance
must not turn a nearby point into coincidence. They establish no body
aspect construction, timing conversion or predictive validity. The later
milestones must supply their own independently derived expectations.
