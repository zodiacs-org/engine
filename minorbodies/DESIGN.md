# Minor-body ephemeris design

## Status and scope

This is the design adopted in M1, extended by the ingestion, numerical and
Chiron pilot and full-range contracts below. The pilot adds an astronomical
evaluator and receipts. M5 adds the required bodies over the target interval,
with a separate full-data validation command. Its finite coverage samples
do not replace the final M11 accuracy and event corpus. M6 adds body dispatch,
generic longitude callbacks and configured-aspect rows with explicit receipts.
M7 adds station searches using the engine solver and independent event references.
M8 assembles retrograde windows from those stations and endpoint states.
M9 adds tropical sign ingresses with sign labels and independent direction evidence.

The required targets are Chiron, Ceres, Pallas, Juno and Vesta. Pholus and
Eris can follow only after the same checks. The target interval is
1800-01-01T00:00:00 TT inclusive through 2201-01-01T00:00:00 TT exclusive,
including the whole calendar year 2200. `src/acceptance.ts` defines that
requirement; `tests/catalog.test.ts` preserves the preregistration. Actual
availability must come from a validated dataset manifest, never from the
catalogue alone. There is no extrapolation outside installed coverage.

The package provides geocentric ecliptic longitude and latitude in degrees,
distance in au, longitude and latitude speed in degrees per TT day, distance
speed in au per TT day, and `retrograde = longitudeSpeed < 0`. A zero speed
does not imply a reversal. Results identify their frame, clock,
corrections and source dataset. Houses, planetary ephemerides and the HTTP
chart API remain the engine's responsibilities.

## Chosen representation

Fit piecewise Chebyshev polynomials to Horizons geocentric Cartesian
positions on fixed ICRF axes. Evaluation uses Clenshaw recurrence and
analytic polynomial derivatives. Cartesian fitting avoids wrapping at a
longitude boundary and avoids fitting nutation into the source table.
Distance is the Cartesian norm. Segment lengths and polynomial degree are
chosen on a pilot and tuning samples, then recorded in the manifest.

