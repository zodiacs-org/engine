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

## Symbolic timing fixtures

`timing.test.ts` uses the same invented question instant and coordinate pair
as the preceding fixtures, with hand-written positions rather than a claim
about that instant's sky. In the base chart, Aries on the first cusp selects
Mars and Taurus on the second selects Venus. The Moon remains separately
assigned. All timing unit scales below are deliberately caller-defined
arithmetic inputs; none is taken from an engine output or a historical
universal timing table.

The baseline longitude laws, in degrees and elapsed UTC days `t`, are
`Mars=10+2t` and `Venus=16+t`. Their current conjunction gap is `16-10=6`.
Equating the laws gives `t=6`, at longitude `22`. Mars travels `12` degrees
and Venus `6`; the timing hint uses the current gap `6`, not either
travelled arc. Both start in Aries and house one, which is angular. The
explicit cardinal/angular cell of one week per degree gives six symbolic
weeks, kept separate from six elapsed UTC days. With Mars's speed changed
to `3`, `10+3t=16+t` gives `t=3`, while the unchanged gap still gives six
symbolic weeks. With an hour scale of `1,000,000` per degree the quantity
is `6,000,000`; this enforces the factory's upper bound, with larger scales
rejected. A scale of `Number.MIN_VALUE` remains valid where the product is
nonzero. A gap and speed of `2^-20` give a contact at one day; multiplying
that gap by `Number.MIN_VALUE` underflows, and the test requires rejection
rather than reporting a nonexact application as zero duration.

The mixed-basis laws start Mars at `29` and Venus at `30.5`, with speeds
`2` and `1`. The gap is `1.5` and the contact is at `t=1.5`. Mars starts in
Aries and angular house one, while Venus starts in Taurus and succedent
house two. The caller cells give `1.5*1=1.5` symbolic weeks and
`1.5*0.5=0.75` symbolic years, retained as alternatives. A false cardinal
cell suppresses only the Mars alternative. Mars crosses into Taurus before
contact; retaining the question-time basis is deliberately not a claim of
uninterrupted perfection.

For canonical sign/house checks, use `a=30i+10` and `b=a+6`, for sign
indices `i` from zero through eleven, keeping speeds `2` and `1`.
The literal sign expectations follow zodiac order; their modalities repeat
cardinal, fixed and mutable. On cusps `0,30,...,330`, placement is house
`i+1`, and house kinds repeat angular, succedent and cadent. Original
fixture sign and degree annotations are stale by design and are ignored.
The separate matrix test places each modality in each of these house kinds:
for modality index `m` and house-kind index `h`, start Mars at `30m+10`
and use cusps `(30(m-h+i)) mod 360`. The longitude falls ten degrees inside
house `h+1`. Declared natural Mars and Venus keep the tested pair available
even when rotated first and second cusps select other rulers. Each cell's
distinct scale is `1+3m+h` days per degree, so the expected quantity is
`6(1+3m+h)` by independent multiplication.

An unequal cusp circuit `20,50,85,115,145,175,205,235,265,295,325,355`
puts both baseline positions in wrapping house twelve, between `355` and
`20`. Their sign remains Aries, but their placement is cadent. Two symbolic
days per degree therefore gives twelve symbolic days. Distinct-cusp and
single-circuit validation tests use a repeated cusp or swap two adjacent
cusps, both of which violate the placement premise before any sampling.

Circle-wrap laws start at `358` and `4` with speeds `2` and `1`. The
directed conjunction gap is six degrees, and both normalized positions
agree at `t=6`. Mars's Pisces/cadent cell gives twelve symbolic months;
Venus's Aries/angular cell gives six symbolic weeks. Reversing motion with
starts `2` and `356` and speeds `-2` and `-1` preserves the gap and contact
time, exchanging those planet bases. For each nonconjunction major aspect
angle `A`, starts `10` and `10+A+6` with the baseline speeds give relative
longitude `-A-6+t`; the branch contact is at `t=6`. The gap remains six
degrees for sextile, square, trine and opposition, without using a
conjunction-only arithmetic shortcut.

