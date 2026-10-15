# Draconic chart development

This private project adds a draconic chart library and CLI on top of the engine
in this checkout. See [PLAN.md](PLAN.md) for completed and pending work.
The current API provides pure rotation and comparison primitives, an engine
natal adapter, a pure chart transformation, structured natal versus draconic
comparisons and result wrappers with engine natal receipts. The CLI supports
`draconic chart` and `draconic compare`, each with JSON or plain text output.

## Run from this checkout

Use Node 22 with the standalone tooling:

```sh
cd draconic
npm ci --ignore-scripts
npm run typecheck
npm test
```

This is a private source project, excluded from the engine npm package. The
commands below run from `draconic/` and need no root installation or engine
build. The executable is `bin/draconic.mjs`; the npm script exposes the same
`draconic` command without a global installation.

Run the CLI against the committed invented inputs:

```sh
npm run --silent draconic -- --help
npm run --silent draconic -- chart --input examples/synthetic.json
npm run --silent draconic -- chart --input examples/synthetic.json --node mean --format json
npm run --silent draconic -- chart --input examples/synthetic.json --format text
npm run --silent draconic -- compare --input examples/synthetic.json
npm run --silent draconic -- compare --input examples/synthetic.json --node mean --format text
node bin/draconic.mjs chart --input examples/polar-fallback.json --format text
node bin/draconic.mjs compare --input - --node mean < examples/unknown-time.json
```

| Input | Intended behavior |
| --- | --- |
| [examples/synthetic.json](examples/synthetic.json) | A resolved instant with an explicit offset and invented site, with ordinary whole-sign natal houses. |
| [examples/unknown-time.json](examples/unknown-time.json) | A caller-supplied reference instant with unknown birth time and no site; angles, houses and body house assignments stay absent. |
| [examples/polar-fallback.json](examples/polar-fallback.json) | An invented polar site requests Placidus; the engine returns whole-sign houses and a fallback flag, preserved under rotation. |

[test/examples.test.ts](test/examples.test.ts) runs every input through both
commands with both node choices and checks availability and natal receipts.
These fixtures contain inputs only. Their engine-computed positions are not
committed as expected values or presented as an accuracy reference.

To save output, use the ignored `generated/` folder:

```sh
mkdir -p generated
node bin/draconic.mjs chart --input examples/synthetic.json > generated/chart.json
```

## CLI input and output

An input file must contain only a `synthetic` field equal to `true` and a
`birth` object with the engine's JSON-compatible `BirthInput` fields. Use
invented inputs only. The declaration is a caller assertion, not verification
of the input's origin. Accepted birth fields are `utc`, `latitude`, `longitude`,
`houseSystem`, `timeKnown`, `timeScale`, `deltaT` and `flags`. Misspelled or
additional fields are refused; the engine validates their values. Resolve
local wall times before supplying the instant. The CLI does not load URLs,
resolve place names or accept imported positions or receipt context.

For an invented unknown-time input, read from standard input instead:

```sh
printf '%s\n' '{"synthetic":true,"birth":{"utc":"2000-04-05T06:07:00Z","timeKnown":false}}' |
  npm run --silent draconic -- chart --input - --node mean
```

This invented instant and unknown-time input are exercised by
[test/cli-runner.test.ts](test/cli-runner.test.ts). JSON is the default;
`--format text` selects plain text for either command. True north node is the
default; `--node mean` explicitly selects mean north node. The chart JSON shape
is the `draconicChart` result described below: the unchanged tropical natal
envelope, separate conventions and rotated positions. The comparison JSON
shape is the `draconicCompare` result, containing the same natal envelope and
conventions with structured paired longitudes and signed deltas. The CLI
retains the original instant spelling in `natal.receipt.sourceInstant` for
string inputs; numerical epoch
inputs carry no original spelling. It infers no local resolution or provenance.

