# M9 bounded scan enumeration

[scan-examples.ts](scan-examples.ts) contains independently authored synthetic
sphere inputs and a complete hand enumeration of their selected contacts.
It imports no implementation. No expected arc or timing value comes from
running the direction library, and no coordinate describes a person's chart.

## Definitions and sources

This enumeration uses the ordinary mundane Placidus semi-arc construction
already derived in [M6](M6-derivations.md). Its historical basis is Placidus
de Titis, *Primum Mobile*, John Cooper translation (1814), Part III,
pp. 72-77, canons XXX and XXXII, pp. 87-91, and canon XXXVII,
pp. 104-105. The [source register](../SOURCES.md) links the edition and its
recorded readings. Westward and eastward are the project's explicit branch
labels from original promissor to original significator. Converse means the
previously sourced `placidus-role-swap` construction. Both bodies retain
their equatorial coordinates under `mundane/retain-both`.

The timing choices are the existing separate keys from
[M7](M7-derivations.md): Ptolemy, *Tetrabiblos*, Ashmand translation (1822),
Book III chapter XIV, p. 94; the adopted Naibod rate stated by Erich Carl
Kuehr, *Berechnung der Ereigniszeiten* (1936), pp. 62-63; and the solar
equatorial birth-day rate attributed to Maginus by William Lilly,
*Christian Astrology* (1647), Book III, pp. 709-710. The sources' URLs and
limits remain in the source register. [M8](M8-derivations.md) explains the
assembly of these geometry and timing definitions. A scan introduces no
new geometric construction, timing key or traditional interpretation.

## Equatorial reduction

All angular quantities are degrees, except that `q` denotes proportional
mundane-position degrees. Set RAMC and geographic latitude to zero. The
synthetic significator `S` has right ascension `330` and declination zero;
the synthetic promissor `P` has right ascension `60` and declination zero.
The signed west-positive hour angle is RAMC minus right ascension reduced
to `[-180, 180)`, so

```text
H_S = 30,  q_S = 30
H_P = -60, q_P = 300
AD = asin(tan(0) * tan(0)) = 0
D = N = 90
```

Since both diurnal and nocturnal semi-arcs equal `90`, the piecewise
coordinate in M6 reduces to `q = H modulo 360`. Its inverse is `H = q`
for `q < 180`, and `H = q - 360` otherwise. In particular the lower
meridian is represented as `H = -180`, not `180`.

Let `r` be the signed aspect offset: positive for westward and negative for
eastward, zero for conjunction, and positive `180` for the unbranched
opposition. Original labels retain the relation `q_S = q_P + r` modulo a
turn. Consequently:

```text
direct:   q_target = (30 - r) modulo 360
          arc = (H_target + 60) modulo 360
converse: q_target = (300 + r) modulo 360
          arc = (H_target - 30) modulo 360
```

These are first nonnegative rotations, preserving an initial contact as
zero. The enumeration concerns body significators, including their cardinal
positions. It does not enable converse angular significators.

## Enumerated contacts

Every entry follows by the integer substitutions above. The order is also
the fixture's selection order. Each direct or converse cell gives target
`q`, target `H` and arc, respectively.

| Selection index | Contact | `r` | Direct `(q,H,arc)` | Converse `(q,H,arc)` |
| ---: | --- | ---: | --- | --- |
| 0 | Conjunction | 0 | `(30,30,90)` | `(300,-60,270)` |
| 1 | Sextile westward | 60 | `(330,-30,30)` | `(0,0,330)` |
| 2 | Sextile eastward | -60 | `(90,90,150)` | `(240,-120,210)` |
| 3 | Square westward | 90 | `(300,-60,0)` | `(30,30,0)` |
| 4 | Square eastward | -90 | `(120,120,180)` | `(210,-150,180)` |
| 5 | Trine westward | 120 | `(270,-90,330)` | `(60,60,30)` |
| 6 | Trine eastward | -120 | `(150,150,210)` | `(180,-180,150)` |
| 7 | Opposition | 180 | `(210,-150,270)` | `(120,120,90)` |