Equal current longitudes are exact now, with zero gap and no future
symbolic duration. Equal speeds, reversed positions with positive relative
speed, and a nine-degree gap outside the configured conjunction orb yield
no current application. A two-day horizon cannot contain the base six-day
contact. Disabled and preflight-refused searches return no hints. Default
disabled timing consumes no future provider evaluations and skips
placement-only checks while retaining ordinary cast validation. Explicit
querent and quesited bases select only their roles; a Moon basis supplies
no substitute for the Mars/Venus pair. A shared first-house question with
declared Mars and Venus preserves all Mars roles without self-aspects or
duplicated hints for those roles.

The late-refusal fixture changes the initial target to `16.125`, so its
contact at `6.125` lies between quarter-day grid samples. The first pair
uses `33` grid evaluations and `24` refinements, totaling `57`; a budget
of `58` leaves too little for the next pair. The test enforces atomic
removal of that already found candidate and all hints, with `114` calls
because each relative evaluation reads both planets. This is resource
accounting, not a contact-time or ephemeris accuracy reference. Restored
policy validation, deep freezing and provider-error propagation establish
software behavior.

`timing.integration.test.ts` casts only the invented instant and location.
Its half-day window exercises delegation to engine exact aspects and
crossings, verifies engine clock provenance and confirms no recasting.
Disabled searching checks each actual house system and polar fallback.
These integration tests do not supply independently verified ephemeris
positions or establish predictive validity.

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

## Translation of light fixtures

`translation.fixture.ts`, `translation.test.ts` and
`translation.eligibility.test.ts` use the same invented question instant
and schematic Aries/Taurus house cusps as the earlier adapter fixtures.
They represent invented continuous longitude laws, not the ephemeris at
that instant. Let `t` be elapsed UTC days from the question and reduce each
longitude modulo 360 only when giving it to the provider. The default laws
are source Mars `S=10+t`, receiver Venus `D=16+2t`, and carrier Moon
`C=12+3t`, all in degrees. Their speed rows are the literal derivatives.
Other classical planets are fixed at Sun 100, Mercury 180, Jupiter 220 and
Saturn 260. Only conjunction is enabled in the baseline scan, so these
planets introduce no contact over the window `(-2,5]`.

The directed gaps are `C-S=2+2t` and `C-D=-4+t`.
At the question the first gap is positive and growing, hence separating;
the second is negative and shrinking in absolute value, hence applying.
The source conjunction is at `t=-1`, at longitude nine. The receiver
conjunction is at `t=4`, at longitude twenty-four. Both roots lie on the
quarter-day sampling grid, so their ISO instants follow directly from the
question timestamp plus elapsed days. The two principals have gap
`S-D=-6-t`: they are separating within the configured conjunction orb.
Carrier speed three exceeds principal speeds one and two. Moon is lighter
than Mars and Venus in the traditional sphere order. At the question the
carrier is twelve degrees into Aries, which Mars rules by domicile;
Mars therefore receives Moon by domicile. The other default reception
choices do not add a dignity there under the engine's named table variants.
This uses Ptolemy's independently transcribed Aries domicile already cited
above; it is not an expectation derived from the engine's return value.

Giving Mercury the same `C` law and leaving Moon fixed at 140 retains both
contact times. Mercury is also lighter than both principals in the chosen
sphere order; a declared natural role changes only its role list. Declaring
Moon as natural preserves both its Moon and natural roles on one carrier.
Putting both principal cusps in Aries instead gives one physical Mars ruler
with two roles; no distinct-principal transfer exists. Selecting Mars or
Venus as carriers cannot create a self-transfer. Setting `C(0)` equal to ten
or sixteen gives a current exact endpoint contact; this project requires a
nonexact separation/application pattern across the question, so it does not
label those present contacts translation. Giving the carrier speed one
makes its source gap stationary. Starting it at thirty leaves the baseline
in-orb bridge absent.

For reversed transfer roles, set Venus `40+t`, Mars `46+2t` and Moon
`42+3t`. The same gap equations give source contact at `-1` and receiver
contact at `4`, now from Venus to Mars. The carrier's question longitude is
twelve degrees into Taurus, whose domicile belongs to Venus. Aries/Taurus
house assignments remain unchanged; the direction follows the motion, not
an assumed querent-to-quesited ordering.

A lookback of half a day omits the source contact at minus one; a future
horizon ending at two days omits the receiver contact at four. A horizon
ending at four includes that future endpoint. A lookback beginning exactly
at minus one excludes that past endpoint by the open-start crossing
contract. These cases test bounded absence, without concluding that a
contact cannot exist beyond the chosen interval. Disabling searching keeps
current geometric observations; disabling translation or selecting no
carriers creates no endpoint references or provider calls.

