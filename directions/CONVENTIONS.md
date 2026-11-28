# Conventions and geometry audit

`directions/` implements a restricted Placidus proportional semi-arc
construction. Every request names its direction mode, latitude policy,
motion, timing key and year unit. The [API guide](API.md) describes the
calls; the [CLI guide](CLI.md) gives runnable JSON requests. This guide
explains what the choices mean and how to inspect a returned hit.

Historical attribution and numerical verification are separate. The
[source register](SOURCES.md) and [reading record](evidence/source-readings.json)
identify the passages read. The [evidence index](evidence/README.md) links
authored spherical examples and their checks. Those examples use synthetic
coordinates, not published birth records or this library's earlier output.

## What each source supplies

| Source | Adopted here | Boundary of the attribution |
| --- | --- | --- |
| Ptolemy, *Tetrabiblos*, J. M. Ashmand translation (1822), book III chapter XIV, [pp. 94-96](https://sacred-texts.com/astro/ptb/ptb58.htm) | Temporal-hour position between horizon and meridian; different angular rules for rising, culmination and setting; the `ptolemy` degree-for-a-year key. | This does not select the project's latitude projection, modern coordinate frame or elapsed-day unit. |
| Placidus de Titis, *Primum Mobile*, John Cooper translation (1814), [theses 40, 45-46, 55 and 60-61; p. 57; canons XVII-XIX, XXIII, XXVII, XXX, XXXII and XXXVII](https://iapsop.com/ssoc/1814__cooper___primum_mobile.pdf) | Proportional diurnal/nocturnal semi-arcs, retained bodily latitude in mundane contacts, direct westward motion and converse role exchange. The cited restrictions exclude converse angles and zodiacal rays to angles. | `zero-both` is a restricted project projection. The ordinary semi-arc implementation omits changing significator latitude, the special solar crepuscular treatment, mundane parallels and other systems. |
| William Lilly, *Christian Astrology* (1647), book I, [pp. 108-109](https://www.worldastrology.net/wp-content/uploads/2008/12/CA-I.pdf) | Zodiacal branch terminology: sinister follows sign order, dexter runs against it. | Lilly's branch names do not replace the Placidus geometry or name the project's mundane branches. |
| Lilly, *Christian Astrology*, book III, chapter CLXVI, [pp. 709-715](https://www.worldastrology.net/wp-content/uploads/2008/12/CA-III.pdf) | Separate timing keys; the method he attributes to Antonius Maginus uses the next day's same-hour solar RA advance as a fixed annual arc. | Maginus's original text was not read. Lilly does not specify the project's TT day, modern true-of-date frame or unwrapping rule. |
| Erich Carl Kühr, *Berechnung der Ereigniszeiten* (1936), [pp. 62-63](https://www.imagomundi.biz/wp-content/uploads/2026/04/PYKS52-Berechnung_der_Ereignisgrenzen-Erich_Carl_Kuehr.pdf#page=37) | The printed decimal form of the `naibod` annual rate. | Naibod's original text was not read. Kühr's directional geometry and predictive claims are not adopted. |
| US Naval Observatory, [*Computing Altitude and Azimuth from Greenwich Apparent Sidereal Time*](https://aa.usno.navy.mil/faq/alt_az), local-hour-angle and altitude equations | Modern relation between latitude, declination, hour angle and geometric altitude. | This supplies a sphere identity, not a historical direction system or timing key. |

The implemented equations are written out in the
[sphere](evidence/M3-derivations.md),
[angle](evidence/M4-derivations.md),
[zodiacal](evidence/M5-derivations.md) and
[mundane](evidence/M6-derivations.md) derivations. These record which parts
are project definitions instead of silently presenting the entire API as
one traditional author's method.

## Supported combinations

`system` must be `placidus-semiarc`. The convention parser recognizes an
explicit request; the selected contact solver decides whether it is
implemented. A valid convention object alone does not promise a hit.

| Mode and latitude | Motion | Body conjunction | Body aspect | Angular conjunction | Angular aspect |
| --- | --- | --- | --- | --- | --- |
| `zodiacal`, `zero-both` | `direct` | Supported | Supported with zodiacal branch rules | Supported | Refused |
| `zodiacal`, `zero-both` | `converse`, `placidus-role-swap` | Refused | Refused | Refused | Refused |
| `mundane`, `retain-both` | `direct` | Supported | Supported with mundane branch rules | Supported | Refused |
| `mundane`, `retain-both` | `converse`, `placidus-role-swap` | Supported | Supported with mundane branch rules | Refused | Refused |

Every supported cell still requires defined sphere geometry and valid
timing input. Body aspects are sextile, square, trine and opposition.
Conjunction and opposition forbid a branch field; the other aspects require
one. A promissor is always a body. An angular significator is explicitly
`mc`, `ic`, `asc` or `dsc`. These contracts and refusals are enforced in
[conventions.check.ts](checks/conventions.check.ts),
[zodiacal.check.ts](checks/zodiacal.check.ts),
[mundane.check.ts](checks/mundane.check.ts) and
[hit.check.ts](checks/hit.check.ts).

For `direct`, omit `converseConstruction`. For `converse`, explicitly supply
`converseConstruction: "placidus-role-swap"`. Direct carries the promissor
westward toward the fixed significator's position or contact relation.
Mundane converse carries the significator westward while the promissor
stays fixed. Results preserve the original names in `significator` and
`promissor`; `movingRole` and `fixedRole` identify their operative roles.

Zodiacal `zero-both` preserves each original ecliptic latitude in the input
metadata, projects the operative points to the ecliptic, and calls the
engine's `eclipticToEquatorial` with the supplied true obliquity. The
promissor's sinister ray adds the aspect to its longitude; its dexter ray
subtracts it. A conjunction uses its own projected longitude. This subset
also refuses converse projected conjunctions, because no such construction
was established for it in the adopted source work.

Mundane `retain-both` uses the supplied bodily RA and declination without
an ecliptic ray. `westward` and `eastward` refer to the proportional-position
relation from the original promissor to the original significator, even
in converse. They are project coordinate labels. For ordinary aspects with
magnitude `A`, write `r = +A` for westward and `r = -A` for eastward. The
relation is `qS = qP + r` modulo a turn; direct targets `qS - r`, and
converse targets `qP + r`. The [mundane derivation](evidence/M6-derivations.md)
and [fixtures](evidence/mundane-examples.ts) fix these branch signs.

The natal adapter retains the engine's requested house system, cusps,
angles, full equatorial rows and clock provenance. It recovers RAMC from
the engine's MC and obliquity. Selecting natal houses does not select a
different direction system: the direction solver uses the explicitly named
semi-arc construction. The integration checks in
[natal.check.ts](checks/natal.check.ts) verify this provenance; they are
not independent arc references.

## Geometry to read in a hit

All angular coordinates here are degrees. RAMC is the local sidereal
angle, `alpha` is RA, `phi` is observer latitude and `delta` is declination.
The audit uses west-positive hour angle `H`, canonical in `[-180, 180)`.
The independently authored [M3 derivation](evidence/M3-derivations.md) and
[sphere fixtures](evidence/sphere-examples.ts) establish:

```text
H = RAMC - alpha, reduced to the signed hour-angle interval
AD = asin(tan(phi) * tan(delta))
D = 90 + AD
N = 90 - AD
```

`D` and `N` are the diurnal and nocturnal semi-arcs. The implementation
uses an equivalent factored expression to preserve a short semi-arc near
horizon tangency; see [M11's latitude derivation](evidence/M11-latitude-derivations.md).
Read `semiArcs` for the computed values and `kind`, `quadrant` or `boundary`
for the actual classification. A rounded proportional coordinate by itself
does not establish that a point lies exactly on an axis.

`semiArcPositionDegrees`, abbreviated `q`, expresses position as a fraction
of the relevant semi-arc. Its origin and orientation are library
definitions: upper meridian `0`, setting `90`, lower meridian `180`, rising
`270`. It is a proportional coordinate, not ecliptic longitude or the
equatorial rotation returned as `arcDegrees`. The complete piecewise
mapping and its inverse are in [M6](evidence/M6-derivations.md); the
[sphere checks](checks/sphere.check.ts) test the quadrant and axis values.

For a body conjunction, retain the fixed point's meridian-distance fraction
and apply it to the moving point's appropriate semi-arc. For a mundane
aspect, first select the target `q` from the branch equation, then invert
it on the moving body's circle. The target quadrant determines whether
to use the moving body's diurnal or nocturnal semi-arc; its natal quadrant
need not be the target quadrant.

For an angular conjunction the target hour angle is `0` at MC, `-180` at
IC, `-D` at ASC and `D` at DSC. The target uses the prepared promissor's
declination circle. An angle is a meridian or horizon axis, not a body
substituted at an angle's ecliptic longitude. The targets are derived and
tested in [M4](evidence/M4-derivations.md) and
[angles.check.ts](checks/angles.check.ts).

Every solver selects the first nonnegative westward rotation, including
initial contact as zero. Read `targetHourAngleDegrees`, `unreducedArcDegrees`,
`wholeTurnsAdded`, `coincident` and the returned `arcDegrees` together.
The first-turn interval is `[0, 360)`; this is a project rule enforced by
the angle, zodiacal and mundane tests. The audit's unreduced subtraction
is rounded, so reproducing a tiny arc from that field alone can lose
information that the solver retained from its inputs.

## Walk through independently derived hits

These are the existing M8 fixtures, with their complete derivation in
[M8-derivations.md](evidence/M8-derivations.md), inputs and rational
expectations in [hit-examples.ts](evidence/hit-examples.ts), and acceptance
checks in [hit.check.ts](checks/hit.check.ts). All coordinates are invented.
The ideal arithmetic below explains their expected values; floating-point
results are compared under those fixtures' declared allowances.

Take observer latitude `45`, RAMC `0` and `d = atan(1/2)` in degrees.
Let synthetic S have RA `320`, declination `d`, and synthetic P have RA
`30`, declination `-d`. Then:

| Audit quantity | S | P |
| --- | ---: | ---: |
| Hour angle | `40` | `-30` |
| Ascensional difference | `30` | `-30` |
| Diurnal semi-arc | `120` | `60` |
| Nocturnal semi-arc | `60` | `120` |
| Proportional position `q` | `30` | `315` |

For fixture `mundane-direct-ptolemy`, S is fixed. Its meridian fraction is
`40/120 = 1/3`. P reaches that fraction at hour angle `60/3 = 20`, so the
westward arc is `20 - (-30) = 50`. In an accepted result, follow
`geometry.calculation.geometry`: the moving role is `promissor`, the fixed
role is `significator`, and `targetHourAngleDegrees` is compared with `20`.
The top-level `arcDegrees` is the primitive's arc; Ptolemy's key gives
directed age `50`.

For `mundane-converse-naibod`, P is fixed and S moves. The fixed fraction
east of the upper meridian is `30/60 = 1/2`; the target on S is
`-120/2 = -60`. The arc is `-60 - 40 + 360 = 260`. The audit now names
`movingRole: "significator"` and `fixedRole: "promissor"` while the
top-level labels remain S and P. This independently derived pair shows
why role exchange cannot generally be replaced by negating the direct arc.
Naibod's rate gives age `93600000/354833`, as the fixture's rational
expectation records.

For `mundane-converse-square-solar`, retain those coordinates and select
the eastward square. Its offset is `-90`, so the target is
`qP - 90 = 225`, in the below-east quadrant. S's nocturnal semi-arc is
`60`, and the target hour angle is `-180 + 60/2 = -150`. Thus the arc is
`-150 - 40 + 360 = 170`. The fixture's invented solar samples give a
fixed rate of `5/4` degrees per year, making the age `136`. Inspect
`aspectOffsetDegrees`, `targetSemiArcPositionDegrees`, `targetQuadrant`,
`targetSemiArcDegrees` and `timing.audit.samples` to audit each step.

The same M8 evidence includes `zodiacal-square-solar`. With obliquity
`30`, observer latitude `atan(sqrt(3)/2)` in degrees and RAMC `45`,
the significator longitude `0` projects to RA and declination `0`.
A promissor longitude `180` casts a dexter square at longitude `90`,
which projects to RA `90`, declination `30`. The fixed fraction is
`45/90 = 1/2`; the ray's diurnal semi-arc is `120`, so the target is
`60` and the arc is `60 - (-45) = 105`. Read `rayOffsetDegrees` and
the prepared `geometry.significator` and `geometry.promissor` inside
the calculation: the moving coordinate is the ray. The fixture's solar
rate `1/2` then gives age `210`. These figures establish that synthetic
case, not a bound over arbitrary charts.

## Timing choices remain separate

Every supported geometric construction can select any implemented key,
provided its required timing input is valid. Changing the key does not
change the arc or moving/fixed roles. The definitions and independent
rational checks are in [M7-derivations.md](evidence/M7-derivations.md),
[timing-examples.ts](evidence/timing-examples.ts) and
[timing.check.ts](checks/timing.check.ts).

| `key` | Annual rate and audit |
| --- | --- |
| `ptolemy` | `1` equatorial degree per symbolic solar year; `timing.audit.rationalDegreesPerYear` records the defining fraction. |
| `naibod` | Exactly the adopted printed `59 minutes 8.33 seconds`, or `354833/360000` degrees per symbolic year; the audit records that fraction. This is a decimal convention, not an exact physical mean solar rate. |
| `solar-equatorial-birth-day` | The positive forward solar RA advance over the explicitly supplied TT day, held fixed as degrees per symbolic year; the audit retains the samples, advance and seam-wrap choice. |

The solar policy uses apparent geocentric Sun positions with bodily latitude
retained, each in its own true equator and equinox of date. Its represented
TT Julian dates must differ by exactly one day, and the unwrapped advance
must be positive and below a half-turn. These are explicit modern project
choices. Converse still uses that forward sampling day and positive rate.
The pure API validates the sample arithmetic and declarations; it cannot
authenticate that supplied values are solar observations. The optional
engine adapter supplies samples with engine provenance and reference-scope
refusals.

The year unit is also explicit: `tropical-365.2422-days` or
`julian-365.25-days`. Directed age is `arc / rate`; `elapsedDays` is that
age times the selected fixed day count. Changing only the year unit changes
the elapsed-day expression, not the arc or directed age. These constants
and that separation are enforced by the timing fixtures and
[hit.check.ts](checks/hit.check.ts). No calendar anniversary or event date
is inferred. [COMPARISONS.md](COMPARISONS.md) shows how the engine's solar
arc and secondary progressions can be examined separately.

## Refusals and evidence limits

Unsupported choices are explicit failures. There is no automatic change
of house system, latitude treatment, motion construction or aspect branch.
The sphere layer refuses geographic and celestial poles, horizon
tangencies and circumpolar points. Even a meridian target currently requires
crossing semi-arcs. The natal adapter additionally requires a timed and
located chart within its complete-ecliptic semi-arc domain and refuses
engine polar fallback. Body latitude can still make an individual contact
undefined after the natal adapter succeeds.

Unresolved floating-point distinctions produce `numerical-degeneracy`
where the implemented guards detect them. The layer does not use an
epsilon to turn a near contact into an exact one. The
[M11 evidence record](evidence/M11.md) describes the checked boundary cases,
their finite coordinate span, the retained limitations and reproducible
residual report. It does not establish a global error bound or an
arbitrary-precision validation of the runtime's elementary functions.

The Sun uses the same ordinary body construction as other labels; a label
does not enable Placidus's separate crepuscular treatment. A body exactly
on an axis remains a body contact and does not enable converse angular
significators. Source fidelity outside the implemented subset, independent
ephemeris accuracy, and predictive validity are not established by these
synthetic geometric checks.
