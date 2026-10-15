# Occultations workbench

An isolated package over the adjacent `@zodiacs/engine` TypeScript source.
It describes sky geometry only. It does not select or recommend dates, attach
interpretations, or make predictions about people or events.

The current milestones provide validated position samples, a receipted SAO
stellar catalogue, reproducible source extraction, apparent star directions,
geocentric conjunction searches in right ascension or ecliptic longitude,
geocentric Moon/planet and planet/planet appulse searches, and lunar
occultation candidate intervals with window-local series, and topocentric
spherical-limb contact times for stars and planetary disks.
Independent event references and maximum-error criteria were frozen before
event implementation in [the reference contract](test/fixtures/events/EVENTS.md).
Sky facts, visibility outlines and the CLI remain unchecked in
[PLAN.md](PLAN.md). Contact validation covers the development references
described below, with no general timing bound. [DESIGN.md](DESIGN.md) records the geometry and error
budget to validate; [SOURCES.md](SOURCES.md) separates provenance from leads.

Use Node matching this folder's `package.json` engines range. From the
repository root:

```sh
npm ci --prefix occultations --cache occultations/.cache/npm --ignore-scripts
npm --prefix occultations run check
```

No root install or root build is needed. Local TypeScript, Vitest and esbuild
resolve the pinned ephemeris from this folder while reading the engine source
through relative imports. The build writes only `.generated/`, which is
ignored. The built module can be used from the repository root:

```js
import { positionAt } from "./occultations/.generated/index.mjs";

const sample = positionAt({
  body: "Moon",
  time: "2025-01-01T00:00:00Z",
  observer: { latitude: 0, longitude: 0, elevationMeters: 0 }
});
console.log(JSON.stringify(sample));
```

The example is a sky sample at a synthetic station, not a contact prediction.
In an equatorial frame, `lon` is right ascension in degrees and `lat` is
declination in degrees. In an ecliptic frame they are longitude and latitude.
`dist` and Cartesian coordinates are in astronomical units. Speeds are absent.
Omit `observer` for the geocentre; specify `frame` for either true equator or
true ecliptic of date. The default is equatorial. Input and delegation behavior
are enforced by `test/input.test.ts` and `test/engine.test.ts`.

Instants follow the engine parser: ISO dates mean UTC midnight; date-times
need an explicit UTC offset. A valid Date is also accepted. Windows must be
nonempty and ordered; conjunction searches use the engine's `(from, to]` ownership.
Input records use their own fields, captured once. Malformed inputs throw
RangeError. A valid position request beyond the
engine's calculation span returns `status: "refused"` with a receipt.

Receipts preserve normalized requests and the complete engine calculation
receipt when available, including time basis, correction conventions and
dependency identity. They are provenance records, not attestations or physical
accuracy guarantees. Results are immutable snapshots and JSON serializable.

The authored code and documentation are MIT under [the repository licence](../LICENSE).
The local bundle includes engine data: keep the generated LICENSE,
LICENSING.md and NOTICE alongside it. Its inherited terms are the engine's
`MIT AND CC-BY-4.0`, with the qualifications in [LICENSING.md](../LICENSING.md).
The workbench is private and excluded from the engine's npm package.

`starCatalogue()` returns an immutable source catalogue and its receipt. The
subset contains 119 SAO records, with catalogue visual magnitude at most 4.5
and absolute J2000 ecliptic latitude at most 8 degrees, plus explicitly named
Pleiades targets. Regulus, Spica, Antares and Aldebaran are included. The ten
Pleiades entries are Alcyone, Atlas, Pleione, Maia, Merope, Electra, Taygeta,
Celaeno, Asterope (21 Tauri) and the separate 22 Tauri. These counts and
selection thresholds are enforced by [the catalogue tests](test/catalogue.test.ts)
against the frozen SAO query described in [SOURCES.md](SOURCES.md).

