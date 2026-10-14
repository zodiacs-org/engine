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

## Essential dignity and reception fixtures

`essential.test.ts` uses the existing invented question instant and location
as labels for schematic charts, without claiming that any modified positions
are an ephemeris. All classical planets are declared as natural significators
to exercise their condition; the normal house and Moon roles remain present.
The first and second cusps remain Aries and Taurus. Longitude determines the
sign even when the old schematic sign annotation remains unchanged.

The independently read sources and table variants are listed in
`../SOURCES.md`. The fixtures below use Ptolemy's domicile, exaltation and
Egyptian term definitions, al-Biruni's sect triplicity and face definitions,
and Lilly's own-position essential weights. Expected arrays and totals are
literal hand derivations; they are not generated from engine tables or calls.
At the default Ascendant 15, Sun 200 gives the normalized difference 185,
in the day half-circle; Sun 100 gives difference 85, in the night half-circle.
The modified planet in the condition matrix never overrides the Sun.

| Planet and absolute longitude | Sect | Own dignities | Own debilities | Peregrine | Hand sum |
| --- | --- | --- | --- | --- | --- |
| Mercury 150 (Virgo 0) | day | domicile, exaltation, term | none | no | `5 + 4 + 2 = 11` |
| Mercury 60 (Gemini 0) | night | domicile, triplicity, term | none | no | `5 + 3 + 2 = 10` |
| Saturn 10 (Aries 10) | day | none | fall | yes | `-4 - 5 = -9` |
| Saturn 25 (Aries 25) | day | term | fall | no | `2 - 4 = -2` |
| Mars 35 (Taurus 5) | day | none | detriment | yes | `-5 - 5 = -10` |
| Venus 150 (Virgo 0) | day | triplicity | fall | no | `3 - 4 = -1` |
| Mercury 330 (Pisces 0) | day | none | detriment, fall | yes | `-5 - 4 - 5 = -14` |
| Moon 40 (Taurus 10) | night | exaltation, triplicity, face | none | no | `4 + 3 + 1 = 8` |
| Jupiter 10 (Aries 10) | night | triplicity | none | no | `3` |
| Moon 215 (Scorpio 5) | night | none | fall | yes | `-4 - 5 = -9` |

Virgo is Mercury's domicile and exaltation, with his Egyptian term
`[0, 7)`; its first face is the Sun's and earth by day belongs to Venus.
Gemini is Mercury's domicile, its first term `[0, 6)` his, and air by night
belongs to him; its first face is Jupiter's. Aries is Saturn's fall and he
does not hold its sect triplicity (Sun by day, Jupiter by night). Egyptian
Aries term lengths `6, 6, 8, 5, 5` cumulate to ends `6, 12, 20, 25, 30`,
so Saturn gains his own term at 25 and loses the peregrine penalty. Aries
10 is Venus's term and the Sun's face, while Aries 25 is Venus's face.
Taurus opposes Mars's domicile Scorpio: Mars 5 is in Venus's term and
Mercury's face, with earth by day Venus. Virgo is Venus's fall, but its day
triplicity gives her essential dignity. Pisces opposes Mercury's Virgo
domicile/exaltation, and its first term is Venus's, first face Saturn's,
and water by day Venus. The Moon in Taurus has exaltation; earth by night
is hers and the second Taurus face `[10, 20)` is hers. Jupiter in Aries
by night has fire triplicity only. The Moon's participating water lordship
does not count in Scorpio; night belongs to Mars. Scorpio 5 is Mars's term
and face, leaving the Moon peregrine and in fall.

Term boundary tests place Venus just before 6, at 6, just before 12 and at
12 in Aries. Her term `[6, 12)` includes its start and excludes its end.
Face tests place Mars at 0, just below 10, at 10 and at 30: only `[0, 10)`
is his Aries face; Taurus starts at 30 with Mercury's face. The binary
offset `2^-40` supplies the adjacent lower value without a tolerance.

Sect boundary tests hold Ascendant 15 and put the Sun at 15 (difference
zero, night), just before 195 (difference just below 180, night), at 195
(difference 180, day), just below 360 (difference just below 345, day),
and at 0 (difference normalized from -15 to 345, day). Reception examples
with Sun 40 and Ascendant 200 give difference normalized to 200 (day);
Ascendant 15 gives difference 25 (night). Sun 300 and Ascendant 110 give
difference 190 (day).