Plain text uses tab-separated body, angle and cusp rows in source order.
Chart rows include longitude, unchanged latitude, sign, degree within sign
and house. Comparison rows contain natal tropical longitude, draconic
longitude and signed delta, with the direction and boundary convention
printed above them. Text preserves JavaScript's number spelling without
decimal rounding; displayed digits do not establish astronomical accuracy.
Absent geometry and house assignments are labelled `unavailable`.

Both text commands state the selected north node and its natal longitude,
the rotation to the Aries origin, and the preservation of natal cusps without
recasting. They show natal receipt details: engine and ephemeris identifiers,
instant, time scale, time basis, deltaT, flags, requested and computed houses
and any absence reason. These are a readable selection of receipt fields;
use JSON for the full unchanged engine natal envelope. The engine receipt
covers the natal chart only. Rendering is checked against the hand-derived
synthetic positions and deltas in [test/ARITHMETIC.md](test/ARITHMETIC.md) by
[test/cli-text.test.ts](test/cli-text.test.ts). Subprocess tests in
[test/cli-runner.test.ts](test/cli-runner.test.ts) check both commands and
formats, fallback context, stream separation and exit codes. These are
presentation and wiring checks, without an astronomical accuracy claim.

Successful JSON, text and help go to standard output. Errors go to standard
error without a partial result. Exit codes are `0` for success or help, `2`
for invalid arguments or input, and `1` for I/O or internal failures. Input is one UTF-8
JSON object limited to 64 KiB, read from a file or standard input. Supply
`--input` explicitly. Options take separate values and may appear only once;
unknown options, extra positional arguments and mixed help requests fail.
Use `./` before a filename that starts with `--`. These contracts and the
input limit are checked in [test/cli.test.ts](test/cli.test.ts), with file and
stream integration checks in [test/cli-runner.test.ts](test/cli-runner.test.ts).
They check command wiring and validation, not astronomical accuracy.

## Library usage

Run [examples/library.mjs](examples/library.mjs) after installing the local
tooling:

```sh
node examples/library.mjs
```

It registers the same local source loader as the CLI, reads the committed
invented input relative to the example file, and prints a true-node chart,
an explicit mean-node comparison and a separate hand-arithmetic example.
It works from another current directory when invoked by its absolute path.
The file read and output belong to the example; the library functions perform
no I/O. The executable example and its arithmetic results are checked in
[test/examples.test.ts](test/examples.test.ts).

In TypeScript code with the project's source resolution, the receipt-bearing
API can be called directly. From a file in `draconic/`:

```ts
import type { BirthInput } from "../src/index.js";
import { draconicChart, draconicCompare } from "./src/index.js";

// Invented input, matching examples/synthetic.json.
const syntheticBirth = {
  utc: "2000-04-05T08:07:00+02:00",
  latitude: 12.5,
  longitude: 45.25,
  houseSystem: "whole"
} satisfies BirthInput;
const context = { sourceInstant: syntheticBirth.utc };
const chartResult = draconicChart(syntheticBirth, {}, context);
const compareResult = draconicCompare(syntheticBirth, { node: "mean" }, context);

// Read results without interpreting the coordinates.
console.log(chartResult.draconic.bodies, chartResult.draconic.angles);
console.log(chartResult.draconic.houses, chartResult.conventions);
console.log(compareResult.comparison.bodies, chartResult.natal.receipt);
```

The library accepts engine `BirthInput` directly, without the CLI's
`{ synthetic, birth }` envelope. Use invented data in either interface.
The relative source import depends on this repository layout; this project
does not provide a published package or a built JavaScript entry point.

| Function | Input and result |
| --- | --- |
| `draconicChart(birth, options?, context?)` | Cast and return `{ natal, conventions, draconic }`. |
| `draconicCompare(birth, options?, context?)` | Cast and return `{ natal, conventions, comparison }`. |
| `castNatal(birth, options?)` | Cast and return `{ natal, node }` for reuse by pure functions. |
| `transformNatal(source)` | Rotate an existing source's bodies, angles and cusps. |
| `compareNatal(source)` | Pair that source's natal and rotated longitudes with signed deltas. |
| `rotateLongitude(longitude, northNodeLongitude)` | Rotate a canonical longitude by the selected natal node. |
| `signedLongitudeDelta(natalLongitude, draconicLongitude)` | Return the shortest signed circular difference. |

