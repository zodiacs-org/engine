# Rotation arithmetic reference

These invented longitudes form an arithmetic chart, not an ephemeris fixture
or a person's birth chart. The reference is subtraction on a circle, worked
here by hand before calling the implementation. `rotation.test.ts` enforces
each table entry using exact equality. The checked span is the listed cases;
they make no claim about astronomical accuracy or ephemeris coverage.

The selected natal north node is 75.25 degrees. Subtract it from each natal
longitude. If the difference is negative, add one full circle, 360 degrees.
The selected node consequently becomes 0 degrees, the origin labelled Aries.

| Synthetic row | Natal degrees | Hand calculation | Draconic degrees |
| --- | ---: | --- | ---: |
| Chosen north node | 75.25 | 75.25 - 75.25 | 0 |
| Opposite south node | 255.25 | 255.25 - 75.25 | 180 |
| Sun | 100.5 | 100.5 - 75.25 | 25.25 |
| Moon | 15 | 15 - 75.25 = -60.25; add 360 | 299.75 |
| Ascendant | 350 | 350 - 75.25 | 274.75 |
| Midheaven | 80 | 80 - 75.25 | 4.75 |
| House cusp | 30 | 30 - 75.25 = -45.25; add 360 | 314.75 |

Integers, halves and quarters here are exact binary fractions, so these tests
need no numerical tolerance. Boundary cases in the same test check zero
rotation, equal longitudes, opposite longitudes and crossing the circle's
origin: for example, 0.25 - 359.75 = -359.5, then adding 360 gives 0.5 degrees.
The synthetic opposite node is placed half a circle from the chosen node by
construction; this is not a claim about an independently measured node.

The implementation uses JavaScript binary64 subtraction and addition. General
decimal inputs can round. The test for zero minus `Number.MIN_VALUE` checks
the endpoint policy: adding a full circle rounds to 360, which is represented
as positive zero to keep a canonical result. Positive subnormal inputs with a
zero node are retained. Signed zero inputs also return positive zero.
