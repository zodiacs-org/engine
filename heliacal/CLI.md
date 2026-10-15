# Heliacal CLI

The CLI runs the library APIs described in [README.md](README.md). It retains
their engine receipts, model parameters, source searches and diagnostics.
It needs the engine source in the parent checkout and this folder's installed
dependencies, including the development tools. It does not build the engine
or require root dependencies. This private project is not a standalone npm
distribution.

Use the Node version required by [package.json](package.json). From the
repository root:

```sh
npm --prefix heliacal ci --ignore-scripts
node heliacal/bin/heliacal.mjs --help
node heliacal/bin/heliacal.mjs events --help
node heliacal/bin/heliacal.mjs crescent --help
node heliacal/bin/heliacal.mjs phase --help
```

The executable has the package-local bin name `heliacal`. The direct Node
invocation above also works without installing a global command. An absolute
path to the launcher works from another working directory. The equivalent
npm script is `npm --silent --prefix heliacal run heliacal -- COMMAND OPTIONS`;
use `--silent` to keep npm's script banner out of JSON stdout. The CLI source
loader is confined to its process, transpiles the source in memory, and resolves
the pinned astronomy dependency from this folder. Importing the pure library
does not install that loader or read process arguments.

## Shared inputs and output

Supply `--latitude` and `--longitude` in geodetic degrees, with east-positive
longitude. `--height` is in metres and defaults to zero. Height changes the
observer position but does not add horizon dip. The model and source search
conventions describe their observer ellipsoids and horizon definitions.

Date-only strings mean UTC midnight in the proleptic Gregorian calendar.
Date-times require an explicit offset. No host timezone or unresolved local
time is inferred. Ranges use `--from` and `--to`, including the start and
excluding the end. Their source opportunity ownership and support padding
remain those of the library. A range edge cannot establish a first or last
appearance on its own.

Options accept `--name value` or `--name=value`, with exact case-sensitive
names and values. Unknown, repeated, empty, missing or unused options are
errors, as are extra positional arguments or a bare `--`. Numeric values
must be finite plain decimals; hexadecimal, exponent notation, whitespace,
`NaN` and `Infinity` are rejected. Budgets require positive safe decimal
integers. The library enforces the physical input domains and operational
search caps. There are no silent parameter overrides or inferred models.

Computations write one compact JSON document followed by a newline to stdout:

```text
{ "schema": "heliacal-cli/1", "command": "...", "units": { ... }, "result": { ... } }
```

`result` is the full library result. Source `Date` values become UTC ISO
strings; the serializer retains array order and finite numeric precision,
sorts object keys recursively, omits absent object properties and uses JSON's
zero for negative zero. It refuses nonfinite numbers, invalid dates, cycles
and unsupported values. No wall-clock generation timestamp is added. Identical
requests on the same checkout, runtime and platform have deterministic output;
this is not a cross-platform numerical identity promise or an authenticated
receipt format.

The envelope's `units` names derived coordinate angles in degrees, distances
in astronomical units, observer height in metres, elapsed times in milliseconds
and crescent widths in arcminutes. Yallop's `q` is dimensionless; Odeh's `v`
is in degrees. Field-specific units and the original source receipt conventions
remain authoritative, including bounds in arcseconds and time-scale data in
seconds. Engine receipts cover the original position calculations, not the
derived visibility events or their predictive validity.

| Exit status | Meaning and stream |
| --- | --- |
| `0` | `ok` phase, `complete` search (including an empty result), or requested help |
| `1` | Invalid input or execution/serialization error; error document on stderr, no result on stdout |
| `2` | Library `refused`; complete refusal object and diagnostics on stdout |
| `3` | Library `unresolved`; complete unresolved object and diagnostics on stdout |

Help is plain text. Startup failures, such as unavailable dependencies or an
unsupported Node runtime, produce a concise stderr line before the JSON
application can load. A closed downstream pipe exits quietly. A completed
search may contain explicit opportunity gaps; inspect `diagnostics` rather
than interpreting completion as proof of every physical event. Refusals and
unresolved results never become empty successful searches.

The exit behavior, parsing, serialization and examples are enforced by
[CLI boundary tests](test/cli.test.ts), [failure tests](test/cli-status.test.ts)
and [process integration tests](test/cli-integration.test.ts).

## Phase

```sh
node heliacal/bin/heliacal.mjs phase --body Moon --at 2020-01-01 \
  --latitude 45 --longitude 10 --height 0
```

