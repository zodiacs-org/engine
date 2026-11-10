# Sources and implemented conventions

The sources below support the implemented geometry, phase, arcus and crescent
checks. Each implementation records its units, coordinate conventions and
domain. A cited definition or successful formula comparison does not establish
sighting predictive accuracy.

## Geometry checks

NASA/JPL Solar System Dynamics, *Horizons System*, observer-table quantities
for apparent equatorial, horizontal and ecliptic coordinates, range and
Sun-observer-target separation:
<https://ssd.jpl.nasa.gov/horizons/manual.html>.
The source and Sun/Moon responses were read on 2026-10-14. The small
[geometry fixture](test/fixtures/geometry-reference.json) preserves exact
requests, provider metadata, units, coordinates and predeclared tolerances.
[Its notes](test/fixtures/README.md) record the source/engine frame and
correction differences and the comparison's scope.

The existing `../src/fixtures/horizons-2020.ts` supplies apparent geocentric
longitudes for the visible planets at the same selected epoch. Its header
records the original retrieval date and identifies the Horizons quantity;
the root licensing record covers those numerical fixtures.

ERFA release v2.0.1, validation routine `t_hd2ae`:
<https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/t_erfa_c.c>.
Its horizontal-coordinate definition is in
<https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/hd2ae.c>.
Read on 2026-10-14. The geometry fixture records the example, locator and
degree-input comparison gate; its notes retain ERFA's copyright and BSD
notice. This checks the local rotation independently of the ephemeris.

## Phase geometry

US Naval Observatory, *Phases of the Moon and Percent of the Moon Illuminated*,
paragraph beginning "The relationship of the Moon's phase":
<https://aa.usno.navy.mil/faq/moon_phases>.
Read on 2026-10-14. Defines primary lunar phases by the difference of apparent
ecliptic longitudes. `synodicPhase` uses that longitude difference, signed
in `(-180, 180]`, for the Moon and visible planets. Its morning/evening labels
are this library's longitude convention, not a sighting or horizon claim.
`test/phase.test.ts` checks the published lunar angle definitions and the
library's signed wrap, conjunction and opposition conventions.

NASA/JPL NAIF, *phaseq_c: Phase angle quantity between bodies centers*,
"Detailed Input" (`abcorr` value `NONE`) and "Particulars":
<https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/cspice/phaseq_c.html>.
Read on 2026-10-14. Defines the angle at the target between the illuminator
and observer, and distinguishes geometric states from light-time-corrected
states. Our illumination uses geometric states at a common instant supplied
by the engine's calculation entry, from the geocentre or observing site.
No NAIF code, kernels or output are used.

Sheldon M. Smith, James B. Pollack, Lawrence P. Giver, Jeffrey N. Cuzzi and
Morris Podolak, *Inhomogeneous Models of the Venus Clouds Containing Sulfur*,
NASA Technical Memorandum 78558 (April 1979), printed p. 4, opening paragraph:
<https://ntrs.nasa.gov/api/citations/19790014817/downloads/19790014817.pdf>.
Read on 2026-10-14. Identifies `(1 + cos(phi)) / 2` as the illuminated fraction
of the disk area, separately from reflectivity. Only the formula is used;
no report prose, figures or tables are copied. `test/phase.test.ts` checks
the formula using independently constructed triangles and exact identities.

Our triangle construction is elementary geometry: for observer-Sun distance
`R`, observer-target distance `d`, and geometric elongation `e`, the components
of target-to-Sun along and across target-to-observer are `d - R*cos(e)` and
`R*sin(e)`. Their `atan2` is the phase angle at the target, and their hypotenuse
is the Sun-target distance. The implementation scales distances and uses
equivalent half-angle arithmetic near coincidence. This construction assumes
a spherical disk and omits shadows, surface shape and travel time.