The policy defaults, including seven-day lookback, 200,000 provider calls
and their upper bounds, are literal assertions in `translation.test.ts`.
The traditional order is asserted there independently as Moon, Mercury,
Venus, Sun, Mars, Jupiter, Saturn. Lilly's source locators are recorded in
`SOURCES.md`. Factory tests exercise malformed values, ordinary-data slots,
sparse lists, restored snapshots and independent immutable ownership. They
are configuration tests, not physical accuracy measurements.

Eligibility variations in `translation.eligibility.test.ts` change one
condition at a time. Receiver Venus `16+0.5t` approaches Mars `10+t`:
principal gap `-6+0.5t` applies, while the carrier still bridges them with
receiver contact `t=4/2.5`. The principal-separation check rejects this
pattern until disabled. Selecting only principal trine cannot qualify the
baseline conjunction when that trine is disabled in the aspect policy.
Selecting only source reception by exaltation fails for Mars hosting an
Aries carrier; empty reception dignities disable this requirement. Giving
Saturn the baseline carrier law makes it swift by the instantaneous speed
proxy but heavier by sphere order, demonstrating that those checks are
independent. Receiver Venus `16-3t` meets Moon `12+3t` at `t=2/3`; their
absolute speeds are equal, so the strict swiftness check fails even though
the relative application exists. Disabling that check and the approaching
principal-pair requirement allows the geometric contact candidate. This
non-grid root is assessed as a candidate without pinning its computed time.

For interruption, hold Jupiter at eleven or eighteen. Moon meets these
positions at `t=(11-12)/3=-1/3` and `t=(18-12)/3=2`, respectively.
Both lie after source separation at minus one and before destination contact
at four. Jupiter has no question role, but these are carrier contacts and
fail uninterrupted transfer. Disabling the check preserves the events while
removing that restriction. Jupiter at nine coincides with the source
contact; Jupiter at twenty-four coincides with the receiver contact.
No strict order is assigned at either endpoint. Jupiter at twelve meets
Moon exactly at the question, inside the combined historical/future scan;
it is an intervening contact. Jupiter at twenty-seven is reached at five,
after the destination, and remains horizon evidence without interrupting.

The inherited numerical resolution is
`r=ceil(0.25*86,400,000/2^24)+1` milliseconds, with contact-order resolution
`2r`; these formulas are asserted over this quarter-day-step horizon.
Placing Jupiter at `24-3*r/86,400,000` puts its contact `r` milliseconds
before the receiver, requiring review. Moving it a thousand milliseconds
before the receiver establishes an earlier sampled contact; moving it a
thousand milliseconds after the receiver puts it outside the transfer.
To exercise an endpoint almost at the question, set source Mars
`12-2*r/86,400,000+t`. Its carrier gap vanishes `r` milliseconds before the
question, so the source contact is too close to establish a strict
historical/current order. These are numerical-order conventions enforced
in tests, not ephemeris accuracy bounds.

All major aspect branches use angular arithmetic independent of the engine.
For angle `A` in `0,60,90,120,180` and side `s` in `1,-1`, keep carrier
`12+3t`, set source `10-s*A+t` and receiver `16-s*A+2t`. The directed gaps
are `s*A+2+2t` and `s*A-4+t`; both reach branch `s*A` at the same minus-one
and four-day contacts. Ordinary modulo reduction changes only the branch
label: negative nondegenerate branches are `360-A`. Unused planets are
fixed at fifty, away from every selected contact ray during this window.
Principal separation and reception are disabled in these branch tests
because their original geometry was deliberately changed. For mixed modes,
keep source `10+t` but receiver `76+2t`. The carrier leaves source
conjunction at minus one and reaches receiver sextile at four on directed
branch 300. The principals separate by sextile with initial orb six;
this test explicitly allows an ordinary sextile orb six instead of the
engine's smaller default. It isolates support for different contact modes
on the two legs, without claiming the chosen allowance is traditional.

Adding a longitude offset or reflecting all three laws leaves the root
equations unchanged. The wrap test offsets the carrier to minus twelve
before canonical modulo reduction; the reverse-motion test reflects the
laws about longitude twenty-four. The contacts stay minus one and four,
with reversed relative direction in the reflected case. Negative lunar
motion is an artificial geometry exercise, not a possible physical Moon
trajectory. Other classical planets remain fixed and introduce no enabled
conjunction during these windows.

