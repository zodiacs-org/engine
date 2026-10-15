# M4 event reference preregistration

Frozen on 2026-10-15, before any workbench event implementation or comparison.
The fixtures contain transcribed independent published predictions, not this
package's prior results. `development.json` and `held-out.json` separate entire
events, including alternate stations and related conjunction/contact/outline
cases. The same annual source page can contain both partitions. Reading a
source to transcribe it is not evaluating the workbench against it.

`freeze.json` pins these files and this contract. A mistaken transcription
must be withdrawn with a reason and replaced under a new id. Do not edit a
value, remove a failing case, change its partition, or increase a threshold
in response to workbench residuals. A changed upstream page requires review,
not automatic replacement. Add a new independently preregistered case when
coverage is missing. The tests protect the frozen bytes, partition assignments,
complete check sets, clocks and acceptance arithmetic.

## What is accepted

The numerical maxima below are engineering acceptance criteria for this
finite corpus. They are not measured errors, reference uncertainties, or
proved bounds. Unknown model differences have not been assigned zero.
Rounding allowances are already included in each maximum; do not add them
again. Each individual check must pass, not an average or percentile.

| Reference and span | Maximum absolute error | Qualification |
| --- | ---: | --- |
| USNO Aldebaran predictions, January and April 1923 | 120 s per contact | Historical smooth-sphere model and qualified station inputs |
| NAOJ Saturn, 2024-05-31; Mars, 2025-01-14 | 120 s per contact or local minimum | Source UT, fixed delta-T, undocumented details retained |
| Same NAOJ planetary events, duration of each disk crossing | 10 s | Independently checks external/internal contact distinction despite a common timing offset |
| Contact position angles from those sources | 2 degrees | Shortest circular difference, north through east |
| NAOJ Moon altitude at the selected planetary contacts | 0.5 degrees | Source altitude includes refraction; compare with the stated refracted model |
| NAOJ Moon-Mars RA/ecliptic conjunctions, January and November 2024 | 180 s | Printed to minutes, TT |
| NAOJ Jupiter-Saturn 2020, Venus-Jupiter 2022, Mars-Jupiter 2024 conjunctions | 3600 s | Printed to hours, TT; coarse agreement only |
| NAOJ outreach appulses for the same planet pairs | 3600 s | Approximate hours in Japan Standard Time; coarse occurrence only |
| NAOJ Saturn/Mars map nodes for the local events above | 1 degree latitude | At each exact source longitude, matched north/south and inner/outer curve |

These values are enforced by `event-references.test.ts` and the reusable
`assertReferenceChecks` gate. Its synthetic self-tests prove rejection of
omitted/extra results, nonfinite numbers and individual excesses even when
an average would pass. They do not claim that an event solver passed.
The additional disk-duration checks reject a center-only implementation
returning the same time for both edges. M8 must still test geometric contact
semantics, ordering, partial-only events, tangencies and clipped windows.

The angular outline maximum is wider than some inner/outer separations.
M10 must independently require distinct, correctly ordered disk boundaries
and test contact/tangency geometry at their longitudes. Passing these coarse
latitudes alone does not establish that distinction.

## Source and clock handling

`sources.json` records retrieval URLs, byte lengths and SHA-256 receipts,
rights and lineage. USNO scan pages were visually checked; OCR only located
them. The retained numbers are source transcriptions, not newly generated
reference predictions. Downloaded documents, maps, scans and any future
comparison results stay ignored. Keep `NOTICE.txt` with these fixtures.

USNO's *American Ephemeris and Nautical Almanac for 1923* was published by the
US Government Printing Office in 1921. Its preface credits the Nautical
Almanac Office with the occultations, and names Brown's lunar tables, its
historical Zodiacal Stars catalogue and Bessel/Chauvenet geometry. The
contact equation uses a lunar radius of 0.2725 Earth equatorial radii;
its terrestrial radius is 6378.388 km and flattening 1/297. These are source
constants, not fitted corrections to the engine. The derived 1738.11073 km
sphere differs from the engine's 1737.4 km sphere by 0.71073 km. The tests
check this arithmetic against the source constants; no contact residual
has been used to set a radius.

The Boston worked example on pages 766-767 prints Greenwich astronomical
mean times to a tenth of a minute. Add twelve hours because the source day
begins at noon. The Washington table on page 608 prints local astronomical
mean times to minutes; also add the station's west longitude in time. The
fixtures retain the original strings and the resulting nominal UT1 labels.
This is an approximation to historical Greenwich mean solar time, not modern
UTC and not a subsecond UT1 realization. A `Z` on those labels is serialization
syntax only. The comparison unit explicitly says `nominal-ut1-seconds`.

