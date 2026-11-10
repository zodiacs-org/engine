# Primary directions workbench

A private TypeScript library and CLI for classical primary directions on top
of `@zodiacs/engine`. It computes an equatorial rotation and directed age for
explicitly selected bodies, angles, contacts, motion constructions and timing
keys, retaining the intermediate sphere geometry. It lives entirely in
`directions/` and is excluded from the engine's npm package.

Code and authored documentation follow the repository's [MIT license](../LICENSE).
Engine use retains its [data and attribution terms](../LICENSING.md). All
examples and fixtures are synthetic.

## Run it

Use Node 22 as specified in [package.json](package.json). From the repository
root, install the isolated tools and build the CLI:

```sh
npm ci --prefix directions --ignore-scripts --cache directions/.cache/npm
npm --prefix directions run build:cli
node directions/bin/directions.mjs hit --input directions/examples/natal-hit.json
node directions/bin/directions.mjs scan --input directions/examples/natal-scan.json
```

For the library, run the complete TypeScript examples with the local runner:

```sh
node directions/scripts/run-example.mjs pure-api
node directions/scripts/run-example.mjs natal-api
node directions/scripts/run-example.mjs compare-techniques
```

The runner builds only its selected example in the ignored local build
directory. The CLI uses its most recent local build, so rebuild it after
source edits. Neither workflow needs root dependencies or an engine build.
Nothing here installs a global command or writes root `dist/`.

## Choose the convention explicitly

| Contact | Supported construction | Required latitude policy |
| --- | --- | --- |
| Zodiacal body conjunction or ecliptic aspect ray | Direct Placidus semi-arc transfer | `zero-both` |
| Mundane body conjunction or mundane aspect | Direct, or converse with `placidus-role-swap` | `retain-both` |
| Conjunction to MC, IC, ascendant or descendant | Direct axis crossing in either mode | The policy for the selected mode |

Aspect branches, keys, year units and scan endpoints must be explicit. The
keys are `ptolemy`, `naibod` and `solar-equatorial-birth-day`; the last requires
solar RA samples and never silently fetches them. The natal house system is
an independent engine input, not a selector for the direction construction.
Converse angles, zodiacal converse and aspects to angles are explicit
refusals. Circumpolar or tangent semi-arcs are refused without a house-system
fallback. Read the convention guide before selecting a different method.

## Guides and evidence

- [API.md](API.md): entry points, complete hits, natal selection, bounded scans,
  timing keys, geometry fields and typed failures.
- [CLI.md](CLI.md): JSON requests, commands, solar-sample handoff and exit codes.
- [CONVENTIONS.md](CONVENTIONS.md): supported scope, source-by-source choices
  and a worked audit of the sphere calculation.
- [COMPARISONS.md](COMPARISONS.md): separate examples using the engine's
  secondary-progression and longitude solar-arc helpers.
- [SOURCES.md](SOURCES.md): traditional source editions, locators and recorded
  readings, including where this project's subset differs.
- [evidence/README.md](evidence/README.md): independent hand derivations,
  reproducible residual reports and separately labeled integration checks.

Scans enumerate the requested contacts and motions under a work limit. They
return the first nonnegative rotation of each selected construction and do not
search later revolutions or sample an age grid. Directed ages are symbolic
key conversions; results do not predict events or establish a global error
bound. The documented numeric scope is the finite evidence corpus.

## Check the project

```sh
npm --prefix directions run typecheck
npm --prefix directions test
npm --prefix directions run build:cli
npm --prefix directions run evidence
npm --prefix directions run check:isolation
```

The lockfile pins local tools and the engine's ephemeris version. Tests use
`.check.ts` and an explicit Vitest config so root test discovery excludes
them. Typechecking includes the runnable examples and emits nothing.
Generated reports, build files and caches stay in ignored project folders.

The isolation check verifies documentation punctuation, file sizes and npm's
dry-run exclusion of `directions/`, with lifecycle scripts disabled. It does
not establish engine package completeness, size budgets or archive reproduction.
The root package gate needs an existing engine build, which this task does
not create. [M12 evidence](evidence/M12.md) records the final checks and their
limits. Git writes and the draft PR are handled by the session harness.
