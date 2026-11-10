# Source-checkout setup and offline replay

Run every command below from `minorbodies/` inside the matching engine source
checkout. Keep the parent engine source files and licence notices with it.
The companion imports those files directly, records their hashes in receipts,
and resolves the pinned ephemeris dependency from its own `node_modules/`.
There is no root build step and no standalone distribution in this project.

Use Node 22.22.2 for the frozen builds and source replay. The original
generator manifests pin that exact runtime and their implementation hashes;
`tests/pilot-recipe.test.ts` and `tests/full-sources.test.ts` enforce those
identities. Installing another Node version or editing a frozen generator
does not create an equivalent dataset. Dependency versions come from this
directory's `package-lock.json` and `scripts/requirements-reference.txt`.

## Prepare dependencies

This first setup may use the public package registries. It does not request
ephemeris data:

```sh
npm ci --ignore-scripts --cache .cache/npm --no-audit --no-fund
python3 -m venv .cache/reference-venv
.cache/reference-venv/bin/python -m pip install \
  --cache-dir .cache/pip -r scripts/requirements-reference.txt
```

The Python environment is used only for independent ERFA validation and the
default check command. Position calculation, searches, the CLI and coefficient
fitting do not call Python. `scripts/reference-erfa.py` checks the installed
NumPy, PyERFA, ERFA and SOFA heritage versions. `npm ci` installs the versions
locked by the companion, including the same exact `astronomy-engine` version
as the parent engine. No root dependency installation is required.

After a successful installation on the same platform, the populated npm
cache can support a disconnected reinstall:

```sh
npm ci --offline --ignore-scripts --cache .cache/npm --no-audit --no-fund
```

A cache with missing package bytes fails; `--offline` does not download them.
Keep a working Python environment on its original machine and path for
disconnected validation. A copied virtual environment is not a portable
installer: recreate it for the destination OS, architecture and Python
runtime with the pinned requirements before disconnecting. This repository
does not supply offline dependency binaries or a wheel archive.

After preparing the pilot below, verify a fresh runtime installation using
only the populated npm cache:

```sh
npm run check:offline-install
```

This command creates a temporary source tree under `.cache/`, installs the
locked npm dependencies with `--offline --ignore-scripts`, rebuilds the pilot
and requires its coefficient and descriptor bytes to match the prepared
installation. It runs the committed example and CLI with `fetch` disabled
and rejects file modules resolved outside the temporary tree. A deliberate
outside import must fail before the actual examples run. The tree is removed
after success or failure. A missing cached package fails without downloading.
This is an installation and reproduction check, not an independent accuracy
comparison; it does not install or exercise the Python environment.

## Rebuild the retained pilot

The committed pilot sources contain everything needed for its offline
coefficient rebuild after dependency setup:

```sh
npm run pilot:build
npm run offline:check
npm run check
npm run pilot:validate
npm run --silent cli -- position --body Chiron --dataset pilot \
  --jd 2451600.25 --scale tt
```

The pilot supports Chiron only over calendar year 2000 on TT, with its upper
endpoint excluded. `tests/pilot-recipe.test.ts` and
`tests/ephemeris.test.ts` enforce the interval and refusal behavior.
`pilot:build` writes `generated/pilot/` from unchanged original responses in
`tests/fixtures/pilot/`; it does not fetch. `pilot:validate` independently
reduces the held-out Horizons positions with ERFA and saves its report in
that generated directory. The synthetic example above is a usage check,
not a reference position or a physical accuracy claim.

`offline:check` checks local prerequisites and installed pilot data without
fetching or fitting. It is separate from `check` and `pilot:validate`: a valid
local installation does not establish numerical agreement.

## Transfer a full-data installation

A fresh clone contains the recipes, digest manifests, coefficient receipts
and compact source fixtures. It does not contain the bulk full-range sources
or fitted tables. No public download location for those frozen bulk files is
recorded here. Obtain them from an installation retaining the exact originals
named by this checkout's committed manifests, keeping the following relative
paths beneath `minorbodies/`:

| Local path | Used for | Frozen identity |
| --- | --- | --- |
| `.cache/horizons-full/` | Full coefficient rebuild and full-body loading | `data/manifests/` |
| `generated/full/` | Full-body loading | `data/receipts/`; reproducible from the base cache |
| `.cache/horizons-speed-reference/` | Original full-range speed checks | `data/speed-manifests/` |
| `.cache/horizons-final/` | Final held-out position and speed checks | `data/final-manifests/` |
| `generated/final-events/` | Offline final station, retrograde and ingress reference replay | `data/final-event-manifests/` |

Keep the paths and capture filenames unchanged. Copying the coefficient
shards without `.cache/horizons-full/` is insufficient: the loader verifies
the original source bytes as well as the coefficients. In
`generated/final-events/`, the original named capture files are required;
derived `reference.json` and `accuracy-report.json` files do not substitute
for them. Copy only from a trusted installation and verify the result below.
Digest checks detect disagreement with this checkout's pins, not the
authenticity of an arbitrary checkout or the physical accuracy of a solution.

The auxiliary `.cache/horizons/` is needed only for `fixtures:replay`, whose
source fixtures are already committed and checked by `fixtures:check`.
`.cache/horizons-final-events/` is useful to preserve as a capture cache, but
final-event offline replay reads the named captures in
`generated/final-events/`. Neither cache replaces the table's required paths.
Other reports and temporary outputs can be regenerated. Dependency caches
and installed packages are separate from the ephemeris inventory.

Prepare the destination's dependencies, retain the committed pilot fixtures,
and run:

```sh
npm run pilot:build
npm run full:check
npm run full:build
npm run offline:check -- --full
npm run check
npm run full:test
```