The custom-weight Mercury fixture keeps his Virgo dignity list, changes
domicile to 2.5, sets exaltation to enabled zero, and disables term, giving
`2.5 + 0 + 0 = 2.5`. A negative caller domicile weight gives
`-2.5 + 4 + 2 = 3.5`. Disabling only Saturn's peregrine penalty at Aries
10 leaves his fall score `-4`. The overflow test makes both Mercury's
domicile and exaltation weights the largest finite double; their sum is
not finite and must be refused. These tests enforce configurable arithmetic,
without attributing custom values to Lilly.

Directional reception evaluates the host's dignity at the guest's position:

- Mars 40 in Taurus and Venus 10 in Aries exchange domicile hosts. Mars
  receives Venus in Aries; Venus receives Mars in Taurus. Domicile-only
  selection produces a mutual pair. Mars's own detriment/peregrine sum is
  `-10`; Venus is in her own Egyptian Aries term, giving `2 - 5 = -3`.
  Reception changes neither score. Venus precedes Mars in the engine's
  canonical physical-planet pair order.
- Moving Mars to Leo 10 (130) keeps Venus hosted by Mars in Aries, but Mars
  is hosted by the Sun in Leo, so Venus cannot receive him by domicile.
  There is no mutual Venus/Mars pair.
- Sun 300 in Aquarius and Saturn 10 in Aries have a mixed reception. At
  Aries 10 the Sun holds exaltation, day fire triplicity and the second
  face. At Aquarius 0 Saturn holds domicile and day air triplicity, but
  neither term (Mercury) nor face (Venus). The pair retains those exact
  dignity lists. Domicile-only selection removes the Sun's hosting side
  and therefore the mutual pair.
- Sun 40 in Taurus and Venus 10 in Aries exchange triplicity hosts by
  day: earth belongs to Venus and fire to the Sun. By night those places
  belong to the Moon and Jupiter; Sun/Venus mutual triplicity disappears.
  Saturn's participating fire lordship never receives Venus under the
  chart-sect-only convention.
- Venus 23 in Aries and Mars 75 (Gemini 15) exchange Egyptian term hosts.
  Aries `[20, 25)` belongs to Mars; Gemini `[12, 17)` to Venus, from term
  lengths `6, 6, 5, 7, 6`. Moving Venus to 25 reaches Saturn's term and
  removes the Mars-host direction. The interior placements also fit the
  ordinal degrees in Lilly's printed reception-by-term example; they remain
  invented geometry, without copying a historical question chart.

Empty reception selection records disabled directional entries and no mutual
pairs. Selecting only the Moon by putting the first cusp in Cancer, declaring
the first house as quesited and the Moon as natural preserves all its roles
in one condition record, without scoring it repeatedly or creating a pair
with itself. The required Sun row remains only sect evidence in that case.

Malformed-policy fixtures exercise unknown fields, invalid weight types,
non-finite weights, unknown reception dignities and sparse lists; policy
snapshots must contain every configured field. Geometric rejection fixtures
remove or duplicate required Sun, Mars and Moon rows, or use noncanonical
longitudes and missing angles. Unselected Mercury rows and unused speed/sign
annotations do not change required input semantics. Ownership tests recursively
check frozen output, JSON serialization and independence from later chart edits.

`essential.integration.test.ts` uses the real engine at the invented question
instant to verify delegation to `essentialDignities`, `mutualReceptions` and
`sectOf`. The house-system and polar-fallback checks verify adapter metadata
and use of the Ascendant rather than the first cusp. These are integration
checks, not independent astronomical accuracy evidence.

## Accidental condition fixtures

`accidental.test.ts` uses `schematicChart()` with the same invented question
instant and coordinates as the foundation fixtures. Its positions are
hand-written geometry, not an ephemeris for that instant. All classical planets
are selected as natural significators, preserving the existing house and Moon
roles. The expected weights come from the passages read in `SOURCES.md`,
without using any engine result as the reference.

The whole-sign cusp circuit starts at zero and advances by thirty degrees.
Each interval includes its lower cusp and excludes the next. A longitude
`(house - 1) * 30 + offset` with offset zero, fifteen or just below thirty
therefore belongs to the specified house. Tests move Mars through all these
intervals with motion points disabled. Only one house rule is present and
its score equals the literal weight transcribed from Lilly. An unequal circuit
`350, 20, 45, 80, 110, 140, 170, 200, 225, 260, 290, 320` additionally checks
that zero belongs to house one, twenty starts house two, and 350 starts house
one rather than ending house twelve. Positions just below each checked cusp
retain the preceding house. No cusp anticipation is applied.

