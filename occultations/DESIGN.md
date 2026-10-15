# Geometry and verification design

This is the implementation contract for the remaining milestones. The
position adapter, input/receipt foundation, source catalogue, apparent
stellar reduction, geocentric coordinate conjunctions, appulse searches and
lunar candidate screening and local spherical-limb contacts are implemented. An unchecked
part of PLAN.md is not a supported calculation or an established error bound.

## Engine boundary and clock

`src/engine.ts` calls the adjacent engine's `calc` with apparent corrections,
true equator or true ecliptic of date, Cartesian output and no speed samples.
It preserves the engine receipt and bounds. `src/input.ts` reuses the engine's
date parser. Frame precession, nutation, delta-T, TT, UT1 and observer rotation
remain the engine's responsibility. The conjunction search calls the engine's
`src/crossings.ts`; subsequent searches must reuse it too, and rise/set facts
must reuse `src/sky.ts`.

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
There is no claim that this fixed list covers every possible contact
throughout a time window. M3 handles frame differences and motion;
M7 checks retention of every registered positive development event, without
claiming all-target completeness for those windows.

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

## Coordinate conjunctions implemented in M5

`searchConjunctions` passes the first-minus-second apparent coordinate to
`searchLongitudeCrossingsWith`, with a target of zero. Right ascension and
ecliptic longitude select the corresponding true-of-date frame. The first
target is a physical solar-system body; the second is another body or a
catalogue star. Each sample calls the existing position adapters without a
second aberration, light-time or frame correction. The engine solver handles
angular wrap, sign changes and relative stations. An antipodal sign jump is
not a conjunction. At the returned time the spherical separation is
`atan2(norm(cross(a,b)), dot(a,b))` for unit directions.

The window owns `(from, to]`. The engine refines floating timestamps while
its Date callbacks evaluate whole milliseconds. A bounded adjacent-millisecond
check canonicalizes each candidate to the first represented instant at or
past the crossing, using no samples outside the window. This also handles
Date truncation before the Unix epoch. An unconfirmed candidate refuses the
whole search with `unresolved-root`; it is not silently omitted. Exact
sampled contacts with the coordinate are retained under the solver's original
touch convention: a coarse sample uses the preceding side, while an extremum
touch found by the station probe is marked direct. This direction flag is not
evidence of a transit through a stellar or lunar disk.

The coarse step is capped by `CONJUNCTION_LIMITS`, can be reduced by the
caller and is rounded down to whole milliseconds. The paired-position budget
counts every callback, including repeated instants, root verification and the
samples retained in event records. Preflight tests can refuse the coarse scan
before evaluating positions. Exhaustion during any later operation discards
all events. The receipt states the requested step, actual step, budget and
work consumed. No unbounded-budget option is accepted.

`time-seams.ts` derives candidate boundaries from the engine's delta-T model,
leap list and IERS table, then confirms each adjacent-millisecond clock change
using the engine's `elapsedDays` and `timeBasis`. IERS fallback starts after
the inclusive table endpoint. A seam in `(from, to]` produces a receipted
`time-discontinuity` refusal before position sampling. This conservative
policy avoids treating a skipped leap second or model jump as a continuous
root. Caller-split subwindows cannot resolve the missing clock interval.
Both boundary clocks must also lie inside the engine calculation span.

The algorithm inherits the solver's smooth-motion and relative-station
assumptions, its merging of very close roots, and its inability to guarantee
unsampled tangencies. The capped step is a sampling policy, not a proof of
completeness. `complete` means the calculation finished within its budget.
`test/conjunction-geometry.test.ts` uses independent analytic trajectories
for wrap, stations, endpoint ownership and budgets; `test/conjunctions.test.ts`
checks actual engine integration; `test/time-seams.test.ts` checks all declared
clock boundaries. These establish numerical behavior, not physical timing.

The separate NAOJ comparison in `test/conjunction-references.test.ts` uses
the frozen development coordinate events only. It converts source TT windows
through the engine clock and converts returned instants back to nominal TT
seconds before applying each original gate. No reference value or tolerance
has been fitted to these results. The measured scope is in VALIDATION.md;
neither that comparison nor numerical root precision supplies a general
physical timing bound or validates an appulse or occultation contact.

## Appulses implemented in M6

`searchAppulses` accepts two distinct Moon/planet targets and a required
maximum separation in degrees. It returns local minima of their apparent
geocentric spherical separation that satisfy the inclusive limit. There is
no observer, ranking or default closeness criterion. Stars and the Sun are
outside this API. Equal RA, equal ecliptic longitude and disk contacts remain
separate calculations.

