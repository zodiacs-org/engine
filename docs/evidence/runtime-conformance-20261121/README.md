# Runtime conformance, 21 November 2026

The conformance suite `0.3.0` ran against `@zodiacs/engine` `2.0.0-rc.6` on
Linux x64 in GitHub Actions workflow run
[44881492972](https://github.com/zodiacs-org/engine/actions/runs/44881492972)
from commit `b25c55cb0543f8dfbc1818b4287665efd1321b67` (whose `dist/` is
byte-identical to the `2.0.0-rc.6` source commit `1a2e176b1daf2f4d5100877f0e855c248ab25a76`,
as `1a2e176` changed only `README.md`, `CHANGELOG.md` and
`scripts/verify-package-contents.mjs`). The root and core entries each have
their own Node reference.

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
leap-second instant in L3 and the 30 station and 40 lunation cases in L4.
[Root matrix](matrix.json) · [Core matrix](core/matrix.json)

## Reproduce

Run from the repository root with Node `22.22.2` on Linux x64 (`.github/workflows/runtime-conformance.yml`):

```sh
npm ci
npm run build
(cd tools/runtime-conformance && npm ci && npx playwright install --with-deps chromium firefox webkit)
node tools/runtime-conformance/run-all.mjs --out docs/evidence/runtime-conformance-20261121
```
