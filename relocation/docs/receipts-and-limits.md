# Receipts, result status and numerical limits

The relocation library returns sampled geometry with the underlying engine
results. A receipt describes the request and calculation conventions. It does
not authenticate an imported chart, identify a location's historical civil
time, or establish physical accuracy. Paths and test names below are relative
to `relocation/`.

## What is calculated and what is derived

| Value | Computation and provenance |
| --- | --- |
| Natal and relocated chart | Engine `natalChart` and `createNatalEnvelope`; full engine result and natal receipt |
| Planetary equatorial direction | Fresh engine `calc`, true equator of date, geocentric and apparent; full result and calc receipt |
| Nonpolar observer axes and houses | Engine `houses` on the replayed clock and requested house system; full result and houses receipt |
| Altitude, azimuth, horizon motion and residuals | Library spherical projections from the engine direction and ARMC; `ANGULAR_CONVENTIONS` |
| Angular line vertices and crossings | Derived locations evaluated with engine observer axes; indices refer to the sampled observer and position receipts |
| Great-circle route and local-space course | Library unit-sphere geometry; `GREAT_CIRCLE_CONVENTIONS` or `LOCAL_SPACE_CONVENTIONS` |
| Interpolated antimeridian vertex | Lat/lon interpolation with endpoint indices and a fraction; no additional engine calculation or receipt |
| Exact geographic-pole observer | Explicit undefined metadata; no engine houses result or invented receipt |

