# Draconic chart development

This private project adds a draconic chart library and CLI on top of the engine
in this checkout. See [PLAN.md](PLAN.md) for completed and pending work.
The current API provides pure rotation and comparison primitives, an engine
natal adapter, a pure chart transformation, structured natal versus draconic
comparisons and result wrappers with engine natal receipts. CLI commands are
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
chart claim. Use the result wrappers below to attach natal provenance.

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

Without coordinates, angles, houses and body house assignments remain null;
missing coordinates alone do not imply unknown time. With `timeKnown: false`,
those fields remain null even when coordinates are supplied, and the natal
chart carries `no-time`. The caller's reference instant still determines body
and selected-node positions. The requested house system remains in
`source.natal.input.houseSystem`; the computed system is in
`source.natal.houses?.system` and, when present, `draconic.houses.system`.
For the synthetic polar cases in [test/availability.test.ts](test/availability.test.ts),
Placidus and Koch requests retain the natal `polar-fallback` flag and use the
engine's computed whole-sign cusps, rotated without recasting. That test also
checks missing coordinates, unknown time, default houses and a site with zero
coordinates for both node choices. These are integration preservation checks.

`compareNatal(source)` takes the same source as `transformNatal` and derives
the rotated chart internally. It returns `node`, `conventions`, `bodies`,
`angles` and `houses`. Each body row has its body identifier and each cusp
row its house number, in the source order. Each position comparison contains
`natalLongitude`, `draconicLongitude` and `deltaDegrees`; angles use the same
angle keys as the source. Houses retain the computed natal system label.
Absent angles or houses remain null. Output objects are independent of the
source and of other calls.

```ts
import { castNatal, compareNatal } from "./src/index.js";

const comparison = compareNatal(castNatal(syntheticBirth, { node: "mean" }));
```

The delta is the shortest signed circular displacement from natal tropical
to draconic longitude: draconic minus natal, in degrees in `(-180, 180]`.
An exact half-circle difference is positive 180 degrees in either direction;
zero is positive zero. The `conventions` object records the direction, units,
longitude and delta ranges and half-circle choice. `signedLongitudeDelta`
exposes the same arithmetic for a pair of canonical longitudes, with the
same validation as the rotation primitive. These boundary values and the
worked comparisons are derived in [test/ARITHMETIC.md](test/ARITHMETIC.md)
and enforced in [test/compare.test.ts](test/compare.test.ts). They cover
only the listed synthetic cases, without an astronomical accuracy claim.

Deltas compare the actual rotated binary64 coordinates, which can round;
they are not copied from a nominal node rotation. The comparison pairs
positions from one source and does not accept separately computed charts.
It returns coordinate differences without aspects, interpretation or
predictions. Mean-node selection retains the natal true-node body labels.
This low-level comparison does not include receipts. Use `draconicCompare`
below to attach the engine's natal envelope.

`draconicChart(birth, options?, context?)` casts the natal chart and returns
`{ natal, conventions, draconic }`. `draconicCompare` takes the same arguments
and returns `{ natal, conventions, comparison }`. Both use the engine's
`BirthInput`, the existing node options and an optional `NatalEnvelopeContext`.
They perform no I/O or runtime discovery. The natal chart is cast once per
call, with selection and rotation based on that same chart. The integration
checks in [test/results.test.ts](test/results.test.ts) enforce that behavior
for default true-node and explicit mean-node selection.

```ts
import { draconicChart, draconicCompare } from "./src/index.js";

const chartResult = draconicChart(syntheticBirth);
const compareResult = draconicCompare(syntheticBirth, { node: "mean" });
```

`natal` is the unchanged engine envelope produced by `createNatalEnvelope`,
with the original tropical positions, engine and ephemeris identifiers,
conventions, coverage, flags, time scale, time basis and deltaT. Its receipt
retains the requested and actual house systems, including fallback or absence.
It can be serialized and parsed with the engine's receipt codec separately
from the wrapper. Replaying its natal input still requires the selected node
choice from this library's `conventions.northNode.kind`.

The separate `conventions` object belongs to this library. It records the
selected node and natal longitude, its target at the Aries origin, units,
longitude range, subtraction and wrap rule, binary64 endpoint policy, cusp
rotation without recasting, unchanged latitude and snapshot scope. The node
in the derived result and in these conventions is copied independently.
The engine's receipt covers the natal chart only. It does not cover the
draconic positions or deltas, and no field of its conventions or coverage is
rewritten to make such a claim.

Pass `context.sourceInstant` explicitly to retain an original ISO spelling,
`context.localResolution` for captured local-time context, and
`context.provenance` for source, artifact or runtime claims. The engine codec
validates these claims and labels provenance as claimed; neither it nor this
library authenticates them. Context extensions remain attached only to the
natal envelope. Omitted context stays unavailable, with a supplied-instant
reference even for unknown time. The library does not infer a local zone,
noon convention or artifact identity. Invalid context propagates the engine's
`NatalEnvelopeError`; invalid birth input or node options throw `RangeError`.

The synthetic integration checks in
[test/results.test.ts](test/results.test.ts) cover receipt round-tripping,
time scales with model or pinned deltaT, missing location, unknown time,
polar fallback, explicit context, invalid claims and independent mutable
outputs. These checks establish wiring and preservation only. The independent
rotation and delta references remain the hand-derived cases in
[test/ARITHMETIC.md](test/ARITHMETIC.md).

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
