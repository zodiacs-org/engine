# Sources and provenance

This register distinguishes the adopted stellar catalogue from reference
leads that remain unapproved. Sources were retrieved or inspected on
2026-10-15. Catalogue provenance does not establish occultation accuracy;
published event references still require the review described below.

## Local engine

The implementation uses this checkout of `@zodiacs/engine` through relative
source imports. Its source, dependency and data provenance are recorded in
the repository's [licensing audit](../LICENSING.md) and [NOTICE](../NOTICE).
The engine's code is MIT; its distributed package also carries CC BY data.
Using its time and ephemeris machinery does not remove those attribution
requirements. The local [package metadata](../package.json) and engine
receipts identify the engine and pinned ephemeris versions.

This project must reuse the engine's ephemeris, frames, nutation, time basis,
rise/set machinery and crossing solver. Integration tests against those
functions establish wiring and conventions, not independent astronomical
accuracy. Existing star values in the engine do not provide a shortcut to a
new catalogue: the root licensing audit explicitly leaves questions about
their redistribution terms unresolved.

## Adopted catalogue: SAO, NASA ADC J2000 edition

The stellar input is the Smithsonian Astrophysical Observatory Star Catalog
(SAO Staff, 1966), in the NASA Astronomical Data Center J2000 edition corrected
through May 1991. The [HEASARC SAO table description](https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/sao.html)
records its origin in ADC/CDS catalogue I/131A. The
[edition description](https://cdsarc.cds.unistra.fr/ftp/cats/I/131A/ReadMe)
identifies the NASA CD-ROM documentation and subsequent CDS documentation
standardization. Cite SAO Staff and Nancy G. Roman and Wayne H. Warren Jr.,
*Documentation for the Machine-Readable Version*, NSSDC/WDC-A-R&S 89-08,
alongside HEASARC when reusing this subset.

The public-domain basis is NASA's catalogue-specific determination. Its
Technical Reports Server classifies the original catalogue volumes
([part 1](https://ntrs.nasa.gov/citations/19660017606),
[part 2](https://ntrs.nasa.gov/citations/19660017607),
[part 3](https://ntrs.nasa.gov/citations/19660017608) and
[part 4](https://ntrs.nasa.gov/citations/19660017609)) as
"Work of the US Gov. Public Use Permitted." The
[ADC documentation record](https://ntrs.nasa.gov/citations/19910021722)
carries the same determination. The
[rights receipt](data/sao-rights.json) records the exact metadata URLs,
retrieval date, byte counts and SHA-256 digests, and the
`GOV_PUBLIC_USE_PERMITTED` determination. It does not infer rights from
legacy Boolean metadata fields or a generic government-site licence link.

The unchanged [NASA CD-ROM documentation](data/sao-documentation.txt) is
included as requested by its Introduction, printed page 1-1. It was fetched
from [CDS's copy](https://cdsarc.cds.unistra.fr/ftp/I/131A/doc.txt); its digest
is in the rights receipt. Its Procedure, printed page 1-3, and
Acknowledgments, printed page 4-9, attribute the computed J2000 positions
and proper motions on the FK5 system to Clayton A. Smith at USNO. The
related [NASA PDF](https://ntrs.nasa.gov/api/citations/19910021722/downloads/19910021722.pdf)
was also inspected and hashed; the compact CD-ROM text is the retained copy.

SAO is a compilation, and its documentation identifies contributions and
corrections from other catalogues. The retained magnitude, proper-motion
source, source-catalogue and duplicity/variability codes preserve that
provenance. Table 16 of the documentation identifies magnitudes imported
from SIMBAD for SAO 84129 and SAO 92548; these records are excluded. Imported
DM, HD and GC cross-identifications, HD component codes and spectral types
are omitted. This adoption does not declare other NASA- or CDS-hosted
catalogues public domain.

The committed [source records](data/sao-source.json) retain selected fields
from HEASARC without substituting values from another stellar catalogue.
Their receipt records the TAP request, retrieval and selection. The
[generator](scripts/catalogue.mjs) normalizes these compact records into
`.generated/catalogue.json`; generated output and downloaded bulk inputs
remain ignored. The [alias register](data/sao-aliases.json) separately cites
the identities of the requested named stars and Pleiades members. An alias
does not import additional astrometry.

| Retained field | Meaning and convention |
| --- | --- |
| `name` | SAO identifier, used as the stable catalogue identity. |
| `ra`, `dec` | J2000 epoch and equinox coordinates on the FK5 system, in degrees. The query retains the table's native epoch. HEASARC warns that its selectable precession is not astrometrically accurate and does not apply proper motion. |
| `vmag`, `ref_vmag` | Catalogue visual magnitude and its source code. This is heterogeneous visual photometry; combined or variable magnitudes retain their source code. It is not asserted to be uniform modern Johnson V photometry. |
| `proper_motion_ra_fk5` | Change in right ascension, in seconds of time per year, without a declination cosine factor. It is not the similarly named FK4 field. |
| `proper_motion_dec_fk5` | Change in declination, in arcseconds per year, on the FK5 system. Missing motion remains missing. |
| `remarks` | Original duplicity/variability code. An absent warning does not establish that the source is a single star. |
| `ref_source_cat`, `ref_proper_motion` | Original source-catalogue and proper-motion provenance codes, decoded in the retained documentation. |

The [TAP VOTable field descriptor](https://heasarc.gsfc.nasa.gov/xamin/vo/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=application%2Fx-votable%2Bxml&QUERY=SELECT%20TOP%201%20name%2Cproper_motion_ra_fk5%20FROM%20sao)
labels `proper_motion_ra_fk5` as `arcsec/yr`. This conflicts with the
HEASARC table description and the retained NASA documentation's field table,
which specify seconds of time per year. The importer follows those original
field definitions and treats the TAP unit label as a metadata discrepancy.

SAO does not supply parallax or radial velocity in these records. Unknown
values must not become measured zeros. Separate catalogue components remain
separate records; a combined magnitude or unresolved system does not justify
inventing component positions or a binary orbit. The selection and missing
value policies are enforced by the generator's catalogue tests. Selection
describes this catalogue subset, not proven completeness for lunar
occultations throughout the engine's time span.

## Catalogue alternatives not adopted

| Source | Evidence and decision |
| --- | --- |
| [ESA Hipparcos and Tycho catalogues](https://www.cosmos.esa.int/web/hipparcos/catalogues) | The search-indexed licence section specifies CC BY-NC 3.0 IGO; a direct page request was refused. This does not meet the requested public-domain basis. No records adopted. |
| [NASA HEASARC Bright Star Catalog](https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html) | HEASARC records Yale/ADC/CDS origins. The [Debian Yale catalogue copyright record](https://sources.debian.org/copyright/license/yale/5.0.95-3/) reports author copyright and ADC correspondence restricting modified redistribution. It therefore supplies contrary evidence to an unqualified public-domain claim. No records adopted. |
| [NASA's BSC portal metadata](https://data.nasa.gov/dataset/bright-star-catalog) | Its generic government-work licence link also appears in the [Hipparcos portal record](https://data.nasa.gov/dataset/hipparcos-main-catalog), despite the ESA terms. The linked [USAGov explanation](https://www.usa.gov/government-copyright) distinguishes government works from protected third-party material on government sites. This generic metadata is not the rights basis for the selected catalogue. |
| [USNO ICRS products](https://crf.usno.navy.mil/icrs) and [USNO Bright Star Catalog paper](https://arxiv.org/html/2204.09080v1) | The solution incorporates Hipparcos intermediate astrometry and copies some Hipparcos fields. Field-specific rights were not settled during this review. No records adopted. |

## Astrometric reduction references adopted in M3

The stellar reduction implements vector geometry with the engine's clock,
Earth state and frame rotations. Its proper-motion and observer-parallax
model follows the description of [ERFA pmpx](https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/pmpx.c),
which cites the 1984 Astronomical Almanac, pages B39-B41, and Urban and
Seidelmann, *Explanatory Supplement to the Astronomical Almanac* (2013),
section 7.2. [ERFA fk5hip](https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/fk5hip.c)
and [fk52h](https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/fk52h.c)
document the FK5 orientation and spin, citing Mignard and Froeschle,
*Global and local bias in the FK5 from the Hipparcos data*, A&A 354,
732-739 (2000). The ERFA descriptions were fetched and read; this record
does not claim inspection of the cited book or article.

[ERFA ab](https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/ab.c)
documents relativistic aberration and its additional solar-potential term.
The workbench omits that potential term and gravitational deflection and
names both omissions. The independent full reduction uses
[epv00](https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/epv00.c)
and [pnm06a](https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/pnm06a.c)
for the Earth state and true equator. It retains the reference ephemeris's
out-of-range warnings. It substitutes no other catalogue measurements.

The compact [published validation fixture](test/fixtures/erfa-published.json)
transcribes inputs and expected values from
[ERFA's versioned test source](https://raw.githubusercontent.com/liberfa/erfa/v2.0.1/src/t_erfa_c.c).
Its receipt gives the URL, function locators, retrieval date, size and digest.
These are retained reference-source values, not project-generated expectations.
They retain the [ERFA BSD notice](test/fixtures/ERFA-NOTICE.txt) and are used
only in tests. ERFA and its Python wrapper are external development tools;
no ERFA implementation, ephemeris coefficient table or Hipparcos catalogue
is vendored or bundled. The frame name Hipparcos here identifies a coordinate
system, not an imported stellar dataset.

[The preregistration](test/fixtures/ASTROMETRY.md) fixes tolerances before
comparison. The [generator](scripts/astrometry-reference.py) reads the fixed
case register and the existing SAO inputs, calls separately installed pinned
PyERFA, and writes all generated results to the ignored `.generated/` folder.
Its receipt pins inputs and generator bytes. The source-verification mode
checks upstream bytes and every retained published value; ordinary calculation
and tests remain offline. Passing these reductions does not establish SAO
position accuracy or occultation timing accuracy.

## Independent event references adopted in M4

[The event contract](test/fixtures/events/EVENTS.md) and its
[source register](test/fixtures/events/sources.json) freeze development and
held-out events before any workbench event comparison. The register retains
retrieval URLs, source-page locators, original byte receipts, clock conventions,
observer inputs, rights evidence and model qualifications. The
[fixture notice](test/fixtures/events/NOTICE.txt) credits the source authors.

The US Naval Observatory's *The American Ephemeris and Nautical Almanac for
1923*, published by the US Government Printing Office in 1921, supplies
Aldebaran contact predictions and a worked Boston example. The
[Internet Archive scan](https://archive.org/details/in.ernet.dli.2015.515803)
was inspected at the page locators retained in the register. It is a US
federal-government work and was published before 1931. Its preface names
Brown's lunar tables and the historical stellar catalogue; its explanatory
pages specify the sphere and Earth constants. The Washington station and
historical coordinate/height conventions remain qualified. No modern observed
contact accuracy follows from agreement with these historical predictions.

The National Astronomical Observatory of Japan supplies
[conjunction tables](https://eco.mtk.nao.ac.jp/koyomi/cande/),
[local planetary occultation predictions](https://eco.mtk.nao.ac.jp/cgi-bin/koyomi/occuly_p_en.cgi),
sparse numerical outline nodes and approximate outreach appulse times. Exact
queries and article URLs are in the register. The
[calendar office use terms](https://eco.mtk.nao.ac.jp/koyomi/site/) allow use
with credit, and [NAOJ's terms](https://www.nao.ac.jp/terms/copyright.html)
cover research, publications and applications. These references are not
represented as a public-domain catalogue or relicensed as MIT. Only compact
numeric transcriptions and short source excerpts are retained, with no map
code, provider keys or imagery.

NAOJ documents its
[JPL DE ephemeris lineage](https://eco.mtk.nao.ac.jp/koyomi/topics/html/topics2026_1.html)
and frame conventions. Apparent geocentric coordinates are inferred from
those institutional almanac conventions; the conjunction CGI does not expose
its complete reduction. Its requests explicitly select TT. The occultation CGI and outreach
pages do not identify their executable or exact ephemeris release. This is
institutional provenance, not an invented per-result software receipt. The
local predictions retain fixed delta-T requests and synthetic stations;
source UT, radius, refraction, planet shape and height-datum uncertainties
are recorded. Outline curve names are a documented inference from source
ordering and independent NAOJ local contact queries. No Swiss Ephemeris
source, data or per-case output was adopted.

The outreach times establish only coarse occurrence. They cannot validate
precise geocentric minimum-separation times. Historical catalogue differences,
sparse outline sampling and undocumented model details also limit claims.
The frozen thresholds and source-integrity tests establish an acceptance
contract, not measured occultation accuracy. Additional independent evidence
is required for the gaps listed in the event contract.

## Radius facts adopted for M7 screening

The [JPL Solar System Dynamics Planetary Physical Parameters table](https://ssd.jpl.nasa.gov/planets/phys_par.html),
read on 2026-10-15, supplies the nominal equatorial radii used for the
planetary screening spheres and the Earth enclosing sphere. The locator is
the Equatorial Radius column in the planet and dwarf-planet tables. Every
adopted value cites reference D: B. A. Archinal et al., "Report of the IAU
Working Group on Cartographic Coordinates and Rotational Elements: 2015",
Celestial Mechanics and Dynamical Astronomy 130:22 (2018).
[The source receipt](data/radii-source.json) retains the retrieved page's
digest and length, individual numeric facts, units, locator and attribution.
The page prose, layout and publication are not vendored or relicensed; these
are individually transcribed scientific measurements, not a copied catalogue.

Equatorial radius is distinct from the table's volume-equivalent mean
radius. The adopted values are nominal, with no enlargement for the table's
reported uncertainties. An equatorial-radius sphere is a screening model;
it does not resolve oblateness, a pressure surface, atmospheric extinction,
planetary rings or detailed contact limbs. These values were not selected
from event residuals. `test/occultations.test.ts` checks the transcriptions
and source receipt separately from contact references.

The Earth value equals the semimajor axis already used by
`../src/calc-reduce.ts`. Adding the maximum height accepted by this package's
observer validation gives the enclosing sphere. Actual topocentric positions
continue to use the engine's IERS ellipsoid. The Moon radius remains the
engine's `SKY_RADII_KM.Moon`, whose source is documented in
`../LICENSING.md`; the astronomical unit comes from the pinned dependency
used by the engine. The generated bundle carries the radius source receipt
alongside the existing engine and SAO attribution.

## Contact sky models and M9 references

Position, observer, time, sidereal rotation and phase calculation remain in
the adjacent engine. The lunar and solar radii and constant rise/set
refraction allowance come from `src/sky.ts`, with the attribution already
in the engine's LICENSING.md and NOTICE. The local tangent and horizontal
projections are derived explicitly in DESIGN.md and checked against analytic
constructions, not fitted contact output.

The altitude-dependent refraction function is imported from the already
pinned MIT dependency, not transcribed from a new source. Its
[versioned source](https://raw.githubusercontent.com/cosinekitty/astronomy/v2.1.19/source/js/astronomy.ts),
function `Refraction` and preceding documentation, was read on 2026-10-15.
It documents a nominal sea-level correction and the Saemundsson expression.
The workbench exposes its own lower-altitude reporting cutoff and clamps
negative lift near the zenith, as recorded in the geometry tests. No new
dependency, refraction table or independently validated atmospheric model
is supplied. The generated bundle retains the dependency's MIT notice.

`test/fixtures/sky/usno-sky.json` contains compact factual extracts from the
US Naval Observatory Astronomical Applications API. Each request has its
URL, selected JSON fields, API version and raw response digest. The companion
`acquire.py` retrieves only those requests and prints an extract without
importing this workbench. The retained values are published numerical
predictions, not measured atmosphere or limb brightness. As US Government
works they follow the public-domain basis already recorded for this USNO
service in the root LICENSING.md. The source descriptions, locators and
pre-comparison gates are in
[the sky preregistration](test/fixtures/sky/PREREGISTRATION.md).

The [USNO celestial-navigation documentation](https://aa.usno.navy.mil/data/celnav)
defines the supplied geocentric altitude and parallax correction; their
difference is used for the topocentric solar-center check. The
[rise/set definitions](https://aa.usno.navy.mil/faq/RST_defs) establish the
standard upper-limb horizon convention. The existing independently sourced
root rise/set fixture is read without modification. The
[primary-phase definitions](https://aa.usno.navy.mil/faq/moon_phases) support
the lunar longitude checks. No photographs, map assets or page prose are
vendored. These remain development references, separate from the original
held-out events.

## Event leads not adopted

[IOTA's Occult software terms](https://occultations.org/sw/occult/occult4.htm)
restrict redistribution of software output for some purposes. The IOTA
contact and limit pages previously listed as leads were not adopted as
numeric fixtures. Institutional affiliation alone would not establish a
prediction's computational lineage. No proprietary atlas was consulted.

IMCCE conjunction material was inspected as a potential independent source,
but redistribution permission for its retained material was not established.
NASA SKYCAL did not provide sufficient event-convention and computational
lineage evidence for the proposed fixtures. Neither source supplies retained
numerical expectations. Historical USNO planetary rows were also excluded
because their center-versus-disk contact meaning was unresolved.