## Hand-derived rotation example

This arithmetic example uses invented positions, independent of the cast
above. The selected natal node is at 75.25 degrees. For each longitude,
subtract 75.25, then add 360 if the difference is negative:

| Row | Natal degrees | Draconic degrees | Signed delta degrees |
| --- | ---: | ---: | ---: |
| Selected north node | 75.25 | 0 | -75.25 |
| Sun | 100.5 | 25.25 | -75.25 |
| Moon | 15 | 299.75 | -75.25 |

For the Sun, `100.5 - 75.25 = 25.25`. For the Moon,
`15 - 75.25 + 360 = 299.75`; its shortest signed difference is
`299.75 - 15 - 360 = -75.25`. These are exact binary fractions.
The reference is the listed synthetic cases in
[test/ARITHMETIC.md](test/ARITHMETIC.md), enforced by
[test/rotation.test.ts](test/rotation.test.ts) and
[test/compare.test.ts](test/compare.test.ts). No astronomical agreement or
coverage figure is inferred from this arithmetic.

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

## Casting and pure transformations

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

## Structured comparisons

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

## Receipts and provenance

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

## Source tooling and limits

The adapter imports the engine's source entry via a relative path. The local
Vitest alias and TypeScript path mapping resolve its ephemeris dependency from
this project's installation, pinned to the engine's version. The standalone
checks need no root dependency installation or engine build. Direct library
execution outside this tooling requires equivalent source and dependency
resolution. The CLI's local runner transpiles TypeScript in memory using the
installed tooling, and resolves the engine's ephemeris from this folder. It
runs without a root install or engine build, including from another working
directory via `node /path/to/draconic/bin/draconic.mjs chart ...`.

The chart convention uses the engine's true north node by default and
its mean north node only when explicitly selected. Existing natal angles and
cusps rotate with the bodies, including whole-sign cusps, rather than being
calculated again in the rotated zodiac. A fixed chart rotation supplies no
new ephemeris speeds. Results will describe positions and structured deltas
only, without interpretation or predictions.

This is a fixed longitude rotation of a natal tropical chart. It uses no
ayanamsa or new ephemeris calculation for the derived positions. The node
choice is a convention: mean-node selection changes the rotation origin and
keeps the natal true-node body rows. The engine's natal corrections, time
basis, coverage and flags remain available in the natal envelope; rotation
does not extend their accuracy or validate a supplied instant. Refer to the
engine's [README](../README.md) for its astronomical limits. Integration tests
here check engine reuse and receipt preservation, not independent physical
accuracy. Printed precision does not establish accuracy.

Pure transforms trust the supplied node selection, body identity, house
construction and chart provenance. Their consumed-coordinate validation does
not authenticate a caller-created chart. Use `castNatal` or the result
wrappers to select nodes on the engine's chart clock. The wrapper formats and
separate draconic conventions are local drafts; no draconic receipt import or
replay codec is provided. The engine codec applies to `result.natal` only.

The project reports positions and coordinate differences only. It adds no
interpretation, predictions, aspects, derived motion, progressions,
directions, harmonics, relocation, returns or HTTP chart service. It performs
no place lookup or local-time resolution. Unknown time requires an explicit
reference instant, without an inferred noon or a claim about positions across
the rest of that date.

## Licensing and data

Code and documentation here are MIT under the repository's [LICENSE](../LICENSE).
The engine as distributed is `MIT AND CC-BY-4.0`; see its
[LICENSING.md](../LICENSING.md) and [NOTICE](../NOTICE). No engine data or
release archives are copied here. All examples and fixtures must be synthetic.
Dependencies, caches and generated output stay in ignored local folders.
