# Offline CLI

Commands below run from `relocation/`. See [the library API](api.md) for
complete option semantics and [receipts and limits](receipts-and-limits.md)
for result interpretation.

Run `npm run build` in this directory to compile this project's TypeScript
into its ignored `build/` directory. This uses the installed carried engine
archive and writes no engine build output. Run `node bin/relocation.mjs --help`
or `npm run cli -- --help` from this directory. To use the command name from
elsewhere, put this directory's absolute `bin/` path on your shell's `PATH`.
The local package also declares the `relocation` binary for npm consumers.
`npm test` rebuilds this project before testing the real launcher.

```sh
# From relocation/, with dependencies installed and this project built.
node bin/relocation.mjs chart --input examples/chart.json --pretty
node bin/relocation.mjs lines --input examples/lines.json
node bin/relocation.mjs grid --input examples/grid.json
node bin/relocation.mjs lines --input examples/path.json
node bin/relocation.mjs lines --input examples/local-space.json
node bin/relocation.mjs grid --input examples/grid-crossings.json
# Pipe a complete JSON request instead of naming a file.
cat examples/chart.json | node bin/relocation.mjs chart
```

Each command reads one UTF-8 JSON object from stdin by default. `--input FILE`
reads a local file relative to the current working directory; `--input -`
selects stdin explicitly. `--pretty` indents output without rounding numbers.
`--help`, alone or after a command name, prints usage without reading input.
Unsupported or repeated options reject. Paths are local filesystem paths;
the CLI does not resolve URLs, geocode places, infer time zones or contact
network services. Resolve a local wall time before preparing the request.

The `source` field accepts a resolved engine birth input or an engine natal
envelope object. Birth inputs use `utc` as a resolved ISO string or finite
epoch-millisecond number; optional fields are `latitude`, `longitude`,
`houseSystem`, `timeKnown`, `timeScale`, `deltaT` and `flags`. The engine
validates their semantics. Natal envelopes go through the engine's codec,
including its own size and structural limits. Serialized full engine charts
are not a CLI source format: use an engine natal envelope for stored results.
The pure library still accepts full engine chart objects.

| Command | Request fields | Returned result |
| --- | --- | --- |
| `chart` | `source`, `destination: {latitude, longitude}` | `relocateChart` result with both natal envelopes |
| `lines`, mode `angular` | `source`, `mode`, `options: {bounds, latitudeStep, maxEvaluations, bodies?, lines?}` | `zodiacs.relocation-lines.v1`, containing meridian and horizon results |
| `lines`, mode `path` | `source`, `mode`, `options: {from, to, stepDegrees, maxEvaluations, maxRefinements, coordinateTolerance, residualTolerance, bodies?, lines?}` | Path, crossing brackets, unresolved intervals and engine sampling |
| `lines`, mode `local-space` | `source`, `mode`, `options: {origin, lengthDegrees, stepDegrees, maxEvaluations, bodies?, directions?}` | Azimuth rays and receipt-linked observer samples |
| `grid`, mode `charts` | `source`, `mode`, `options: {bounds, latitudeStep, longitudeStep, maxSamples}` | Relocated natal envelope at every admitted grid point |
| `grid`, mode `crossings` | `source`, `mode`, `options: {bounds, latitudeStep, longitudeStep, maxEvaluations, maxRefinements, coordinateTolerance, residualTolerance, bodies?, lines?}` | Angular crossings, cell geometry, unresolved cells and engine sampling |

`?` marks an optional field in the table; it is not part of the JSON key.
`bounds` contains `south`, `north`, `west`, `east`. `from`, `to` and `origin`
contain `latitude`, `longitude`. All coordinates, steps, angular distances
and tolerances are degrees; work budgets and refinement limits are integers.
The committed request files use synthetic births and cover every mode. File
and stdin executions of those exact files are checked in `test/cli.vitest.ts`.
Their values are demonstration inputs, not recommended accuracy settings.

For a stored CLI result, use its natal envelope as the next `source`: the
`relocated` field from `chart`, or `samples[i].envelope` from a chart grid.
An outer relocation result is not itself a natal envelope. For angular mode,
read each family's `sampling` inside `results`; path, local-space and grid
crossing modes have a top-level `sampling`. Those angle samples are not full
natal charts. A complete JSON request must wrap the envelope in `source` and
provide the selected command's other fields. This flow is exercised through
real CLI processes in `test/workflow.vitest.ts`.

Modes are explicit. Every mode requires the library's steps, budgets and,
for crossing refinement, tolerances and refinement limits. Unknown request,
option, coordinate and raw birth fields reject instead of being ignored.
Body, line and direction selections follow the library's case-sensitive
names. Duplicate JSON keys reject, including keys spelled with JSON escapes.
Requests are bounded to `MAX_CLI_INPUT_BYTES`, currently 131,072 UTF-8 bytes,
and `MAX_CLI_JSON_DEPTH`, currently 32 nested containers. Byte boundaries,
invalid UTF-8, duplicate keys and depth refusal are enforced over synthetic
request cases in `test/cli-request.vitest.ts` and stream cases in
`test/cli.vitest.ts`; these are input limits, not accuracy figures.

Angular mode defaults to all angular bodies and all four angular lines.
It returns a `results` array with the meridian family first when selected,
then the horizon family when selected. Line order within a family follows
the request. Each family retains its full library result, including its
own positions, observer indices and receipts. Indices are local to that
family's `sampling`, not shared across the outer array. The CLI reserves
both families' worst-case evaluations against one `maxEvaluations` before
calculating a raw source chart. `requiredEvaluations` reports their sum;
each nested plan receives its reserved share. A raw birth adds a source
natal chart calculation outside this position-and-observer budget. If either
family refuses, the outer result is `refused` and retains only the refusing
family, with no geometry from an earlier successful family. The aggregate
budget, single source calculation and refusal behavior are enforced in
`test/cli-request.vitest.ts`.

Results go to stdout as one JSON document followed by a newline. The CLI
returns exit code 0 for a returned result or help, 2 for a library refusal
such as unknown birth time or an engine calculation refusal, and 1 for
invalid input, exceeded work budgets or IO errors. `status: "ok"` can still
contain undefined directions and unresolved crossings; inspect the returned
metadata. Errors go to stderr as `zodiacs.relocation-cli-error.v1` objects
with `status`, `code` and `message`. Budget errors also report the unit,
required work and maximum. If required work overflows a finite JSON number,
`required` is null and `requiredRepresentable` is false; no Infinity is
silently converted into a successful numerical result. Error diagnostics
omit raw input and local filenames. Process exit codes, stream separation,
clock replay, receipts, polar fallback, seam requests and budget overflow
are covered by synthetic tests in `test/cli.vitest.ts`. These checks and
the examples establish regressions and CLI behavior, not physical accuracy.

The CLI writes no output files itself. Use shell redirection to save results
in the ignored `generated/` directory. Bound requests to keep outputs small;
receipt-bearing chart grids grow with every sample. Keep generated grids and
temporary request files out of committed fixtures. The public library entry
does not import the CLI or its filesystem and process helpers.