This is a fixed catalogue selection, not verified event completeness across
the engine's time span. `starCatalogue()` retains positions at the catalogue
epoch and equinox J2000 in FK5. `starPositionAt()` propagates their proper
motion and returns an apparent direction at the requested instant.
Magnitudes are historical heterogeneous visual values. Missing distance,
radial velocity and multiplicity information remain unknown. The catalogue
does not resolve binary components or predict a variable star's brightness.

The public-domain basis, original authors, field conventions and exclusions
are recorded in [SOURCES.md](SOURCES.md) and [the rights receipt](data/sao-rights.json).
Keep the generated SAO-NOTICE.txt and sao-documentation.txt with the bundle.
Normalized data is generated only in the ignored folder:

```sh
npm --prefix occultations run catalogue:check
# Optional network check: retrieve the pinned NASA query and reproduce the extract.
npm --prefix occultations run catalogue:verify-source
# Or verify from the previously downloaded query without network access.
node occultations/scripts/catalogue.mjs --extract occultations/.cache/catalogue/sao-query.txt
```

Both extraction commands check the parent response digest and compare the
candidate extract with the committed original source rows. A changed response
is refused; no command overwrites committed data. The normal `check` is offline.

```js
import { starCatalogue, starPositionAt } from "./occultations/.generated/index.mjs";

const spica = starCatalogue().stars.find((star) => star.label === "Spica");
const direction = starPositionAt({
  star: spica.id,
  time: "2025-01-01T00:00:00Z",
  observer: { latitude: 0, longitude: 0, elevationMeters: 0 }
});
console.log(JSON.stringify(direction));
```

Use the exact catalogue `id`. The default frame is the true equator and
equinox of date; `frame: "ecliptic-true-of-date"` selects the true ecliptic.
The `direction` is a unit vector, and `lon` and `lat` are degrees, with
equatorial `lon` meaning right ascension. `distanceAu` stays null because
SAO supplies no distance here. The observer uses the same ellipsoid and
elevation convention as `positionAt()`.

Star reduction applies FK5 orientation and spin, proper motion, observer
light-time modulation, annual aberration and, for a site, diurnal aberration.
It uses the engine's clock, Earth state and frame rotations. Missing proper
motion produces a receipted refusal. Missing parallax and radial velocity
produce explicit omissions; no measured zeros or physical accuracy bounds
are invented. Refraction, solar deflection, stellar orbital motion and
unresolved component positions are absent. The result receipt records the
source row, catalogue digests, clock and reduction conventions.

The ordinary tests include published independent ERFA component references.
The extended comparison checks apparent stellar directions against an
independent ERFA Earth ephemeris and frame reduction, using the same SAO
inputs. It requires separate development-only Python dependencies:

```sh
python3 -m pip install --target occultations/.cache/erfa --cache-dir occultations/.cache/pip pyerfa==2.0.1.5 numpy==2.2.6
npm --prefix occultations run test:astrometry
```

This command generates its reference values under `.generated/` before
running the assertions. It is separate from `check`; missing dependencies or
references fail explicitly. Runtime calculations require no Python or network.
[The preregistration](test/fixtures/ASTROMETRY.md) fixes the cases and error
criteria, and [VALIDATION.md](VALIDATION.md) records their measured scope.
Agreement checks reduction of shared inputs, not the accuracy of the
historical catalogue or occultation contact times.

`searchConjunctions()` searches one pair and one coordinate at a time:

```js
import { searchConjunctions } from "./occultations/.generated/index.mjs";

const result = searchConjunctions({
  first: "Moon",
  second: "Mars",
  coordinate: "right-ascension",
  window: { from: "2024-01-10", to: "2024-01-11" }
});
console.log(JSON.stringify(result));
```

`first` names a physical solar-system body supported by `positionAt()`.
`second` names a different supported body or an exact catalogue id such as
`sao:157923`. Use `coordinate: "ecliptic-longitude"` for equal ecliptic
longitudes. No observer is accepted for these geocentric searches.
The event gives its coordinate difference, the first target's declination
or ecliptic latitude minus the second's, and their spherical separation,
all in degrees. Equal coordinates need not mean closest approach or an
occultation. `relativeRetrograde` describes the first-minus-second coordinate,
not either body's motion alone; the receipt records the solver's touch convention.

