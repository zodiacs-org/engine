# Draconic chart development

This private project adds a draconic chart library and CLI on top of the engine
in this checkout. See [PLAN.md](PLAN.md) for completed and pending work.
The current API provides the pure rotation primitive, an engine natal adapter
and a pure chart transformation. Comparisons, receipts and CLI commands are
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
Pass its result to `transformNatal` to rotate the chart.

```ts
import { castNatal, transformNatal } from "./src/index.js";

const source = castNatal(syntheticBirth); // An engine BirthInput invented by the caller.
const draconic = transformNatal(source);
```

`transformNatal({ natal, node })` is pure: it reads existing positions without
casting a new chart, and allocates independent body rows, angles, cusps and
node metadata. Its input needs only the natal bodies, angles and houses plus
the selected node. It trusts the caller's selection and chart provenance;
use `castNatal` for selection on the engine's chart clock. The result is a
separate derived coordinate object, with no engine receipt or engine-issued
chart claim. Receipt attachment is a later milestone.

Each body reports its rotated longitude, unchanged latitude, refreshed sign
and degree, and a longitude-only house number from the engine's `houseOf`
helper against the rotated cusps. With absent houses that field is null.
Angles keep the engine's numeric `asc`, `mc`, `dsc` and `ic` shape; cusps keep
their original sequence and computed system label. The selected `node`
metadata retains its natal longitude, which is the amount subtracted.
Mean-node selection rotates the existing true-node body rows too; it does not
replace them with mean nodes. The derived object omits speeds, retrograde
flags and aspects because this API supplies a position snapshot.

The hand-derived chart and boundary checks are documented in
[test/ARITHMETIC.md](test/ARITHMETIC.md) and enforced by
[test/transform.test.ts](test/transform.test.ts). Those listed synthetic
cases are the reference span for the transformation checks, with no claim
of independent astronomical accuracy. The transformation validates consumed
longitudes with the rotation primitive, checks body latitudes, and rejects
incomplete cusp arrays or mismatched node labels.

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

The chart convention uses the engine's true north node by default and
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
