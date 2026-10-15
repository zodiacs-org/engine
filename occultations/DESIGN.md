# Geometry and verification design

This is the implementation contract for the remaining milestones. The
position adapter, input/receipt foundation, source catalogue and apparent
stellar reduction are implemented. An unchecked
part of PLAN.md is not a supported calculation or an established error bound.

## Engine boundary and clock

`src/engine.ts` calls the adjacent engine's `calc` with apparent corrections,
true equator or true ecliptic of date, Cartesian output and no speed samples.
It preserves the engine receipt and bounds. `src/input.ts` reuses the engine's
date parser. Frame precession, nutation, delta-T, TT, UT1 and observer rotation
remain the engine's responsibility. Future searches must call
`src/crossings.ts`; rise/set facts must reuse `src/sky.ts`.

The source interfaces and their qualifications are in `../docs/calc.md`,
`../docs/sky.md`, `../src/calc-reduce.ts` and `../src/time-scale.ts`. Their
acceptance range is not an occultation-validation span. A successful position
requires both TT and UT1 within the engine's calculation span; a nominal civil
date just inside an endpoint can still be refused. Tests exercise this boundary.
Seams of the engine time basis must be split or reported before continuous
event root solving. A leap second is not representable as a JavaScript Date.

## Parallax, light-time and aberration

Topocentric samples use the engine's ellipsoidal observer at reception time,
with geodetic latitude, east longitude and elevation in metres. Calc uses the
IERS 2003 ellipsoid; the sky rise/set API uses WGS84. Our elevation is an
ellipsoidal height, not height above mean sea level. The later horizon and
outline work must account for this distinction and any reference station's
vertical datum; it must not silently relabel the calc observer as WGS84.

The engine's geocentric apparent Moon is its geometric series at the instant.
Its topocentric apparent Moon instead passes through the engine's retarded
target/observer calculation. Planets use the engine's light-time and apparent
direction treatment. No second aberration or light-time correction may be
applied to these returned directions. The original correction identifiers
are retained in every successful receipt, including the lunar exception.

Star samples propagate catalogue epoch and proper motion in the catalogue's
stated frame, with the normalized RA motion multiplied by cos(declination).
Missing fields, double stars and variable magnitudes remain explicit in each
receipt. Gravitational deflection is absent from both adapters; reference
comparisons near the Sun must expose that omitted correction. The engine's
Moon exception and the stellar aberration formula are distinct correction
models on common axes. Do not add stellar annual aberration to the returned
Moon: lunar light-time and aberration largely cancel. Their remaining model
difference must enter the contact validation and correction budget.

## Stellar reduction implemented in M3

`starPositionAt` accepts an exact frozen catalogue id and the same instant,
observer and frame vocabulary as `positionAt`. Both TT and UT1 must lie
inside the engine calculation span. It returns an immutable unit direction,
angular coordinates and a receipt; unknown distance stays null. Missing either
proper-motion component yields `proper-motion-unavailable`, even at the source
epoch, rather than treating an unknown motion as zero.

`src/astrometry.ts` first forms the catalogue unit vector `p` and tangent
motion `m` from east and north unit vectors. This avoids division by the
declination cosine at a pole. FK5 J2000 positions and motion then become
ICRS directions using the published orientation matrix `R` and spin `s`:
`pICRS = R p` and `mICRS = R (m + p cross s)`. This is the Mignard and
Froeschle rotation/spin model documented by ERFA `fk5hip` and `fk52h`, with
no FK5 zonal correction. It is separate from the engine's ICRS-to-J2000
frame bias. The published matrix and spin are checked in
`test/erfa-published.test.ts` against the retained ERFA validation values.

The direction propagation follows the model described by ERFA `pmpx`.
Let `b` be the barycentre-to-observer vector in AU, `px` the parallax in
radians, and `vr` the radial velocity in AU per Julian year. The propagated
direction is proportional to

```text
p + dt * (m + vr * px * p) - px * b
dt = elapsedJulianYears + dot(p, b) / speedOfLightAuPerJulianYear
```