Historical rates convert to arcseconds/day as follows: Sun, Mercury and Venus
`59 * 60 + 8 = 3548`; Moon `13 * 3600 + 10 * 60 + 36 = 47436`; Mars
`31 * 60 + 27 = 1887`; Jupiter `4 * 60 + 59 = 299`; Saturn `2 * 60 + 1 = 121`.
Divide each by `3600` to obtain degrees/day. Literal expectations assert those
fractions independently of the production constant objects. The defaults
follow the planetary chapters, including the Mars source discrepancy
documented in `SOURCES.md`.

The schematic totals are worked independently:

| Planet | House contribution | Direction | Rate magnitude | Total |
| --- | ---: | ---: | ---: | ---: |
| Sun at 10, speed 1 | house 1: 5 | exempt: 0 | swift: 2 | 7 |
| Moon at 40, speed 12 | house 2: 3 | exempt: 0 | slow: -2 | 1 |
| Mercury at 70, speed 2 | house 3: 1 | direct: 4 | swift: 2 | 7 |
| Venus at 100, speed 1 | house 4: 4 | direct: 4 | swift: 2 | 10 |
| Mars at 130, speed 0.5 | house 5: 3 | direct: 4 | slow: -2 | 5 |
| Jupiter at 160, speed -0.125 | house 6: -2 | retrograde: -5 | swift: 2 | -5 |
| Saturn at 190, speed 0.0625 | house 7: 4 | direct: 4 | swift: 2 | 10 |

Sect points are disabled in those totals. A separate exact binary comparator
of `0.5` degrees/day for Mars isolates rate boundaries. Magnitudes `0.75`
and `0.25` are respectively swift and slow. Positive speeds earn direction
`4`, negative speeds `-5`, giving house-five totals `9, 5, 0, -4` for
`0.75, 0.25, -0.75, -0.25`. At magnitude `0.5` neither rate rule is present,
so the positive and negative totals are `7` and `-2`. At signed zero neither
direction nor rate rule fires, leaving `3`. Tests just above/below either
signed mean boundary use the same independently derived strict comparison.

With stationary tolerance `0.125`, speeds at either signed endpoint are
stationary. Just outside the endpoints they are direct or retrograde. A
stationary condition leaves only the house contribution applied under the
default weights, even though a disabled sect rule may have its fact present.
The tolerance is an illustrative caller choice, not a sourced station
interval or claim that a reversal occurs.

For Ascendant fifteen, Sun fifteen is on the ascending boundary and the chart
is night. Sun just below 195 is still night; 195 is the descending boundary
and starts day. Sun zero lies in the wrapped day half. These are the same
circle derivations used for essential condition. With Sun 200, the chart is
day; Sun, Jupiter and Saturn match, Moon, Venus and Mars do not. Mercury at
seventy is west of Sun 200 by 130 degrees, so the project's morning proxy
assigns it day. Opt-in weights `1` and `-1` increase or decrease the baseline
totals accordingly and explicitly carry caller provenance.

Mercury 350 relative to Sun ten is west by twenty degrees, morning/day;
Mercury ten relative to Sun 350 is east by twenty, evening/night. Equal
longitudes and both orientations of an exact opposition are indeterminate:
neither sect rule is applicable and neither earns points. These tests check
the longitude convention, without asserting physical visibility. With
`Number.MIN_VALUE` as a positive nonzero offset from zero, Mercury east of
the Sun remains night, and west remains day. Mercury at 180 relative to that
tiny positive Sun is strictly less than a half-circle east, hence night;
the reversed pair is strictly less than a half-circle west, hence day.
These exact-rational comparisons detect cancellation that would falsely
report conjunction or opposition after rounded subtraction or modulo.

Moving the cusp circuit to start at ninety, declaring the first house as
quesited and selecting only the Moon as natural makes all selected roles
refer to the Moon. Its forty-degree longitude occupies the eleventh interval,
which wraps from thirty to sixty. The single record retains querent,
quesited, Moon and natural roles; house weight `4` and slow penalty `-2`
sum once to `2`, without role multiplication.

