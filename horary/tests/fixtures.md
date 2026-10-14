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