Results contain either `status: "complete"` with chronologically ordered
`events`, or `status: "refused"` with an empty list and a reason. Both carry
receipts, including empty searches, and stellar searches retain catalogue
and source-row identity. Each event also retains its clock and both position
receipts. `at` uses the engine's UTC input basis; outside its IERS interval,
civil labels are read as UT1. It is not a TT label. Returned crossing instants
are assigned to the first integer millisecond on or beyond the crossing, so
a returned instant can divide adjacent windows without duplicate ownership.

`stepDays` can reduce the coarse step; `maxSamples` sets a finite paired-position
budget. Defaults and hard limits are exported as `CONJUNCTION_LIMITS`.
Root refinement and event verification consume that same budget. Budget
exhaustion returns no partial list. Out-of-range windows are refused before
position sampling. A window spanning an engine clock discontinuity returns
`time-discontinuity` and the seam instants in its receipt. Search continuous
subwindows separately; the skipped clock jump is unresolved, not a conjunction.

Completion means the sampled solver finished. It assumes smooth motion and
limited relative stations between samples; it is not a completeness proof.
The inherited solver can collapse subsecond-separated roots and can miss
an unsampled tangency. These limitations and the absence of a general timing
bound remain in every receipt. [The geometry tests](test/conjunction-geometry.test.ts),
[integration tests](test/conjunctions.test.ts) and
[clock tests](test/time-seams.test.ts) check these API boundaries.

The event fixtures separate development and held-out cases from USNO and
NAOJ, with clock, observer, model and source-rights qualifications. Ordinary
tests enforce their frozen bytes, transcription arithmetic and error-checking
contract. [The conjunction reference test](test/conjunction-references.test.ts)
also compares the development NAOJ Jupiter/Saturn and Moon/Mars coordinate
events with their original maximum-error gates. Held-out event comparisons
remain deferred to M12. An optional online
audit verifies the retained source receipts without writing source data:

```sh
npm --prefix occultations run references:verify-source
```

Keep [the event reference notice](test/fixtures/events/NOTICE.txt) with these
fixtures. NAOJ reference material retains its stated use terms; the authored
MIT licence does not replace them.

`searchAppulses()` finds local minima of spherical separation for a pair:

```js
import { searchAppulses } from "./occultations/.generated/index.mjs";

const result = searchAppulses({
  first: "Moon",
  second: "Mars",
  maximumSeparationDegrees: 10,
  window: { from: "2024-01-10", to: "2024-01-11" }
});
console.log(JSON.stringify(result));
```

Both targets must be distinct entries in `APPULSE_BODIES`: the Moon or a
planet. The required `maximumSeparationDegrees` is an inclusive caller limit
on each event's reported separation. An event has `kind: "appulse"`, `at`,
both targets, `separationDegrees` and a receipt. It is a geocentric fact;
neither equal coordinates nor occultation contacts are implied. A monotonically
decreasing separation at the window end is not a local minimum.

The search approximates a minimum by a negative-to-positive zero of a
centered difference of squared unit-chord distance. The engine crossing
solver supplies candidate times, which are checked using the original rate.
The fixed stencil and finite resource limits are exported in `APPULSE_LIMITS`.
`stepDays` may reduce the coarse step; `maxSamples` limits paired position
evaluations, including stencil, refinement and output samples. All results
and refusals carry immutable JSON receipts. Refusal always returns an empty
event list, including when earlier events were already found.

Events own `(from, to]`. The stencil needs positions outside that window,
including a neighboring millisecond for endpoint confirmation. The entire
possible interval is in `receipt.search.evaluationWindow`; its clock seams
or out-of-range endpoints refuse the search before position sampling. An
isolated exact zero is accepted; a detected zero plateau is unresolved.
Constant separation supplies no isolated event. The returned millisecond
identifies the numerical rate crossing, not the physical minimum to that
precision. Shallow minima, finite-difference bias and unsampled extrema
remain limitations. Completion is sampled, not a completeness proof.

