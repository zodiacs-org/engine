# Horary fixture derivations

All question instants and coordinate pairs are invented. No expected
astronomical value is obtained by running the engine or Swiss Ephemeris.

`questionInput` in `fixtures.ts` uses the UTC instant at noon on the first day
of January in the year 2000, at an invented location. Its lost-object label is
caller supplied and its quesited house is explicitly declared. The foundation
does not make any traditional house assignment from that label.

The calendar expectation in `input.test.ts` is calculated independently:
from the Unix epoch to the start of the year 2000 there are thirty ordinary
year lengths plus seven leap days, or `30 * 365 + 7 = 10957` days. Adding half
a day and multiplying by `86400000` milliseconds gives `946728000000`.
A `+02:00` offset at 14:00 and a `-05:00` offset at 07:00 identify that same
noon UTC. The date-only form identifies midnight, half a day earlier.
The fractional-second fixture adds the literal decimal milliseconds to noon.
These are calendar normalization checks, not ephemeris accuracy evidence.

`schematicChart` is a hand-written plumbing fixture, not the sky at the
question instant. Its Ascendant is 15 degrees in Aries; the Descendant adds
180 degrees. Its Midheaven is 285 degrees and the opposite angle is 105
degrees. Whole-sign cusps start at Aries and add 30 degrees for each house.
The body longitudes start at 10 degrees and increase by a sign for each row,
so their degrees within each sign remain 10. Speeds are arbitrary binary
fractions in degrees per day; Jupiter's negative speed is paired with a
retrograde flag. The empty aspect list and pinned zero clock are deliberate
placeholders. `cast.test.ts` checks that the wrapper forwards this fixture,
including metadata, without constructing numerical positions itself.

`cast.integration.test.ts` uses real engine calculations only for delegation
and structural invariants: the requested/actual house system, whole-sign
spacing, valid longitude and speed fields, and preservation of coverage and
polar-fallback flags. Its high latitude forces the engine's documented
Placidus fallback. Its pre-reference instant exercises the documented
coverage flag. No result is recorded as an independent sky reference.

## Significator fixtures

`significators.test.ts` uses the same invented question instant and the
schematic chart. The ruler expectations come from Ptolemy, *Tetrabiblos*
I.17, as cited in [`../SOURCES.md`](../SOURCES.md), and the role definitions
from Lilly, *Christian Astrology*, chapter XX, printed pages 123 and 124.
Neither the production ruler table nor an engine calculation generates the
expected planets.

For a sign starting at longitude `s`, its interval is `[s, s + 30)` degrees.
The test's independently written expectations are:

| Sign | Start longitude (degrees) | Domicile ruler |
| --- | ---: | --- |
| Aries | 0 | Mars |
| Taurus | 30 | Venus |
| Gemini | 60 | Mercury |
| Cancer | 90 | Moon |
| Leo | 120 | Sun |
| Virgo | 150 | Mercury |
| Libra | 180 | Venus |
| Scorpio | 210 | Mars |
| Sagittarius | 240 | Jupiter |
| Capricorn | 270 | Saturn |
| Aquarius | 300 | Saturn |
| Pisces | 330 | Jupiter |

Each interval is tested at its exact start, its midpoint (`s + 15`) and
`s + 30 - 2**-40`, an exactly representable binary value below its end.
The following interval's start tests the transition itself. In the
Aries-first whole-sign schematic, house `h` has longitude `(h - 1) * 30`:
selecting each house therefore checks indexing against the corresponding
literal ruler above. The first house gives Mars, the declared second gives
Venus, and the Moon is separately assigned as co-significator. A question
label of relationship with the tenth house still selects Saturn and adds no
automatic natural significator.

The unequal-cusp fixture is a deliberate geometric sketch, not a claim
that Regiomontanus at the question instant computes these cusps. Its
longitudes are `[65, 85, 100, 125, 145, 160, 245, 265, 280, 305, 325, 340]`.
The first and sixth cusps are in Gemini and Virgo, so Mercury has both
querent and quesited roles. The tenth cusp is in Aquarius and selects
Saturn. Setting the sketch's MC to its opposite quadrant, 125 degrees in
Leo, ensures the tenth ruler comes from the actual tenth cusp; substituting
MC would wrongly choose the Sun. Advancing each house by a sign from the
first cusp would also wrongly put the tenth in Pisces. The array contains
repeated cusp signs and an intercepted sign; no extra ruler is added for
either. A separate equal-from-MC sketch starts its cusps at 300 degrees
while leaving the Ascendant at 15: the first-cusp project convention gives
Saturn rather than Mars.

