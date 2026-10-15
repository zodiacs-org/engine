# Minor bodies companion

This source-checkout package is under development. It computes geocentric
ecliptic longitude, latitude, distance, speeds and retrograde state for Chiron,
Ceres, Pallas, Juno and Vesta from explicitly loaded local tables, with
provenance receipts. Its Chiron pilot is also retained. The implementation
sequence is in [PLAN.md](PLAN.md). The body adapter, station search and
retrograde windows are available; sign ingresses and the CLI remain later milestones.

The design uses JPL Horizons samples to build local Chebyshev tables. See
[DESIGN.md](DESIGN.md) for conventions, coverage, validation and engine
integration, and [SOURCES.md](SOURCES.md) for provenance. Agreement with a
finite reference corpus is separate from the JPL orbit's physical uncertainty.

From this directory, using Node 22.22.2, the frozen pilot generator runtime:

```sh
npm ci --ignore-scripts --cache .cache/npm
python3 -m venv .cache/reference-venv
.cache/reference-venv/bin/python -m pip install --cache-dir .cache/pip -r scripts/requirements-reference.txt
npm run check
npm run pilot:build
npm run pilot:validate
```

The Python environment is needed only for independent validation. Calculations
and coefficient regeneration use local files after dependency setup. Missing
reference dependencies or pilot sources fail the tests; they are not skipped.
The frozen generator checks its implementation hashes and exact Node version.

Tests validate Horizons intake against original responses and corrupted copies.
Numerical tests compare Chebyshev positions and analytic derivatives with
separately evaluated polynomials and trigonometric functions. Shard tests
exercise byte integrity, metadata, interval selection and boundary continuity.
Separate synthetic tests exercise target selection and the engine's existing
generic crossing and configured-aspect interfaces. Those synthetic and analytic
checks are not astronomical accuracy evidence. The pilot accuracy tests instead
use held-out original Horizons vectors, an independent ERFA frame reduction and
reference position differences for speeds. Checks also validate the frozen
source captures and list the root package without running build hooks, to
verify that this directory is excluded.

## Chiron pilot

Pilot coverage is 2000-01-01 TT inclusive to 2001-01-01 TT exclusive.
`tests/pilot-recipe.test.ts` fixes this interval; `tests/ephemeris.test.ts`
checks its boundaries after time conversion. The separate full-range loader
below covers the required bodies. No coefficient extrapolation is allowed.

After `npm run pilot:build`, source-checkout Node execution needs the companion
resolver for the parent engine's TypeScript imports:

```sh
node --import ./scripts/register-source.mjs --experimental-strip-types --input-type=module <<'JS'
import { loadChironPilot } from "./src/index.ts";
const ephemeris = await loadChironPilot();
console.log(ephemeris.calculate("Chiron", { date: "2000-06-01T00:00:00Z" }));
JS
```

`calculate(body, time)` returns `status: "ok"` with `longitudeDeg`,
`latitudeDeg`, `distanceAu`, `longitudeSpeedDegPerDay`,
`latitudeSpeedDegPerDay`, `distanceSpeedAuPerDay` and `retrograde`.
Speeds are per TT day. Positions use the true ecliptic and equinox of date,
receive light time and stellar aberration, without gravitational deflection.
The result's `jdTt` is the epoch actually evaluated.

Use `{ jd, scale: "tt" }` for an explicit TT Julian date, or
`{ date, timeScale?, deltaT? }` for the engine's resolved calendar input and
time basis. Calendar input defaults to UTC. Historical/future civil-time
uncertainty and input precision are separate from interpolation agreement.

Unknown or unavailable bodies, invalid times, and epochs outside installed
coverage produce structured refusals. Every result or refusal carries a
receipt naming conventions, loaded dataset, source identity, engine source
hashes and runtime; successful positions also name the shard and segment.
Receipts are provenance records, not authentication or physical error bounds.
The loader checks source bytes and joins; its receipt explicitly does not
certify accuracy. The independent test scope is in
[the M4 evidence note](docs/evidence/M4.md).

`pilot:build` reconstructs ignored `generated/pilot/chiron.json` and its
descriptor from the retained original sources, without network access.
`loadChironPilot()` reads those files and verifies their provenance against
the retained responses. It does not fit or fetch. `pilot:validate` writes the
full independent reference and comparison report under ignored
`generated/pilot/`, retaining a failing report if a numerical gate fails.
`pilot:capture` explicitly obtains proposed replacement sources under ignored
`generated/pilot-sources/`; it never changes the retained originals. A changed
JPL solution is a new dataset and needs a new validation record.