Adding Mercury `13+3t` gives a second carrier whose source and receiver
roots are `t=-1.5` and `t=3`. The two carriers stay one degree apart and
never contact each other. Each assessment retains its own endpoint
references without confusing them with the Moon's. In the late-budget
fixture Mercury instead follows `13.25+3t`, with source root `-1.625`
between coarse samples and receiver root `2.75` on the grid. This forces
root refinement after earlier scans. `translation.budget.test.ts` uses the
full run's call count solely to choose a deliberately insufficient budget,
not as an event expectation or accuracy reference. It verifies all-or-none
refusal across carriers, exact provider-call accounting, window containment,
preflight refusal, provider exceptions, malformed rows and unrepresentable
Date windows. Each relative evaluation costs two longitude-provider calls.

`translation.integration.test.ts` uses the invented real-cast instant with
an explicit broad allowance of 180 degrees for every major aspect and a
half-day lookback/future horizon solely to exercise engine delegation. It
checks moving longitude, exact aspect decisions, crossing calls and dignity
hosting, without pinning ephemeris outputs or recasting the chart. A mocked
production longitude boundary exercises the baseline independently derived
sequence as well. Tests preserve actual requested/computed house systems and
polar fallback with searching disabled. These are integration checks, not
independent ephemeris accuracy evidence. The full existing aspect/direct
suite also checks the shared instantaneous-observation helper extracted for
translation reuse; the helper still delegates decisions to the engine.

## Collection of light (M10)

`collection.fixture.ts` reuses the invented question instant and schematic
Aries-first/Taurus-second cusp circuit, so Mars and Venus are the two house
rulers. This is an artificial angular-motion experiment, not an ephemeris
at that instant. Let `t` be elapsed UTC days, normalize only the final
longitudes modulo 360, and set collector Saturn `C=220+t/4`, Mars
`A=214+5t/4`, Venus `B=285-t`. Other classical planets retain the independent
fixed laws of the translation fixture. They do not participate in collection.

The directed gaps are `A-C=-6+t` and `B-C=65-5t/4`. Mars applies to
conjunction at `t=6`; Venus applies to sextile at `t=4` with decreasing
relative longitude. Their initial orbs are six and five degrees. These tests
explicitly configure ordinary/luminary sextile orbs to six degrees, a test
choice rather than a historical allowance. Mars and Venus are initially
seventy-one degrees apart, outside the enabled conjunction/sextile orbs.
Saturn follows both in sphere order and its absolute rate is smaller than
both. Venus's negative speed is a deliberate synthetic motion input; no
retrograde flag or physical ephemeris is the reference.

The fixture Sun is at 100 degrees and Ascendant at 15, placing the Sun in
the ecliptic lower half for night sect. At the collector's 220 degrees,
Scorpio ten, Mars has domicile and the night water triplicity; Venus holds
Egyptian term `[7,11)` degrees of Scorpio. These expectations are hand-read
from the published dignity definitions cited in the essential-condition
section. The Chaldean face at Scorpio ten belongs to the Sun, not Mars.
In reverse, Saturn has no selected dignity at Mars's Scorpio four and
has domicile at Venus's Capricorn fifteen. Thus the default principals-
receive-collector requirement passes, while the reverse-direction requirement
fails for Mars. Restricting reception to domicile fails for Venus. Empty
selection disables reception without inventing self-reception.

Shifting all three laws by one degree preserves the contact equations but
moves the collector to Scorpio eleven, outside Venus's term. That question-
time reception fails even though later contacts exist. Moving Mars's initial
longitude to 218 changes its contact to `t=2`, ahead of Venus; moving it to
216 gives `t=4` for both, requiring numerical-order review. A horizon ending
at six includes the last contact; a horizon ending at five leaves Mars's
contact unestablished. Current Mars at 220 is exact, at 224 separates, at
214 with speed one quarter is relatively stationary and at 200 is outside
the conjunction orb; each removes the current pattern. The conflicting
provider experiment preserves current Mars geometry but supplies future
`230-t`, which contacts the collector at `t=8` in the opposite direction;
it tests unauthenticated-input review, not a physical trajectory.