Custom-weight tests use Mars house-five weight `-1.5`, enabled direct weight
zero and disabled slow weight: total `-1.5`. All-disabled weights give zero
while preserving facts. Two simultaneously present maximum finite weights
exercise overflow rejection. Validation tests cover malformed policies,
incomplete JSON snapshots, unavailable/duplicate required rows, invalid
longitudes and cusp circuits, non-finite speeds and retrograde luminaries.
Contradictory sign/retrograde annotations and latitude do not override
longitude or speed; unselected rows and the unselected Sun's speed are ignored.
Recursive freezing, JSON round trips and chart edits check ownership.

`accidental.integration.test.ts` uses the invented question instant to check
engine `houseOf`, `sectOf`, supplied chart speed and `longitudeSpeed`
delegation across house systems and fallback. It verifies that evaluation
does not call the casting or speed helper again. Those assertions are reuse
and regression evidence, without claiming independent ephemeris accuracy.

## M7 instantaneous aspects and bounded motion

`aspectFixture` reuses the invented question epoch in `fixtures.ts` with the
schematic whole-sign cusps. Aries on the first cusp gives Mars; Taurus on the
second gives Venus; the Moon remains a separate co-significator. Positions
and rates are synthetic geometry, not an astronomical chart at that epoch.
The tests deliberately leave unrelated sign and retrograde labels stale to
verify that longitude and speed decide the observations. No engine output
was used to obtain the expected contacts or motions.

`aspects.test.ts` checks instantaneous motion by signed angular arithmetic.
Mars at zero with speed one, Venus at six with speed zero has conjunction
orb six decreasing by one degree/day, hence applying. Reversing their
longitudes makes it separating. Mars 359 and Venus one are two degrees apart
across the wrap and approaching; Mars one and Venus 359 are separating.
With Mars zero stationary and Venus six retrograde at minus one degree/day,
the gap shrinks. Mars six at minus two and Venus zero at minus one also
approach. Exact moving conjunction/opposition can only separate. At exact
conjunction the separation increases toward a sextile, and at exact
opposition it decreases toward a trine: both observations apply to those
other angles when explicitly allowed full-circle orbs.

The exact-rational edge case uses the literal binary values
`188.86 = 1661230128174203 / 8796093022208` and
`98.86 = 6956654049403863 / 70368744177664`. Subtraction gives
`6333186975989761 / 70368744177664 = 90 + 2^-46`. With relative speed
minus one, the tiny positive square deviation is decreasing. Zero allowance
therefore rejects it as ineligible, but its motion remains applying. A naive
add-360 wrap would erase the residue. Separately, the literal values
`7.6999999999999895 = 8669429282688193 / 1125899906842624` and
`359.7 = 6327909320176435 / 17592186044416` give folded conjunction orb
`8 + 2^-50`. The reported nearest double is eight, but exact eligibility at
an eight-degree allowance is false. These rational reductions come from the
IEEE binary significands, not an engine aspect result.

Eight degrees is an included orb boundary; the adjacent binary value
`8.000000000000002` is outside. A configured relative-speed threshold
`0.125` makes zero and `0.0625` stationary while equality at `0.125`
remains moving. Equal speeds remain stationary with a zero threshold.
Separate luminary and ordinary allowances check replacement semantics.
The default engine orbs, relative-speed threshold, project horizon, step,
budget and maximum operational ranges are literal policy expectations in
`aspects.test.ts`, without an accuracy claim. Endpoint acceptance and a
question at JavaScript Date's upper representable boundary check bounded
policy ranges and horizon overflow without calling a longitude provider.
Declaring the first house as
quesited with Mars and Venus as naturals yields unique Mars, Moon and Venus:
three physical pairs times five rules gives fifteen records, without a
Mars/Mars self-aspect. Freezing, JSON round trips, caller chart edits and
malformed input cases test the ownership and validation contract.

`aspects.motion.test.ts` passes independently specified longitude laws to
the production adapter, running the engine crossing solver unchanged. Let
`t` be elapsed days since the invented epoch; longitudes are reduced modulo
360. Mars `2t` and Venus `6+t` are equal when `2t=6+t`, hence `t=6`.
Freezing the target would wrongly give three days. This establishes the
moving-target fixture by algebra. An eight-day horizon includes the contact;
a six-day horizon includes it as the upper endpoint; a five-day horizon has
no contact. Mars and Venus initially equal produce an `exact-now` record at
zero, with no duplicate future contact in the open-start window.