For the Aries-first fixture with the fourth house selected, that cusp is
Cancer and the Moon has both quesited and Moon roles. In another sketch,
the first cusp is moved to Cancer, the quesited house is the first, and
the caller declares the Moon as natural significator: all assignments refer
to the Moon while retaining querent, quesited, Moon and natural roles.
Duplicate natural declarations collapse through input normalization. This
overlap does not supply an aspect to a second physical planet.

For a seventh-house relationship declaration, Libra gives Venus as quesited
and Aries gives Mars as querent. The natural list `Venus, Sun, Venus, Moon`
normalizes to `Venus, Sun, Moon`; Venus retains quesited and natural roles,
and the Moon retains Moon and natural roles. The natural associations are
caller choices, not attributed historical rules.

The ownership tests compare selection before and after a deliberate cusp
edit, check frozen result records and JSON round-tripping, and verify that
the input chart remains unmodified and mutable. Rejection fixtures place
missing, non-finite and out-of-range values in the cusp array, or edit
question settings, to test validation rather than astronomical accuracy.

`significators.integration.test.ts` casts the invented question with each
engine house system and with the existing synthetic polar fallback. It
checks delegation to the engine dignity function, absence of chart
recalculation, physical planet availability and actual/requested system
metadata. These comparisons are plumbing checks, not independent
astronomical references.

## Consideration policy and angular fixtures

`policy.test.ts` and `considerations.test.ts` exercise the M3 policy. The
historical definition is Lilly's "Considerations before Judgment", with
source locators and project conventions in `../SOURCES.md`. These are
geometric rule fixtures, not ephemeris accuracy or predictive evidence.

The existing invented question instant and location remain labels for a
hand-written sketch. No modified longitude is claimed to be the sky at that
instant. The sketch starts its whole-sign cusps at Aries, its Ascendant at
15 degrees, Moon at 40 degrees and Saturn at 190 degrees. Subtracting sign
start gives an Ascendant degree of 15, outside both caution intervals. The
Moon is outside `[195, 225)`. Saturn is inside the seventh cusp interval
`[180, 210)`, so only the Saturn-seventh consideration triggers by default.

For Ascendant tests, sign starts are the multiples of 30 from 0 through 330.
Adding a degree within `[0, 30)` keeps the point in that sign. Degrees just
below 3 trigger the early condition, but 3 and just above do not; degrees
just below 27 do not trigger the late condition, but 27 and just above do.
Zero is early and just below 30 is late. The offset `2^-40` is exactly
representable in binary and remains distinguishable at all these longitudes;
no comparison tolerance is used. Keeping the first cusp at 0 while moving the
Ascendant to 62 gives 2 degrees into Gemini and checks use of the actual
angle instead of the cusp.

Libra begins at 180 absolute degrees, so its final fifteen degrees start
at 195. Scorpio starts at 210; its first fifteen degrees end at 225. The
Moon fixtures test each endpoint and the binary offset on both sides:
195 is included, 225 is excluded, 210 is inside, and the circle's origin
and the point 359 are outside. The sketch's stale Taurus sign annotation
remains unchanged to ensure decisions use longitude rather than labels.

Saturn fixtures use the same half-open whole-sign cusp intervals, with 0
included in the first house and 30 excluded; 180 included in the seventh
and 210 excluded. Values just before those cusps belong to the preceding
house. The unequal circular sketch has cusps
`[350, 15, 45, 80, 120, 150, 170, 195, 225, 260, 300, 330]`.
It is a geometry sketch labeled Regiomontanus, without claiming that the
engine computes it at the question instant. The first interval wraps through
zero: `[350, 360)` together with `[0, 15)`. Saturn at 0 occupies the first,
at 15 the second, at 170 the seventh and at 195 the eighth. Requested
whole-sign houses and the angle at 15 cannot replace these actual cusps.
Changing Saturn's retrograde flag leaves placement unchanged and checks that
the emphasis reported by Lilly is explanatory rather than mandatory.

A declared seventh-house relationship keeps the Saturn placement observation
enabled until its toggle is disabled. This is a documented policy choice,
not an assertion that Lilly's two seventh-house passages have identical
scope. Each toggle is tested separately to leave all other observations
unchanged. Disabling all rules skips missing geometric data; enabling only
Moon Via Combusta requires only the Moon's row and longitude.

Validation fixtures deliberately remove or duplicate required rows, insert
noncanonical longitudes, sparse cusps, repeated adjacent cusps and an
out-of-order cusp. A valid cusp circuit makes one forward revolution, with
each subsequent cusp after the previous one modulo the circle; repeats or
extra wraps cannot support unambiguous membership. Invalid policy options
and incomplete or mistyped policy snapshots are also refused. Ownership
fixtures preserve the input chart, freeze all result records, restore JSON
policy data and verify that subsequent chart edits cannot alter observations.