Boston has no printed height, so zero is a nominal model input. The Washington
table does not establish whether observatory 246 or 247 is intended. Both
station variants are frozen, with each one's own clock offset; both must
pass. Do not choose the better residual. Their historical astronomical
coordinates and heights have no established transformation to the engine's
ellipsoid. These cases test qualified model agreement, not modern timing
accuracy. Both use the existing Aldebaran identity `sao:94027`; the source's
stellar measurements differ from SAO, so success cannot validate the whole
catalogue. Historical planet rows were excluded because their disk-contact
semantics are unresolved.

NAOJ's almanac describes its JPL DE lineage, current theory and IAU frames.
The conjunction tables are interpreted as geocentric apparent places from
those institutional conventions; the CGI does not expose its complete
reduction. Requests explicitly select TT, avoiding an inferred UTC offset. The occultation CGI and
outreach pages do not identify their executable or exact DE release. Their
institutional provenance is recorded without inventing a per-result DE440
receipt. No Swiss Ephemeris source, output or dependency was used.

The local occultation requests fix delta-T to 69 s and specify synthetic
stations explicitly. Output says UT; compare nominal UT1 and retain the
source's clock qualification. The exact lunar radius, Earth ellipsoid,
height datum, detailed planet shape and refraction in the contact equation
are not documented there. Zero height does not establish an ellipsoidal
height datum. The angular semidiameters and named contact rows are retained.
The model must remain the one in DESIGN.md, with these differences reported,
not tuned to the source. Saturn's rows are interpreted as the planet disk
from the published semidiameters and contact geometry; rings exclusion is
an inference, not an explicit source statement.

Each time check stores seconds on its named scale using the Unix calendar
origin as a numerical encoding. This is not a claim that TT or UT1 is UTC.
Before comparing, put the actual result on that same scale using the engine
clock. Do not compare a TT number directly to a UTC timestamp. The outreach
conversion subtracts the source's explicit Japan Standard Time offset;
these approximate hours have neither a formal uncertainty interval nor an
exactly specified observer. Their gate confirms only coarse occurrence.
It cannot validate precision geocentric appulse times. The Tokyo-context
Moon-Mars outreach time is excluded because lunar parallax matters.

## Outline interpretation and limitations

The map's coordinate arrays are published source data. Only selected numeric
nodes, their array/index locators and digests are retained; no map code,
provider keys or base-map imagery is vendored. Source curve labels are an
inference: north/south ordering together with separately requested NAOJ
local contact rows identifies the inner and outer curves. Those supporting
queries and rows are retained in `sources.json`. They are independent of
this workbench. Near a rounded tangent node, contacts may be absent or differ
by seconds; those rows are label evidence, not precision timing fixtures.

Compare each limit at the node's exact longitude. Returning a single overall
latitude extent or comparing a different longitude band does not pass.
Every node must yield a resolved finite boundary, with north/south and
inner/outer semantics preserved. No reference-node interpolation is required.
The source maps contain geometry and horizon caps, with no night-only filter;
the selected boundary nodes are away from the caps. M10 must also check all
local contact cases and expose sampling uncertainty. These sparse nodes do
not establish global completeness, terrain accuracy, pole/dateline topology,
or horizon, daylight and low-altitude behavior.

## Running and using the gates

Normal `npm run check` validates the source register and frozen contract
offline. The explicit `npm run references:verify-source` audit fetches source
bytes and checks their recorded lengths/digests, streaming large historical
OCR rather than saving it. Conjunction and local-contact HTML assign a new
illustration filename per request. The original raw receipt is retained; the repeatable
check replaces only the numeric suffix of that exact illustration path with
a fixed marker, requires exactly one match, and checks all remaining bytes,
including the complete result table. Contact pages also retain a separate
audit-fetch receipt used to establish that normalized digest, with every
retained contact row checked against it. The audit discovers a newly named NAOJ map data file from
the original query without saving the wrapper HTML or executing scripts.
It makes no request to a map provider. `--source ID` limits this audit to a
single source. An upstream change fails the audit and leaves fixtures intact.
The audit authenticates bytes, not astronomy or legal status.

Only development cases may guide M5-M10 implementation. M12 must run every
held-out check once the implementation choices are fixed and retain failures.
A missing/refused/unresolved result fails its registered check; it must not
be filtered out. Claims must name the actual reference, dates, conventions
and maximum observed residual, and must distinguish every coarse check from
precision timing. The scope tests do not run astronomical comparisons in M4.

This corpus leaves precision geocentric Moon/planet and planet/planet minimum
times, Sun altitude, phase, limb classification, horizon behavior, catalogue
completeness, and polar/dateline coverage unvalidated. M6, M9, M10 and M12 must
preregister additional independent evidence before making claims in those
areas. Existing local closest-approach rows are topocentric and do not fill
the geocentric minimum gap. No successful source-transcription or arithmetic
test is an occultation accuracy result.