For each major angle `A` in `0, 60, 90, 120, 180`, set Mars `t` and
Venus `6-s*A` modulo 360, for each `s` in `1,-1`. Relative longitude begins
at `s*A-6` and reaches directed target `s*A` when `t=6`. Conjunction and
opposition identify the same branch for both signs; the other angles have
distinct branches. An eight-degree ordinary allowance admits the initial
application. Mars `t` and Venus 55 start with sextile separation 55 decreasing,
so the sextile is separating; the future positive branch reaches sixty at
`t=115`. It remains contact evidence without a current-application candidate.
Mars `t` and Venus nine similarly meet at nine days, but their initial
conjunction is outside the default ordinary allowance and gets no candidate.

The nonlinear law Mars `10-(t-2)^2`, Venus nine, Moon fixed at 180 has a
relative turn at two days. Solving `10-(t-2)^2=9` gives contacts at one
and three days, respectively increasing and decreasing. At the question
Mars is six with speed four, so a frozen linear estimate `3/4` would be
incorrect. The first actual contact is the application candidate. The hidden
pair fixture Mars `9.0625-(t-0.5)^2`, Venus nine solves
`(t-0.5)^2=0.0625`, hence `t=0.25,0.75`. A one-day coarse step has negative
endpoint offsets and hides both crossings; the engine's extremum search
must recover them. The fixed time tolerance is derived before evaluation as
`ceil(86,400,000 / 2^24) + 1` milliseconds: a full one-day bisection bracket
plus Date truncation. This tests synthetic root arithmetic, not a physical
ephemeris accuracy bound or completeness outside these laws.

Budget tests use a conjunction at `t=6.125` with horizon eight days and step
one quarter day. The coarse scan has `8/0.25+1=33` evaluations; refinement
adds 24, totaling 57 for that branch. A budget of 58 completes it but cannot
start the next pair; all earlier contacts are discarded. A budget of 34
refuses during the first refinement and also returns no partial contacts.
A budget of one refuses before any provider evaluation. A separate all-rule
budget of 100 verifies the global cap across every pair and directed branch.
Each relative evaluation calls two planet providers, with observed count
twice `search.samples`. Non-finite/out-of-range provider values and thrown
errors reject instead of becoming no-contact observations.

`aspects.integration.test.ts` uses the invented question instant to verify
delegation to engine exact configured aspects, moving longitudes and the
budgeted crossing solver over the following half-day window. It checks
requested/actual houses across systems and polar fallback, and confirms
empty-rule and budget-preflight cases call no ephemeris. These assertions
are adapter and regression evidence, without independent astronomical
accuracy claims or a horary outcome verdict.

## Direct contact, sign changes and stations

`direct-perfection.test.ts` runs the production aspect and event adapters
against separately specified longitude laws and their derivatives, through
the unmodified engine crossing solver. Time `t` is elapsed UTC days since
the same invented epoch. The schematic chart is independent of an
ephemeris at that epoch. Longitudes below are reduced modulo 360 and speeds
are the analytic derivatives in degrees/day. Moon is fixed at 180 unless
explicitly changed. These fixtures test defined geometry and event
interpretation, without establishing astronomical accuracy or predictive
validity.

The basic law is Mars `10+2t`, Venus `16+t`. Their equality reduces to
`t=6`. Over `[0,8]` Mars runs from 10 to 26 and Venus from 16 to 24, all
within Aries, and both speeds are strictly positive. No sign change or
station precedes contact. Extending the horizon to twelve days adds Mars's
ingress `10+2t=30`, at `t=10`; that later event cannot interrupt contact at
six days.

For Mars `28+2t`, Venus `34+t`, equality still gives `t=6`, but Mars reaches
30 when `t=1`, moving from Aries into Taurus. Venus stays in Taurus over
the horizon. Moon `180+12t` has speed twelve and reaches the boundaries
210, 240 and 270 at `t=2.5,5,7.5`. The event list orders these with Mars's
earlier ingress. Lunar events do not interrupt the Mars/Venus pair.
Disabling only the sign-change check admits the partial direct contact,
with the disabled check stated in the explanation.

For the forward wrap case, Mars `358+2t` crosses 360 at one day, moving
Pisces to Aries, and meets Venus `4+t` modulo 360 at six days. For the
retrograde case, Mars `2-2t` crosses zero at one day, Aries to Pisces,
and meets Venus `356-t` modulo 360 at six days. These are opposite-direction
sign transitions with the same directed conjunction contact. Mars `24+t`
and Venus fixed at 30 instead meet exactly at the ingress at six days;
the ingress/contact order is unresolved and requires review.