`full:check` verifies the committed request manifests and frozen generator
identity; it does not check bulk response bytes. `full:build` reads the pinned
original cache, fits only training rows, enforces joins and rewrites ignored
coefficient files. The full suite requires their descriptors to match the
committed receipts exactly. `offline:check -- --full` checks the local full-data
prerequisites and integrity, including the reference sources, without performing
the numerical comparisons. The explicit `full:test` configuration runs those
comparisons and integration tests; missing sources, coefficients or reference
dependencies fail instead of skipping tests.

The files in `vitest.full.config.ts` can also be run in separate processes:

```sh
for test_file in full-accuracy full-adapter full-stations full-retrogrades \
  full-ingresses full-cli full-final-accuracy full-final-events
do
  npm run full:test -- "tests/$test_file.test.ts" || exit "$?"
done
```

Every configured file must pass before reporting full-suite success. Running
only a filtered subset checks only that subset. [M11 evidence](docs/evidence/M11.md)
records its interrupted and module-loader-timeout attempts separately from
the later passing filtered runs; it does not claim those aggregate attempts
passed.

The full dataset interval is 1800-01-01 TT inclusive through 2201-01-01 TT
exclusive, including all of calendar year 2200. `tests/full-recipe.test.ts`
enforces this interval. The M5 and M11 accuracy tests compare finite held-out
Horizons samples across it, with independent ERFA reductions and explicit
arcsecond limits. Event comparisons cover the registered windows described in
[M11 evidence](docs/evidence/M11.md), not every event across the interval.
Neither the interval nor successful offline verification establishes a
continuous physical error bound. Ordinary bodies delegated to engine calc
retain that engine's own narrower supported span and refusals.

## Replay the independent comparisons

The full test configuration already includes the final numerical and event
assertions. These commands separately write or reconstruct their local reports:

```sh
npm run full:validate
npm run final:validate
npm run final:events:replay
```

`full:validate` and `final:validate` retain completed numerical reports before
signaling a failed gate. `final:events:replay` verifies original captures and
reconstructs their independent reference brackets; the comparison with the
companion is enforced by `tests/full-final-events.test.ts`. A reference replay
alone is not that comparison. All reports and derived references remain under
ignored `generated/`.

The previous full-range short-stencil speed method is preserved for audit:

```sh
npm run full:validate:v1
```

It intentionally fails its original gates on the frozen data. It is not an
installation acceptance command. [The M5 correction](DESIGN.md#m5-reference-speed-correction)
and [M5 evidence](docs/evidence/M5.md) explain the failure and the replacement
reference method; neither the coefficients nor the original accuracy limits
were changed to make that replacement pass.

## New live capture is a separate operation

Live capture commands use public JPL services, reuse their respective caches,
and write proposed data only under ignored directories:

```sh
npm run fixtures:capture
npm run pilot:capture
npm run full:capture
npm run full:reference:capture
npm run final:capture
npm run final:events:capture
```

Run only the capture relevant to the intended new dataset, and run capture
processes serially. These are not steps for recovering missing frozen bytes.
Horizons may return a changed orbit solution, response timestamp or numerical
bytes for the same request. Existing manifests must not be replaced merely
because a newly fetched response differs. A changed source needs a separately
reviewed dataset identity and independent validation. Final reference captures
also require the fitted dataset's frozen source identity.

Before proposing a new capture, preserve the installed originals in an ignored
backup directory under this companion. In particular, final-event capture
writes named files under `generated/final-events/`, which are the original
source files required for current replay. Preserve those files before any
recapture. Do not delete a valid cache to force downloads inside the installed
frozen dataset. No live recapture is needed for the offline workflows above.

## Use the installed tables

The committed [offline pilot example](examples/offline-pilot.ts) uses the
retained Chiron pilot, adapter, configured aspects, generic crossings,
stations, retrograde windows and sign ingresses after `pilot:build`:

```sh
node --import ./scripts/register-source.mjs --experimental-strip-types \
  examples/offline-pilot.ts
```

Its invented input instants and integration checks do not add astronomical
accuracy evidence.

After full setup, native Node execution needs the companion source resolver:

```sh
node --import ./scripts/register-source.mjs --experimental-strip-types --input-type=module <<'JS'
import { createBodyAdapter, loadFullBody } from "./src/index.ts";

const adapter = await createBodyAdapter([await loadFullBody("Ceres")]);
const result = adapter.calcWithMinorBodies({
  body: "Ceres",
  time: { jd: 2451600.25, scale: "tt" }
});
console.log(JSON.stringify(result));
JS
```

The CLI uses the same resolver and loaders:

```sh
npm run --silent cli -- position --body Ceres --jd 2451600.25 --scale tt
npm run --silent cli -- ingresses --body Vesta \
  --from-jd 2451545.5 --to-jd 2451908.5 --scale tt
```

These are synthetic usage examples. Full-body integration, event output and
CLI process behavior are checked by `tests/full-adapter.test.ts`,
`tests/full-cli.test.ts` and the CLI tests. Preserve the entire JSON result,
including its receipts and any refusal, when recording a calculation. Event
times are TT Julian dates; do not label them UTC. The [README](README.md)
documents all position fields, search boundaries, budgets, supported
conventions and the configured-aspect and generic-crossing adapters.

The original code is covered by [LICENSE](LICENSE). Retain
[LICENSING.md](LICENSING.md), [NOTICE](NOTICE), [SOURCES.md](SOURCES.md),
the parent engine's licence notices and installed dependencies' notices when
transferring an installation. The companion's MIT declaration does not
relicense its source data or reused engine material.

[M12 evidence](docs/evidence/M12.md) records the installation checks and their
scope, including the root package check's missing-build limitation.
