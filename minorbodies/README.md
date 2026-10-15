# Minor bodies companion

This source-checkout package is under development. It supplies target
definitions, a preregistered acceptance policy and a build-time Horizons
client with validated source captures. It does not yet calculate positions
or ship coefficient data. The implementation sequence is in [PLAN.md](PLAN.md).

The intended bodies are Chiron, Ceres, Pallas, Juno and Vesta. The design uses
JPL Horizons samples to build local Chebyshev tables. See [DESIGN.md](DESIGN.md)
for conventions, target coverage, validation and engine integration, and
[SOURCES.md](SOURCES.md) for provenance. Target coverage and tolerances are
requirements until independently tested.

From this directory, using Node 22.22.2 (the runtime used for M2 checks):

```sh
npm ci --ignore-scripts --cache .cache/npm
npm run check
```

Tests validate Horizons intake against original responses and corrupted copies.
Separate synthetic tests exercise target selection and the engine's existing
generic crossing and configured-aspect interfaces. They are not astronomical
accuracy evidence. Checks also validate the frozen
source captures and list the root package without running build hooks, to
verify that this directory is excluded.

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

The companion uses relative imports from the engine source checkout. It is
private and has no publishing or root-build script. Generated downloads,
coefficients and build output belong in ignored directories under this
folder. Calculations will be offline once data is prepared; fetching data
belongs to explicit generator commands only.

No astrology interpretation or predictive claims are part of this package.