Let `a` and `b` be unit directions, `q = |a-b|^2`, and `theta` their
great-circle separation. Then `q = 4 sin(theta/2)^2`. A decreasing-to-increasing
zero of `q`'s time derivative describes a separation minimum; the opposite
direction describes a maximum. This also handles a zero-separation passage
without differentiating a singular angular norm. Reported separation uses
`atan2(|a cross b|, a dot b)`, retaining precision near coincidence and the
antipode. Exact coordinate poles have longitude-independent directions.

The numerical rate is `(q(t+h)-q(t-h))/(2h)`, with the fixed half width
`h = 60 s` in `APPULSE_LIMITS`. `test/appulse-geometry.test.ts` checks that
stencil, its analytic bias, slow motion and window boundaries. To avoid
subtracting nearly equal squared lengths, the kernel uses the haversine:

```text
q = 4 [sin((decA-decB)/2)^2
     + cos(decA) cos(decB) sin((raA-raB)/2)^2]
sin(x/2)^2 - sin(y/2)^2 = sin((x+y)/2) sin((x-y)/2)
cos(x) - cos(y) = -2 sin((x+y)/2) sin((x-y)/2)
```

Each factor difference and product difference is formed before summing the
terms. Relative longitudes at the two epochs use a common continuous branch;
an exact pole's cosine is zero. Directions at each epoch share the engine's
true-of-date frame, so scalar separation is unchanged by that epoch's common
rotation. No second frame, light-time or aberration correction is applied.

The rate in squared unit-chord per day becomes `atan(10000*rate)*90/pi`
degrees for `searchLongitudeCrossingsWith`. This bounded monotone mapping
keeps the same zeros while avoiding an artificial circular wrap. Candidate
times are verified against the untransformed rate at adjacent integer
milliseconds, including before the Unix epoch. Only negative-to-positive
transitions or isolated exact zeros between those signs become events.
Maxima and stationary touches are omitted. A detected zero plateau or an
unconfirmed candidate refuses the complete search with `unresolved-minimum`.
Constant separation has no isolated event. Limits compare the separation at
the reported numerical instant without an accuracy allowance.

Events own `(from,to]`. Stencil samples and adjacent-millisecond verification
can evaluate outside that event window: `search.evaluationWindow` covers
`[from-h-1 ms,to+h+1 ms]`. Both endpoints must fit the engine clock and
calculation span, and any clock seam inside that expanded support refuses
the search before position sampling. No stencil crosses a leap second or
the delta-T/table handovers. The step is capped and rounded down to integer
milliseconds. Every pair of adapter calls, including repeated instants,
consumes the same finite budget; an exhausted budget discards all events.

This is a numerical approximation to a minimum, not a claim of physical
millisecond accuracy. For smooth `q` with a nonzero second derivative, the
leading stencil shift is approximately `-h^2 q'''/(6 q'')` seconds when the
derivatives use seconds. It grows without a bound as curvature vanishes.
Position errors and roundoff perturb the derivative too: their local timing
effect is approximately `E(q')/abs(q'')` seconds, in addition to clock and
solver errors. These expressions are sensitivities, not assigned error
budgets; missing derivative-error bounds remain unknown. A constructed
asymmetric polynomial in the analytic test demonstrates a stencil shift
even with exact input geometry.

The inherited smooth-motion and station assumptions and merging of very
close roots still apply. No sampling policy proves all minima were found,
and slow shallow minima can be unresolved or numerically unstable. The
receipts retain these limitations, the stencil, actual evaluation support,
budget and both position receipts. The independent NAOJ development appulse
test checks only the frozen approximate Jupiter/Saturn occurrence time.
The reference's center is unspecified; there is no precision geocentric
Moon/planet minimum validation or general timing bound. Held-out checks
remain reserved for M12. VALIDATION.md records this milestone's scope.

## Lunar candidates and window-local series implemented in M7

`searchLunarOccultations` screens one planet or catalogue star. It searches
intervals of negative clearance against the observer envelope, and separately
against the geocentric disk limit. Both functions are evaluated at every
solver sample using the current ranges. Screening only at an angular
separation minimum would overlook changes of apparent radius and parallax.
The boundary search delegates to `src/crossings.ts` through the monotone
transform `atan(clearanceDegrees)*90/pi`, which has no circular branch jump.

Let `dM` and `dT` be geocentric distances, `rM` and `rT` the adopted spherical
radii, `R` a sphere enclosing the observers, and `s` the angular separation.
For rigidly translated vectors, each center changes direction by at most
`asin(R/d)`, and each angular radius is at most `asin(r/(d-R))`. The spherical
triangle inequality therefore gives the necessary candidate condition:

```text
s <= asin(R/dM) + asin(R/dT) + asin(rM/(dM-R)) + asin(rT/(dT-R))
```

The limit is capped at a half circle. Infinite point-source stars contribute
no target terms, an explicit approximation rather than a measured zero
parallax. The geocentric overlap condition is
`s <= asin(rM/dM) + asin(rT/dT)`. Both assume that the target is beyond the
Moon. Finite-target validation enforces the sufficient radial ordering
`dT-R-rT > dM+R+rM`; all observers must also be outside the lunar sphere.

The lunar radius comes from the engine's `SKY_RADII_KM`. Planet radii are
nominal equatorial-radius spheres from the cited JPL table in
`data/radii-source.json`, without a fitted contact correction, oblate limb,
rings, atmosphere or uncertainty enlargement. The enclosing observer radius
uses the calc ellipsoid's equatorial radius plus the maximum height accepted
by `normalizeObserver`. This includes elevated observers without replacing
the actual ellipsoid used by later local calculations. The source constants
and height contract are checked in `test/occultations.test.ts`.

This is a conservative bound for the stated translated-vector spheres, not
for every physical uncertainty or every apparent-place convention. The
engine's geocentric lunar exception and topocentric light-time treatment
differ. No unknown correction error, catalogue parallax or lunar relief has
been given a zero error bound. A positive candidate need not correspond to
any visible event; horizon, shadow intersection and local contacts remain
subsequent calculations. Geocentric disk overlap does not imply visibility.

`clearance-intervals.ts` checks every returned root against the raw clearance
and all sampled signs against the reconstructed interval topology. A
nonintegral entry uses the last outside millisecond; an exit uses the first
outside millisecond. Exact zeros between opposite signs become point
boundaries. A detected tangent or zero plateau is unresolved. A zero at
the owned upper endpoint approached from positive clearance is also
unresolved, as its following side lies outside the window. No singleton
candidate is silently inferred or omitted there. The unowned lower endpoint
uses its in-window side; active intervals at either edge retain clipping.
`geocentricOverlap` means detected positive-duration disk overlap, not a
proof that an unsampled touch did or did not occur.

The search unwraps Moon-minus-target RA across its coarse grid. Sampled
negative motion or an ambiguous large advance refuses passage assignment.
The initial signed angle sets a window-local origin; nearest complete
revolutions assign passage indices. Candidate interval edges and midpoint
must belong to the same passage. Consecutive accepted indices form a local
series; a missing index breaks it. There is no date-gap heuristic or claim
of correspondence to published global series numbers. Continuation beyond
the requested window stays unknown. This relies on the stated smooth
motion and sampling assumptions, including the engine solver's limitations.

All position pairs, including the winding scan, both clearance scans,
verification and output witnesses, share one finite budget without caching.
A failed or ambiguous calculation discards every candidate and series.
Clocks at both window boundaries must be inside the engine span, and any
clock seam refuses the complete window. Search, candidate and series receipts
retain model constants, source identity, clock conventions and limitations.

`test/occultation-geometry.test.ts` checks analytic point-source shadow
constructions and direct Cartesian observer translations. Interval and
series tests cover changing radii, narrow sampled encounters, wrap, rejected
passages, near misses, clipping and budget accounting. These check the
screening construction, not physical ephemeris accuracy. The independent
development references require containment of all published local event
instants under `test/fixtures/events/CANDIDATES.md`; no local timing gate or
held-out case has been used to select radii or search parameters. The finite
positive-event check supplies no all-target completeness or contact accuracy
claim. `VALIDATION.md` records its scope.

## Spherical-limb contacts implemented in M8

The lunar limb is a sphere using the radius already exported by the
engine's sky entry, with no mountains, valleys or limb-darkening profile.
Planet radii use M7's cited JPL nominal equatorial values. Saturn's rings
are absent, and no planet flattening or atmosphere is modeled. For a radius
`r` and topocentric range `d`, the sphere subtends `asin(r/d)`. The adapters'
reported `dist` supplies that range. In the engine's apparent reduction it
is the astrometric light path; the apparent direction comes from a separately
retarded relative vector. This is an inherited approximation, not an exact
retarded silhouette construction. The correction uncertainty stays unknown.

Let `s` be the angular center separation and `m` and `p` the apparent lunar
and target semidiameters. External clearance is `s - (m + p)`; negative means
some target disk is covered. Internal clearance is `s - (m - p)`; negative
means the whole target disk is covered. The difference is signed, not absolute:
a larger background disk cannot be fully hidden by a smaller lunar disk.
The target's near surface must lie beyond the Moon's far surface, a sufficient
radial ordering check at every sample. Infinite point-source stars have no
target radius and only one clearance scan; unknown stellar parallax is an
omission, not a measured zero.