For the no-beholding toggle, Mars 219 and Venus 284 start sixty-five degrees
apart, inside the configured sextile orb, with collector branches still
applying. For the weight toggle, substitute Moon for Saturn with the same
collector law; weight then fails but motion and receptions stay unchanged.
Declaring Moon also as natural significator retains both Moon/natural roles
on one collector. Declaring Saturn natural retains its natural role without
another physical pattern. Assigning Aries also to the second cusp shares
Mars between principal roles and produces no collection. For a principal
Moon, rotate whole-sign cusps to Cancer first and use Taurus at house eleven
for Venus, assign Moon the baseline Mars law, and disable reception. Moon's
querent and co-significator roles stay on a single application.

For the slower-speed toggle, use collector `220+2t`, Mars `226+t` and
Venus `275+3t`. The relative gaps reach conjunction and sextile at six and
five respectively; the collector is faster than Mars, so the strict speed
proxy fails. Disabling it permits the partial pattern. This experiment
changes sign/term histories, which this report does not assess.

Every directed major branch is tested separately. For angle `Q` in
`0,60,90,120,180` and side `s` in `1,-1`, use collector `220+t/4`, Mars
`220+s*Q-6+5t/4`, Venus `220+s*Q-4+5t/4`. The directed gaps
`s*Q-6+t` and `s*Q-4+t` reach their same branch at six and four.
Nondegenerate negative branches have canonical target `360-Q`. This also
exercises longitude wrapping and mixed original signs. Each test configures
an ordinary orb of eight degrees for its selected aspect, disabling principal
no-beholding and reception because the deliberately changed geometry no
longer supports the baseline requirements.

A one-day step has root-resolution convention
`r=ceil(86,400,000/2^24)+1` milliseconds. Setting Mars to
`220-1e-7+5t/4` places its conjunction at approximately 8.64 milliseconds
in independently solved decimal arithmetic, within `2r` of the question.
The test asserts only review and the reported numerical-resolution interval,
not exact binary/decimal equality or physical timing accuracy.

Adding Jupiter `219.5+t/4` supplies another collector. Its Mars gap
`-5.5+t` and Venus gap `65.5-5t/4` lead to contacts at 5.5 and 4.4;
the latter is between quarter-day coarse samples. The budget test uses the
full run's provider count solely to choose a deliberately insufficient
limit. It does not use that run as a timing reference. Refusal must erase
both collectors' partial contacts, keep current/reception evidence, count
both calls of every relative sample and stay within the future window.
Provider-Date mutation, invalid values, exceptions, malformed required rows,
unused rows and unrepresentable horizons are separately tested.

The integration suite mocks the production longitude boundary with the
baseline laws and observes delegation to engine aspect classification,
crossings and essential dignities without recasting. A real cast at the
invented instant uses explicitly broad aspect orbs and a short horizon
solely to exercise engine motion and JSON output. Every supported house
system and polar fallback preserves actual/requested settings with searching
disabled. These are integration checks, not independent ephemeris accuracy
or predictive validity evidence.

## Prohibition, frustration and refranation (M11)

`impediments.fixture.ts` uses the same invented question instant, location
and schematic cusp circuit. Mars is the querent ruler, Venus the quesited
ruler, and Moon retains its co-significator role. This is an independent
angular-motion experiment, not an ephemeris chart. Let `t` be elapsed UTC
days and wrap only the resulting longitudes modulo 360. Each law supplies
its analytic derivative as speed, ignoring synthetic retrograde flags.
The fixed nonparticipating planets are Sun 100, Moon 180, Mercury 140,
Jupiter 220 and Saturn 260. No expectations come from engine output.

Baseline Venus `V=10+2t` and Mars `M=16+t` have gap `V-M=-6+t` and
conjunction at six days. Venus is lighter in the existing traditional
sphere order and has larger absolute speed. Substituting Mercury
`T=8+4t` gives `V-T=2-2t` and `M-T=8-3t`, contacting Venus at one day
and Mars at eight thirds days, both before the principal conjunction.
Substituting Mercury `14+4t` gives `M-T=2-3t`, contacting Mars at two
thirds days, while `V-T=-4-2t` never reaches conjunction in this window.
The general prohibition scope counts the latter contact; the stricter
two-principal scope does not. These are synthetic configurations, not copies
of Lilly's historical numerical examples.