For station-before-contact evidence, set Mars `a=10+2t-t^2` and Venus
`b=16+t-2t^2`. Their difference is
`a-b=t^2+t-6=(t-2)(t+3)`, so the only future conjunction over `[0,3]` is
at `t=2`. Initially the separation is six degrees and relative speed is
positive one, making this an application. Venus's derivative `1-4t` is zero
at `t=0.25`; Mars's `2-2t` is zero at `t=1`. Both change from positive to
negative, in that order, before conjunction. Neither planet leaves Aries
over this horizon. The report retains the later contact and both reversals,
without calling either one a refrenation.

Mars `10-(t-2)^2` and Venus fixed at ten touch conjunction at `t=2`,
simultaneously with Mars's speed-zero reversal `4-2t=0`. Over `[0,4]` both
side speeds are available; the station/contact pair is coincident. Ending
the horizon at two days leaves no after-side evidence, making that endpoint
station unresolved. The before probe is still recorded and no provider date
leaves the horizon.

The station-touch law Mars `10+(t-1)^3/3+1/3`, Venus fixed at sixteen has
speed `(t-1)^2`. Speed reaches zero at one day but is positive on both
sides, so this is a touch rather than a direction reversal. Conjunction
occurs when `(t-1)^3=17`, hence `t=1+cuberoot(17)`, between three and four
days. That station touch before contact requires review. This non-grid root
is classified by its analytic interval rather than pinned to an engine time.

For a sign-boundary tangency, Mars `30-(t-1)^2` touches thirty at one day
without spending a surrounding interval in Taurus. Side samples remain
Aries, so boundary evidence is labeled a touch; it cannot be treated as a
confirmed ordinary ingress. Venus fixed at thirty-five cannot meet this
law, whose maximum is thirty. No contact in the horizon is an explicit
bounded-search state. For exit and reentry, Mars `31-(t-2)^2` reaches
thirty at `t=1,3`, Aries to Taurus and back, with its station at `t=2`.
Equal endpoint signs cannot hide those intervening changes.

Mars `30-t` starts on the canonical Taurus boundary and immediately
departs into Aries; its conjunction with Venus twenty-four is at six days.
The root at the question is excluded by the engine's ordinary crossing
interval, so an explicit unresolved departure observation is preserved.
Similarly Mars `10+t^2` has speed `2t`, zero exactly at the question and
positive afterwards. The report preserves this open-start zero departure;
the chart's initially stationary conjunction itself has no application.

For each major angle `A` in `0,60,90,120,180`, and each sign `s` in `1,-1`,
set Mars `10+2t`, Venus `16-s*A+t` modulo 360. The directed difference is
`s*A-6+t`, hence the chosen branch is perfected at six days. The initial
ordinary orb allowance is explicitly eight degrees. Neither planet reaches
a sign boundary over the eight-day horizon. This checks every configured
major aspect branch as partial contact evidence without removing Lilly's
additional traditional conditions.

Other fixtures keep exact-current, separating, stationary, out-of-orb and
missing-contact states distinct. Both continuity toggles can be disabled
without using a speed provider. A shared Aries second cusp preserves Mars's
querent/quesited roles without self-contacts. Frozen report, policy, nested
event evidence, JSON round trips and edits to the original chart test
ownership, rather than a computed astrological reference.

The policy defaults and maximum event budget are asserted literally in
`direct-perfection.test.ts`. It enforces `rootResolutionMs` as
`ceil(0.25*86,400,000/2^24)+1` over the quarter-day-step fixtures, directly
from the engine's bisection bracket and Date truncation. The event/contact
coincidence comparison uses twice this resolution. These are numerical
search choices, not an astronomical tolerance or an exhaustive-search
guarantee.

`direct-perfection.budget.test.ts` uses the linear ingress fixture over the
eight-day horizon to check event preflight refusal, provider-call accounting
including side evidence, disabled scans, malformed providers and late
atomic refusal. A full run's call count is used only to choose a deliberately
insufficient resource budget, not as an event expectation or accuracy
reference. Late refusal clears all earlier events but retains the separately
completed six-day contact candidate. Total callback calls must equal twice
the aspect sample count plus the event sample count; each event callback
counts once regardless of longitude or speed.

`direct-perfection.integration.test.ts` uses the invented question instant
and following half-day horizon to verify delegation to engine moving
longitudes, sampled speed, sign selection and crossings. It checks actual
house systems and polar fallback with future searching disabled, avoids
recasting, preserves caller chart ownership and verifies JSON output. These
are integration/regression checks, not independent ephemeris evidence.
