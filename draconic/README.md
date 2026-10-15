# Draconic chart development

This private project adds a draconic chart library and CLI on top of the engine
in this checkout. See [PLAN.md](PLAN.md) for completed and pending work.
The current API provides the pure rotation primitive; natal casting, chart
transformation, comparisons, receipts and CLI commands are pending milestones.

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
