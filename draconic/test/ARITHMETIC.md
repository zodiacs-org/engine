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

## Pure chart transformation reference

`transform.test.ts` uses the same invented selected node, 75.25 degrees.
The fixture contains only positions and needs no birth instant or ephemeris.
The Sun, Moon and true nodes use the first table's subtractions. Additional
rows and remaining angles are derived as follows:

| Synthetic row | Natal degrees | Hand calculation | Draconic degrees | Sign and degree |
| --- | ---: | --- | ---: | --- |
| Mercury | 105.25 | 105.25 - 75.25 | 30 | Taurus 0 |
| Venus | 75 | 75 - 75.25 + 360 | 359.75 | Pisces 29.75 |
| Saturn | 330 | 330 - 75.25 | 254.75 | Sagittarius 14.75 |
| Jupiter | 0 | 0 - 75.25 + 360 | 284.75 | Capricorn 14.75 |
| Descendant | 170 | 170 - 75.25 | 94.75 | Not annotated |
| Lower midheaven | 260 | 260 - 75.25 | 184.75 | Not annotated |

For signs, divide a canonical longitude by 30 and take the integer part as
the index from Aries at index zero. The degree is its remainder after whole
signs: Sun 25.25 is Aries 25.25; Moon 299.75 = 9 * 30 + 29.75 is Capricorn
29.75; north node 0 is Aries 0; south node 180 = 6 * 30 is Libra 0.
Every synthetic body has latitude 1.25, which this longitude-only rotation
retains. Their invented natal speed -0.125 and retrograde flag are omitted
from the derived position snapshot.

The natal whole-sign cusps start at 330 because the natal ascendant 350 is in
Pisces. Subtracting 75.25 from each cusp, wrapping negatives, gives:

| House | Natal cusp | Rotated cusp |
| --- | ---: | ---: |
| 1 | 330 | 254.75 |
| 2 | 0 | 284.75 |
| 3 | 30 | 314.75 |
| 4 | 60 | 344.75 |
| 5 | 90 | 14.75 |
| 6 | 120 | 44.75 |
| 7 | 150 | 74.75 |
| 8 | 180 | 104.75 |
| 9 | 210 | 134.75 |
| 10 | 240 | 164.75 |
| 11 | 270 | 194.75 |
| 12 | 300 | 224.75 |

House intervals include their starting cusp and exclude the next cusp, in
circular order. Thus Sun 25.25 and Mercury 30 are in house 5, Moon 299.75 is
in house 2, north node 0 and Venus 359.75 are in the wrapping house 4, and
south node 180 is in house 10. Saturn 254.75 sits exactly on cusp 1 and
Jupiter 284.75 exactly on cusp 2, so each belongs to the house that starts
there. These manually assigned expectations check the engine's reused
longitude house helper on the rotated cusps.

Recasting whole-sign houses from the rotated ascendant 274.75 would put cusp
1 at 270. The expected cusp is instead 254.75: the original natal cusp
rotated by the same amount as every position. The `whole` system label
describes the natal construction; rotated cusps need not start on sign edges.

The explicit synthetic mean-node case selects longitude 75 instead of 75.25.
Then Sun 100.5 - 75 = 25.5, true north node 75.25 - 75 = 0.25, true south
node 255.25 - 75 = 180.25, and Venus 75 - 75 = 0. The true-node rows are
still the supplied natal bodies; they are not substituted with mean nodes.

The boundary annotation test uses zero rotation and exact binary64 values
30 - 2^-48 = 29.999999999999996 and 360 - 2^-44 = 359.99999999999994.
They remain in Aries and Pisces respectively. Their degrees are
29.999999999999996 and 30 - 2^-44 = 29.999999999999943. Adding a circle to
either longitude before a remainder can round it onto the next sign, so
annotations read the already canonical longitude directly.

All arithmetic chart expectations above use exact binary fractions and exact
equality. Separate engine integration cases in `transform.test.ts` use the
invented input from `engine-adapter.test.ts`; those check composition of the
adapter and rotation primitive only, not independent astronomical accuracy.