With Saturn `T=18+t/2`, `M-T=-2+t/2` reaches conjunction at four days,
while `V-T=-8+3t/2` reaches it at sixteen thirds days. The heavier
recipient joins Saturn first, supporting the selected frustration reading
and overlapping the general prohibition observation. Saturn `78+t/2`
instead gives a sextile on each corresponding directed branch. It counts
for prohibition with sextile enabled and for the broader frustration scope,
but not for the corporal-only frustration choice. Fixed Saturn 22 gives
both third conjunctions exactly at the principal conjunction at six days:
order requires review, including in the stricter two-principal scope.
Fixed Saturn 26 contacts Venus at eight days and Mars at ten, after the
principal contact; the eight-day horizon retains only the first, without
classifying it as earlier intervention.

Every directed major branch is exercised using angle `Q` in
`0,60,90,120,180`, side `s` in `1,-1` for nondegenerate angles, Venus
`358+2t`, Mars `m0+t` with `m0=358+s*Q+6`, and Saturn
`m0+s*Q+2+t/2`. The principal directed gap `-s*Q-6+t` reaches its
selected branch at six days. Mars-Saturn `-s*Q-2+t/2` reaches the same
aspect branch at four days. Wrapping changes neither root equation.
Tests enable only the selected type and use an explicit ordinary orb of
eight degrees. This verifies contact ordering on both branches without
introducing another aspect table or a historical orb claim.

For the swiftness toggle, Venus `10-t`, Mars `16-2t`, Saturn `14-3t/2`
give principal contact at six and recipient-Saturn contact at four days.
Venus is lighter but slower in absolute instantaneous speed; default
frustration eligibility fails and disabling that proxy permits the partial
observation. All relative application decisions still use the engine.
Declaring Moon natural while giving it the Mercury two-contact law retains
Moon/natural roles without assigning it a principal house. Assigning Aries
to both first and second cusp shares Mars across the two principal roles,
without creating self-intervention. A distant principal longitude removes
the in-orb pattern. A two-day horizon leaves the six-day principal contact
unestablished, so contact rules do not infer order against an extrapolation.

For refranation, set Venus `10+2t-t^2`, speed `2-2t`, leaving Mars
`16+t`. The principal gap is `-6+t-t^2`, whose discriminant is negative,
so no conjunction exists in the experiment. Venus reverses at one day.
Mars stays direct at the question and side probes, and the gap is opening
after that station. In fact relative closing ceases at half a day, before
the individual station: the report is explicitly reversal-associated
evidence rather than a causal claim. To preserve a later contact, use Venus
`10+2t-3t^2/2+t^3/3`, speed `(t-1)(t-2)`, and Mars `14.5+t`.
Stations are at one and two days. The gap factors as
`(t-4.5)*(t^2+3)/3`, hence its only real contact is at 4.5 days.
The first station supports the selected observation; the second, retrograde
to direct, does not. The later contact remains recorded.

Venus `14-(t-2)^2` and fixed Mars 14 touch in conjunction at two days,
coincident with Venus's reversal, so this is review evidence. Ending the
horizon at that instant lacks a resolved after side. Venus
`10+(t-1)^3/3+1/3` has speed `(t-1)^2`: a zero-speed touch at one day,
without reversal. Against Mars `16-t`, both initial speed magnitudes equal
one. The swift-applicant proxy fails; disabling it exposes the ambiguous
touch as review rather than confirmed refranation. A recipient-only reversal
uses Mars `16+t-t^2` with baseline Venus and does not satisfy the selected
applicant rule. Venus `10+2t-t^2` with Mars `16-t` is still applying just
after Venus's station, while the recipient is retrograde, so it also fails.
Venus `10+4t-t^2` and Mars `11+t` have first contact
`(3-sqrt(5))/2` days, before Venus's station at two; that later station
does not interrupt the already reached contact.

Noninteger roots are compared within a test tolerance of `0.0000005` UTC
days implied by six-decimal `toBeCloseTo`; grid roots use exact millisecond
Dates. The quarter-day step's reported numerical root resolution is
`ceil(0.25*86,400,000/2^24)+1` milliseconds, inherited from the existing
event adapter. Neither tolerance nor resolution is physical timing evidence.
Budget tests use the full run's call count only to select an insufficient
resource limit, never as a contact-time reference. They check coarse refusal,
late refusal, a partially read station probe, separate aspect/station budgets,
detached frozen records, fresh provider Dates and input validation.