NASA/JPL *Horizons System*, observer quantities 10, 23, 31 and 43:
<https://ssd.jpl.nasa.gov/horizons/manual.html>.
Definitions and responses read on 2026-10-14. Quantity 43's `phi` is the true
phase in retarded geometry, whereas quantity 24 also includes down-leg
stellar aberration. The phase tests use `phi`, along with the disk percentage,
apparent separation and apparent longitude; they allow for our simultaneous
geometric illumination convention. [The phase fixture](test/fixtures/phase-reference.json)
records the source rows and gates fixed before running the comparison. Its
selected instant is not evidence of accuracy across the engine's date span.

## Horizon events already delegated to the engine

US Naval Observatory, *Rise, Set, and Twilight Definitions*, particularly
"Technical Definitions and Computational Details":
<https://aa.usno.navy.mil/faq/RST_defs>.
Read on 2026-10-14. The engine's sky guide explains its implementation and
the distinction between its variable solar radius and USNO's standard
solar radius. Refraction and the local horizon affect observed times.

The foundation comparison reuses a committed reference, not engine output:
`../src/sky/fixtures/usno-rstt.json`, whose source records retrieval on
2026-09-29 from the USNO *Complete Sun and Moon Data for One Day* API. The
tested row's URL is
<https://aa.usno.navy.mil/api/rstt/oneday?date=2024-06-21&coords=38.89,-77.03&tz=0>.
The API response could not be freshly retrieved in this session; the test
uses that existing attributed fixture. `test/engine.test.ts` states the
tolerance and exact comparison scope. The root licensing record identifies
the fixture as a US Government work.

The USNO definition page was read again for observing windows on 2026-10-14,
especially the "Horizon", "Transit" and "Twilight" paragraphs. It distinguishes
meridian transit from a horizon crossing and notes that several transits may
occur between rise and set at high latitude. The implemented window partition
uses engine events with airless centre conventions, rather than USNO's usual
refracted upper-limb sunrise. It does not implement the twilight thresholds.
Dividing candidate intervals at alternating upper/lower solar transits is
this library's explicit scheduling convention, not a published visibility
criterion. Constructed event schedules in `test/window-partition.test.ts`
check the interval arithmetic independently; `test/windows.test.ts` checks
engine delegation, scope, clipping and budget accounting.

## Planetary visibility

These sources were fetched and the cited sections read again on 2026-10-14
for the arcus criterion and custom screen.

C. Schoch, "The 'Arcus Visionis' of the Planets in the Babylonian
Observations", *Monthly Notices of the Royal Astronomical Society* 84
(1924), pp. 731-734:
<https://articles.adsabs.harvard.edu/pdf/1924MNRAS..84..731S>.
Printed p. 731 defines airless solar depression at the body's horizon
crossing. `horizonArcusVisionis` implements that definition with a caller's
threshold. The selected magnitude-zero first/last values from the lower
table on p. 734 check criterion arithmetic in
[visibility-reference.json](test/fixtures/visibility-reference.json).
The source's clear-sky calibration is not a universal or lunar calibration.

Bradley E. Schaefer, "Astronomy and the Limits of Vision", *Vistas in
Astronomy* 36 (1993), pp. 311-361:
<https://www.uai.it/pianeti/wp-content/uploads/2021/03/ppr_Sch93-1.pdf>.
Section 2.3, printed p. 315, equation (2b), gives Rozenberg's relative air
mass `X = 1 / (cos(Z) + 0.025 exp(-11 cos(Z)))`, with apparent, refracted
zenith distance `Z`. `rozenbergAirmass` uses the equivalent sine of apparent
altitude. Selected rounded values in Table 3 on p. 316 independently check
this formula. Section 2.4, pp. 318-319, equation (8a), gives scalar attenuation
`kX`; accurate near-horizon extinction instead needs the component treatment
of equation (8b).