Angular lines use the full planetary direction with ecliptic latitude retained
by the engine's frame rotation. ASC and DSC are the body center's unrefracted
horizon branches. MC and IC are the upper and lower meridians, regardless of
altitude. These are planetary angular locations; matching a body's ecliptic
longitude to a chart cusp is a different construction. Refraction, parallax,
limb radius, observer height and terrain are absent. See [angular conventions](api.md#planetary-directions-and-angular-line-conventions).

Imported source numerical positions remain source claims. Angular sampling
recomputes them through the installed carried engine. Existing envelopes are
validated and copied by the engine codec. Their recorded artifact or version
labels are not authenticated by that validation. The dependency lock and
`project:check` bind the installed dependency request to the carried archive;
a clean `npm ci --ignore-scripts` installs its locked bytes. The fixture
manifest additionally records runtime and engine identities. Matching a label
alone is insufficient to claim reproduction on another runtime or processor.

## Source replay and time

The engine's `natalReplayInput` preserves the recorded instant, requested
house system, time-known setting, clock and any pinned delta-T. The destination
receives a new engine receipt. Source birthplace-resolution context, extensions
and imported artifact claims stay with the source. A polar whole-sign fallback
at one place does not change the requested house system at another place.
Unknown-time charts preserve absent angles and houses; angular APIs refuse to
infer a map from their conventional reference instant.

UTC angular requests use ISO time. UT1 and TT angular requests use a Julian date
on the recorded clock, derived from the source's millisecond instant. Binary
Julian-date rounding can differ from the natal chart's millisecond arithmetic.
The returned `sampling.time` is the actual angular request; position and
observer receipts record the engine's UT1 and TT. A replay check on those
requests establishes repeatability of the angular calculation, not bitwise
parity with a natal chart on another request representation. The synthetic
clock and delta-T tests are in `test/angles.vitest.ts`, `test/source.vitest.ts`
and the per-family test files.

For a stored chart, serialize only the engine envelope needed as a new source:

```ts
import { parseNatalEnvelope, serializeNatalEnvelope } from "@zodiacs/engine/receipt";
import { relocateChart } from "../src/index.js";

// captured is a RelocatedChartResult from an already resolved synthetic birth.
const stored = serializeNatalEnvelope(captured.relocated);
const parsed = parseNatalEnvelope(stored);
if (!parsed.ok) throw new Error(parsed.code);
const next = relocateChart(parsed.envelope, destination);
```

[examples/workflow.ts](../examples/workflow.ts) provides the complete runnable
version; `test/workflow.vitest.ts` tests its compiled output and engine replay.
The engine codec accepts natal envelopes, not outer relocation results. These
outer `zodiacs.relocation-*.v1` objects have versioned field layouts, but this
project does not supply a general import validator for stored geometry. The CLI
validates new requests; treat external geometry as untrusted data.

## Resolve geometry to its receipts

On a successful angular result, `positionIndex` addresses
`sampling.positions`; `observerIndex` and polyline `source.index` address
`sampling.samples`. They are global within that sampling object. To replay a
position use `calc(position.engine.receipt.request)`; to replay a nonpolar
observer use `houses(observer.engine.receipt.request)`. The current installed
engine performs the replay. `test/golden.vitest.ts` and
`test/workflow.vitest.ts` replay these requests across their committed synthetic
cases. Natal replay uses `natalChart(natalReplayInput(envelope))`.

Seam vertices have `source.kind: "seam"`, `fromIndex`, `toIndex` and `fraction`.
Resolve those indices to the endpoint observers rather than attributing an
endpoint receipt to the interpolated point. `planGreatCircle` and the standalone
`splitAntimeridian` instead use their input path/point indices and perform no
engine sampling. In the CLI's combined angular mode, each entry of `results`
has its own sampling object; do not combine its indices with another family's.

Grid cell polylines connect sampled boundary crossings per cell. Path polylines
trace the route, including refinement observers, rather than tracing a
planetary line. Sampled meridian and horizon polylines and local-space rays
are split at display seams; undefined poles and excluded runs break geometry.
Empty polylines and singleton polylines are valid. Straight links and seam
interpolation need not lie exactly on a physical angular curve or spherical
route between their samples.

## Successful, partial, undefined and refused

| Outcome | Meaning and handling |
| --- | --- |
| Chart or chart-grid result | Validated destinations were computed by the engine; inspect the envelope's flags and actual houses |
| Angular `status: "ok"` | The bounded calculation returned; inspect line statuses, samples and unresolved metadata |
| Grid/path unresolved search | A bracket, topology, singularity or work limit is unsettled; successful earlier crossings and receipts remain available |
| Line `outside-bounds`, horizon `gap`, or undefined observer/direction | The requested geometry is clipped, circumpolar or singular; preserve its reason rather than fill in a location |
| Angular `status: "refused"` | Unknown birth time or a typed engine refusal; partial geometry is discarded, including after a refinement refusal |
| Thrown validation or budget error | Invalid input or insufficient planned coarse work; no successful partial result is promised |

CLI refusals are structured JSON on stdout with exit code 2. Ordinary results,
including `ok` with unresolved regions, exit with 0. Invalid requests, budgets
that fail preflight and IO errors produce diagnostics on stderr and exit with
1. These codes and stream behavior are enforced in `test/cli.vitest.ts` on
synthetic requests. See [the CLI guide](cli.md) for error fields.

Exact destination poles reject for chart relocation and chart grids. Direction
samplers and supported line/path operations retain undefined pole metadata.
At ecliptic/horizon coincidence, observer ecliptic ASC/DSC fields are masked
while the raw engine result remains provenance. Celestial-pole RA and
zenith/nadir azimuth have separate undefined reasons. Nearby directions are
ill-conditioned. Do not replace nulls, unresolved searches or absent houses
with invented zeroes or cusps.

## Work and storage limits

Steps, work budgets and crossing tolerances are explicit inputs. The following
caps are implementation limits enforced by the named committed tests over
synthetic planning, boundary and invalid-input cases. They are not accuracy
claims or a recommended spatial resolution. `scripts/check-project.mjs`
also compares each published cap below to the built public constants, so a
code change cannot silently leave this table stale.

| Limit | Cap and units | Evidence |
| --- | --- | --- |
| `MAX_GRID_SAMPLES` | 4,096 coarse chart-grid destinations | `test/grid.vitest.ts` |
| `MAX_ANGLE_EVALUATIONS` | 4,096 position plus houses calls per angular operation | `test/angles.vitest.ts` and per-family budget tests |
| `MAX_PATH_SAMPLES` | 4,096 retained path or ray observer samples | `test/great-circle.vitest.ts`, `test/path-crossings.vitest.ts`, `test/local-space-lines.vitest.ts` |
| `MAX_GRID_REFINEMENTS` | 52 midpoint probes per candidate grid edge | `test/grid-crossings.vitest.ts` |
| `MAX_PATH_REFINEMENTS` | 52 probes per body, line and coarse path interval, cached probes included | `test/path-crossings.vitest.ts` |
| `MAX_POLYLINE_POINTS` | 16,384 input points to the seam splitter | `test/geography.vitest.ts` |
| `MAX_CLI_INPUT_BYTES` | 131,072 UTF-8 request bytes | `test/cli-request.vitest.ts`, `test/cli.vitest.ts` |
| `MAX_CLI_JSON_DEPTH` | 32 nested JSON containers | `test/cli-request.vitest.ts` |
| Committed project file size | Strictly below 2,000,000 bytes per file | `scripts/check-project.mjs`, excluding ignored generated/build/cache folders |

Chart-grid budgets count destination natal chart calculations. Angular budgets
count engine position calls and houses calls, including refusals and new
refinement observers. They do not count the engine's internal operations or
bound elapsed time or output bytes. Capturing a raw birth can additionally
calculate a natal chart; a chart or envelope needs no source chart calculation.

Analytic line and ray planners reserve conservative worst-case work before
source capture. Clipping, gaps and poles can reduce actual engine work without
relaxing that reservation. Grid and path planners reserve coarse work, then
spend a shared remaining budget during refinement. Exhaustion during refinement
retains partial results and unresolved brackets; an engine refusal discards
them. The CLI's angular mode reserves both selected families against a shared
cap and captures a raw source once. [The API guide](api.md) describes each
planner's independent allocation limits and required-count fields.

Grid `coordinateTolerance` controls the final bracket width in latitude or
unwrapped longitude degrees. Path `coordinateTolerance` controls angular
distance along the spherical arc. `residualTolerance` controls the sampled
altitude or meridian residual, in degrees. Both acceptance conditions must
hold. These tolerances are unrelated to the fixture comparison tolerance or
the underlying engine's reported astronomical bounds. Very small tolerances
can leave searches unresolved at floating-point precision or work limits.

Positions retain engine bounds and coverage refusals. The library does not
propagate those bounds into geographic location uncertainty. A chart accepted
by the root engine can still receive a coverage refusal from the calculation
entry used for angular sampling. Finite grids and sampled line connections do
not establish complete topology; unresolved cells and intervals should be
reported as such. Great-circle paths use geographic latitude on a unit sphere,
not an ellipsoidal route. Antipodal shortest paths reject unless the direction
is supplied by a local-space bearing or the route is split through a waypoint.

The golden fixtures and direct engine comparisons establish regressions on
their stated synthetic corpus. Separate Cartesian, haversine and artificial
geometry checks establish geometric invariants. None is an independent
astronomical accuracy measurement. [The fixture guide](../test/fixtures/README.md)
records the comparison units, tolerance, corpus and artifact/runtime scope.

Keep large generated grids, requests and trial outputs in ignored `generated/`
or `.cache/`. The CLI has no output-byte cap; use modest requests when full
receipt-bearing results must fit a consumer's storage or stream limits.