Choose `Moon`, `Mercury`, `Venus`, `Mars`, `Jupiter` or `Saturn`. The result
contains geocentric and topocentric signed synodic longitude, true angular
elongation and geometric illumination. Morning-star and evening-star labels
describe the side of the Sun in longitude, not whether the body is visible.
Conjunction and opposition have distinct boundary labels. `phase` accepts an
instant, not a range or a visibility model.

The integration tests compare the Moon and Venus at the example instant and
site with the [committed Horizons fixture](test/fixtures/phase-reference.json),
using its predeclared gates. The other CLI comparisons with the library check
transport and receipt preservation, not independent physical accuracy.

## Events

`events` requires `--mode heliacal` or `--mode horizon`. Both take a body, site
and date range. Optional `--max-samples` applies to the combined sky search
budget, including support intervals; attached position receipts are outside
that sample count.

### Heliacal visibility transitions

```sh
node heliacal/bin/heliacal.mjs events --mode heliacal --body Venus \
  --from 2001-02-03 --to 2001-02-06 --latitude 13 --longitude -42 --height 120 \
  --model horizon-arcus-visionis/1 --first-morning-deg 10.5 --last-evening-deg 9.5
```

This calls `heliacalEvents` with the cited horizon arcus model. Supply at least
one appearance threshold; there are no calibrated defaults. Each threshold
is the minimum solar depression in degrees at the target's airless centre
horizon crossing. The example uses invented observing inputs and explicit
threshold choices exercised by the integration tests; it is not a recommended
calibration or a claim of an appearance during that short interval.

| Threshold option | Appearance | Applicable bodies |
| --- | --- | --- |
| `--first-morning-deg` | Heliacal rising, first morning appearance | Visible planets |
| `--last-evening-deg` | Heliacal setting, last evening appearance | Visible planets |
| `--first-evening-deg` | First evening appearance | Mercury, Venus, Moon |
| `--last-morning-deg` | Last morning appearance | Mercury, Venus, Moon |

The Moon's arcus results are explicitly geometric extensions, not crescent
predictions. Use `crescent` for the empirical lunar models. Optional
`--max-geometry-samples` bounds full Sun/body geometry calls separately.
Events retain successive-opportunity brackets; their reference epochs are
not predicted sighting instants.

This horizon criterion does not apply the library's separate configurable
altitude/extinction/magnitude screen. It rejects those options rather than
pretending they influence this search. Its returned conventions explicitly
state the fixed airless centre horizon and absent photometric adjustments.

### Geometric acronychal and cosmical events

```sh
node heliacal/bin/heliacal.mjs events --mode horizon --body Moon \
  --from 2001-02-03 --to 2001-02-06 --latitude 13 --longitude -42 --height 120 \
  --kinds acronychal-setting,cosmical-rising
```

This calls `horizonPhenomena`. Omit `--kinds` to request all supported pairings,
or supply a comma-separated list with distinct names and no spaces:
`cosmical-rising`, `cosmical-setting`, `acronychal-rising`,
`acronychal-setting`. The returned terminology defines cosmical pairings with
sunrise and acronychal pairings with sunset; rising or setting refers to the
target. These are geometric horizon-order reversals, not visibility events.
No visibility model, appearance thresholds or geometry-call budget applies.

## Crescent searches

```sh
node heliacal/bin/heliacal.mjs crescent \
  --from 2001-02-03 --to 2001-02-06 --latitude 13 --longitude -42 --height 120 \
  --model yallop-1997/1 --last-category B --max-elongation-deg 30 \
  --morning-timing mirror-evening
```

This calls `crescentEvents` for the Moon. Choose `yallop-1997/1` with
`--last-category` A, B, C or D, or `odeh-2006/1` with A, B or C. The category
selects the ordered prefix starting at A within that model. Read each
criterion's `categoryMeaning`; identical letters do not imply equivalent
optical-aid conditions across models.

`--max-elongation-deg` is a required geocentric separation ceiling and a
caller-selected search domain, not an empirically validated limit. The
example's ceiling and category are explicit test inputs, not a claim that
a crescent is visible during the example range. Both model choices are
exercised with these inputs by the process integration tests.

Without `--morning-timing`, or with `disabled`, only first evening transitions
are searched. `mirror-evening` adds last morning transitions using the
library's explicitly unvalidated symmetry extension. The result retains
that label. The published evening best-time rule and the morning extension
are described with sources in [README.md](README.md#first-evening-and-last-morning-crescent-searches).

Optional `--max-samples` and `--max-geometry-samples` have the separate sky
and full geometry budgets described above. These fixed empirical fits offer
no adjustable extinction or magnitude parameters. Every result retains the
actual model geometry, coefficients, selected categories, conventions,
opportunity gaps and engine receipts. No model output guarantees a sighting.
