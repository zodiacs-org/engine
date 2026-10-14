# Convention source register

These sources were fetched and read for the foundation milestone. Their
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
aspects. A future solver must refuse those combinations under this construction.
Accepting a convention object alone does not permit every contact.

The initial `zodiacal/zero-both` policy is a project restriction to ecliptic
projections. `mundane/retain-both` preserves the bodies' latitude. These
choices do not exhaust traditional latitude treatments. Aspect branches and
full equations require further source and numerical checks in their milestones.

## Timing keys remain separate from geometry

William Lilly, *Christian Astrology* (London, 1647), book III,
[chapter CLXVI, printed pp. 709-713](https://www.worldastrology.net/wp-content/uploads/2008/12/CA-III.pdf),
discusses Ptolemy's and Naibod's keys. The `naibod` name reserves a distinct
fixed-rate key; its exact rate and arithmetic will be sourced and tested in
the timing milestone before any age is returned.

Lilly attributes a solar-equatorial method to Antonius Maginus: compare the
Sun's right ascension at birth with its right ascension at the same hour on
the following day, then use that difference as the fixed annual arc. This
is the planned `solar-equatorial-birth-day` key. It is not a longitude solar
arc or a continually changing progressed-Sun key. The modern time scale,
day interval and angle unwrapping must be specified and tested separately.

Maginus's own cited text has not been read here; this attribution is through
Lilly. Lilly's directional geometry is not used as a substitute for the
Placidus semi-arc construction.

## Remaining source work

Before enabling a numerical method, its milestone must settle the corresponding
equations, coordinate branch, domain and refusal rules in committed evidence.
In particular, zodiacal latitude variants, aspect rays, timing arithmetic and
any converse construction beyond role exchange remain unfinished. Public
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
