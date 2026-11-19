# Runtime conformance, 19 November 2026

The conformance suite `0.3.0` ran against `@zodiacs/engine` `2.0.0-rc.3`,
built from `origin/main` at `47eebb8` with this runner change. The root
and core entries each have their own Node reference.
[Engine source](https://github.com/zodiacs-org/engine/commit/47eebb83516ad99152dfefb69feff2aea93264b3)

## Verdict agreement with Node

Run counts include unsupported responses. Agreeing counts matching
verdicts for supported vectors, including matching failures against
an arbiter. The disagreeing column lists all differing verdicts by
vector ID when there are any. Output identity compares the serialized output
values for the supported vectors against Node on the same entry. Receipt
agreement requires every synthetic receipt digest to match Node's for that
entry. Arbiter pass counts vectors whose results meet their arbiters'
expected values within the stated tolerances.

| Entry | Runtime | Version | Run | Agreeing | Disagreeing | Unsupported | Outputs identical to Node | Receipts same as Node | Arbiter pass |
| --- | --- | --- | ---: | ---: | --- | ---: | ---: | --- | ---: |
| root | Node | 22.22.2 | 640 | 569 | 0 | 71 | 569 of 569 | Yes | 569 |
| root | Bun | 1.4.4 | 640 | 569 | 0 | 71 | 458 of 569 | No | 569 |
| root | Deno | 2.9.6 | 640 | 569 | 0 | 71 | 458 of 569 | No | 569 |
| root | Chromium | 156.0.8078.4 | 640 | 569 | 0 | 71 | 458 of 569 | No | 569 |
| root | Firefox | 157.0 | 640 | 569 | 0 | 71 | 569 of 569 | Yes | 569 |
| root | WebKit | 27.2 | 640 | 569 | 0 | 71 | 458 of 569 | No | 569 |
| core | Node | 22.22.2 | 640 | 569 | 0 | 71 | 569 of 569 | Yes | 377 |
| core | Bun | 1.4.4 | 640 | 569 | 0 | 71 | 468 of 569 | No | 377 |
| core | Deno | 2.9.6 | 640 | 569 | 0 | 71 | 485 of 569 | No | 377 |
| core | Chromium | 156.0.8078.4 | 640 | 569 | 0 | 71 | 485 of 569 | No | 377 |
| core | Firefox | 157.0 | 640 | 569 | 0 | 71 | 540 of 569 | No | 377 |
| core | WebKit | 27.2 | 640 | 569 | 0 | 71 | 468 of 569 | No | 377 |

The root Node verdicts match the committed root results. Core passes 48 of
240 L1 position vectors against the arbiter. Each runtime matches Node on
all 192 core L1 failures. Both entries use the shared `/geo` and `/calc`
functions as specified by the adapter. The unsupported results are the
leap-second instant in L3 and the station and lunation cases in L4.
[Root matrix](matrix.json) · [Core matrix](core/matrix.json)

## Reproduce

Run from the repository root with Node `22.22.2` on Linux x64.

```sh
npm ci
npm run build
(cd tools/runtime-conformance && npm ci && npx playwright install --with-deps chromium firefox webkit)
node tools/runtime-conformance/run-all.mjs --out docs/evidence/runtime-conformance-20261119
```

This run used Playwright's pinned browser builds. Firefox used a writable
XDG config directory and `MOZ_DISABLE_CONTENT_SANDBOX=1` to start content
processes in the cloud workspace. WebKit's Debian libraries were installed
in a temporary directory, so the run skipped Playwright's system library
check. Each runtime directory contains the harness results, the raw adapter
responses, and the summary with verdict, numerical output and synthetic
receipt digest comparisons.
