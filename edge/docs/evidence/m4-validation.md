# M4 validation

Repository base: `3d0d052ebd8cef534740b5f589f3f315ea0e3d6e`, plus this
milestone's changes under `edge/`. [m4-build.json](m4-build.json) records the
source and output digests for the builds. The native HTTP reports,
[Deno](m4-deno-http.json) and [Bun](m4-bun-http.json), identify the adapter
bytes they executed. Previous milestone evidence remains unchanged.

The session used Linux x86_64, Node `v22.22.2`, npm `9.2.0`, Deno `2.5.4`
and Bun `1.4.2`. Runtime reports include the Deno V8 version and Bun revision.
These are tested versions on this host, not minimum runtime requirements.
The edge lockfile and installed build dependencies were unchanged. The default
shell Node was `v20.19.2`; commands selected the existing ignored Node install:

```sh
export PATH="$PWD/edge/.cache/runtime/node_modules/.bin:$PATH"
```

Deno was installed into the ignored tool cache, without changing the edge
toolchain lockfile or root installation:

```sh
npm install --prefix edge/.cache/deno-tool --cache "$PWD/edge/.cache/npm" \
  --no-audit --no-fund --save-exact deno@2.5.4
```

Bun was already available at `/usr/local/bin/bun`. All commands below ran
from the repository root.

| Command | Observed outcome |
| --- | --- |
| `npm --prefix edge run typecheck` | Passed without emitted files. |
| `npm --prefix edge run build` | Passed for all targets, including the Deno and Bun HTTP entries. |
| `npm --prefix edge test` | Passed; TAP totals below. |
| `npm --prefix edge run smoke:node` | Passed Node repeatability and the bounded transit scan. |
| `npm --prefix edge run check:isolation` | Passed project file/documentation limits and exclusion from the root dry-run packing list. |
| `node edge/scripts/build-report.mjs > edge/docs/evidence/m4-build.json` | Produced compact build measurements. |
| `node edge/scripts/check-http-runtime.mjs deno "$PWD/edge/.cache/deno-tool/node_modules/.bin/deno" > edge/docs/evidence/m4-deno-http.json` | Passed import and native HTTP checks, including child-process shutdown. |
| `node edge/scripts/check-http-runtime.mjs bun /usr/local/bin/bun > edge/docs/evidence/m4-bun-http.json` | Passed import and native HTTP checks, including child-process shutdown. |
| `node edge/scripts/check-http-runtime.mjs deno "$PWD/edge/.cache/missing-deno"` | Failed as expected with ENOENT, exit status 1 and no success report. |
| `npm_config_cache="$PWD/edge/.cache/npm" npm run package:contents` | Failed with `packed package is missing dist/calc.d.ts`; root build output is absent. |
| `git diff --check` | Passed. |

TAP totals from the full edge test command:

```text
1..51
# tests 51
# suites 0
# pass 51
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

## What was checked

`tests/http.check.mjs` now exercises the production Worker, Deno and Bun
adapters in Node. Each returns full synthetic chart JSON equal to a separate
Node source build for the workload corpus, date-only and offset forms, time
scales, unknown time and every house system at the synthetic northern
location. Fetch is mocked to throw during these calculations. Routing,
validation, engine refusals, stream failures, aborted requests, cancellation
and the body deadline are exercised through each adapter. The existing
injected-calculator checks still cover failures and input boundaries in the
shared handler. No changes were made to that handler or the engine.

`tests/runtime-http.check.mjs` verifies the new bundles have only the named
handler export, no unresolved imports, and no startup or outbound Fetch
activity when imported in Node with absent or throwing runtime globals.
`tests/bundles.check.mjs` verifies each target includes only its own adapter,
the browser excludes HTTP sources, repeated builds are byte-identical, and
the manifest and licence notices remain intact. Node's mock timer API emits
an experimental warning during the deadline tests.

`scripts/check-http-runtime.mjs` executes the built entry in the selected
native runtime. Its import probe must exit without starting a listener; the
Deno probe has no network permission. Before sending any HTTP request, the
runner requires a startup marker from its own child. Requests use loopback
only and do not follow redirects. Each report lists the cases actually run:
synthetic charts with whole and Placidus houses, unknown time, polar fallback,
date syntax and time scales, valid chunked input, routing, HEAD, headers,
invalid input and engine refusals, and byte limits with declared-length and
chunked requests. It checks chart structure and finite numerical fields,
without using numerical results from Node as expected values.

The runner bounds runtime output, response size and waiting time, reports a
missing or failed runtime as a failure, and cleans up its children. The npm
Deno command uses a wrapper process. Initial testing exposed an orphaned
native process during wrapper-only termination; POSIX process-group cleanup
now stops both, and the final reports were generated with that fix. Timeout,
interruption and unexpected shutdown failures cannot produce a success report.
Cleanup was tested on this Linux host; Windows process-tree cleanup was not
tested.

A separate manual failure check held a Node HTTP listener on the example
address, then ran each native checker. Both failed before sending requests
to that listener and emitted no success report. This checks that an existing
service cannot mask a failed server startup.

## Scope and remaining checks

These are HTTP compatibility checks on synthetic inputs. Ordinary HTTP JSON
does not preserve signed zero or Date objects, and the native tests do not
compare numerical outputs across runtimes. Exact comparison and the full
runtime workload matrix remain in M5 through M7. Workers and real browser
execution, performance measurements and WASM evaluation remain untested.
No astronomical accuracy comparison was made.

All edits, downloaded tools and generated output stayed under `edge/`.
Raw bundles and caches remain ignored; only compact evidence is carried.
Root source, packed files, dependencies, build output and release archives
were unchanged. No archive was packed. Root CI and archive rebuild gates
were not run, and the passing isolation check does not replace the root
package-content gate. Root `dist/` remains absent as required by this task.
