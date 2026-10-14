# Convention source register

These sources were fetched and read for the listed milestones. Their
locators and short excerpts are recorded in
[source-readings.json](evidence/source-readings.json). The register supports
the meanings of the planned choices; it is not evidence that a solver has
been implemented or agrees with a worked example. No historical chart or
person's birth data was copied.

## Temporal-hour geometry

Claudius Ptolemy, *Tetrabiblos*, translated by J. M. Ashmand (1822),
[book III, chapter XIV, printed pp. 94-96](https://sacred-texts.com/astro/ptb/ptb58.htm),
relates positions between horizon and meridian by their temporal hours.
The diurnal or nocturnal hourly time depends on the point's declination and
the observer's latitude. This supplies the historical starting point for
proportional semi-arc placement. The same passage supplies the `ptolemy`
timing key: an equatorial degree signifies a solar year.

## The Placidus choices and their limits

Placidus de Titis, *Primum Mobile*, translated by John Cooper (1814),
[printed pp. 17-23, 57 and 104-105](https://iapsop.com/ssoc/1814__cooper___primum_mobile.pdf),
provides the named basis for `placidus-semiarc`. Thesis 40 describes mundane
aspects through proportional division of diurnal and nocturnal arcs;
theses 45-46 retain bodily latitude. Thesis 55 distinguishes temporal-hour
positions from great circles of position.

Page 57 and canon XXXVII explain direct and converse by exchanging roles.
For direct motion the promissor moves westward to the significator's fixed
mundane position. For converse the significator moves westward to the
promissor's fixed position. This is `converseConstruction:
"placidus-role-swap"`; original labels must remain visible in future results.
It is generally different from negating a direct arc when declinations differ.

Theses 60-61 reject converse directions of angles and converse zodiacal
aspects; thesis 61 also excludes zodiacal rays to angles. The angle solver
refuses converse under this construction. Aspect solvers must preserve those
restrictions. Accepting a convention object alone does not permit every contact.

The initial `zodiacal/zero-both` policy is a project restriction to ecliptic
projections. `mundane/retain-both` preserves the bodies' latitude. These
choices do not exhaust traditional latitude treatments. The zodiacal subset
implemented in M5 and the mundane subset implemented in M6 are described below.

## Timing keys implemented in M7

William Lilly, *Christian Astrology* (London, 1647), book III,
[chapter CLXVI, printed pp. 709-715](https://www.worldastrology.net/wp-content/uploads/2008/12/CA-III.pdf),
discusses Ptolemy's and Naibod's keys separately. His Naibod tables give
rounded calendar conversions, without establishing the finer rate used here.

Erich Carl Kühr, *Berechnung der Ereigniszeiten* (Regulus-Verlag, 1936),
[printed pp. 62-63, PDF page 37](https://www.imagomundi.biz/wp-content/uploads/2026/04/PYKS52-Berechnung_der_Ereignisgrenzen-Erich_Carl_Kuehr.pdf#page=37),
states a Naibod rate of `0 degrees 59 minutes 8.33 seconds` of equatorial
arc per year. The `naibod` key uses exactly that printed decimal convention,
`354833/360000` degrees per year. This is a fixed conventional rate at the
source's precision, not a claim that the astronomical mean solar motion is
exactly that number. This scan's title page dates it to 1936. Naibod's own
text has not been fetched and read; Kühr supplies this explicit numerical
formulation. His directional geometry and claims of predictive success are
not adopted.

Lilly attributes a solar-equatorial method to Antonius Maginus: compare the
Sun's right ascension at birth with its right ascension at the same hour on
the following day, then use that difference as the fixed annual arc. This
is the `solar-equatorial-birth-day` key. It is not a longitude solar
arc or a continually changing progressed-Sun key. The modern time scale,
day interval and angle unwrapping are explicit project choices, specified
and tested in [M7-derivations.md](evidence/M7-derivations.md).

Maginus's own cited text has not been read here; this attribution is through
Lilly. Lilly's directional geometry is not used as a substitute for the
Placidus semi-arc construction. Each key converts the already computed
equatorial arc to a symbolic solar-year age by dividing it by the selected
annual rate. A fractional symbolic year is not a civil anniversary or an
elapsed timestamp; this layer performs no calendar conversion.

## Remaining source work

Before enabling a numerical method, its milestone must settle the corresponding
equations, coordinate branch, domain and refusal rules in committed evidence.
In particular, further zodiacal latitude variants, additional mundane aspects
and any converse construction beyond role exchange remain unfinished. Public
engine coordinates supply the astronomical chart, not proof of the primary
directions geometry.

## Sphere coordinates implemented in M3

The US Naval Observatory's
[Computing Altitude and Azimuth from Greenwich Apparent Sidereal Time](https://aa.usno.navy.mil/faq/alt_az)
(HTML equations for local hour angle and altitude, fetched and read
2026-10-14) supplies the modern coordinate relation. Setting geometric
altitude to zero gives the rising and setting hour angles. The authored
[M3 derivation](evidence/M3-derivations.md) obtains the ascensional difference
and semi-arcs from that relation, then expresses position as a fraction of
the appropriate quadrant. Ptolemy's temporal-hour passage above supplies the
traditional rationale for comparing proportional meridian distances.

The westward proportional coordinate in M3 is an explicitly defined library
coordinate. It does not yet implement a historical aspect rule or choose a
direct or converse construction. Neither the USNO coordinate relation nor
the analytic fixtures validate the ephemeris or predictive interpretation.

## Angle conjunctions implemented in M4

Ptolemy's angular rules on printed page 94 of the Ashmand translation above
distinguish rising, meridian and setting contacts. Placidus's westward direct
construction on printed page 57 supplies their motion sense. His converse
angle restriction appears in thesis 60 on printed page 23 and again in
canon XXXVII on printed page 105. These passages were reread for M4.

The coordinate-level solver fixes the angular significator and carries the
prepared promissor along its declination circle. It uses the appropriate
branch of the geometric horizon or meridian, with the derivation in
[M4-derivations.md](evidence/M4-derivations.md). It does not yet apply a
zodiacal projection, aspect ray or timing key. Selecting the first nonnegative
rotation, including an initial contact, and restricting every target to
crossing semi-arcs are explicit project rules, not additional historical
claims. The Placidus role-swap option is refused for all angle targets.

## Zodiacal body directions implemented in M5

Placidus, Cooper's translation above, canons XVII-XIX on printed pp. 58-60,
uses the promissor's ecliptic conjunction or ray. Canon XIX scales the
significator's meridian distance by the ratio of their semi-diurnal arcs.
Canon XXIII, printed p. 69, discusses semi-nocturnal arcs for other
significators below the horizon. The authored
[M5 derivation](evidence/M5-derivations.md) applies that proportional equation
to explicitly projected points in each quadrant. These passages were fetched
and read for M5; no published birth example was copied.

This is a restricted geometric implementation. Placidus also discusses
changing significator latitude and a separate treatment of the Sun below
the horizon. `zero-both` applies neither rule, and the API names no body
whose identity could silently change the selected semi-arc method.
Thesis 61 and canon XXXVII do not supply a converse zodiacal construction;
this solver conservatively refuses it for projected conjunctions as well.

William Lilly, *Christian Astrology*, book I (1647),
[printed pp. 108-109](https://www.worldastrology.net/wp-content/uploads/2008/12/CA-I.pdf),
defines dexter against sign order and sinister with sign order. Those names
select subtraction or addition at the promissor's longitude. The classic
aspect magnitudes, ray arithmetic and independent synthetic arcs are recorded
in the M5 derivation and fixtures. Lilly supplies branch terminology here,
not a replacement for the Placidus proportional equation.

## Mundane body directions implemented in M6

Placidus, Cooper's translation above, Part III on printed pp. 72-73,
defines mundane aspects through proportional diurnal and nocturnal arcs
independently of the ecliptic. Canon XXVII on pp. 74-76 relates the ordinary
aspect separations to mundane houses. Canon XXX on pp. 87-88 retains both
bodies' latitude for conjunction; canon XXXII on pp. 89-91 scales distance
within a house by the bodies' horary times. The moving body's time is
diurnal or nocturnal according to its place at contact. These passages and
canon XXXVII on pp. 104-105 were fetched and read for M6.

[M6-derivations.md](evidence/M6-derivations.md) translates that construction
to the library's westward proportional coordinate. The explicit branch
labels `westward` and `eastward` refer from the original promissor to the
original significator. They are project coordinate labels, not quotations
of traditional terminology. In converse the significator moves to the
promissor's fixed position or ray; the original branch relation is preserved
when the moving and fixed roles exchange. The implementation imports no
zodiacal latitude projection or aspect ray into this mundane construction.

The API uses full bodily equatorial coordinates and applies the ordinary
semi-arc model uniformly to them. Canon XXXVI's solar crepuscular treatment
on pp. 98-104, mundane parallels and other aspects are outside this subset.
Body points on axes remain body points; this does not extend converse to
angular significators. The finite hand-derived examples establish the
specified geometry on their stated inputs, not predictive validity.

## Complete hits assembled in M8

The hit API combines the existing constructions and timing keys without
introducing a historical convention. Original body labels remain visible
when mundane converse exchanges the operative roles. The ordinary semi-arc
subset applies to every label, including the Sun; the special crepuscular
treatment remains outside it.

Zodiacal angular conjunctions explicitly project the promissor to zero
ecliptic latitude before applying the M4 axis-crossing construction.
Mundane angular conjunctions retain bodily equatorial coordinates. No
aspect ray to an angle is enabled, and the existing converse angle and
zodiacal converse refusals remain. [M8-derivations.md](evidence/M8-derivations.md)
shows how the independently authored sphere arcs and timing rationals
combine into complete synthetic hits. Engine selection is checked
separately and supplies no new independent arc expectation.
