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

## Structured comparison reference

`compare.test.ts` uses the invented Sun, Moon, north node, south node, all
angles and the full cusp sequence above. For each row, subtract natal from
draconic longitude. If the result is at most -180 degrees add 360; if greater
than 180 subtract 360. This chooses the shortest signed circular displacement
in (-180, 180], with a half-circle tie reported as +180. The direction is
always draconic minus natal, with no physical motion or time interval implied.

With the selected node at 75.25, every row has delta -75.25. For Sun this
is 25.25 - 100.5 = -75.25. For Moon it is 299.75 - 15 = 284.75, then
284.75 - 360 = -75.25. For cusp 2 it is 284.75 - 0 = 284.75, then the
same wrap. The other positions and cusps in the tables follow either the
Sun's unwrapped subtraction or the Moon's wrapped subtraction. The tests
check both original and rotated longitudes and this delta for each row.

With the explicitly selected mean node at 75, Sun is 25.5, Moon is 300,
the natal true north node is 0.25 and the natal true south node is 180.25.
Their deltas are respectively 25.5 - 100.5 = -75, 300 - 15 - 360 = -75,
0.25 - 75.25 = -75 and 180.25 - 255.25 = -75. Selecting a mean node does
not replace the true-node body rows.

Additional hand-derived boundary comparisons are:

| Natal | Draconic | Raw difference | Signed delta |
| ---: | ---: | ---: | ---: |
| 359.75 | 0.25 | -359.5 | 0.5 |
| 0.25 | 359.75 | 359.5 | -0.5 |
| 0 | 180 | 180 | 180 |
| 180 | 0 | -180 | 180 |
| 359.75 | 179.75 | -180 | 180 |

Whole-chart boundary checks use the same Sun at 100.5. A zero node leaves
it at 100.5 with delta 0. A node at 180 gives 100.5 - 180 + 360 = 280.5
and delta 180. A node at 359.75 gives 100.5 - 359.75 + 360 = 100.75
and delta 0.25. The same deltas apply to the other synthetic body rows.

At the half-circle boundary let u = 2^-45, one binary64 step at 180.
From 0 to 180 + u the difference folds to -180 + u; reversing that pair
gives 180 - u. From 0 to 180 - u the delta is 180 - u, while reversing
gives -180 + u. This checks the boundary without an epsilon. From 0 to
360 - 2^-44 (359.99999999999994) subtracting a circle gives -2^-44.
From the smallest positive binary64 value to 0 the delta is its negative;
reversing the pair gives the positive value. Equal inputs and either spelling
of signed zero give positive zero. These deltas use direct subtraction before
folding, preserving tiny signed differences near zero.

For a chart's Sun at 0 and selected node at `Number.MIN_VALUE`, the earlier
rotation endpoint policy yields 0. Comparing those actual coordinates gives
0 - 0 = 0, even though the nominal rotation was a tiny negative displacement.
The tests therefore require deltas from actual positions rather than a copied
node offset. All listed arithmetic expectations are exact binary fractions
and use exact equality. Separate integration checks compare API wiring to
the engine and transformation on synthetic births; they are not independent
astronomical references.