[The analytic tests](test/appulse-geometry.test.ts) check spherical geometry,
minimum classification and stencil bias. [The integration tests](test/appulses.test.ts)
check the example, angular caps, conjunction distinctions, receipts and budgets.
[The appulse reference test](test/appulse-references.test.ts) applies the
unchanged frozen maximum error to the NAOJ Jupiter/Saturn development case
on 2020-12-21. Its approximate outreach time establishes coarse occurrence
only; it does not validate precision geocentric timing or lunar minima.
No held-out appulse has been evaluated. [DESIGN.md](DESIGN.md) explains the
numerical and physical timing limitations.

`check:scope` checks npm file selection without running lifecycle scripts or
writing an archive. It also enforces the task's source-file size and prose
rules and detects changed paths outside this folder. It does not replace the
repository's release archive or full built-package checks.

[VALIDATION.md](VALIDATION.md) records this milestone's checks and the
unavailable root build prerequisite.

`searchLunarOccultations()` screens a single target for possible lunar
occultation within a window:

```js
import { searchLunarOccultations } from "./occultations/.generated/index.mjs";

const result = searchLunarOccultations({
  target: "Saturn",
  window: { from: "2024-05-31", to: "2024-06-01" }
});
console.log(JSON.stringify(result));
```

The target is an entry in `OCCULTATION_PLANETS` or an exact catalogue id,
such as `sao:94027` for Aldebaran. Each candidate's `interval` is where a
conservative angular envelope allows a spherical lunar occultation for some
terrestrial observer. It is a necessary screening condition. It establishes
neither a local contact nor visibility from any particular place. The example
uses the NAOJ development event in [the candidate test](test/occultation-references.test.ts).

The envelope encloses the engine observer ellipsoid and all heights accepted
by `normalizeObserver`, and uses the Moon's and target's ranges. Planets are
nominal equatorial-radius spheres; rings and atmospheric limbs are excluded.
Stars are infinite point sources in this screen, with their missing distances
retained as unknown in receipts. `OCCULTATION_RADII` exposes the adopted model
and source receipt. [SOURCES.md](SOURCES.md) records the radius provenance.

`geocentricOverlap` reports whether a positive-duration geocentric spherical
disk overlap was found, with its intervals in `geocentricOverlapIntervals`.
Parallax can allow a candidate without geocentric overlap. A false value does
not rule out an unsampled tangency. The candidate's `sample` is an interval
midpoint witness, not closest approach or a contact. Its angular geometry,
clock and both adapter receipts are retained.

Candidate intervals intersect the requested `(from,to]` window. An active
interval crossing a window edge is retained with `start: "window"` or
`end: "window"`; splitting inside an interval therefore returns clipped
pieces in both searches. Finite entry and exit boundaries enclose a crossing
on the millisecond lattice, including the adjacent outside millisecond when
the root falls between milliseconds. This is numerical bracketing, not a
physical timing-accuracy claim. Detected tangencies and ambiguous boundaries,
including an entry exactly at the owned upper endpoint, refuse the search.

`series` groups accepted consecutive relative-RA revolutions of this target.
A sampled revolution without a candidate breaks a series. The candidate's
`passageIndex`, `seriesIndex` and series membership are local to this request;
they are not persistent identifiers or a published global series catalogue.
Continuation beyond the window is unknown. The search refuses sampled
nonforward or ambiguous relative motion instead of assigning a passage.

`OCCULTATION_LIMITS` gives the finite step and budget policies. The engine
crossing solver searches the changing envelope clearance itself and separately
searches geocentric disk clearance. All scans, boundary checks and output
samples consume the same paired-position budget. There is no evaluation
outside the window. Clock seams, unavailable positions, budget exhaustion or
unresolved geometry return `status: "refused"` with empty `candidates` and
`series`, plus a receipt. Completion is sampled, not a proof of completeness.