The production integration test casts the invented instant with explicit
broad major-aspect allowances of 180 degrees and a half-day horizon solely
to exercise the adapter. It checks engine exact aspects, crossings and
speed helpers without recasting, pinning sky values or claiming independent
ephemeris accuracy. Disabled searching preserves each actual house system
and polar fallback. These tests establish software behavior, not predictive
validity.

## Combined API and CLI fixtures

`analyze.test.ts` composes the existing independently worked
`aspectFixture(0, 6, 1, 0)` with an Ascendant angle of two degrees. Its
schematic cusps remain at multiples of thirty degrees, so house one is
Aries and house two is Taurus: Mars represents the querent, Venus the
quesited, and the Moon retains its co-significator role. Changing the angle
does not change the schematic cusps. The early-Ascendant interval includes
two degrees; Saturn at 190 degrees occupies house seven, whose interval is
`[180, 210)`. Moon at 180 degrees is outside Via Combusta. The lunar scan
is disabled because these positions are an invented geometric chart, not
an ephemeris at its declared instant.

The Sun at ten degrees with Ascendant at two is on the day side of the
engine's ecliptic sect convention. Mars at zero Aries has domicile and
Chaldean face, but no other selected dignity: the fire day triplicity lord
is Sun and the first Egyptian term is Jupiter. Lilly's configured score
is therefore `5 + 1 = 6`. Venus at six Aries is in detriment, but begins
its own Egyptian term at that exact endpoint. Its essential score is
`-5 + 2 = -3`, and it is not peregrine. Mars receives Venus by Aries
domicile and the first Aries face. Venus has no dignity at Mars's zero
Aries position, so these two have no mutual reception; the other
significator pairs also lack reciprocal selected dignities.

Mars occupies house one, is direct at one degree per day and exceeds the
configured Lilly mean motion for Mars. Its accidental score is
`5 + 4 + 2 = 11`. The Mars-Venus directed separation starts at 354 degrees
with increasing relative speed of one degree per day: it approaches zero,
so the conjunction is applying with an angular gap of six degrees.
Disabled contact searching yields no future contact candidate, rather than
the independently extrapolated six-day time. The test retains every section,
policy and disabled state without combining a final judgement.

The composed engine check casts the invented `questionInput` with a
half-day horizon and insufficient sample budgets. Expected assertions are
cast call accounting, provenance retention and independent refusal states,
not reference sky positions or an accuracy claim. The explanation test
uses trusted typed and JSON-restored reports to check identical formatting,
source records, ownership and the absence of additional calculations.

`examples/question.json` and `examples/analysis-request.json` repeat the
invented question instant, coordinate pair and explicit second-house
selection from `fixtures.ts`. The request disables future contact scans and
the lunar void scan. The process tests check equality to those documented
inputs and execute the examples from outside the checkout. CLI assertions
cover JSON schemas, normalization, option propagation, source-bearing text,
separate stderr errors, exit status, relative file paths, local dependency
resolution and byte-bounded input. These are software integration checks,
not new astronomical reference fixtures. No process expectation is taken
from the engine's own planetary output.

## Enabled composition and executable coverage (M14)

`analyze.integration.test.ts` calls `analyzeCast` through the production
wrappers with controlled longitude and speed providers. Every schematic
chart retains the invented question instant and cusp circuit. The lunar
void scan is disabled for the independent laws because they are not a sky
ephemeris. The constant derivatives of the linear laws are supplied as
speeds at every requested instant; the curved law supplies its analytic
derivative. No calculated sky position supplies a test expectation.

The overlapping-contact case uses the M11 laws Venus `10+2t`, Mars `16+t`
and Saturn `18+t/2`. The principal conjunction solves `-6+t=0`, at six
days. Mars-Saturn solves `-2+t/2=0`, at four days. The direct report sees
the principal contact with no earlier sign change or nonzero-speed station
for these principals: both remain inside Aries through contact. The separate
impediment report retains prohibition and frustration evidence from the
earlier Saturn contact, rather than overriding or deleting the direct
record. Saturn and these equations have the same derivation as M11.