External ingress starts partial disappearance, internal ingress completes
disappearance, internal egress starts reappearance, and external egress ends
partial reappearance. Stars have only disappearance and reappearance.
The external and internal negative-clearance intervals are returned separately.
Full intervals must be contained in overlap intervals; conflicting geometry
or coincident distinct disk contact times refuses the search. A partial-only
event has overlap without full coverage. Clipping does not claim anything
about the rest of the event beyond the window.

Compute separation from unit vectors with atan2(norm(cross), dot) to retain
precision near coincidence. A sign-changing contact and a tangent graze need
separate detection. Closest angular approach, equal right ascension and equal
ecliptic longitude are separate events and must not share a timestamp merely
because they occur nearby. A geocentric disk overlap is also distinct from
an occultation visible somewhere on Earth.

`contact-intervals.ts` delegates each scalar zero search through the same
bounded `atan(clearance)*90/pi` transform as candidate screening. The engine
finds crossings and probes sampled extrema. Raw clearance checks then recover
adjacent integer milliseconds with opposite signs or an exact isolated zero.
Every sampled sign and each reconstructed partition midpoint must agree with
the resulting topology. Detected tangencies, zero plateaus, inconsistent
sample values or lost roots refuse the entire result as `unresolved-contact`.
An unsampled tangency can still escape detection; the inherited smooth-motion,
station-spacing and close-root-merging assumptions remain in the receipt.

Contacts own `(from,to]`; both directions use the first integer millisecond
on or after the numerical root. A halo of one millisecond on either side
classifies exact endpoint roots. It is checked for clock seams and calculation
range before positions are evaluated. The numerical bracket is either a
point or one millisecond wide, as enforced in `test/contact-intervals.test.ts`
and `test/contacts.test.ts`; it supplies no physical error bound.
Intervals are clipped to the request and use these quantized contact edges.
An ingress exactly at the upper endpoint is a contact with no positive-duration
interval; an unowned lower endpoint never duplicates the previous window's
contact. A fully covered window can have no contacts and a clipped interval.

The topocentric scan does not depend on M7 screening, whose translated-vector
envelope has different correction approximations. `CONTACT_LIMITS` caps the
step at five minutes, a sampling policy rather than a completeness proof.
Both clearance scans, verification and output share a finite paired-position
budget; output receipts fix the consumed count only after all output samples
succeed. Failure discards all events and intervals. Below-horizon geometry is
retained without a visibility claim. The observer ellipsoid, corrections,
range approximation, radii, star source and boundary clocks remain in receipts.

`test/contact-geometry.test.ts` and `test/contact-search-geometry.test.ts`
check independent analytic trajectories, partial and full coverage, reversed
containment and grazing ambiguity. `test/contacts.test.ts` checks engine
integration, clipped windows, ownership, clock halos, source receipts and
bounded work. These are distinct from the published prediction comparison in
`test/contact-references.test.ts`: it applies the original development time
and disk-duration gates, including clock conversion. No radius, station or
time offset was fitted to those predictions. The checked subset and deferred
source quantities are listed in `test/fixtures/events/CONTACTS.md`.

## Sky facts planned in M9

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

Development contact timing gates now pass over the cases recorded in
VALIDATION.md. They do not fill the physical uncertainty budget. The budget
will be evaluated per contact, using independently checked uncertainties and
the contact's normal angular speed. Define:

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

M4's [event reference contract](test/fixtures/events/EVENTS.md) freezes
numerical maximum-error assertions against USNO and NAOJ published
predictions before event implementation. It records source clocks, precision,
limb and station qualifications, and documented ephemeris lineage. Unknown
source conventions remain explicit. Development and held-out whole events
are separate. These thresholds are acceptance criteria, not a measured error
budget. M8 records passing the unchanged gates over its development span;
it does not turn their acceptance limits into measured residual maxima.
M12 must record the held-out comparisons with failures retained.
M3's angular reduction comparison cannot fill the
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

Conjunction receipts now add catalogue identity and digest when relevant,
window ownership, both boundary clocks, seam records, search resolution/budget
and limitations. Each event retains both position receipts and its time basis.
Refusals retain the same normalized request and available provenance, with
the originating position refusal when one occurs. Contact receipts now add
the observer, spherical disk models, classification halo, raw numerical bracket
and development-only validation scope. Outline receipts must later add their
respective models and validation scope.
Exhausting a search budget must produce an explicit
refusal or unresolved interval, never a silently complete partial list.
No network request is part of a calculation. Bulk downloads and generated
outputs stay in ignored folders, and no authored file may reach the root build.
