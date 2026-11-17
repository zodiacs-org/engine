# Runtime conformance, 17 November 2026

The conformance suite 0.2.0 (500 vectors: L1 240, L2 150, L3 110) run through
`@zodiacs/engine` 2.0.0-rc.2 (origin/main 373ceda plus this change, which
touches no packed file) in Node, Bun and Deno, with
`tools/runtime-conformance/run-all.mjs`. Every verdict is the harness's, judged
against the vectors' own arbiters (JPL Horizons DE441 for L1, ERFA and the
house definitions for L2, tzdb, IERS and exact calendar arithmetic for L3)
with the suite's tolerances (1 arcsecond; 0.1 s; exact). Node's values are
used only to measure the spread; they are not the pass mark.

Command, from the repository root, on Linux x64 (kernel 6.18), Node 22.22.2:

```sh
npm ci && npm run build
(cd tools/runtime-conformance && npm ci)
node tools/runtime-conformance/run-all.mjs --out docs/evidence/runtime-conformance-20261117 --runtimes node,bun,deno
```

Each folder holds `results.json` (the harness's results file;
`adapter.runtime` names the runtime and its version), `responses.jsonl`
(every line the adapter wrote, so values can be compared exactly) and
`summary.json`; `matrix.json` collects the three.

## Results

| Runtime | Version | JS engine | Intl tzdb | L1 pass | L2 pass | L3 pass / unsupported | Verdicts that differ from Node | Outputs bit-identical to Node | Receipt digests equal to Node's |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Node | 22.22.2 | V8 | 2025c | 240 of 240 | 150 of 150 | 69 / 41 | (reference) | 459 of 459 | 5 of 5 |
| Bun | 1.4.4 | JavaScriptCore | not exposed | 240 of 240 | 150 of 150 | 69 / 41 | 0 | 348 of 459 | 0 of 5 |
| Deno | 2.9.6 | V8 15.0 | 2026b | 240 of 240 | 150 of 150 | 69 / 41 | 0 | 348 of 459 | 0 of 5 |

Node's verdicts equal `conformance/results/zodiacs-engine.json`. No verdict
differs from Node's, so nothing is classed "host data". The 41 unsupported
vectors are the same in each runtime, the leap-second instant among them.
Bun and Deno loaded `astronomy-engine` and the shipped DE440 pack without
error.

Largest absolute difference from Node's value, Bun and Deno alike (the same
values in both):

| Kind | Field | Largest difference | Values bit-identical to Node's |
| --- | --- | --- | --- |
| position.apparent.ecliptic-true-of-date | lon | 2.05e-10 arcsec (5.7e-14 degrees) | 215 of 240 |
| position.apparent.ecliptic-true-of-date | lat | 2.32e-11 arcsec | 168 of 240 |
| angles.asc-mc | asc | 2.05e-10 arcsec | 59 of 60 |
| angles.asc-mc | mc | 2.05e-10 arcsec | 54 of 60 |
| angles.vertex-east-point | vertex | 0 | 10 of 10 |
| angles.vertex-east-point | east_point | 2.05e-10 arcsec | 9 of 10 |
| houses.cusps | cusps | 4.09e-10 arcsec (largest cusp) | 52 of 70 |
| time.zone-offset | status, offsets | exact fields | 86 of 86 |
| time.tt-minus-utc | tt_minus_utc_s | 0 s | 9 of 9 |
| time.delta-t | delta_t_s | 0 s | 15 of 15 |

5.7e-14 degrees is one unit in the last place of a double between 256 and
512 degrees. The five receipts (`createNatalEnvelope`, then
`serializeNatalEnvelope`, for the synthetic births in
`tools/runtime-conformance/receipt-cases.mjs`) differ from Node's in Bun and
Deno because positions, speeds and aspect orbs differ in their last digits
(for example R1's Sun speed, 0.9807525080258728 in Node and
0.9807525080294255 in Bun and Deno, degrees per day); Bun's and Deno's
digests are equal to each other.

## Browsers

Chromium, Firefox and WebKit ran in the workflow
(`.github/workflows/runtime-conformance.yml`), not in this workspace, where
Playwright's browser downloads are refused. Their results files and
summaries are in the artifact `runtime-conformance` of the workflow's runs on
pull request 122; they are not committed here, because downloading the
artifact from this workspace was refused (its storage host is not reachable
from here). The workflow's gate, which passed, requires each browser's
verdicts to equal Node's for every vector that does not read the host's zone
data.

## What "to the bit" can and cannot claim

The README's statements that positions equal earlier builds "to the bit"
were measured on V8 in Node, and hold there: Node reproduces its committed
values exactly. They do not carry over to other runtimes. In Bun 1.4.4 and
Deno 2.9.6 about a quarter of the numeric outputs differ from Node's in their
last bits (at most 4.1e-10 arcsec here), because the ECMAScript specification
leaves `Math.sin`, `cos`, `tan`, `atan2`, `exp` and `pow`
implementation-approximated. What holds across the runtimes measured is the
suite's verdicts: the same 459 vectors pass against the outside arbiters, at
1 arcsecond, 0.1 s and exactly. A receipt computed in one runtime is not
expected to have the same digest when recomputed in another.

Rerun after ZOD-283, which adds behaviour that depends on the host's zone
data.