The additional term in `dt` is the observer's Roemer modulation of reception
time. Catalogue epochs already refer to reception at the barycentre; there
is no subtraction of the star's absolute light-travel time. Finite parallax
and radial velocity are supported in the internal kernel and tested with
synthetic astrometry against ERFA. SAO supplies neither here, so those terms
are omitted and flagged in the public result. The resulting distance and
perspective uncertainty are unknown. This approximation supplies no binary
orbit, photocentre, catalogue-error covariance or full relativistic stellar
space-motion solution. Motion uses TT as an approximation to TDB and Julian
years; the receipt records that choice.

`geometricState` from the engine supplies the Earth's barycentric position
and velocity. The negative of its topocentric Earth state supplies the
geocentric observer state, reusing the engine ellipsoid, sidereal rotation
and UT1 basis. Both states are rotated to ICRS before stellar propagation.
With observer velocity `beta` in units of light speed and
`g = sqrt(1 - dot(beta, beta))`, aberration normalizes
`g * p + (1 + dot(p, beta) / (1 + g)) * beta`. This includes annual and
diurnal aberration but excludes solar gravitational deflection and the
solar-potential term. The engine's frame matrix carries that direction back
to its J2000 axes and then to the requested true frame.

`test/astrometry.test.ts` checks analytic geometry, and the extended ERFA
comparison checks independent motion, aberration, Earth state and frame
reduction. Its cases and maximum-error criteria were fixed before comparison
in `test/fixtures/astrometry-cases.json` and `test/fixtures/ASTROMETRY.md`.
The reference's full reduction uses IAU 2006/2000A; the engine uses its
IAU 2000B nutation. Agreement on shared source coordinates measures the
reduction model, not the physical accuracy of the historical SAO positions.
SOURCES.md names the primary documentation and the fixture licence.

## Catalogue selection and stellar limitations

M2 adopts the public-domain SAO catalogue on the basis recorded in
SOURCES.md. The source extractor selects historical visual magnitudes at most
4.5 within 8 degrees of the J2000 ecliptic, with explicit named Pleiades
inclusions. These are implementation policies checked in
`test/catalogue.test.ts`, not measured lunar-path limits. The latitude uses
the engine's `eclipticOfDate` at J2000; nutation in longitude does not change
that latitude. Treating the catalogue FK5 axes as the engine's mean J2000
axes is sufficient for this broad prefilter, not a stellar reduction model.
There is no claim yet that this fixed list covers every possible contact
throughout a time window. M3 handles frame differences and motion;
M7 must test candidate completeness over reference windows.

The source positions have epoch and equinox J2000 in FK5. The FK5 RA motion
is a coordinate rate in seconds of time per year. Catalogue normalization
converts it to milliarcseconds per year along the tangent with
`raRate * 15 * cos(dec) * 1000`; declination motion is converted from
arcseconds per year to milliarcseconds per year. These unit conversions do
not propagate the positions. The original source rows and provenance codes
are retained, and the tests exercise the cosine factor and absent values.

SAO provides no parallax or radial velocity here. M3 exposes the resulting
distance and perspective-motion limitations without replacing unknown
values with observed zeros. Source duplicity and variability flags are
retained; a blank warning or zero code means unknown status. Proper names
are labels on a catalogue entry, not a choice of a resolved component in a
binary. Neither orbital motion nor a photocentre correction is supplied.
M4 must assess whether this historical astrometry is adequate for each
reference case before assigning a stellar timing budget.

The data flow is a digest-pinned NASA TAP query, exact selected source lines,
then normalized output in the ignored `.generated/` folder. Only source
records and provenance are committed. Normal use is offline. Re-extraction
checks the complete parent response, its completion footer and the query
digest, and refuses changed upstream data. Tests of extraction and units are
source-transcription checks, not independent evidence of sky accuracy.

## Sphere contacts and sky facts

The lunar limb will be a sphere using the radius already exported by the
engine's sky entry, with no mountains, valleys or limb-darkening profile.
The apparent angular radius is asin(radius / topocentric range). For a star,
a contact solves angular separation minus lunar angular radius equal to zero.
For a planet disk, external and internal contacts use the sum and difference
of the apparent radii. Planet disks need independently sourced radius and
shape conventions; Saturn's rings are not its solid disk.

Compute separation from unit vectors with atan2(norm(cross), dot) to retain
precision near coincidence. A sign-changing contact and a tangent graze need
separate detection. Closest angular approach, equal right ascension and equal
ecliptic longitude are separate events and must not share a timestamp merely
because they occur nearby. A geocentric disk overlap is also distinct from
an occultation visible somewhere on Earth.