`arcus-visionis-altitude/1` is our explicit custom extension: independent
minimum body-altitude and solar-depression gates, optionally combined with
that rough scalar attenuation and a caller's visual magnitude limit. Its
photometry requires an explicit refraction correction. This is not Schaefer's
sky-brightness or limiting-vision model. It has no fitted planetary defaults
and rejects lunar point-source photometry. The reference tests check formulas
and criterion arithmetic, not historical observations or predictive accuracy.

## Heliacal transitions

Schoch (1924), cited above, printed pp. 731-734, fetched and read again for
the search implementation on 2026-10-14. Page 731 defines heliacal rising
as first morning visibility and heliacal setting as last evening visibility
for outer planets. Page 732 distinguishes all first/last morning/evening
phenomena for Mercury and Venus. Page 733 explains why first-appearance
and last-appearance thresholds differ; `heliacalEvents` therefore requires
a separate explicit threshold for each requested appearance.

The implementation samples the page 731 horizon criterion at engine target
rises or sets, including failures in daylight. Solar meridian halves and
the requirement for consecutive same-period opportunities are this library's
search conventions, not an additional calibration from Schoch. No threshold
table is fitted to magnitude, weather, latitude or epoch. The selected
published values already in `test/fixtures/visibility-reference.json` are
applied to synthetic schedules in `test/heliacal-reference.test.ts`;
their exact criterion arithmetic checks the search without treating engine
output as a reference. Those tests do not measure historical date agreement.

Schoch supplies no lunar calibration here. Applying the same horizon
arithmetic to first-evening or last-morning Moon geometry is an explicitly
named extension. It does not substitute for the crescent models below.

## Lunar crescents

B. D. Yallop, *A Method for Predicting the First Sighting of the New
Crescent Moon*, NAO Technical Note 69, June 1997, updated April 1998:
<https://webspace.science.uu.nl/~gent0113/islam/downloads/naotn_69.pdf>.
Fetched and the relevant page images read on 2026-10-15. Implemented as
`evaluateYallop`, `yallopCategory` and `yallopBestTime`:

- Section 2, printed p. 1, defines airless geocentric centre separation
  (ARCL) and Moon-minus-Sun altitude difference (ARCV).
- Equations (3.8)-(3.10), printed p. 3, define semidiameter from parallax,
  its altitude-dependent correction, and crescent width. Despite calling
  this width topocentric, the equation uses geocentric ARCL. The code keeps
  that convention and accepts true separation, rather than using equation
  (2.1), which is not a general spherical identity away from the horizon.
- Equation (4.1), printed p. 4, supplies the evening best-time lag fraction.
  Millisecond rounding and rejecting nonpositive lag are explicit library
  conventions. No morning timing formula is inferred.
- Equation (6.1), printed p. 11, defines q; Table 5, printed p. 12, gives
  its category inequalities, with equality assigned to the less-visible
  category. The elongation remarks explain the calibration and do not add
  separate classifier conditions.
- Printed pp. 5 and 12 discuss site height, extinction and observations
  outside the model's expected behavior. This implementation exposes the
  fixed empirical model and provides no atmospheric adjustment.

The report carries a permission notice. Our code and synthetic
[worked fixtures](test/fixtures/yallop-reference.json) are original formula
implementations and independent arithmetic on invented geometry. No source
program, prose or observation database is copied.
The [fixture notes](test/fixtures/YALLOP.md) and committed generator describe
the comparison gates. These are criterion implementation checks, not
sighting records or a calibration validation. Geocentric ARCV must not be
silently replaced with Odeh's topocentric definition.

For the final end-to-end comparison, Appendix A, printed p. 16 (PDF page
17), was fetched and inspected as an image on 2026-10-15. The separate
[published fixture](test/fixtures/yallop-published.json) retains selected
numerical facts for London on January 28-29 and August 22-23, 1998:
sunset, moonset, best time and category. The source table contains calculated
predictions, not observation records. [Its notes](test/fixtures/YALLOP-PUBLISHED.md)
record the source digest, explicit sea-level assumption, GMT/UTC convention,
predeclared comparison gates and the limited numerical extraction's rights
scope. [Tests](test/yallop-published.test.ts) compare full engine-backed
library and CLI calculations with these selected examples. No page image,
complete table or source program is redistributed. The
[measurement report](docs/evidence/README.md) gives results for this scope
without extending them to other dates, models or observed sightings.

