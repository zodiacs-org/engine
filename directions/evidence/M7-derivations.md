# M7 timing arithmetic derivations

These fixtures verify the conversion of an already supplied directional arc
into a directed age. They do not establish a spherical arc, an ephemeris
position or a prediction. Every arc and solar coordinate below is an authored
synthetic value. The timing function does not obtain its own expected answers.

The traditional definitions and the modern frame and clock choices are
registered in [SOURCES](../SOURCES.md). Ptolemy, *Tetrabiblos*, Ashmand's
translation (1822), Book III chapter XIV, p. 94, supports the degree-for-a-year key.
Erich Carl Kühr, *Berechnung der Ereigniszeiten* (1936), pp. 62-63, gives the
Naibod rate used here. William Lilly, *Christian Astrology* (1647), Book III,
pp. 709-710, supports deriving a fixed annual
rate from the Sun's right-ascension advance over the day after birth. The
fixtures use invented sample coordinates, never a published person's chart.

## Rational fixed keys

Let `a` be the nonnegative input arc in degrees, `r` the selected degrees per
directed year, and `Y` the explicitly selected days per year. Then

```text
age = a / r
elapsedDays = age * Y
```

The Ptolemy rate is exactly `1 degree/year`. Its fixture arcs and ages are
the identical fractions `0`, `1/8`, `25/2` and `719/2`.

The selected Naibod rate is `59 minutes 8.33 seconds` of arc per year. Its
decimal seconds are part of this specific convention, without a substitution
of a rounded whole-second rate or a reciprocal tropical-year approximation:

```text
r = (59 * 60 + 833/100) / 3600
  = 354833/360000 degrees/year
```

The Naibod age fixtures follow by cancellation or integer multiplication:

| Arc in degrees | Directed age in years |
| --- | --- |
| `0` | `0` |
| `1` | `360000/354833` |
| `354833/10000` | `36` |
| `719/2` | `129420000/354833` |

The selected elapsed-year units are exact decimal conventions:

```text
tropical-365.2422-days: Y = 1826211/5000 days
julian-365.25-days:     Y = 1461/4 days
```

For each fixture the expected elapsed-day count is computed separately by
integer rational multiplication. `timing.check.ts` uses BigInt for the
numerator and denominator products, then converts that fraction to the
comparison number. It does not multiply the library's returned age by a
constant to obtain an expected answer. Year choices affect elapsed days;
they do not change the arc, rate or directed age.

## Modern solar sampling policy

Lilly's same-hour next-day instruction does not choose a modern time scale.
This project explicitly selects a TT day for `solar-equatorial-birth-day`.
Both Julian dates must differ by exactly one represented day; a compensated
subtraction checks the residual as well as the rounded difference. The
adapter resolves a caller's explicitly named input scale through the engine,
then resamples the represented birth TT date and that date plus one day.
The TT day is independent of the selected elapsed-year unit. UTC leap-second
steps cannot silently lengthen this sampling interval.

Samples use apparent geocentric solar coordinates with bodily latitude
retained and the true equator and equinox of each sample's own date. They
are not both rotated into the birth frame. The pure input must explicitly
name those conventions. These are project choices for realizing the named
historical method, not modern conventions attributed to Lilly.

The forward right-ascension difference must lie strictly between zero and
a half-turn, after one seam wrap where needed. This admits the following
synthetic rates and refuses reversed or ambiguous sample pairs. It is not
a physical rate bound or authentication of solar coordinates. The same
validated difference is held fixed as the annual rate for every input arc,
in either direction construction; neither the samples nor the birth day
are reversed for converse. All sphere geometry has already been selected.

## Synthetic solar samples

All solar fixture intervals run from TT Julian day `2451545` to `2451546`.
Right ascensions are degrees on the declared true equator and equinox of
date, under geocentric apparent conventions. These labels describe the
synthetic inputs; they do not attest to actual solar positions at that epoch.

Let `alpha0` and `alpha1` be the start and end right ascensions. Their positive
forward advance is `alpha1 - alpha0`, adding one turn only when it crosses
zero. That advance over the supplied day becomes the fixed rate in degrees
per directed year.

| Start RA | End RA | Turns added | Rate | Arc | Age |
| --- | --- | --- | --- | --- | --- |
| `100` | `100.5` | `0` | `1/2` | `25/2` | `25` |
| `359.75` | `0.25` | `1` | `1/2` | `25/2` | `25` |
| `80` | `81.25` | `0` | `5/4` | `25/2` | `10` |
| `0` | `0.0625` | `0` | `1/16` | `1/8` | `2` |
| `150` | `151` | `0` | `1` | `0` | `0` |

Each table entry is an exact dyadic fraction. For the wrapped row,
`0.25 - 359.75 + 360 = 0.5`. The elapsed-day checks use both exact year
fractions with the same independent rational multiplication as above.
An additional branch test checks `359.5` to `0`, also an advance of `0.5`.

## Comparison tolerance and tested scope

[timing-examples.ts](timing-examples.ts) declares all table fixtures and fixes
the comparison tolerance before the implementation is run. Each nonzero
rate, age or elapsed-day value must differ from its independently derived
comparison fraction by at most `16 * Number.EPSILON * abs(expected)`.
Zero expectations require exact positive zero. The allowance covers the
fixture's final rational-to-binary64 conversion and the implementation's
rounded rate, division and day multiplication. It is an acceptance tolerance
for this finite arithmetic fixture set, not a measured global error bound.

Separate boundary tests require exact one-day TT sample separation, refusing
even the starts `Number.MIN_VALUE` and `-Number.MIN_VALUE` with end `1`, whose
rounded subtraction conceals a nonzero residual. They reject zero, reversed,
half-turn and larger solar
advances; reject non-finite input, omitted conventions and accessors; and check
deeply frozen output copies. Small-number tests preserve a representable
positive age, refuse a nonzero age lost to zero, and refuse infinite age or
day counts. These cases test arithmetic refusal behavior, not a physically
possible solar-motion range or ephemeris accuracy over the accepted epochs.

The checks are [timing.check.ts](../checks/timing.check.ts) and the compile-time
contract assertions in [timing.types.ts](../checks/timing.types.ts).
