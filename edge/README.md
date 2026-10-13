# Edge and browser lab

This private project reads the engine's source through relative imports. Its
dependencies, build output and checks live here. It does not change the npm
package or require a root build. Code and documentation here use the repository
[MIT licence](../LICENSE); bundles also carry the engine's data attribution and
the dependency's notices. See [LICENSING.md](../LICENSING.md) and
[NOTICE](../NOTICE) before redistributing them.

The current milestone provides a Node reference build and synthetic workloads.
Worker, Deno, Bun and browser bundles, runtime parity checks, benchmarks and a
measured WASM experiment are tracked in [PLAN.md](PLAN.md). They are not yet
implemented or validated.

The foundation's commands, observed results and the missing-root-build
limitation are recorded in [M1 validation](docs/evidence/m1-validation.md).

## Run the foundation

Use Node 22, as enforced by `scripts/build-reference.mjs`. From the repository
root:

```sh
npm ci --prefix edge --cache "$PWD/edge/.cache/npm"
npm --prefix edge run typecheck
npm --prefix edge test
npm --prefix edge run smoke:node
npm --prefix edge run check:isolation
```

No root install is needed. The local lockfile pins the toolchain, and the build
checks its installed ephemeris against the root package's exact dependency.
The build resolves that dependency from `edge/node_modules`, even when the
root has another installation. This uses esbuild's
[alias option](https://esbuild.github.io/api/#alias).

`build:reference` writes `.generated/reference/workloads.mjs`, the build's
import metadata and copies of the engine's licence, licensing record and
notice. It retains dependency legal comments in the bundle. That ignored
directory is a local test artifact; it is not a release package.

`src/workloads.ts` contains only invented inputs. Chart cases exercise UTC,
southern and polar locations, and unknown birth time. The houses workload
computes angles and every system exported in `HOUSE_SYSTEMS` on fixed angular
inputs. The transit scan searches the Sun's longitude crossing over the
explicit interval in `TRANSIT_CASE`, with a fixed sample budget. Calls return
their full engine results, without rounding or replacing numerical values.
The test checks that the scan completes and contains a crossing.

Node test files use `tests/*.check.mjs`, explicitly selected by the edge test
command. Do not name them `*.test.*` or `*.spec.*`: the root Vitest command
would discover those and run this separate project in the engine's jobs.

`smoke:node` checks repeatability within Node and prints a summary. The tests
also repeat calculations after the other workloads to exercise shared
ephemeris state. These are compatibility checks, not evidence of astronomical
accuracy. Cross-runtime exact comparison, including a representation that
preserves signed zero, belongs to the later parity milestones.

`check:isolation` checks project file limits and documentation, then inspects
the root package's dry-run file list with scripts disabled. It checks that
this folder stays out of the package. The repository's separate
`npm run package:contents` needs an existing root `dist/`; the edge check does
not substitute for that complete gate. Do not create or alter root build
output for this project.

Keep raw runs in `results/`, generated bundles in `.generated/` and downloaded
tools in `.cache/`; all are ignored. Future baseline summaries and their
measurement scripts will be committed under `docs/evidence/` within this
folder. Do not commit secrets, personal birth inputs or external ephemeris
output.
