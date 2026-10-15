# Local CLI

Install and build from the repository root on the Node runtime specified in
[package.json](../package.json):

```sh
npm ci --prefix mundane
npm run build --prefix mundane
./mundane/bin/mundane.mjs --help
```

The command is named `mundane` in the private project's `bin` manifest. Invoke
the local executable by path, or use `npm run --silent mundane --prefix mundane --`
followed by the arguments. It is not part of the engine's npm package. The
build bundles the CLI, relative engine imports, and pinned ephemeris under
ignored `mundane/build/`. Rebuild after changing sources. It leaves the engine's
`dist/` untouched and needs no root dependencies. Tests build the CLI themselves.
The pure library entry has no dependency on the CLI or Node file IO.

For an invented place, cast and summarize the cardinal solar ingress charts:

```sh
./mundane/bin/mundane.mjs ingresses \
  --latitude 12.5 --longitude -31.25 --name 'Synthetic Meridian' \
  --year 2024 --house-system regiomontanus
```

Find New and Full Moons in a resolved instant range and print complete JSON:

```sh
./mundane/bin/mundane.mjs lunations \
  --latitude 12.5 --longitude -31.25 \
  --from 2024-03-01 --to 2024-04-01 --format json
```

Combine ingress and lunation charts in chronological order:

```sh
./mundane/bin/mundane.mjs year \
  --latitude 12.5 --longitude -31.25 --year 2024 --format json
```

Each command requires coordinates and either `--year` or both `--from` and
`--to`. `year` also accepts a range. Coordinates are finite decimal degrees,
north and east positive, validated by the engine and the mundane place helper.
Names label a place; they do not select or geocode it. Scientific and hexadecimal
coordinate spellings are rejected. House names use the engine's exact spelling,
defaulting to whole sign. Actual houses and polar fallback remain in output.
The year must be a safe integer, with astronomical year numbering. Ephemeris
coverage is checked by the library even when the search budget would refuse.

Date-only arguments denote UTC midnight. Date-times require an explicit UTC
designator or numeric offset. Local wall times, calendar rollovers, reversed
or empty windows, and leap-second labels are rejected through existing input
validation. The event window is `(from, to]`, excluding the opening instant and
including the closing instant. Host timezone does not select a local year.
The returned chart clock and its coverage caveats still apply; see
[ingresses.md](ingresses.md), [lunations.md](lunations.md), and
[reports.md](reports.md).

Options accept `--option value` or `--option=value`. Unknown options, duplicate
options, missing or empty values, positional arguments, and options for another
command are errors. Help is accepted alone, or immediately after a command
with no other arguments. Omitting arguments shows general help.

`--format text` is the default. It prints the place, normalized window, status,
search assumptions and budget metadata, then each event's angles, requested
and actual houses, cusp longitudes, body longitudes and latitudes, speeds,
angular classical planets, time basis, calculation flags, engine identity,
and existing factor descriptions. Longitudes and latitudes use degrees; speeds
use degrees per day. Factor text describes each angle's ruler and its essential
dignities and debilities. Lists are labelled
`traditional conventions, not predictions`. Values are not rounded for display.

`--format json` serializes the complete library result, including chart
provenance, structured analyses, factor source pointers, and refusal metadata.
There is no extra CLI envelope. Ingress and lunation commands retain their
respective result-array names, and `year` uses `events`. A refused search has
an empty result array, never partial chart output. A complete search with no
events is a different outcome. JSON and text terminate with a newline. Output
goes to stdout; input and operational errors go to stderr, with no chart output
or stack trace. Error messages are JSON-escaped to keep diagnostics on one line.

Exit codes, enforced by [test/cli.test.ts](../test/cli.test.ts):

| Code | Meaning |
| --- | --- |
| `0` | Completed search, including empty results, or help |
| `1` | Invalid arguments, invalid settings, unsupported calculation input, or IO error |
| `2` | Search refused, including unavailable requested eclipse adapter |

For `ingresses` and `lunations`, `--max-samples` replaces the library's budget.
For `year`, `--ingress-max-samples` and `--lunation-max-samples` set separate
budgets. Values must be positive safe integers in ordinary integer notation.
Budget units and sample-based completeness limits remain the library's; this
CLI performs no extra event search. Defaults remain those documented and tested
in the component APIs.

To request optional eclipse minima with `year`, supply
`--eclipse-settings PATH`. PATH is a local JSON file, relative to the current
working directory. It must contain exactly the explicit settings accepted by
[EventsEclipseSettings](../src/events-bridge.ts): a `model` object with
`sunRadiusAu`, `moonRadiusAu`, and `earthRadiusAu`, and `stepMs`,
`derivativeStepMs`, and `maxEvaluations`. Radii use astronomical units; steps
use milliseconds. All settings are required and validated before loading the
optional module. Choose them deliberately; the CLI supplies no physical model
or scan defaults. No module path can be supplied in JSON.

The loader reads the already-built relative `events/build/src/index.js` in
this checkout. It never fetches or builds events. Missing or incompatible APIs
produce a refused report with eclipse status and reason. A broken module or
malformed settings file is an operational error. Source labels, provenance,
and completeness restrictions remain in JSON. The current bridge supplies
`minimum-shadow-axis-distance` instants, not limb contacts or local visibility.
The pure eclipse API also supports an explicitly supplied contact adapter;
arbitrary adapter modules are not loaded by this CLI. See
[eclipses.md](eclipses.md) for the source contract and limits.

[test/cli.test.ts](../test/cli.test.ts) spawns the built executable with the
test runner's Node runtime. It checks strict arguments, complete JSON against
the current library API as integration evidence, text fields, budget refusals,
empty windows, early-year calendar behavior, explicit offsets, host timezone
independence, and loading at the production relative directory depth. Supplied
eclipse-module geometry and places are synthetic. March event checks use the
existing committed USNO fixtures and their original comparison threshold and
clock qualifications from [ingress-references.md](ingress-references.md) and
[lunation-references.md](lunation-references.md). No expected instant comes
from an earlier engine run. The CLI establishes no additional accuracy claim.
The session check record is [evidence/m12/checks.txt](evidence/m12/checks.txt).
