# Draconic chart development

This private project adds a draconic chart library and CLI on top of the engine
in this checkout. See [PLAN.md](PLAN.md) for completed and pending work.
The current API provides the pure rotation primitive and an engine natal
adapter. Chart transformation, comparisons, receipts and CLI commands are
pending milestones.

Use Node 22 with the standalone tooling:

```sh
cd draconic
npm ci --ignore-scripts
npm run typecheck
npm test
```

```ts
import { rotateLongitude } from "./src/index.js";

const rotated = rotateLongitude(100.5, 75.25); // 25.25 degrees
```

This is an invented longitude example. Its subtraction and wraparound
reference are documented in [test/ARITHMETIC.md](test/ARITHMETIC.md) and checked
by [test/rotation.test.ts](test/rotation.test.ts). All longitude inputs and
results use degrees in `[0, 360)`; invalid inputs throw `RangeError` without
coercion. The primitive subtracts the supplied north-node longitude and wraps
a negative difference around the circle using JavaScript binary64 arithmetic.
The endpoint and rounding policy is documented with the arithmetic reference.

`castNatal(birth, options?)` accepts the engine's `BirthInput` and returns
`{ natal, node }`. `natal` is the engine's tropical chart. `node` names the
chosen kind, the engine point and its natal longitude in degrees. Omit options
or pass `{ node: "true" }` to select the natal body's `North Node`; pass
`{ node: "mean" }` to select `Mean Node` from `chartPoints(natal)`. Selecting
the mean node leaves the natal bodies, including their true-node rows, intact.
This adapter does not yet rotate the chart.

Birth settings, resolved instants, time scales, pinned deltaT and flags use
the engine's validation and canonicalization. Unknown time keeps the supplied
reference instant. Invalid birth inputs or node choices throw `RangeError`;
unknown option keys are rejected. The integration checks in
[test/engine-adapter.test.ts](test/engine-adapter.test.ts) compare the adapter
with direct calls to the same engine using invented input. They check wiring
and preservation, without supplying independent astronomical accuracy evidence.

The adapter imports the engine's source entry via a relative path. The local
Vitest alias and TypeScript path mapping resolve its ephemeris dependency from
this project's installation, pinned to the engine's version. The standalone
checks need no root dependency installation or engine build. Direct execution
outside this tooling requires equivalent source and dependency resolution;
the planned CLI will provide its own runner.

The planned chart convention uses the engine's true north node by default and
its mean north node only when explicitly selected. Existing natal angles and
cusps rotate with the bodies, including whole-sign cusps, rather than being
calculated again in the rotated zodiac. A fixed chart rotation supplies no
new ephemeris speeds. Results will describe positions and structured deltas
only, without interpretation or predictions.

Code and documentation here are MIT under the repository's [LICENSE](../LICENSE).
The engine as distributed is `MIT AND CC-BY-4.0`; see its
[LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE). No engine data or
release archives are copied here. All examples and fixtures must be synthetic.
Dependencies, caches and generated output stay in ignored local folders.