## Full-range local tables

The full recipe covers 1800-01-01 TT inclusive to 2201-01-01 TT exclusive,
including the whole calendar year 2200, for every required body.
`tests/full-recipe.test.ts` enforces that range. `tests/full-accuracy.test.ts`
checks held-out Horizons samples throughout it, including shard boundaries,
independent ERFA reduction, reference-speed convergence and unchanged
arcsecond limits. These are finite M5 coverage checks; the denser final M11
corpus and event checks remain pending. See [M5 evidence](docs/evidence/M5.md).

Bulk source responses and coefficient files are intentionally not committed.
The repository contains the generator, exact request recipes, frozen source
manifests and coefficient receipts. A working full-data installation needs
the matching ignored `.cache/horizons-full/` and `generated/full/` directories.
Validation additionally needs `.cache/horizons-speed-reference/` and the
reference Python environment. Preserve those caches when transferring an
installation. A clean clone can run the default checks and the retained
pilot; it does not contain the full ephemeris.

With the frozen original caches installed, run these commands from this
directory on the recorded Node runtime:

```sh
npm run full:check
npm run full:build
npm run full:test
```

`full:check` verifies the committed source manifests and generator identity.
`full:build` verifies original source bytes, fits training rows only and writes
bounded coefficient shards under `generated/full/`. `full:test` runs the
explicit full-data suite; a missing cache or reducer fails rather than skips.
It regenerates coefficients and compares their descriptors with the committed
receipts. `full:validate` writes the same independent numerical reports,
including failed comparisons. Full reports stay ignored.

The offline loader accepts a body name:

```sh
node --import ./scripts/register-source.mjs --experimental-strip-types --input-type=module <<'JS'
import { loadFullBody } from "./src/index.ts";
const ephemeris = await loadFullBody("Ceres");
console.log(ephemeris.calculate("Ceres", { date: "2000-06-01T00:00:00Z" }));
JS
```

It checks the complete original source corpus, coefficient digests and joins
before returning the evaluator. Result fields and time conventions are the
pilot's. Calling an unloaded body or crossing installed coverage returns a
structured refusal. Loading missing or malformed files fails before any
position is returned. This loader performs no network request or fitting.

`full:capture` explicitly retrieves proposed base sources into the ignored
cache and writes proposed manifests under `generated/full-sources/`.
`full:reference:capture` does the same for the supplemental speed corpus under
`generated/speed-reference-sources/`. They never rewrite committed manifests.
Do not replace frozen manifests or receipts with these candidates without
review and revalidation. A new live response may differ even for the same
request; these commands cannot restore an absent original cache byte for
byte. Run live capture commands serially.

