# M1 validation

Repository base: `7307665bdbc432269fdac006104f661be16000bc`.
Runtime: Node `v22.22.2`, npm `9.2.0`, Linux x64.
Engine: `1.0.0`; installed ephemeris: `astronomy-engine@2.1.19`.
Tool versions and integrity hashes are in `edge/package-lock.json`.

The shell initially supplied Node `v20.19.2`. For this session a Node runtime
was installed locally with:

```sh
npm install --prefix edge/.cache/runtime --cache "$PWD/edge/.cache/npm" --no-audit --no-fund --no-package-lock node@22.22.2
export PATH="$PWD/edge/.cache/runtime/node_modules/.bin:$PATH"
```

The downloaded runtime is ignored and is not a project dependency. On a host
already using Node 22, use that host runtime instead.

| Command from repository root | Outcome |
| --- | --- |
| `npm ci --prefix edge --cache "$PWD/edge/.cache/npm" --no-audit --no-fund` | Passed with the committed lockfile. |
| `npm --prefix edge run typecheck` | Passed, no emitted files. |
| `npm --prefix edge test` | Passed: 6 tests, no failures or skips. |
| `npm --prefix edge run smoke:node` | Passed; summary below. |
| `npm --prefix edge run check:isolation` | Passed project file limits, documentation check and edge exclusion from the root packing list. |
| `npm_config_cache="$PWD/edge/.cache/npm" npm run package:contents` | Failed: `packed package is missing dist/calc.d.ts`. This checkout has no root `dist/`. |

The reference bundle is generated from the current checkout's relative source
imports, with its dependency resolved from the local installation. Its output
is under `edge/.generated/reference/` and includes the dependency's inline MIT
notice and copies of the root licence, licensing record and notice.

The smoke command produced this summary:

```json
{
  "status": "passed",
  "scope": "Node repeatability only; cross-runtime comparison is pending",
  "runtime": "v22.22.2",
  "engineVersion": "1.0.0",
  "ephemeris": {
    "name": "astronomy-engine",
    "version": "2.1.19"
  },
  "chartCases": 4,
  "houseCases": 39,
  "transitStatus": "complete"
}
```

The corpus is exactly `edge/src/workloads.ts`: its named synthetic chart and
angle inputs, plus the Sun crossing scan from `2000-03-01T00:00:00Z` through
`2000-04-01T00:00:00Z`. `edge/tests/foundation.check.mjs` enforces coverage of
that corpus, fallback and unknown-time cases, finite outputs, a nonempty scan
within its sample budget and exact repeated results after interleaved calls.
These checks compare this engine with itself under Node; they are neither
cross-runtime parity evidence nor an astronomical accuracy comparison.

No performance numbers have been measured. Other runtimes, the full root
engine CI suite and the archive rebuild gates were not run in this milestone.
Root dependencies and root build output were not installed or generated.
The separate edge packing-list check establishes exclusion only, not the full
repository package-content verdict.
