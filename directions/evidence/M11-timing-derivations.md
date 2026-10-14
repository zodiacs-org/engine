# M11 timing boundary arithmetic

This finite set tests `directedAge` against authored exact rational arithmetic.
It uses no ephemeris, personal chart or output of an earlier library run.
The timing definitions and their traditional sources remain the ones recorded
in [M7-derivations.md](M7-derivations.md) and [SOURCES](../SOURCES.md):
Ptolemy, *Tetrabiblos*, Ashmand translation (1822), Book III chapter XIV,
p. 94; Erich Carl Kühr, *Berechnung der Ereigniszeiten* (1936), pp. 62-63;
and William Lilly, *Christian Astrology* (1647), Book III, pp. 709-710.
The extreme samples below test the numerical contract of the modern
realization, not a claim that the Sun can move at those rates.

## Exact arithmetic reference

Let `a` denote the supplied equatorial arc, `r` the chosen annual rate and
`Y` the selected number of elapsed days in a symbolic directed year. Before
any implementation is measured, the reference defines these fractions:

```text
age = a/r
days = a*Y/r
Ptolemy r = 1
Naibod r = 354833/360000
tropical Y = 1826211/5000
Julian Y = 1461/4
```

[m11-timing.ts](m11-timing.ts) multiplies or divides the integer numerators
and denominators with BigInt. An independent converter finds the rational's
binary exponent, divides at the binary64 significand scale, and rounds the
integer quotient to nearest, ties to even. Below the normal range it uses
units of `2^-1074`. The exact fraction and rounded expectation accompany
every numerical report row. The converter's normal and subnormal halfway
examples are tested directly in
[m11-timing.check.ts](../checks/m11-timing.check.ts).

This reference never reads the implementation's returned rate or age to
form an expected age or day count. Naibod uses the defining rational, even
though the implementation first rounds that rational to binary64. An
acceptance allowance of `16 * Number.EPSILON * abs(expected)` covers those
operation-order differences on this finite set; for nonzero subnormal
values its lower bound is one unit `2^-1074`. Expected zero and unchanged
arcs require an exact match, with positive zero for zero results. This is
a fixed fixture allowance, not an empirical or global accuracy bound.

## Arc and rate span

Both fixed keys use arcs `0`, `2^-20`, `1/8`, `1`, `90`, `180` and
`360 - 2^-44` degrees, under both declared year units. The last value is
the largest binary64 number below the excluded full-turn endpoint:
between `256` and `512`, consecutive values are separated by `2^-44`.
Ptolemy also uses the least positive arc `2^-1074`, so the expected age is
exactly that value. Each year's exact elapsed days then rounds to
`365 * 2^-1074`, without treating the small arc as zero.

All solar sample dates are invented TT labels, ordinarily `2451545` and
`2451546`, exactly one day apart. They declare apparent geocentric solar
right ascension on each date's own true equator and equinox, with bodily
latitude retained by the convention. No latitude, quadrant, motion or
sphere equation is selected by the timing layer: the supplied arc already
encodes that work. The same fixed birth-day rate applies to either motion.

The independent positive advances are as follows. Right ascensions, rates
and arcs are in degrees; ages are in symbolic directed years.

| Start RA | End RA | Advance `r` | Arc `a` | Expected age `a/r` |
| --- | --- | --- | --- | --- |
| `100` | `100.5` | `1/2` | `1/8` | `1/4` |
| `359.75` | `0.25` | `1/2` | `1/8` | `1/4` |
| `359.5` | `0` | `1/2` | `1/8` | `1/4` |
| `360 - 2^-44` | `0` | `2^-44` | `2^-40` | `16` |
| `360 - 2^-44` | `2^-44` | `2^-43` | `2^-40` | `8` |
| `0` | `180 - 2^-45` | `180 - 2^-45` | `1` | `2^45 / (180*2^45 - 1)` |
| `270` | `90 - 2^-45` | `180 - 2^-45` | `1` | `2^45 / (180*2^45 - 1)` |
| `0` | `2^-1020` | `2^-1020` | `2^-1010` | `1024` |
| `0` | `2^-1074` | `2^-1074` | `2^-1074` | `1` |
| `0` | `1` | `1` | `2^-1074` | `2^-1074` |
| `270` | `271` | `1` | `0` | `0` |

For a seam crossing the forward arc is the distance from the start to one
turn plus the end RA. Thus the one-unit seam example is exactly
`360 - (360 - 2^-44) + 0 = 2^-44`, and the next example adds another
`2^-44`. The half-turn neighbor is one represented step below `180`,
where the spacing is `2^-45`. The wrapped version has the same advance
by exact addition of `90` and `90 - 2^-45`.

## Refusal boundaries

The same fixture module records expected typed refusals separately from
numerical residuals. These are domain checks, not failed accuracy samples.
Every refusal is exercised under both year units.

- For every timing key, `-2^-1074`, `360`, `360 + 2^-44`, NaN and either
  infinity are outside the finite first-turn arc domain `[0, 360)`.
- Solar RAs must themselves be finite and in `[0, 360)`. Negative minimum,
  a full turn, NaN and positive infinity are rejected in either sample.
- Equal solar RAs have zero advance. Both unwrapped and wrapped half-turn
  increments, increments above a half-turn, and backwards sample pairs are
  refused. These remain refusals when the supplied directional arc is zero.
- Date differences `0`, `2`, `1 - 2^-1074` and `1 + 2^-1074` TT days are
  refused. The latter two come from distinct represented starts and an end
  of `1`; ordinary rounded subtraction would conceal their residuals.
- Arc `1` and rate `2^-1074` require age `2^1074`, beyond finite binary64.
  Arc `1` and rate `2^-1020` give a finite age `2^1020`, but multiplying by
  either year exceeds the finite range because both year lengths exceed
  `16` days. Arc `2^-1074` and rate `2` give exact age `2^-1075`, which
  rounds to zero by ties to even. All require `numerical-degeneracy`.

The report encodes nonfinite input numbers as explicit strings so JSON
does not silently turn them into null. Accepted numerical rows preserve
their full finite input request, exact fraction, actual value, signed
residual and allowance. The measured span is exactly the authored cases
above and the explicit refusal lists in the fixture module. It establishes
neither ephemeris accuracy nor a universal relative error bound near
subnormal underflow.