At the question both principals occupy Aries and actual house one, whose
synthetic cusp interval is `[0,30)`. Aries is cardinal and that house is
angular. The independently chosen cell assigns two symbolic weeks per
degree. The current principal gap is six degrees, so each of the two basis
alternatives gives `6*2=12` symbolic weeks, while the sampled contact still
carries six elapsed UTC days. This caller convention is intentionally
different from elapsed time and is not a Lilly timing table. The test
checks both alternatives and their separate units and origins.

The translation case uses the M9 laws Mars `10+t`, Venus `16+2t` and Moon
`12+3t`. Moon-Mars is `2+2t`, giving separation at minus one day;
Moon-Venus is `-4+t`, giving future application at four days. The principals'
gap is widening at the question. The composed report keeps the translation
candidate, its endpoints and source while direct application between the
house rulers is absent. The source-reception, weight, speed and absence of
interruption follow the M9 derivation without any new eligibility rule.

The collection case uses the M10 laws Saturn `220+t/4`, Mars `214+5t/4`
and Venus `285-t`, with conjunction and sextile enabled and a sextile orb
of six degrees. Mars-Saturn is `-6+t`, reaching conjunction at six days.
Venus-Saturn is `65-5t/4`, reaching the positive sextile branch at four
days. Venus contacts first; Mars's conjunction completes the selected
sequence at six days. The principal separation at the question is
seventy-one degrees, outside both enabled orbs, and is growing. The
Scorpio reception and selected collection requirements are worked in M10.
Composition preserves their passed reception check and completion contact.

The refranation case reuses the M11 curved Venus law `10+2t-t^2` and
speed `2-2t`, against Mars `16+t`. Venus reverses at one day. The principal
gap `-6+t-t^2` has negative discriminant, so no conjunction exists under
these laws. The post-station gap is separating on its original branch,
while Mars remains direct. Over the two-day horizon, the station-associated
observation survives composition, but neither a contact nor a symbolic
hint is invented. The M11 derivation explains why this is association and
not a claim of station causality.

The atomic-refusal case reuses the translation laws but supplies a
translation budget of one provider call, below the coarse scan requirement,
and a direct-event budget of one. These independent reports refuse and
discard their incomplete evidence while the aspect scan can finish. The
test checks explanation text against the refusal reason and every report's
method limitations, including separate principal-aspect and station scans.
Trusted JSON restoration preserves that explanation without calculations.

The fully enabled engine case uses an invented polar location at latitude
eighty degrees north, with the existing synthetic longitude and instant.
Placidus falls back to whole signs at that latitude under the engine's
documented construction. The request declares the seventh house and natural
Moon and Venus. Its expectations concern one cast, one delegated lunar
scan, retained fallback settings and roles, complete sampled scans under
the explicit short horizons, JSON ownership and explanation provenance.
It provides no new ephemeris or predictive accuracy evidence.

`examples/scanned-analysis-request.json` keeps the original invented
instant and coordinates, declares a job question's tenth house, and
explicitly adds Moon and Venus as natural planets. Future and translation
lookback windows are each half a UTC day as an operational example choice.
`cli.process.test.ts` checks the complete request object and executes it in
real processes from outside the checkout, including enabled lunar and
motion scans. It checks report schemas, source and limitation retention,
declared houses and role propagation, without taking a reference sky
position from the program.

The CLI refusal request chooses one aspect sample, insufficient even for
the first coarse scan. It succeeds with refused evidence and no contacts.
The error request at `0001-05-02T00:00:00Z` reuses the existing independently
motivated ephemeris-span boundary case: casting is permitted, but the
enabled lunar scanner reaches before the engine's permitted samples. It
fails atomically without stdout. The timezone test uses
`2000-01-01T19:00:00+07:00`; subtracting the explicit seven-hour offset
gives noon UTC on the same date. UTC and America/Los_Angeles process
settings must not alter that resolved instant. Comparing their complete
serialized output checks repeatability only, not astronomical accuracy.

`scope.test.mjs` checks the folder gate using disposable files in the
ignored cache, without writing git metadata. ASCII files just below and
at the two-million-byte boundary distinguish permitted and rejected source
sizes; a million UTF-8 `é` characters also reaches that boundary despite
having fewer JavaScript code units. Symlinks, out-of-folder paths, generated
commit candidates and forbidden documentation punctuation are rejected.
Package inventory cases exercise explicit horary leakage and missing npm
reports. These are repository-operational checks, not astrology evidence.