The original full-range short-difference speed reference failed its
convergence checks. Its code and result description are retained; the active
comparison uses independently captured wider stencils, with every stencil
inside one response. Coefficients and acceptance budgets did not change.
`full:validate:v1` replays that rejected method into
`generated/full-v1-replay/` and intentionally exits with a failure on the
frozen data. It is an audit command, separate from the active acceptance
suite. [DESIGN.md](DESIGN.md#m5-reference-speed-correction) explains the change.

## Horizons source captures

The explicit generator commands are:

```sh
npm run fixtures:check
npm run fixtures:capture
npm run fixtures:replay
```

`fixtures:check` verifies the committed original responses and their manifests
without network access or a populated cache. `fixtures:capture` reads the
cache first and fetches missing inputs, writing proposed fixtures under
`generated/horizons-fixtures/`. Review those files before adding them to
`tests/fixtures/horizons/`. It never rewrites the committed fixtures itself.
`fixtures:replay` requires the original `.cache/horizons/` captures and checks
their bytes against the committed response digests, offline. A missing or
changed source fails rather than producing a passing replay.

Run only one capture process at a time. Within a process, all client instances
share a serial queue that includes response-body reads and retry backoff.
Requests identify this project to JPL. Retries cover temporary network errors,
rate limits and server failures; semantic or corrupt responses fail immediately.
An invalid cache is never silently replaced. Digests detect changed bytes;
they do not authenticate JPL or attest to physical accuracy.

The source fixture scope and provenance are in [SOURCES.md](SOURCES.md).
The ingestion contract and enforcing tests are in [DESIGN.md](DESIGN.md).

## Coefficient preparation primitives

`src/chebyshev.ts` supplies `fitChebyshevSegment`, `validateChebyshevSegment`
and `evaluateChebyshevSegment`. Fit the Cartesian positions at their actual
returned TT Julian dates. Evaluation returns position in au and its analytic
derivative in au per TT day. It includes both segment endpoints and refuses
extrapolation. The coefficient convention and operational limits are in
[DESIGN.md](DESIGN.md#m3-numerical-contract), with their enforcing tests.

`src/coefficient-shard.ts` validates contiguous segments and encodes them with
an external SHA-256 descriptor. Decoding checks that descriptor and every
convention field before returning an immutable snapshot. Shard evaluation
includes its first endpoint, excludes its last, and selects the right segment
at internal joins. The continuity helpers compare both sides' positions and
velocities against explicitly supplied numerical limits.

These primitives are offline and perform no file writes. Every shard remains
marked `unvalidated`; a matching hash establishes byte integrity only. The
Chiron pilot adds original source verification and independent astronomical
tests. No supported astronomical range follows from the analytic tests.

The companion uses relative imports from the engine source checkout. It is
private and has no publishing or root-build script. Generated downloads,
coefficients and build output belong in ignored directories under this
folder. Calculations are offline once data is prepared; fetching data
belongs to explicit generator commands only.

No astrology interpretation or predictive claims are part of this package.

## Body adapter

`createBodyAdapter` binds explicitly loaded datasets and captures the local
implementation identity. Calculations are synchronous after that setup. It
does not register new names inside the engine. Its `calcWithMinorBodies`
method takes the engine's calc request shape with a wider body label:

```ts
import { createBodyAdapter, loadChironPilot } from "./src/index.ts";

const adapter = await createBodyAdapter([await loadChironPilot()]);
const time = { jd: 2451600.25, scale: "tt" } as const;
const chiron = adapter.calcWithMinorBodies({ body: "Chiron", time });
const mars = adapter.calcWithMinorBodies({ body: "Mars", time });
```

Use `loadFullBody` in place of the pilot to install full-range datasets.
Only one provider for a given minor body may be installed. An empty adapter
can delegate ordinary bodies. Neither creation nor calculation fetches data.
These examples and the behavior below are checked in
`tests/body-adapter.test.ts`; `tests/full-adapter.test.ts` checks dispatch
and mixed rows against the installed full datasets under `npm run full:test`.

Success has `status: "ok"`, `provider: "engine" | "minorbodies"`, the
provider's `result`, and an adapter `receipt`. Engine options and results
retain engine calc semantics, including its narrower coverage and its
refusals. Minor-body results keep the fields described under the pilot.
They are a distinct type, with no invented engine accuracy bounds.

Minor requests support only the geocentric center, true ecliptic and equinox
of date, tropical zodiac, apparent corrections without deflection, degrees,
all speeds, and no Cartesian output. A different requested convention or
output produces a structured refusal; nothing is silently downgraded.
Unknown names and missing datasets also refuse. Body labels are exact and
case-sensitive. Malformed request fields and times throw `RangeError`.

Time accepts ISO strings, valid Dates, `{ iso, deltaT? }`, or
`{ jd, scale: "utc" | "ut1" | "tt", deltaT? }`. Non-TT input is resolved
with the existing engine time basis before checking installed coverage.
An explicit TT epoch is preserved; a Delta T pin does not move that epoch.
The adapter receipt records the supplied time and resolved TT, and the minor
result records the explicit TT evaluation. Ordinary engine results retain
their original input-clock semantics. Receipts copy input data, identify the
adapter's source graph and retain each provider's conventions and provenance.
An engine refusal gains an adapter receipt while keeping its original reason,
detail and range. These records are neither authentication nor accuracy
certification.

### Configured-aspect rows

```ts
import { createAspectPolicy, findConfiguredAspects } from "../src/configured-aspects.js";

const selected = ["Chiron", "Mars"] as const;
const rows = adapter.aspectRows(selected, time);
if (rows.status === "ok") {
  const policy = createAspectPolicy({ bodies: selected });
  const aspects = findConfiguredAspects(rows.rows, policy);
  console.log({ aspects, receipt: rows.receipt });
}
```

`aspectRows` computes all requested rows at one resolved TT Julian date,
with speeds per TT day and longitudes in tropical true-of-date ecliptic
degrees. Select minor labels explicitly in the engine aspect policy. Retain
the rows receipt beside the engine's aspect result; the engine aspect API
does not carry provider receipts itself. Empty selections, duplicate labels
and malformed arrays throw. A provider refusal returns no partial rows.

The admitted physical corrections are receive light time and stellar
aberration without gravitational deflection. The receipt explicitly names
the different implementations: Horizons LT+S for minor bodies, and engine
calc's Newtonian light time and backdated-observer aberration approximation
for ordinary planets and the Sun. No claim of identical approximations or
shared accuracy follows from combining these rows. The Moon's instantaneous
geometric series and lunar nodes/apogee do not have this correction convention,
so `aspectRows` refuses those labels. Ordinary `calcWithMinorBodies` requests
and individual longitude callbacks can still compute them through the engine.
Earth retains the engine's refusal at the geocentric origin.

### Generic longitude callback

```ts
import { searchLongitudeCrossingsWith } from "../src/crossings.js";

const callback = adapter.createLongitudeCallback({ dateScale: "tt" });
const search = searchLongitudeCrossingsWith(
  callback.longitudeAt, "Chiron", 250,
  new Date("2000-01-01T00:00:00Z"), new Date("2000-12-31T00:00:00Z"),
  { stepDays: 1, maxSamples: 2000 }
);
console.log({ search, callback: callback.receipt });
```

The callback's default `dateScale` is `"tt"`. In this mode each Date's
calendar reading denotes TT, including the search's returned Dates; the
displayed `Z` is not a UTC claim. Explicit `"utc"` or `"ut1"` selects that
clock instead, with an optional `deltaT` pin. UTC/model clock steps can break
the solver's smooth-motion assumption. The example's interval, target and
sampling choices are caller settings, not validated event-search defaults or
event accuracy claims. The adapter integration test exercises the solver on
the real pilot with an engine-derived target as an integration check only.

`longitudeAt(body, date)` is directly assignable to the existing generic
crossing API. `calculateAt(body, date)` returns the same sample with its full
receipt. A provider refusal from `longitudeAt` throws
`BodyAdapterRefusalError`, whose `refusal` holds the structured result and
receipt. It never returns a fabricated longitude. The solver propagates that
error. Its own sample-budget refusal remains unchanged. Keep the callback
receipt with direct solver results. The dedicated station wrapper below adds
per-event receipts; retrograde windows are described below, and ingresses remain
a later milestone.

The adapter's tests establish integration and preserve the pilot's existing
held-out accuracy checks, not additional astronomical coverage. See
[M6 evidence](docs/evidence/M6.md).

## Station searches

```ts
import { createBodyAdapter, createStationSearcher, loadChironPilot } from "./src/index.ts";

const adapter = await createBodyAdapter([await loadChironPilot()]);
const searcher = await createStationSearcher(adapter);
const result = searcher.searchStations({
  body: "Chiron",
  from: "2000-01-02T00:00:00Z",
  to: "2000-12-30T00:00:00Z"
});
console.log(result);
```

Setup reads local implementation hashes. Searches then run synchronously,
offline, using the already loaded datasets. Endpoints accept the adapter's
time vocabulary above. They are resolved once to TT; the search runs on
continuous TT even when an input is UTC or UT1. Output `jdTt` is a TT Julian
date, with no implied conversion back to a civil clock. Original endpoint
requests and their time conversions remain in the receipt.

`status: "complete"` returns `stations` in time order. Each station gives
`direction: "direct-to-retrograde" | "retrograde-to-direct"`, its position,
and receipts for the position and the speed samples that establish the
reversal. The engine's existing crossings solver locates zero-speed
candidates through a monotone angular mapping; the wrapper checks actual
speed signs on either side. A confirmed zero-speed touch with no reversal
is omitted. A candidate whose direction cannot be established refuses the
whole search with `station-direction-unresolved`.

The interval is `(from, to]`. All position samples stay inside the requested
interval, including its endpoints, and inside installed coverage. A station
exactly at `from` is excluded. An exact zero at `to` cannot establish the
following motion without another sample, so it refuses; extend `to` within
coverage to classify it. The dataset's exclusive upper endpoint is never
evaluable. Out-of-coverage searches refuse rather than clip or extrapolate.
The solver samples integer milliseconds relative to the exact starting TT
epoch and samples the exact ending TT epoch. Direction probes may use
fractional milliseconds. Event times retain the solver's finite refinement
and deduplication limits, recorded in `receipt.conventions`.

`stepDays` controls the coarse step in TT days. `maxSamples` limits all
provider calls, including repeated solver samples, direction checks and
event positions. The defaults and admissible limits are defined in
`STATION_SEARCH_CONVENTIONS` and enforced by `tests/stations.test.ts`.
`Infinity` disables the budget and is recorded as `null` in JSON receipts.
A budget refusal returns `stations: []`; a coarse scan that already exceeds
the budget makes no provider calls. Other structured refusals also return
no partial event list, and retain the failing provider receipt when present.
Malformed inputs throw `RangeError`.

Completion means the configured scan finished, not that every physical
station was proven found. The engine solver assumes smooth motion and a
limited number of turns between samples; here that assumption applies to
the longitude speed. Station accuracy was checked against held-out Horizons
positions reduced with independent ERFA over the synthetic calendar interval
in `STATION_REFERENCE_RECIPE`, with timing and arcsecond gates enforced by
`tests/station-accuracy.test.ts` and `tests/full-stations.test.ts`. Those finite
checks do not establish full-range event completeness or physical orbit
uncertainty. See [M7 evidence](docs/evidence/M7.md).

## Retrograde windows

```ts
import { createBodyAdapter, createRetrogradeWindowSearcher, loadChironPilot } from "./src/index.ts";

const adapter = await createBodyAdapter([await loadChironPilot()]);
const searcher = await createRetrogradeWindowSearcher(adapter);
const result = searcher.searchRetrogradeWindows({
  body: "Chiron",
  from: "2000-01-02T00:00:00Z",
  to: "2000-12-30T00:00:00Z"
});
console.log(result);
```

Inputs, setup, TT clock, coverage and station-search settings follow the station
API above. A completed result contains `windows` and the underlying `stations`.
Each window gives `body`, `startJdTt`, `endJdTt`, `clippedStart`, `clippedEnd`
and a receipt linking its station boundaries and the complete search record.
An empty query returns no windows and makes no position calls.

A window describes a negative-longitude-speed episode between reversals, cut
to the requested interval. An isolated zero-speed touch without reversal does
not split an episode. The position API's instantaneous `retrograde` is still
false at an exact zero. Station endpoints are numerical estimates with the
station solver's refinement limits, so these extents are not an exact membership
test for every instant. Zero-duration windows are omitted.

A clipped boundary is a query edge without a classified station. The receipt
stores `null` for that boundary's station; it does not assert how far the
episode continues outside the query. Adjacent queries split within a retrograde
episode each report their own clipped piece. At an exact starting zero, a
nonzero inward probe determines the initial motion, without inferring the
motion before the query. Failure to resolve that state returns
`retrograde-state-unresolved`. An exact ending station retains the station
search's refusal because its following direction cannot be sampled. Requests
outside installed coverage refuse; they are not clipped to the dataset.

One `maxSamples` budget covers the station search, endpoint calculations and
any initial probe. The total is `samples`; `receipt.stationSearch.samples`
records the station-search portion. The receipt also carries endpoint and
probe samples, source identities, dataset provenance and evaluated shard digests.
Successful endpoint states must agree with the station direction sequence;
otherwise the result refuses as `retrograde-state-inconsistent`. This check
can reveal some missed reversals, but does not prove completeness.

Every refusal returns empty `windows` and `stations`, even if the station
search had finished before an endpoint check failed. It carries the reason,
work count and any underlying provider refusal. All returned data are immutable
and JSON-serializable. Searches run offline after explicit setup.

`tests/retrogrades.test.ts` enforces these assembly and failure rules with
synthetic motion. `tests/retrograde-accuracy.test.ts` and the explicit full-data
`tests/full-retrogrades.test.ts` check windows against the retained independent
Horizons/ERFA station corpus, with unchanged timing and angular gates. Their
finite reference scope and reproduction commands are in [M8 evidence](docs/evidence/M8.md).
