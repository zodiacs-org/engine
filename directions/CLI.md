# Primary directions CLI

The CLI runs the existing hit and scan APIs with explicit JSON requests. It
accepts synthetic natal inputs for engine preparation, or already prepared
coordinates for pure geometry. It does not infer conventions from a command
name, select body pairs, sample an age grid or add revolutions.

## Running the commands

Use the Node runtime specified in [package.json](package.json). From the
repository root:

```sh
npm ci --prefix directions --ignore-scripts --cache directions/.cache/npm
npm --prefix directions run build:cli
node directions/bin/directions.mjs hit --input directions/examples/natal-hit.json
node directions/bin/directions.mjs scan --input directions/examples/natal-scan.json
```

The local build writes only the ignored `directions/build/cli.mjs`. It bundles
the engine source with the project's pinned dependency and preserves its
license comments. Rebuild after changing source; the launcher uses the most
recent local build. Neither a root dependency installation nor root `dist/`
is needed. The launcher can also be invoked through the local npm script:

```sh
npm --silent --prefix directions run directions -- hit --input examples/coordinate-hit.json
```

The package's local `bin` name is `directions`. No global installation is
required. `node directions/bin/directions.mjs --help`, `hit --help` and
`scan --help` show the same reference. Help requires the local build and does
not open an input stream. The only calculation option is `--input`, exactly
once, with a file path or `-` for standard input:

```sh
node directions/bin/directions.mjs scan --input - < directions/examples/coordinate-scan.json
```

File paths are relative to the process working directory. The npm script
runs inside `directions/`, so its input paths are relative to that directory.
An absolute launcher path works from any directory. Prefix a file name beginning with
`--` with `./`. Other options, extra arguments, missing values and repeated
options are usage errors. The CLI writes no files. Keep any saved generated
output in the ignored `directions/generated/` directory.

## Request envelopes

Every document explicitly chooses one source. The top-level keys are exact:

| Source | Required keys | Request |
| --- | --- | --- |
| `coordinates` | `source`, `request` | The complete `HitInput` or `ScanInput`, including geometry and body coordinates. |
| `natal` | `source`, `birth`, `request` | A `NatalHitSelection` or `NatalScanInput`, with body identifiers and no geometry or coordinates. |

For example, [natal-hit.json](examples/natal-hit.json) is this invented chart
and explicit selection. Its test is an integration check, not an independent
ephemeris or arc reference:

```json
{
  "source": "natal",
  "birth": {
    "utc": "2000-01-01T12:00:00Z", "timeScale": "ut1", "timeKnown": true,
    "latitude": 35, "longitude": 15, "houseSystem": "placidus", "deltaT": 64
  },
  "request": {
    "convention": {
      "system": "placidus-semiarc", "mode": "mundane",
      "latitude": "retain-both", "motion": "direct", "key": "naibod"
    },
    "significator": { "kind": "angle", "angle": "mc" },
    "promissor": { "kind": "body", "id": "Mars" },
    "contact": { "kind": "conjunction" },
    "yearUnit": "julian-365.25-days"
  }
}
```

`birth` is passed through `prepareNatal` with its existing validation and
domain restrictions. A time scale, known time, location and natal house
system are required. `deltaT` and engine `flags` are optional. A natal
date without a time is refused. Natal house selection is independent of the
direction system. The CLI prepares one snapshot and selects the engine's
body rows and angles by exact labels, without constructing cusps or natal
longitudes. A prepared snapshot cannot be substituted for `birth`.

For a scan, `request` has the common `convention`, `selections`, `motions`,
`yearUnit`, `ageRange` and `maxEvaluations`. Each selection supplies
`significator`, `promissor` and `contact`. Motion belongs in the explicit
`motions` list, not in the common convention. Both age endpoint inclusion
flags and the work budget are required. See
[natal-scan.json](examples/natal-scan.json) and
[coordinate-scan.json](examples/coordinate-scan.json).

The library's supported modes, latitude policies, branches, keys and
refusals are described in the [API guide](README.md). In particular,
converse mundane bodies require `placidus-role-swap`; converse angles,
zodiacal converse and aspects to angles are refused. A scan refuses
atomically when any selected hit refuses, including one outside the age
range. It retains the existing first-turn, deduplication, ordering and
endpoint rules.

Solar-key requests require explicit `solar` samples in `request`, with the
same shape as `directedAge`. Fixed keys reject that field. The CLI does not
silently fetch samples or choose an epoch. For a natal request the audit
retains `solarEpochAssociation: "caller-supplied-unverified"`. Use the
separate `prepareSolarEquatorialDay` API described in the guide to prepare
engine samples from the same natal instant and clock, retaining its
provenance separately. A mathematical sample pair alone does not authenticate
its epoch or solar origin.

## Results and exit status

Calculation output is one JSON document followed by a newline on stdout,
without a banner, rounding or wall-clock timestamp. It is deterministic for
the same inputs, build and runtime. All primitive geometry, convention and
timing fields remain in the result. This is not a promise of identical
floating-point results across platforms or engine versions.

| Exit | Output | Meaning |
| --- | --- | --- |
| `0` | stdout | A hit with `status: "ok"`, or scan with `status: "complete"`, including an empty hit list. Help prints text instead. |
| `2` | stdout | A typed `status: "refused"` calculation result, including invalid library request fields, missing bodies, undefined geometry, unsupported constructions and budget failures. |
| `1` | stderr | A JSON error with `status: "error"`, `stage: "cli"`, `code` and `message`; no calculation result. |

Transport error codes are `usage`, `input-io`, `input-size`,
`input-encoding`, `invalid-json` and `invalid-request`. The last identifies
an invalid envelope; fields inside `request` are validated by the library
and use its typed refusals instead. Startup failures use `runtime` or
`build-missing`; an unexpected failure uses `unexpected-error`. Malformed
JSON diagnostics do not echo submitted text. Natal preparation failures use
`stage: "natal-preparation"` with the adapter's original code and message.

Successful natal hits add the existing `natal` audit. Every returned natal
scan row also carries this audit, including original ecliptic points, natal
clock, engine provenance, requested house system and solar association. A
scan's failing hit appears as its typed `cause`, with indices and work
accounting; earlier hits are discarded. A failure while preparing the natal
snapshot occurs before the scan starts and contains no scan rows.

## JSON boundary and verification

Input is a single UTF-8 JSON document, limited to 1,048,576 bytes and a
container nesting depth of 64. The root object counts as one container;
objects and arrays both add a level. These limits are implementation policy,
enforced in [cli-json.check.ts](checks/cli-json.check.ts) and the subprocess
[CLI checks](checks/cli.check.ts). They are not numerical accuracy claims.

The decoder rejects malformed UTF-8, a byte-order mark, duplicate decoded
object keys, nonfinite numeric literals, comments, trailing tokens and
trailing commas. Escaped and literal spellings of the same key are duplicates.
Numbers otherwise use JavaScript binary64 semantics; JSON input does not add
decimal arithmetic or preserve an integer beyond that representation.

[M10 evidence](evidence/M10.md) records the tests and the examples' scope.
The coordinate examples have hand-derived arcs. The synthetic natal examples
check integration with the engine and preservation of library output. They
do not serve as independent accuracy evidence.