For example the direct westward trine targets `30 - 120 + 360 = 270`,
whose hour angle is `-90`. Its arc is `-90 + 60 + 360 = 330`. With
converse role exchange the target is `300 + 120 - 360 = 60`, whose hour
angle is `60`, so the arc is `60 - 30 = 30`. The westward square is
already present at the input geometry; both constructions have exact zero
arc without an epsilon or a repeated turn.

Give each row the original index `selectionIndex * 2 + motionIndex`, with
direct motion first and converse second. Sorting by age, with ties retaining
that input order, gives the following independently authored index list:

```text
6, 7, 2, 11, 0, 15, 4, 13, 8, 9, 5, 12, 1, 14, 3, 10
```

The paired arc groups in that order are `0`, `30`, `90`, `150`, `180`,
`210`, `270` and `330`. All selected keys have positive fixed rates, so
the age order is the same for each key. Equal ages remain separate contacts
when their selection or motion differs. A scan's explicitly defined endpoint
and duplicate-request policies are software selection rules, not additional
sphere equations. Independent range expectations may filter this authored
table using the chosen endpoint rule; they must not derive eligibility from
the actual returned rows or widen the endpoint with a fixture tolerance.

## Timing the enumeration

For each independently authored arc `a`, the directed ages are:

```text
Ptolemy: age = a
Naibod:  age = a * 360000/354833
solar:   age = 2 * a
```

The solar samples are invented right ascensions `359.75` and `0.25` at TT
Julian dates `2451545` and `2451546`. Their declared frame is the true
equator and equinox of each sample's own date, apparent and geocentric, as
specified in M7. They are arithmetic inputs, not observed solar positions.
The forward advance is `0.25 - 359.75 + 360 = 1/2` degree over the supplied
TT day. It becomes the fixed degree-per-directed-year rate. Converse uses
the same samples and positive rate. Naibod uses the exact conventional
rate `354833/360000`, not a rounded alternative.

Expected elapsed days follow by separate rational multiplication of those
age expressions by `1826211/5000` for the tropical fixed year unit or
`1461/4` for the Julian unit, as in M7 and M8. Expected values must use
the authored arc, not a computed hit's arc or age.

## Acceptance and limits

The scan test also uses a zodiacal direct example with zero obliquity and
observer latitude, significator longitude `330` and promissor longitude `60`.
Projection to zero latitude makes RA equal longitude and leaves declination
zero. Thus conjunction has arc `60 - 330 + 360 = 90`, and the dexter square
ray is already at `60 - 90 + 360 = 330`, giving arc zero. Original latitudes
`4` and `-7` remain metadata. With that promissor's initial hour angle `-60`,
the fixed axes MC, IC, ASC and DSC have target hour angles `0`, `-180`,
`-90` and `90`. Their first nonnegative arcs are respectively `60`, `240`,
`330` and `150`. These are the direct fixed-axis definitions from
[M4](M4-derivations.md), combined with the zero-both projection from
[M5](M5-derivations.md); no angle-as-body replacement is used.

The fixture fixes an absolute angular allowance of `1e-10` degrees and a
relative timing allowance of `1e-11` before any comparison with the scan
implementation. These are finite fixture acceptance thresholds inherited
from M8, not measured global error bounds. Here the equatorial integer
coordinates make the listed angular values exact in the defining arithmetic;
tests may therefore require exact integer equality. Zero arc, age and
elapsed-day expectations require exact positive zero. Range membership and
stable ties use their exact software rules, without those numeric allowances.

This is a finite enumeration of the selected ordinary mundane body contacts
and motions, each within its first nonnegative turn. It does not establish
that arbitrary lists contain every traditionally possible contact, validate
near-singularity geometry, authenticate ephemeris coordinates or establish
predictive accuracy. Comparison of scan rows with `hit` separately checks
assembly consistency; the independent expectations remain this derivation
and the authored fixture table.
