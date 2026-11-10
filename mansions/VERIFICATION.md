# Verification and evidence

Run from the repository checkout with Node.js 22 active:

```sh
cd mansions
npm ci --ignore-scripts
npm run check
```

In a sandbox with a read-only default npm cache, run
`export npm_config_cache="$PWD/.cache/npm"` after changing into `mansions/`
and before either npm command.

The private project's pinned dependencies and lockfile stay here. The checks
import engine source by relative path and resolve its ephemeris dependency
locally. No root install, engine build or release archive is required. All
example instants and test motion are synthetic and unrelated to a person's
birth data. The runnable API and CLI examples are in [README.md](README.md).

## What each check establishes

| Claim or behavior | Committed check | Reference and scope |
| --- | --- | --- |
| Equal segment widths, Aries zero, full-circle closure and rounded-width discrepancy | [tables.test.ts](test/tables.test.ts) | Independent integer cross multiplication at every endpoint of `equal28-aries-v1`; the names are checked against the public domain witness cited in [SOURCES.md](SOURCES.md) |
| Exact half-open membership for supplied binary floating-point longitudes | [classify.test.ts](test/classify.test.ts) | Independent rational arithmetic on the test grid, all boundary neighbors, signed wraps, subnormal and extreme finite inputs |
| Moon position conventions, input validation, bounds and receipt preservation | [engine.test.ts](test/engine.test.ts), [at.test.ts](test/at.test.ts) | Engine parity and receipt replay at the synthetic instants listed in those files, with parser and coverage-edge checks; numerical regression evidence |
| Chronological ingresses and first-changed-millisecond membership | [ingresses.test.ts](test/ingresses.test.ts) | Hand-derived synthetic rational crossing times over a full circle and wrap; separate engine replay over the synthetic window from 2001-02-03 to 2001-03-05 |
| Occupancy endpoints, clipping and adjacent windows | [range.test.ts](test/range.test.ts) | Independent synthetic-motion intervals over a full circle and wrap; separate engine replay from 2001-02-03 to 2001-02-06 |
| Explicit ayanamsa selection and preservation of both zodiacs' receipts | [sidereal.test.ts](test/sidereal.test.ts) | Every offered built-in at the synthetic instant 2001-02-03T00:00Z, engine receipt replay over 2001-02-03 to 2001-02-06, and independent varying-ayanamsa synthetic motion |
| Search limits and shared evaluation budgets | [ingresses.test.ts](test/ingresses.test.ts), [sidereal.test.ts](test/sidereal.test.ts), [hardening.test.ts](test/hardening.test.ts) | The exported `INGRESS_SEARCH_LIMITS`, exact-budget and budget-short refusals, including sidereal calls and searches split at clock steps |
| Time-basis steps, reverse changes, refusals and exceptions | [hardening.test.ts](test/hardening.test.ts) | The engine's model handover, committed leap-second list and IERS table endpoint, with synthetic adjacent and skipped-mansion jumps; engine model regression evidence |
| CLI arguments, chronological JSON/text, receipt retention and exit behavior | [cli.test.ts](test/cli.test.ts), [cli-failures.test.ts](test/cli-failures.test.ts) | Library parity, process calls from outside the checkout, host-zone comparisons, invalid arguments, typed refusals and calculation/startup failures |
| Standalone API examples can execute | [check-examples.mjs](scripts/check-examples.mjs) | The actual fenced TypeScript in README, bundled in memory and executed in fresh processes against the checkout source; not an accuracy comparison |
| Project size, documentation text and package isolation | [check-isolation.mjs](scripts/check-isolation.mjs) | Private manifest, pinned ephemeris parity, source files below the requested size limit, no source symlinks or documentation em dashes, and a root npm package dry-run excluding `mansions/` |

The TypeScript check verifies the source, tests and local Vitest configuration.
The example checker transpiles and executes the README snippets; it is not a
separate static type check of those snippets. Shell examples are exercised
through the CLI integration tests and can also be run directly after setup.

## Numerical resolution and astronomical accuracy

The equal table is a project definition with historical naming attestation.
The arithmetic tests establish that definition and synthetic crossing behavior.
They do not compare the real Moon with an independent ephemeris. Engine replay
checks establish integration and regressions, and cannot serve as independent
accuracy evidence either.

The shared solver finds candidate roots using rounded numerical targets. The
wrapper refines membership using the exact table classifier at adjacent
milliseconds. Reported resolution concerns this computed change. The fixed
scan step and consistency checks are tested, not proven complete. A longitude
bound retained from the engine is not a bound on the time of ingress, and no
new physical timing uncertainty is calculated here.

Clock-model steps can themselves produce a change, including a reverse change
followed by a return. Those events retain the engine's time-basis receipts;
they do not describe physical retrograde lunar motion. Refusals contain no
partial result. An unexpected calculation error is propagated by the library
and becomes a failure diagnostic in the CLI.

[INGRESS-SAMPLES.md](INGRESS-SAMPLES.md) records why the inspected publications
did not supply an admissible independent ingress fixture. No external event
times were imported. Published-sample timing accuracy remains unmeasured.
The admission criteria there apply before any future fixture is added. Engine
bounds, comparison spans and source licences retain the meanings documented
by the [calculation guide](../docs/calc.md), [Vedic guide](../docs/vedic.md)
and [licensing audit](../LICENSING.md).

## Repository isolation review

`npm run check:isolation` performs a dry-run with lifecycle scripts disabled.
It creates no archive and verifies that the root package includes no file
from this project, even when `dist/` is absent. It does not claim to run the
engine's full package-content or archive-binding gates, which require engine
builds and, for archive binding, full history. This project must not build or
modify `dist/`, packed files, release metadata or the immutable archives.

The isolation script checks this project's files, not the scope of a git diff.
Before handing work to the harness, also inspect the read-only worktree diff:

```sh
git diff --check
git diff --stat
git status --short
```

Changes must stay under `mansions/`. No git mutation, publish or release step
belongs in the local checks. Dependencies, generated data and tool caches
belong in the locally ignored directories listed in [.gitignore](.gitignore);
the example checker writes no generated files. New sourced fixtures require
redistribution provenance and a small committed witness, as described in
[SOURCES.md](SOURCES.md). Do not include secrets or tokens in examples,
fixtures, receipts captured from other users or logs.