The alternative, propagating osculating elements with perturbations, would
require a force model, perturbing ephemeris, integrator error control and
validation of long-term dynamics. JPL describes elements as a state at an
epoch and its small-body ephemerides as integrated trajectory solutions
([orbit determination](https://ssd.jpl.nasa.gov/orbits_doc.html)). Interpolating
that solution makes the local numerical error and dataset identity easier
to audit. This is a design judgment, not a measured size or speed comparison.

Use these explicit Horizons settings, with a numbered asteroid selector
from `src/catalog.ts` and discrete Julian dates:

```text
EPHEM_TYPE=VECTORS
CENTER=500@399
REF_SYSTEM=ICRF
REF_PLANE=FRAME
VEC_CORR=LT+S
VEC_TABLE=2
OUT_UNITS=AU-D
TIME_TYPE=TT
TLIST_TYPE=JD
CSV_FORMAT=YES
OBJ_DATA=YES
MAKE_EPHEM=YES
```

The [Horizons manual's time specification](https://ssd.jpl.nasa.gov/horizons/manual.html#time)
allows TT for vectors, while the API parameter table omits that option.
Require a returned `JDTT` table and matching TT metadata; do not silently
fall back to TDB or relabel a time column. The generator must also verify
the resolved body, center, axes, units and corrections in the response.
Capture the actual API signature and reject unreviewed format changes.

`LT+S` supplies receive light-time and stellar aberration, without adding
solar gravitational deflection locally. The final convention must say
this explicitly. Do not treat the returned velocity columns as the
derivative of every corrected observable without verifying their meaning;
differentiate the fitted positions and validate with independent positions
around each held-out epoch.

## Time, frames and engine reuse

The companion `engine-bridge.ts` reuses `src/date-input.ts` and
`src/time-scale.ts`. ISO/Date inputs follow the engine's
time basis; explicit TT Julian dates avoid uncertain civil-time conversion.
Historical and future UTC uncertainty remains separate from interpolation
agreement. Coverage checks apply after conversion to TT and to every
coefficient evaluation. The pilot's derivative probes evaluate only frame
matrices and do not require coefficient coverage. Default engine calc
coverage ends earlier than this
project's target: dispatching ordinary bodies must preserve its refusals.

The engine's frame functions consume mean equator/equinox J2000 vectors,
called EQJ. Convert JPL ICRF to EQJ using the transpose of
`frameMatrix("equatorial-icrs", at)`, then apply
`frameMatrix("ecliptic-true-of-date", at)` from `src/calc-frames.ts`.
This reuses the engine's frame bias, IAU 2006 precession and IAU 2000B
nutation. Do not pass ICRF vectors directly to `eclipticOfDate`.

A rotating frame's velocity includes its matrix derivative. Rotating only
the fitted Cartesian velocity is insufficient. Include that term, or
difference the complete reduced position on a documented TT interval and
test convergence independently. At seams, check both position and speed
from both segments. Reject discontinuities that could create false stations.

These helpers are source-level dependencies, not public engine exports.
Record the engine source identity and isolate imports in the bridge.
Dependency and output preparation must write only under this directory.

## Accuracy acceptance

The following are proposed pass limits, not measurements or physical
uncertainty bounds. Their executable definition is `ACCEPTANCE_POLICY` in
`src/acceptance.ts`; its configuration test does not establish accuracy.

| Quantity | Maximum allowed absolute error | Comparison |
| --- | ---: | --- |
| Fitted direction | 0.05 arcsec | Held-out Horizons ICRF vectors |
| Ecliptic longitude | 1 arcsec | Held-out Horizons with independent frame reduction |
| Ecliptic latitude | 1 arcsec | Same independent reduction |
| Distance | 1e-7 au | Held-out Horizons vector norm |
| Longitude speed | 0.1 arcsec per TT day | Differences of held-out reference positions |
| Latitude speed | 0.1 arcsec per TT day | Same reference differences |
| Distance speed | 1e-8 au per TT day | Differences of held-out reference distances |

The direction fit receives a tighter limit to leave room for reduction,
time conversion and differentiation. End-to-end longitude and latitude
assertions remain mandatory; passing the fit limit cannot substitute for
them. Distance and derivative gates guard errors an angular fit alone
can hide, especially around stations. No allowance covers source orbit
uncertainty: matching a JPL solution does not measure its distance from
the physical sky. Near a station, a speed's sign can be uncertain even
when its numerical error passes the gate.

Separate training epochs, tuning epochs and final validation epochs before
fitting. The final corpus must not influence degree or segmentation. If
it reveals a failure, retain that result and preregister a new independent
corpus before changing the fit. Include endpoints, both sides of seams,
irregular interior epochs throughout the target interval and independent
station/ingress neighborhoods for each body. Assert disjoint epoch sets.

Compare vectors first, then ecliptic coordinates reduced by a separate
ERFA-based reference script. That script must not import this package's
fitter, evaluator or engine frame implementation. Use circular longitude
error, latitude error, vector separation and radial error separately.
Reference speed differences need a convergence study; reference stencil
epochs must also be absent from the training set. Horizons observer
ecliptic output can be a secondary check, with its frame and deflection
differences reported rather than silently folded into the tolerance.

Vitest must eventually assert these maxima on independent source fixtures.
Reports must state the tested epochs and solution identities. Finite sample
maxima are not proofs for all times. Missing full datasets cannot result in
a passing full-span suite through skipped tests. Ordinary offline unit
tests and the explicit full-data validation command must have distinct scope.

## Adapter and searches

Engine `calc()` and `events()` use closed body lists and have no provider
hook. The companion `calcWithMinorBodies` method delegates ordinary requests
to engine calc and handles minor bodies locally. Its result and receipt types
remain distinct. Unsupported centers, zodiac choices, frames and
corrections are refused explicitly. No cast can make an engine
`CalcPosition` genuinely support a new body.

The existing `BodyLongitudeAt<MinorBody>` callback plugs directly into
`searchLongitudeCrossingsWith` in `src/crossings.ts`. The synthetic test
`tests/engine-contract.test.ts` verifies that interface and its budget
refusal. Aspects use `findConfiguredAspects` with `{ body, lon, speed }`
rows and an explicit `policy.bodies` selection. Mixed rows must share a
frame, correction convention and speed clock; preserve each input receipt.

Stations will use that same crossing solver on the monotone mapping
`180 + atan(speed / speedScale) * 180 / PI`, targeting 180 degrees with a
positive speed scale. Classify a reversal from one-sided speed signs;
the solver's direction flag on this mapping describes speed increasing or
decreasing, not longitude retrograde state. Partition retrograde windows
from stations and endpoint signs. Sign ingresses search ordinary longitude
at sign boundaries. These wrappers must not copy the engine's event solver.

Preserve the solver's boundary, budget and deduplication conventions, and
document its smoothness assumption. Combined searches need a shared budget
and whole-result refusal. Event results record clipping at query boundaries,
search settings and the dataset receipt. Establish event timing by independent
reference brackets, not by reusing this package's previous event output.

## Data lifecycle and receipts

Downloads go to `.cache/`; fitted shards and full reports go to `generated/`.
Keep them gitignored. Keep source code, request manifests, original compact
reference samples and reviewed evidence notes in this folder. Every committed
file and generated data shard must stay below the file-size limit in
`ACCEPTANCE_POLICY`. Split data and requests before reaching that limit.

The generator is explicit, serial and cached, with bounded retries and
backoff. No runtime network call or import-time fetch is permitted. Reject
mixed orbit solutions across batches. Capture complete request parameters,
response hashes, target and perturber solution identifiers, retrieval time,
API signature, generator identity, segment layout and output hashes.
Rebuilding frozen inputs must be deterministic. A new live JPL fetch can
produce a new solution and therefore a new dataset identity; a manifest
does not make the remote service immutable. Preserve original responses
locally for an offline rebuild and fail on digest mismatch.

Every calculation, event and structured refusal must carry its applicable
request/convention receipt, with dataset identity when one was loaded.
Numerical results also identify the engine bridge, source solution, shard
digest, coverage and validation evidence status. Receipts describe
provenance; they do not authenticate it or turn sample errors into bounds.

## M2 ingestion contract

`src/horizons-request.ts` builds immutable, explicit requests using the settings
above. `src/horizons-parser.ts` validates the actual returned metadata before
accepting a vector. The tests in `tests/horizons-parser.test.ts` enforce this
contract against the original captures in `tests/fixtures/horizons/` and
deliberately corrupted copies of them.

Requests contain at most 128 positive, strictly increasing TT Julian dates.
This is a local batch limit, not a service limit or a coverage claim. Dates
must be distinct at Horizons' observed nine-decimal JD output precision. Each
returned date must equal its requested date rounded to that precision; the
returned `jdTt` is the printed epoch. Fitting must use that returned epoch,
or choose training dates representable at this precision. The parser checks
the TT labels, Cartesian column order, finite numbers, row count and table
markers. It rejects missing rows, reordered epochs and changed conventions.

The captures identify `NASA/JPL Horizons API` version `1.2`. The parser admits
only that observed signature. The API documentation currently advertises a
different version; that alone does not approve new response bytes. An actual
response with another signature requires review and new fixture coverage.

The source identity includes the selected numbered body, target designation,
orbit solution reference and date, initial TDB epoch and ICRF state, Earth
solution, small-body perturber solution and EOP filename. The initial orbit
epoch is distinct from the requested TT output epochs. The helper
`assertSameHorizonsSolution` rejects differences in these fields across batches
for the same body. Its EOP check is conservative: even a routine EOP file
refresh fails equality and requires a separately reviewed dataset. Comparing
different bodies with this helper also fails by design.

`src/horizons-client.ts` is an explicitly imported build tool. It has no
import-time I/O and is not re-exported by the companion runtime entry. Each
capture records the complete canonical request, SHA-256 of its JSON encoding,
SHA-256 and byte length of the original UTF-8 JSON response, retrieval time,
API signature, source identity and generator identifier. The response bytes
are retained unchanged. Cache reads recompute the hashes and parse the source
again, then compare every manifest field. A caller-supplied digest additionally
pins an original source. Writes use a temporary file followed by rename.

The module-wide queue covers all instances, reads the entire response before
another request, and holds the slot through retry delays. It does not coordinate
separate operating-system processes; run generators one at a time. The default
is at most three attempts with exponential backoff starting at one second.
Retries are limited to network/read failures, HTTP 429 and HTTP 5xx. A request
times out after 30 seconds by default, covering its response body. Retry-After
is honored within the one-minute delay cap; a longer server delay fails for a
later explicit attempt. Redirects are refused. Downloaded responses are capped
at 900,000 bytes and encoded cache records below 2,000,000 bytes. These are
enforced operational limits, not measured ephemeris sizes. The default options,
caps, retry and timeout behavior are checked in `tests/horizons-client.test.ts`.

`scripts/capture-horizons.ts` captures only the fixed parser-fixture epochs.
Its check mode validates the committed raw responses and manifests without
using the cache or network. Its replay mode requires cached bytes matching the
committed digests. Its capture mode writes proposed fixtures into an ignored
directory. This is the intake foundation for the later fitting generator;
it is not a full-span coefficient generator or an accuracy test.

## M3 numerical contract

`src/chebyshev.ts` fits each Cartesian axis as
`p(x) = sum(c[k] * T[k](x))`, with
`x = 2 * ((jdTt - startJdTt) / (endJdTt - startJdTt)) - 1`.
The constant coefficient has its full weight. The Chebyshev recurrence is
described in [NIST DLMF, table 18.9.1](https://dlmf.nist.gov/18.9.T1);
[DLMF's Clenshaw algorithm](https://dlmf.nist.gov/3.11.ii) uses a different
constant-coefficient convention, so its coefficients must not be copied into
this format without conversion.

`fitChebyshevSegment` takes an explicit degree and ordered samples with
`jdTt` and `positionAu`. It solves unweighted least squares by Householder QR,
sharing the factorization across Cartesian axes. It uses the supplied epochs
in its matrix, including Horizons' printed rounding. It does not replace them
with ideal cosine nodes. Square and overdetermined systems are supported;
duplicate, unordered and out-of-interval epochs are rejected. Source velocity
columns may be present on a Horizons row but are not fitted or used as
derivative expectations.

`evaluateChebyshevSegment` evaluates the series with Clenshaw recurrence and
differentiates that recurrence analytically. The derivative is multiplied by
`2 / (endJdTt - startJdTt)` to obtain au per TT day. Both segment endpoints
are evaluable for seam comparisons. Extrapolation is rejected. The input
validator copies and deeply freezes coefficients; repeated evaluation of its
own validated snapshot avoids copying again. Invalid data throws `RangeError`.

`CHEBYSHEV_LIMITS` caps degree at 64 and training samples at 4096. Positive TT
Julian dates up to 10,000,000 are admitted; each supplied Cartesian value and
coefficient must have magnitude at most 1,000,000 au. The computed triangular
QR factor must have infinity-norm condition number at most 100,000,000.
Numerical rank loss and potential derivative overflow also refuse the fit or
segment. These are operational guards, not physical coverage or error bounds;
`tests/chebyshev.test.ts` fixes their values and tests the refusals. Passing the
condition check does not establish interpolation accuracy.

The same ordered inputs produce the same coefficients within the same
JavaScript runtime. Cross-runtime bitwise agreement is not promised. Negative
zero coefficients normalize to zero. The fitter does not choose a degree,
select training data or approve a source solution. Those decisions belong to
the frozen generator recipe and independent checks in later milestones.

`tests/chebyshev.test.ts` compares fits with monomials evaluated separately,
trigonometric functions and their analytic derivatives, including segment
edges, rounded Julian dates, irregular sampling and the maximum degree. It
also checks an overdetermined fit with a separately derived least-squares
solution. These are numerical-algorithm tests, not ephemeris accuracy evidence.
`tests/coefficient-shard.test.ts` adds a fit/encode/decode/evaluate check against
analytic positions and rates across a segment join.

## M3 coefficient shard contract

`src/coefficient-shard.ts` defines `minorbodies-chebyshev-shard-v1`:
body, conventions, provenance, validation status and contiguous segments.
Each segment names its TT Julian endpoints and the Cartesian coefficient
arrays. Axes within a segment share a degree; successive segments may differ
in degree or duration. Gaps, overlaps, reversed order, extra object fields,
accessor fields, sparse arrays, nonfinite coefficients and unsupported
conventions are rejected. Validated records are immutable snapshots.

`SHARD_CONVENTIONS` fixes the coordinate, correction, time, unit and series
conventions above. `provenance` records the source kind, a source-manifest
SHA-256, a generator identifier and a generator-recipe SHA-256. Synthetic
tests use `source: "analytic-test"`; future real datasets must use
`"jpl-horizons"`. A digest field alone does not verify that a source manifest
exists or agrees with those claims. The future dataset loader must read and
verify that manifest, reject synthetic sources for astronomical calculations,
and enforce source identity across shards. This codec performs no file or
network I/O and always retains `validation: "unvalidated"`. It cannot confer
an accuracy status or supported astronomical range.

`encodeCoefficientShard` returns canonical JSON text and a separate descriptor.
The text has a fixed field order, full binary64 JSON number serialization and
a trailing line feed. The descriptor records SHA-256, UTF-8 byte length,
body, coverage, segment count and source-manifest digest. Decoding requires
that external descriptor, checks its digest and every metadata field, validates
the schema, and requires exactly the canonical encoding. A changed byte,
duplicate JSON field or inconsistent descriptor fails. Hashes detect changed
bytes relative to the supplied pin; they do not authenticate the source.

Each encoded shard must be below 2,000,000 UTF-8 bytes and contain at most
1024 segments, as enforced by `SHARD_LIMITS` and
`tests/coefficient-shard.test.ts`. Split a dataset before reaching either cap.
The byte limit also applies to in-memory shard validation and to multibyte
JSON inputs. Generated shards belong under ignored `generated/`.

`evaluateCoefficientShard` selects a segment by binary search. Coverage is
start-inclusive and end-exclusive, and an exact internal seam belongs to the
right segment. The last endpoint can still be examined by the segment-level
evaluator. `measureShardSeams` compares both endpoint positions and analytic
velocities in Euclidean au and au per TT day. `measureSegmentJoin` does the same
for neighboring segments across a shard boundary. `assertShardContinuity`
requires explicit finite nonnegative limits and rejects a jump in either
quantity, including equal positions with unequal velocities. Loading a
structurally valid shard does not itself call that gate. The pilot loader
below enforces real-dataset seam limits and supplies astronomical receipts.

## M4 pilot and evaluator

`src/pilot-recipe.ts` preregisters Chiron from TT JD 2451544.5 inclusive to
2451910.5 exclusive, calendar year 2000. Each segment spans at most 16 days;
its Cartesian fit has degree 14 and uses 17 Gauss nodes. The final segment
is shorter. The held-out corpus covers irregular interiors, the first
endpoint, just inside the final endpoint, internal seams and both sides of
each seam. Each reference-speed center has independent position samples at
plus/minus 0.005 and 0.01 TT day. There are no tuning epochs. These definitions,
counts and training/reference disjointness are enforced by
`tests/pilot-recipe.test.ts`; the complete request manifest is
`tests/fixtures/pilot/manifest.json`.

The original recipe is retained as `PILOT_RECIPE_V1`. Intake stopped before
any fit or held-out comparison because Horizons changed the last printed
digit of a requested Julian date. The active recipe rounds requests to six
decimal places, retaining the parser's exact returned-epoch check. This is
an intake precision change, not a change to the degree, segment lengths,
selection fractions or error budgets. The tests preserve both recipes.
Transport batches were also reduced after HTTP 502 responses. Batching does
not change the epoch sets or enter the fitting decision.

`scripts/generate-pilot.ts` verifies all retained original responses before
fitting. It requires the frozen generator source hashes and exact Node
runtime, and rejects a changed solution, request, role or response digest.
Coefficients and descriptors go only to ignored `generated/pilot/`. Identical
frozen inputs regenerate identical bytes under the recorded runtime.
`src/pilot-sources.ts` shares the same strict source verification with the
runtime loader. This pilot uses one shard; the loader also checks ordering
and joins when the same coverage is split across shards. Position and
Cartesian speed jumps must each be at most 1e-9 in au and au per TT day,
respectively, before calculation is admitted. These limits were set before
the fit and are enforced by the recipe and evaluator tests.

`src/engine-bridge.ts` reuses the engine's strict date parser and time basis.
Explicit `{ jd, scale: "tt" }` inputs avoid a civil-time conversion. Calendar
inputs retain the engine time record, including its Delta T source and
uncertainty. Coverage is checked on the resulting TT epoch. Invalid times,
unknown/unavailable bodies and out-of-coverage epochs are structured
refusals; malformed datasets fail loading before an evaluator is returned.

The bridge turns ICRF through the engine's frame bias into EQJ, then into
the true ecliptic/equinox of date. Velocity is `R v + R' p`: the analytic
polynomial velocity plus the time derivative of the rotation. `R'` uses a
symmetric five-point matrix stencil with a 0.01 TT-day step. Only the frame
is probed outside an endpoint; coefficients are never extrapolated.
`tests/engine-bridge.test.ts` checks static-vector frame motion, moving-vector
derivatives, time conversion, invalid input and frozen snapshots. This
avoids treating the source's corrected velocity columns as derivatives of
the fitted observables.

`scripts/reference-erfa.py` independently turns held-out Horizons ICRF
positions using ERFA's IAU 2006/2000A bias/precession/nutation matrix and
true obliquity. It imports neither the engine nor this package's numerical
implementation. `tests/pilot-accuracy.test.ts` checks every held-out position
inside coverage and every registered reference-speed center against the
unchanged acceptance policy. Reference speeds use position differences on
the actual TT epoch intervals. Fine versus coarse stencil differences must
be no greater than one tenth of each speed budget, enforced by
`REFERENCE_CONVERGENCE_LIMITS` and the accuracy tests. Both direct and
retrograde states are checked where the reference speed exceeds the full
longitude-speed budget. Stations are not located by this milestone.

Every result and calculation refusal has a convention/dataset receipt, with
the time record when the input time was resolved.
It names the source manifest and generator digests, JPL solution, installed
coverage, engine package/runtime and local source graph hashes. Successful
positions also identify their shard and segment. The loader verifies source
bytes, schema and joins; it deliberately records
`accuracy-not-certified-by-loader`. Passing sample tests is documented in
`docs/evidence/M4.md`, not converted into a guarantee at all instants.
Hashes detect changes relative to pins and are not signatures. The loader
does not prove that arbitrary caller-supplied coefficients were honestly
generated; the retained-source regeneration and independent tests are the
checks on this pilot's coefficients.

## M5 full-range data

`src/full-recipe.ts` fixes the same segment length, degree, training-node
count and seam limits as the pilot. It extends the interval to the target
defined above and uses the same settings for every required body. There
is no tuning corpus and no fit change based on the full-range holdouts.
`tests/full-recipe.test.ts` enforces contiguous coverage, exact epoch sets
and disjointness of training and reference epochs.

The M5 coverage corpus samples an irregular interior of every segment,
cycling the pilot's registered interior fractions. It samples every
registered seam neighborhood and both coverage edges. All shard boundaries
are in the reference seam corpus. Cartesian position and velocity joins are
also measured at every segment boundary, including boundaries between
files. `tests/full-accuracy.test.ts` checks the complete registered corpus;
missing local sources, coefficients or the independent reducer fail that
explicit suite. Default tests check the compact manifests and the pilot;
they do not claim the full-data accuracy suite ran.

The full generator uses the separate Horizons File API, observed signature
`1.0`, with POST input files. `src/horizons-file.ts` verifies that envelope
before reusing the original parser's result-table grammar through bounded
in-memory views. Those grammar views are not source captures. Receipts and
digests retain the original File API signature and unchanged response bytes.
`tests/horizons-file.test.ts` checks the actual retained File API fixture,
corrupt responses, multipart settings, serialization, caching and transport
limits. Run only one live capture process, including the legacy GET client.

`data/manifests/` holds the frozen source manifests. The committed recipe
reconstructs every exact epoch and POST parameter; each response receipt
pins that canonical request, original response bytes, retrieval time and
source solution. The generator's source hashes and exact Node runtime are
frozen too. The body manifest digest enters every coefficient shard and
calculation receipt. `data/receipts/` independently pins each generated
coefficient file, its coverage, segment count and measured byte length.
`tests/full-sources.test.ts` rejects altered or malformed manifest fields.
The full accuracy suite requires regenerated descriptors to match the
committed coefficient receipts exactly.

Original bulk responses stay in ignored `.cache/horizons-full/` and
coefficients in ignored `generated/full/`. `full:build` is strictly offline
and requires the frozen originals. `loadFullBody` reads the pinned files,
checks every original source and all joins, and returns the same evaluator
and receipt contract as the pilot. It does not fetch, fit or extrapolate.
The loader still records `accuracy-not-certified-by-loader`. A compact
manifest alone is neither the source corpus nor a coefficient distribution.
Preserve the caches with the generated files when transferring a working
installation. A clean clone does not contain this bulk data, and a new live
fetch cannot promise identical source bytes or solution identities.

## M5 reference-speed correction

The original full-range comparison used the pilot's short central
differences. It failed the distance-speed convergence gate for every body
and the distance-speed comparison for Chiron. The original algorithm is
retained in `src/full-validation-v1.ts`; `full:validate:v1` replays it and
writes a separate report. The failure is recorded in the M5 evidence note.
No coefficient, training epoch, segment, degree or acceptance budget was
changed after that comparison.

The largest inspected discrepancies straddled Horizons response boundaries.
They also appeared when differencing norms of the raw ICRF vectors, without
the package's evaluator or ERFA. This implicates tiny response-dependent
numerical differences amplified by the short stencil; the exact internal
Horizons cause is not established. The failed reference does not establish
the physical or interpolation error of a smooth derivative.

`src/speed-reference-sources.ts` preregisters a supplemental reference-only
corpus before its capture. It retains the same speed centers, takes broader
stencils and groups every complete stencil in one response. Its epochs are
disjoint from training. Its separate manifests bind each original response
to the same orbit solution and base source-manifest digest. These files
never enter the coefficient generator.

The replacement reference uses the seven-point centered derivative
`(45*(f(t+h)-f(t-h)) - 9*(f(t+2h)-f(t-2h)) + f(t+3h)-f(t-3h))/(60*h)`.
Longitude differences wrap across zero; latitude and range use ordinary
differences. Both stencils require their actual TT epochs to have the
registered exact spacing. Fine and coarse steps, and the unchanged
convergence allowance, are fixed by `SPEED_REFERENCE_RECIPE` and tested by
`tests/speed-reference-sources.test.ts` and the analytic derivative tests.
The full suite still enforces every original speed limit and reference
convergence limit. Longer differences are accepted only if those checks
pass. Reports identify both reference corpora and hash the comparison
implementation as well as the independent ERFA reducer.

## M6 body adapter

`src/body-adapter.ts` provides an explicit asynchronous setup function,
`createBodyAdapter`, over already loaded datasets. Its calculations remain
synchronous. It snapshots the provider list, rejects duplicate bodies, and
records its local source graph through `readAdapterSourceIdentity`. This
graph includes the engine calc, crossings and configured-aspect interfaces
and the companion evaluator. Type-only interface dependencies are included
in the hash record. Hashes establish local file identity, not authentication
of an injected provider. A provider is trusted executable code, and the
intended inputs are the checked offline loaders' immutable return objects.

The adapter's `calcWithMinorBodies` method takes calc's request vocabulary
and widens only the body label. It delegates ordinary bodies with their
options and input clock intact, including heliocentric, sidereal and other
combinations the engine supports. It snapshots and freezes the resulting
values without changing engine refusal reasons, details or spans. Native
engine refusals lack a receipt, so the companion wraps them with the request
and implementation record. The original engine receipt remains attached to
each successful result. Minor-body results keep their distinct position and
receipt types; no engine `CalcPosition` or measured bound is fabricated.

Minor requests accept only the convention actually stored and evaluated:
geocentric apparent true-of-date tropical ecliptic coordinates, degrees,
full speeds, no Cartesian output, and no gravitational deflection. Other
requested centers, frames, zodiac choices, corrections or outputs produce
explicit refusals. Missing datasets and unknown labels also refuse with an
adapter receipt. Malformed fields or time syntax throw `RangeError` before
evaluation. Snapshotting preserves unknown keys even if their value is
undefined, rejects accessor fields, and copies Dates only in valid time
positions. This is an ordinary data boundary, not a sandbox against proxies
or other code running in the caller's process.

`src/adapter-input.ts` translates calc's ISO/Date, ISO-with-pin and Julian
date vocabulary using the engine's `dateFrom` and `timeBasis`. UTC and UT1
Julian dates retain fractional milliseconds through the conversion; no Date
round trip truncates them. Explicit TT Julian dates retain their exact input
value. A Delta T pin affects inferred UT1, not an explicit TT epoch. The
minor-body evaluator receives the resolved TT, and the adapter's outer
receipt retains the original time input and conversion. This preserves the
original bridge's narrower input contract without changing its evaluator.

`aspectRows` calculates an explicit, unique body selection at a common TT
epoch, using the TT clock for ordinary-body speeds too. It carries an explicit
Delta T pin into every TT request, preserving the engine's provenance and
UT1 coverage refusal. Its success is immutable `{ body, lon, speed }` rows
and the per-calculation receipts. Every refusal returns an empty row list;
receipts may describe attempted calculations but no partial table is offered.
The caller supplies these rows to the existing `findConfiguredAspects` and
explicitly selects minor-body labels in the policy. No aspect algorithm is
copied or replaced.

The common physical convention for these rows is receive light time and
stellar aberration without gravitational deflection. The computational
approximations differ: engine calc uses Newtonian light time and
backdated-observer aberration; the minor-body fit follows Horizons LT+S.
`ASPECT_ROW_CONVENTIONS` and every original receipt retain this distinction.
The package does not equate their numerical accuracy or uncertainty. The
Moon's instantaneous geometric series, the lunar nodes and mean apogee do
not have that correction convention and are refused by this row helper.
They remain available through ordinary calc dispatch and individual
longitude callbacks. Earth retains its engine refusal at the geocentric
origin. `tests/body-adapter.test.ts` checks both admitted and refused mixes.

`createLongitudeCallback` returns `longitudeAt`, directly compatible with
the engine generic crossing solver, plus `calculateAt` for a sample with
its full receipt. Its Dates denote calendar readings on the explicit
`dateScale`, default TT; a printed Z in TT mode must not be interpreted as
UTC. The callback receipt identifies that clock, the optional pin, installed
datasets and source graph. UTC or UT1 mode uses the engine time basis, with
its possible clock steps. A numerical provider refusal throws
`BodyAdapterRefusalError` carrying the complete refusal and receipt.
Malformed Date input throws `RangeError`. Sample-budget behavior, interval
ownership and root refinement remain the existing solver's. Direct solver
output has no new event receipt or completeness claim; the dedicated event
wrappers are described below and in subsequent milestones.

`tests/body-adapter.test.ts` compares delegated values with direct engine
calc, checks time conversions, refusals and immutable receipts, and repeats
the unchanged pilot held-out Horizons/ERFA acceptance gates through adapter
dispatch. Its real-trajectory crossing target is derived from the pilot for
integration testing, not independent event timing evidence.
`tests/full-adapter.test.ts` checks installed required-body dispatch and mixed
rows over finite full-data samples, including the final calendar year and
coverage edges. Existing full accuracy checks remain separate and mandatory
under `full:test`. No fit, source corpus or acceptance limit changes in M6.

## M7 station contract

`createStationSearcher(adapter)` captures the station wrapper and engine solver
source identities explicitly, then exposes synchronous `searchStations` calls.
Only installed minor bodies are admitted. The caller's calc-compatible endpoint
inputs are snapshotted and resolved with the adapter's existing time conversion.
The internal clock is continuous TT; no civil-time model seam is scanned as a
speed discontinuity. Results retain the original requests and their conversions.

The wrapper calls `searchLongitudeCrossingsWith` on the angular speed mapping
described above, with a fixed positive unit speed scale. It does not implement
bisection, golden-section search or longitude-event enumeration. Samples whose
finite speed rounds to the target during the solver's angular normalization, or
saturates at its far-side cutoff, refuse as `speed-resolution`. Such a speed
cannot silently become a zero or disappear from the search.

The solver receives relative Date coordinates beginning at zero. The origin
maps to the exact input TT Julian date; each integer millisecond maps to that
origin plus elapsed TT. The final Date coordinate is the ceiling of the elapsed
milliseconds and maps to the exact ending TT Julian date. This preserves arbitrary
fractional input epochs and prevents a sample beyond an exclusive coverage edge.
Direction probes can use fractional milliseconds. Output events use TT Julian
dates rather than mutable Dates or a misleading UTC label.

The admissible coarse step is at least a millisecond and at most five TT days,
with a default of one TT day. Direction probes reach up to a minute on each side
of a candidate, clipped to the query endpoints and the midpoints to neighboring
candidates. These are operational choices, not demonstrated full-range speed
extremum bounds. `tests/stations.test.ts` enforces the limits and tests boundary
roots, paired reversals and the maximum step. The existing solver's bisection
and deduplication settings are recorded in the receipt. Its smoothness assumption
now concerns the mapped speed: at most one speed extremum in two coarse steps.

Only opposite, nonzero one-sided speeds establish a station direction. A sampled
zero with matching nonzero signs on both sides is discarded as a touch. Matching
signs with a nonzero candidate, a zero direction probe or a collapsed probe
interval produce `station-direction-unresolved`, with the candidate TT epoch.
The mapped solver's direction flag is never used as a longitude motion flag.
An exact zero at the inclusive query end likewise needs more support and refuses;
no probe goes beyond the query. An exact starting station belongs to the preceding
window under `(from, to]` and is excluded. Searches must lie wholly inside loaded
coverage, whose upper endpoint is exclusive. No clipping or extrapolation occurs.

One budget counts every provider invocation: coarse scan, root refinement,
direction probes and final event positions, including repeated evaluations.
The default and optional unlimited budget are tested. The engine solver performs
its original coarse-count preflight; later stages share the remaining budget.
Any refusal discards all pending events, including failure after earlier events
have already been calculated. A provider refusal retains its original receipt.
Every completed event records its position and both classification samples;
all events share the final search receipt with total work, dataset, source
identities, settings and evaluated shard digests. Receipts establish provenance
and declared conventions, not physical accuracy or proof of completeness.

Independent event intake is described in
[M7 station reference evidence](docs/evidence/M7-station-reference.md).
`tests/station-accuracy.test.ts` checks the retained Chiron pilot;
`tests/full-stations.test.ts` checks the loaded full datasets for the required
bodies. Their expected brackets come from disjoint original Horizons positions
and the separate ERFA reducer, including independent stencil convergence.
The tests enforce the preregistered timing margins and the unchanged longitude
and speed arcsecond limits at held-out station-neighborhood epochs. No fitted
coefficient, polynomial degree, source training epoch or position acceptance
budget changes for M7. Full-range event validation remains M11.

## M8 retrograde-window contract

`createRetrogradeWindowSearcher(adapter)` captures its local source identity
and creates the existing station searcher. `searchRetrogradeWindows` accepts
the same request shape as `searchStations`. The station API validates and
snapshots the input and resolves its clock. Assembly reads only that immutable
record, including the TT endpoints, body and settings. It neither copies the
root solver nor changes the station implementation.

The station scan runs first. A refused scan returns an empty window and station
list with its original reason, provider refusal and candidate epoch. A completed
nonempty scan is followed by endpoint calculations on explicit TT. These calls
share the original budget; repeated evaluations count again. Thus completion of
the scan alone does not ensure enough budget remains for a window result. An
empty request requires no endpoint evaluation. Provider refusals and nonfinite
speeds discard all pending output.

Negative speed at the initial endpoint opens an episode at the query edge.
Each direct-to-retrograde station opens an episode, and each retrograde-to-direct
station closes it. An open episode at the final endpoint is clipped there.
Initial motion must agree with the first station's incoming motion, subsequent
directions must alternate, and the resulting motion must agree with the final
endpoint speed. Contradictions refuse as `retrograde-state-inconsistent`.
These checks expose some missed or unresolved transitions; equal endpoint
states cannot rule out a missed pair, and the original scan assumptions remain.

A zero at the excluded starting station cannot tell its outgoing direction by
itself. The wrapper probes inward, at most the station direction-probe distance
and no further than halfway to the first returned station or query end. If that
TT epoch rounds to either limit, or its speed is zero, the request refuses as
`retrograde-state-unresolved`. The query boundary remains clipped because the
wrapper has no classification on both sides of it. An unresolved ending zero
refuses too; exact terminal station candidates retain the existing
`station-direction-unresolved` refusal. No probe leaves the query or installed
coverage. The dataset's exclusive end remains inadmissible.

Windows are episode extents, not an exact strict-negative-speed set. Isolated
zero-speed touches that do not reverse direction stay within their surrounding
episode; their instantaneous position still reports `retrograde: false`.
Numerically located station boundaries also inherit finite time refinement and
deduplication. A boundary rounded onto the query end must not create a
zero-duration window. A clipped flag means a query boundary without a classified
station, not knowledge that the episode continues outside it. Adjacent queries
split within an episode give clipped pieces; callers must not infer a station
from those artificial split points.

Each window receipt links its classified boundary stations, using null at clipped
boundaries, and the aggregate search receipt. The aggregate retains the station
search receipt, endpoint and optional inward-probe records, total provider calls,
evaluated shard digests and implementation hashes. The station-search work count
remains its own subtotal. All results, including refusals, are immutable snapshots
and JSON-serializable. Invalid request syntax still throws before any calculation.

`tests/retrogrades.test.ts` covers synthetic assembly, adjacent queries, touches,
endpoint zeros, supported-range edges, shared budgets and refusal propagation.
The independent pilot and required-body checks use the retained M7 Horizons
corpus and ERFA, selecting query and split epochs from that reference alone.
`tests/retrograde-accuracy-helper.ts` reconstructs expected episodes and enforces
the existing timing margin and longitude/speed arcsecond limits. No new fit,
source response or acceptance budget is introduced. [M8 evidence](docs/evidence/M8.md)
records the distinction between independent event checks and boundary integration
tests; the full-range event corpus remains M11.

## M9 sign ingress contract

`createIngressSearcher(adapter)` records local source identities and exposes
synchronous `searchIngresses` calls over installed minor-body datasets. Input
validation and endpoint conversion follow the station request vocabulary.
The search preserves the exact starting and ending TT Julian dates with the
same relative integer-millisecond solver coordinates as station searches.
Only the existing engine `searchLongitudeCrossingsWith` enumerates and refines
candidate events. The wrapper calls it separately for each boundary from the
engine's sign catalogue; it does not implement a new event solver.

The wrapper checks the aggregate coarse-grid cost before sampling. Every
provider invocation in every boundary scan, root refinement, direction probe
and event position shares the original budget. Calls are not memoized, so
repeat epochs count again. The remaining budget is passed into each engine
search as well as enforced at the provider boundary. Any failure discards the
whole pending ingress list. A missing dataset, unsupported TT epoch, coverage
failure or provider refusal retains its applicable request and source receipt.

Candidates from all boundaries are sorted by time, with boundary longitude as
the tie breaker. Direction probes are clipped to the query endpoints and
midpoints between neighboring candidates. Opposite, nonzero offsets from the
boundary establish direct or retrograde entry. Both offsets must be nearer
than a sign width, keeping the probe labels in the adjacent signs. The local
offset calculation avoids the engine solver's addition of a full circle to
small differences, which can erase a real offset at binary64 precision.
Each solver callback also checks for that loss and refuses as
`longitude-resolution`, so an entire slow crossing cannot become a sampled
plateau with an empty completed result. Tests cover either direction.
An exact candidate longitude equal to the boundary, with zero speed and
matching nonzero one-sided offsets, is discarded as a touch. An approximate
touch or any unresolved direction refuses the search. The solver's own
direction flag is not the classification evidence.

The event's `longitudeDeg` names the exact boundary. Its `position` retains
the calculated value at the approximate event epoch. `fromSign` and `toSign`
are the engine's lowercase `ZodiacSign` slugs on the incoming and outgoing
sides, including the wrap between Pisces and Aries. The solver's per-target
deduplication is preserved; different boundaries are not deduplicated together.
Every event links its position receipt, classification samples and final search
receipt. The latter records the total provider calls, settings, source graph,
dataset, evaluated shard digests and rejected touch count. Results and receipts
are immutable snapshots with JSON-safe values.

Half-open ownership remains `(from, to]`. A starting-boundary event is excluded.
An exact hit at the inclusive upper endpoint refuses because its following
side cannot be sampled within the query. A candidate rounded onto that endpoint
can still be classified when the exact endpoint lies beyond the root. No
provider call leaves the requested interval or installed coverage. The search
inherits the engine solver's finite refinement, per-target deduplication and
smooth-longitude assumption of at most one station in two coarse steps.
The receipt states scan completion rather than proven event completeness.

`tests/ingresses.test.ts` independently specifies invented analytic trajectories
for wraparound, repeated crossings, close pairs near a station, touches and
query edges, plus budgets and input/refusal behavior. These are mathematical
and integration checks, not astronomical reference data. Held-out original
Horizons positions, reduced separately through ERFA, supply the astronomical
expectations described in [M9 evidence](docs/evidence/M9.md). No fitted data,
training epochs, coefficient recipe or original accuracy budget changes.