Mohammad Sh. Odeh, "New Criterion for Lunar Crescent Visibility",
*Experimental Astronomy* 18, pp. 39-64,
DOI [10.1007/s10686-005-9002-5](https://doi.org/10.1007/s10686-005-9002-5):
<https://astronomycenter.net/pdf/2006_cri.pdf>.
Fetched and the relevant page images read on 2026-10-15. The journal volume
is marked 2004; the PDF carries a Springer 2006 notice. `ODEH_MODEL` uses
the identifier `odeh-2006/1`. Implemented as `evaluateOdeh`, `odehCategory`
and `odehBestTime`:

- Section 5, printed p. 43, specifies airless topocentric ARCV and
  topocentric crescent width. Equation (2), printed p. 61, uses width in
  arcminutes and supplies the residual and inclusive category boundaries.
  This API takes width directly, without deriving it from Yallop's
  geocentric separation or applying a separate elongation limit.
- Equation (1), printed p. 43, adopts Yallop's evening best-time rule.
  The helper reuses its arithmetic with Odeh-specific metadata. The
  millisecond rounding and nonpositive-lag rejection are library choices.
- The category meanings and atmospheric limitations appear on printed
  pp. 43 and 61. The code preserves optical-aid distinctions and supplies
  no weather adjustment or sighting guarantee.

The [fixture](test/fixtures/odeh-reference.json) and its
[notes](test/fixtures/ODEH.md) record original Decimal worked calculations
and selected rounded criterion boundaries from Table V. The
[tests](test/odeh-reference.test.ts) enforce predeclared arithmetic gates.
No observation database, source program or publication prose is copied.
`evaluateCrescent` selects a model explicitly and retains its distinct
geometry, residual, category meanings and pure-function receipt scope.

Both calibration tables include morning observations: Yallop section 5,
Table 4, and Odeh section 6, Table VI, identify morning/evening cases. The
search's explicitly selected morning timing extension is described under
*Crescent search geometry and timing conventions* below. The presence of
morning observations alone does not validate a particular morning search.

## Event terminology

Joseph Harris, *The Description and Use of the Globes, and the Orrery*,
eleventh edition (1773), printed p. 96, section III, "Of the Poetical rising
and setting of the Stars", and Problem XLIII, pp. 171-172:
<https://www.gutenberg.org/files/61683/61683-h/61683-h.htm#Page_96>.
Fetched and read on 2026-10-15. The definition assigns cosmical to either
target crossing at sunrise and acronical to either target crossing at
sunset. Problem XLIII separately constructs each pairing on a celestial
globe. Our `acronychal` spelling follows the modern terminology. The original
work is public domain; no source program, astronomical table or lengthy
prose is copied. [The fixture](test/fixtures/horizon-terminology.json)
encodes the directions independently and records the source and scope.

`horizonPhenomena` applies those geometric pairings to engine Sun/target
events. The same-half ownership, signed elapsed lag and consecutive-pair
order-reversal bracket are this library's scheduling choices, not Harris's
historical calculation or a claim of an exact simultaneous instant. Both
source times remain explicit. No visible rising/setting criterion is
implied. `test/phenomena-reference.test.ts` applies the published directions
to invented schedules and independently specified lag arithmetic; it does
not use an engine result as its expected value or claim historical date
agreement.

Francesca Schironi, "The Language of Astronomy", in *Coming to Terms:
Approaches to (Ancient) Terminologies* (2024), section 4.4, pp. 34-35:
<https://edoc.hu-berlin.de/server/api/core/bitstreams/07b8091d-970b-4c94-8013-4804d2f87a78/content>.
Fetched and read on 2026-10-15. This historical terminology research
documents inconsistent use of acronychal and cosmical names, including
visible and invisible phenomena. The edition's copyright page gives 2024;
the earlier roadmap date has been corrected. Every result records the
actual Sun/body rise/set pairing and the chosen terminology convention.
The names alone are not a sufficient definition.

## Evidence to add with each model

Before running a comparison, commit or write the selected source inputs,
their units, the independent expected result and the tolerance rationale.
Use independently evaluated criterion arithmetic for implementation checks,
and small attributed published observations only where redistribution is
permitted. Distinguish those checks from engine parity, numerical invariants
and predictive-performance measurements. No Swiss Ephemeris material may
supply an expectation.

## Crescent search geometry and timing conventions

The Yallop and Odeh sections cited above were read again on 2026-10-15 for
the search adapter. Yallop equations (3.8)-(3.10), printed p. 3, retain
geocentric elongation in the width formula. `crescentGeometry` supplies
equatorial horizontal parallax from the geocentric Moon range; it leaves
Yallop's own altitude correction to `evaluateYallop`. The right-triangle
construction is `asin(Earth equatorial radius / Moon geocentric distance)`.
The USNO *Astronomical Almanac Glossary*, entry "parallax, horizontal",
defines the horizon case used in that construction:
<https://aa.usno.navy.mil/faq/asa_glossary>.
Fetched and read on 2026-10-15.

Odeh section 4, printed p. 41, defines width along the lit lunar diameter;
section 5, pp. 43 and 61, requires topocentric width but does not give its
calculation formula. The adapter explicitly adopts a distant-Sun
angular-width approximation: topocentric semidiameter multiplied by
`1 - cos(topocentric elongation)`, evaluated with half-angle arithmetic.
This adapts the elongation-width relation in Yallop equation (3.10) to
topocentric separation and an angular radius from topocentric range. It is
a declared library approximation, not a reproduction of Odeh's source
software. No finite-Sun phase angle or `phase()` disk fraction is silently
substituted. Both models continue to use airless centre altitudes.

The adapter's Earth radius matches the engine's IERS2003 observer
ellipsoid. IERS *Conventions (2010)*, Technical Note 36, Table 1.1, printed
p. 18, gives the same equatorial radius, `6378136.6 m`:
<https://iers-conventions.obspm.fr/content/tn36.pdf>.
Its lunar radius is the engine's exported `SKY_RADII_KM.Moon`, `1737.4 km`,
also listed in NASA/JPL *Planetary Satellite Physical Parameters*, Moon
row, Mean Radius column:
<https://ssd.jpl.nasa.gov/sats/phys_par/>.
The au conversion, `149597870700 m`, is the astronomical-unit row of
NASA/JPL *Astrodynamic Parameters*:
<https://ssd.jpl.nasa.gov/astro_par.html>.
All three sources were fetched and read on 2026-10-15. The constants and
independent constructed right-triangle and width identities are enforced
by `test/crescent-geometry.test.ts`. They check the conversion arithmetic,
not ephemeris accuracy or historical visibility agreement.

Yallop equation (4.1), printed p. 4, and Odeh equation (1), printed p. 43,
state the evening rule. Neither gives a morning rule in the cited text.
Morning rows in their observation tables do not establish a morning
algorithm. The search's explicitly requested `mirror-evening` extension
uses sunrise minus four ninths of the positive sunrise-minus-moonrise lag.
It is an unvalidated time-reversal convention, separate from the published
evening rule. The horizon pair uses the engine's upper-limb crossings and
standard horizon refraction, with the chosen options retained in the
result. The USNO rise/set definition cited above supports that horizon
convention; it does not establish the original calibration software's
exact horizon settings. Altitudes evaluated at the selected time remain
airless, as required by the criteria.
