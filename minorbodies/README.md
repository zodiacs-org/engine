# Minor bodies companion

This source-checkout package is under development. It currently supplies
target definitions and a preregistered acceptance policy. It does not yet
calculate positions or ship coefficient data. The implementation sequence is
in [PLAN.md](PLAN.md).

The intended bodies are Chiron, Ceres, Pallas, Juno and Vesta. The design uses
JPL Horizons samples to build local Chebyshev tables. See [DESIGN.md](DESIGN.md)
for conventions, target coverage, validation and engine integration, and
[SOURCES.md](SOURCES.md) for provenance. Target coverage and tolerances are
requirements until independently tested.

From this directory, using the project's Node runtime:

```sh
npm ci --ignore-scripts --cache .cache/npm
npm run check
```

Tests exercise target selection and the engine's existing generic crossing
and configured-aspect interfaces with synthetic inputs. They are not
astronomical accuracy evidence. Checks also list the root package without
running build hooks, to verify that this directory is excluded.

The companion uses relative imports from the engine source checkout. It is
private and has no publishing or root-build script. Generated downloads,
coefficients and build output belong in ignored directories under this
folder. Calculations will be offline once data is prepared; fetching data
belongs to explicit generator commands only.

No astrology interpretation or predictive claims are part of this package.