[Analytic geometry tests](test/occultation-geometry.test.ts) check the
necessary envelope against translated spheres and independent shadow
constructions. [Series tests](test/occultation-series.test.ts) check synthetic
passages, gaps, clipping and near misses. The [development reference check](test/occultation-references.test.ts)
retains the published USNO Aldebaran and NAOJ Saturn events and their local
instants under [a preregistered containment rule](test/fixtures/events/CANDIDATES.md).
It does not compare contact times, validate all catalogue targets or show
that every event in those windows was found. Held-out checks remain in M12.

`searchLunarContacts()` searches vacuum contacts at a specified observer:

```js
import { searchLunarContacts } from "./occultations/.generated/index.mjs";

const result = searchLunarContacts({
  target: "Saturn",
  observer: { latitude: -20, longitude: 0, elevationMeters: 0 },
  window: { from: "2024-05-31", to: "2024-06-01" }
});
console.log(JSON.stringify(result));
```

The synthetic station matches the NAOJ development fixture in
[the contact comparison contract](test/fixtures/events/CONTACTS.md).
The observer uses geodetic degrees, east longitude and ellipsoidal elevation
in metres, as in `positionAt()`. A target is a supported planet or exact SAO
catalogue id. The search uses the existing topocentric adapters and engine
crossing solver directly, without requiring a geocentric candidate first.

Stellar contacts have `kind: "disappearance"` or `"reappearance"`.
Planetary contacts distinguish `"partial-disappearance-start"` (external
ingress), `"full-disappearance"` (internal ingress),
`"full-reappearance-start"` (internal egress), and
`"partial-reappearance-end"` (external egress). A partial-only occultation
has no internal contacts. These are spherical disk contacts; Saturn's rings,
planet oblateness, lunar terrain, atmospheres and refraction are absent.
The geometry is returned even below the horizon. Visibility, position angles,
illumination and altitude facts are not yet calculated.

`contacts` is chronological and owns `(from,to]`. Each contact gives its
direction, angular separation, semidiameters, signed clearance, numerical
root bracket and an immutable receipt containing both position receipts.
Angles are degrees. `at` is the first integer millisecond on or after the
numerical root; it is not a claim of physical accuracy to that precision.
The bracket's ends are equal for an exact sampled zero, otherwise adjacent
milliseconds. [Analytic tests](test/contact-intervals.test.ts) enforce these
numerical semantics, including dates before the Unix epoch.

`overlapIntervals` records times with some target coverage;
`fullCoverageIntervals` records times with the whole target covered.
For a point star these coincide. For a planet the latter is contained in the
former. Interval edges use the same quantized times as contacts. A
`start` or `end` of `"window"` means clipping, not a contact. A window
entirely inside an occultation can therefore have intervals and no contacts.
An ingress at the owned upper endpoint can have a contact but no interval
of positive duration. Missing full coverage inside a clipped window says
nothing about coverage outside it.

`CONTACT_LIMITS` defines the finite coarse step, budget and boundary halo.
The halo classifies contacts at window edges, and its extent is retained as
`receipt.search.evaluationWindow`. Clock seams and calculation-span limits
are checked across that whole support. All paired positions count against
the shared budget, including refinement, repeated instants and output.
Detected grazes, zero plateaus or inconsistent contact topology produce
`status: "refused", reason: "unresolved-contact"`. All refusals return empty
contact and interval lists with a receipt; no partial list is marked complete.
Completion is sampled, not a proof that every contact or tangent was found.

[The reference tests](test/contact-references.test.ts) apply the unchanged
maximum errors of 120 s per contact and 10 s per planetary disk-crossing
duration to USNO's Boston Aldebaran prediction on 1923-01-27/28 and NAOJ's
Saturn prediction on 2024-05-31. These are acceptance limits over those
qualified development cases, not general error bounds or measured maximum
residuals. The comparisons convert results to each source's nominal UT1
clock. Historical catalogue/station differences and undocumented NAOJ model
details remain in the [source contract](test/fixtures/events/EVENTS.md).
Position-angle, altitude and closest-approach checks remain deferred as listed
in CONTACTS.md. No held-out contact has been evaluated. [VALIDATION.md](VALIDATION.md)
records the checks, and [DESIGN.md](DESIGN.md) explains the incomplete physical
timing budget and grazing sensitivity.
