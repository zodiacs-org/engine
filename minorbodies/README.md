# Minor bodies companion

This source-checkout package is under development. Its Chiron pilot computes
geocentric ecliptic longitude, latitude, distance, speeds and retrograde state
with provenance receipts. It also supplies validated Horizons intake and
Chebyshev fitting tools. The implementation sequence is in [PLAN.md](PLAN.md).

The intended bodies are Chiron, Ceres, Pallas, Juno and Vesta. The design uses
JPL Horizons samples to build local Chebyshev tables. See [DESIGN.md](DESIGN.md)
for conventions, target coverage, validation and engine integration, and
[SOURCES.md](SOURCES.md) for provenance. Target coverage and tolerances are
requirements until independently tested.

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
checks its boundaries after time conversion. Other bodies and the wider target
range remain pending. No coefficient extrapolation is allowed.

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