`considerations.integration.test.ts` uses real engine casts for all supported
house systems and the existing invented polar fallback. It compares house
membership to the engine's own `houseOf` only to check delegation and actual
system metadata. No engine-computed longitude is used as an independent
reference or committed as a new numerical fixture.

## Void-of-course motion fixtures

`void-of-course.motion.test.ts` mocks only the engine ephemeris provider with
invented linear longitudes. The actual engine crossing, ingress, aspect and
void-window implementations run unchanged. No astronomical chart is claimed
for these trajectories. Their epoch is the existing invented noon instant;
elapsed time `t` is in days, with `86400000` milliseconds per day. The Moon
has longitude `12t` modulo 360 degrees, so Aries runs from `t = 0` through
just before `t = 30/12 = 2.5`. The preceding Pisces-to-Aries ingress wraps
through zero, and Taurus ends at `t = 60/12 = 5`.

The baseline Sun is fixed at 27 degrees. The other selected classical planets
are fixed at 45 degrees, and Uranus is fixed at 29; the remaining outer bodies
are fixed at 45. An exact Ptolemaic contact requires lunar longitude minus
planet longitude to equal one of `0, 60, 90, 120, 180, 240, 270, 300` modulo
360. For a planet at 45 degrees, these give lunar targets
`45, 105, 135, 165, 225, 285, 315, 345`; none is in Aries. The Sun's last
and only contact in Aries is conjunction at `t = 27/12 = 2.25`, so the
traditional void is `[2.25, 2.5)` days. At `t = 2`, lunar longitude 24 is
still approaching it; at `t = 2.25` the starting instant is included; at
`t = 2.375` the Moon at 28.5 is void. At `t = 2.5` it is in Taurus and
has a future conjunction to the group at 45, at `t = 45/12 = 3.75`.
The next void then belongs to Taurus. No assertion relies on which of the
simultaneous planets the scanner records last for that group.

Uranus would add a conjunction at `t = 29/12`, between 2.375 and sign exit.
The traditional option excludes it, while the engine's modern option includes
it. Both expected statuses follow from this literal arithmetic. Instrumented
provider calls also verify that traditional scans evaluate only the Moon and
the selected classical targets.

For the no-contact case the Sun also moves to the stationary longitude 45.
All selected targets are then outside Aries, so the entire interval `[0, 2.5)`
is void with a null last aspect and a sign-ingress start. With the Sun instead
at 30, conjunction happens exactly at `t = 2.5`, the ending ingress; the
half-open convention excludes it from Aries, which still has no contact.
The Moon is not void in Taurus at this ingress because the group at 45 remains
ahead. These tests use grid-aligned boundary times to isolate interval semantics.

Directed-aspect fixtures independently choose Sun longitudes
`27, 87, 117, 147, 207, 327, 297, 267`. Each has exactly one Aries target,
27: respectively conjunction, sextile, square, trine, opposition, sextile,
square and trine from the opposite side. Perfection is `t = 2.25` in every
case. The off-grid question at `t = 2.375` exercises bisection. The ingress
step divided by `2^24` is `21600000 / 16777216` milliseconds, less than two;
the aspect step divided by `2^26` is `10800000 / 67108864`, less than one.
The scanner evaluates integer-millisecond Dates and reports a truncated Date.
The tests allow two milliseconds relative to the independently solved root,
and `12 * 2 / 86400000` degrees for lunar motion over that interval. This is
a solver-resolution allowance on these linear fixtures, not ephemeris accuracy
or a general boundary guarantee.

For a moving target, the Sun starts at 24.75 and advances one degree per day.
The conjunction equation is `12t = 24.75 + t`, giving `t = 2.25` and
longitude 27. A Moon at `t = 2` still has the contact ahead. This independently
solved expectation ensures the existing scanner evaluates moving target
longitudes rather than freezing a planet at the question instant.

The method metadata is checked against the fixed engine scan: six-hour ingress
steps with 24 bisections, three-hour aspect steps with 26 bisections. The
engine status call begins its window search three days before the question,
then looks another four days back for ingress, and ends six days after the
question. Instrumented provider calls verify that the advertised bounds are
exactly seven days before and six after. This exposes the scanner's fixed
horizon, rather than claiming an independently proven completeness span.

`void-of-course.test.ts` supplies a separate hand-written scanner response
only to check wrapper delegation, disabled rules, error propagation and frozen
ISO serialization. Its dates and longitudes are labels, not event accuracy
evidence. `void-of-course.integration.test.ts` scans a real engine cast at the
invented question instant and checks forwarding and serialization without
pinning engine numerical output. An invented cast near the lower ephemeris
edge verifies that a valid chart instant can still fail when the scan requires
earlier samples; failure must never be turned into a non-void observation.