Position angle is measured from celestial north through east at the Moon.
Bright/dark/terminator labels will use the projected Sun direction and lunar
illumination geometry with an explicit ambiguous region. The Sun's altitude,
Moon's phase and horizon status are facts at each contact. Atmospheric
refraction does not belong in the vacuum contact equation; any refracted
horizon convention must be separately named. Daylight and low altitude are
reported without scoring or recommending the event.

## Coarse global outline

Use a fundamental plane perpendicular to the target direction, with north/east
axes and the projected lunar centre. For a stellar target this gives the
cylindrical shadow limit of the lunar sphere. Finite target distance requires
the corresponding conical geometry for planetary disks. Earth rotation and
the ellipsoidal observer must use the engine's UT1 and frame conventions.

For each longitude band, solve intersections and extrema over the event time
interval to find latitude intervals with contact and the required horizon
condition. Preserve multiple intervals or no intersection; do not invent a
single connected footprint at the dateline or near a pole. Northern/southern
envelopes must identify the sampling grid, unresolved bands and assumptions.
A coarse outline is not a terrain-corrected graze prediction. Every chosen
outline limit must be checked against local topocentric contact geometry.

## Accuracy budget in seconds of time

No contact accuracy has been measured in this milestone. The budget will be
evaluated per contact, using independently checked uncertainties and the
contact's normal angular speed. Define:

- `Eposition`, `Estar`, `Eframe`, `Ecorrection`, `Eradius` in arcseconds;
- `vnormal`, the absolute time derivative of angular limb clearance, in
  arcseconds per second;
- `Eclock` and `Esolver` in seconds;
- `Esite` and `Elimb`, transverse station and unmodelled limb error, in km;
- `vshadow`, the corresponding normal shadow speed in km per second.

The conservative linearized budget in seconds is

```text
Etime = Eclock + Esolver
      + (Eposition + Estar + Eframe + Ecorrection + Eradius) / abs(vnormal)
      + (Esite + Elimb) / abs(vshadow)
```

This is a local sensitivity estimate, not a proven bound. The errors are not
assumed independent, so they are not combined in quadrature. Do not count a
limb-radius uncertainty in both `Eradius` and `Elimb`. Engine sample maxima
are evidence over their measured corpus, not universal error limits.

Near grazing, either normal speed can approach zero and this estimate becomes
unbounded; terrain can create or erase contacts. Such cases require an
uncertain/grazing result, not a fixed seconds claim. Solver precision alone
cannot support a physical timing claim. Missing uncertainty inputs remain
unknown rather than being assigned zero.

M4 must freeze numerical maximum-error assertions in seconds against cited
published references, including their time scales, rounded precision, limb
model, station datum and ephemeris lineage. Development and held-out cases
are separate. M8 and M12 will report the actual comparison span and maxima,
with failures retained. M3's angular reduction comparison cannot fill the
unknown stellar catalogue term or produce a physical seconds guarantee.
Its allowed reduction error would contribute that angular allowance divided
by `abs(vnormal)` to the sensitivity budget; it does not replace `Estar`,
and must not be counted again inside a later end-to-end contact comparison.

## Receipts and bounded work

The initial position receipt records its schema and adapter implementation,
normalized request, engine identity, engine calculation receipt, frame and
unit conventions, and an explicit unmeasured-validation status. Refusals
also carry a request receipt; no fabricated engine calculation is attached.
Receipts are immutable JSON snapshots, not signatures or trusted attestations.

Stellar receipts add the complete source record, source-row and catalogue
digests, normalized observer, engine time basis, the frame and motion models,
missing-distance and correction limitations, and an explicit separation
between tested astrometric reduction and unmeasured catalogue/contact accuracy.
Out-of-range refusals carry no time basis. Missing-motion refusals retain
the resolved time basis without claiming that a direction was calculated.

Event receipts will add catalogue identity and digest, window ownership,
search resolution/budget, contact and outline model, reference-validation
status and limitations. Exhausting a search budget must produce an explicit
refusal or unresolved interval, never a silently complete partial list.
No network request is part of a calculation. Bulk downloads and generated
outputs stay in ignored folders, and no authored file may reach the root build.
