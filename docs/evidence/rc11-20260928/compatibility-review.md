# rc.11 compatibility review against frozen rc.10

The corrected, matched-operation comparison passes **571 of 571 checks**, with no numeric tolerance. It compares the packed rc.11 artifact with a supplied frozen rc.10 package under the same Node runtime and identical pinned dependencies. This is finite evidence of preserved legacy behaviour, not an exhaustive compatibility proof or an independent astronomical accuracy benchmark.

## Artifacts and environment

- Candidate: `artifacts/zodiacs-engine-0.1.1-rc.11.tgz`
- Candidate SHA-256: `13d637db21e3e444c783fd85832e4f61dfdb4b7777b2c84038ec887b47029c4e`
- Baseline: frozen `0.1.1-rc.10` package from the prior parallel runtime.
- Baseline copied-file inventory SHA-256: `0aa82ab81d97966a7a07c39dcf2e2264a8f868906c205e566870510d937a350e`
- Runtime: Node `v24.19.0`, Linux x64.
- Executed: `2026-09-28T07:55:58.107Z`–`2026-09-28T07:55:59.904Z`.
- Dependency: the exact pinned Astronomy Engine `2.1.19`, copied from the frozen baseline into separate trees. The dependency file inventories must match before execution. No network or package installation occurs.
- Each version executes in its own child process. Neither can change the other's Astronomy Engine DeltaT callback or module state.

`compatibility.json` records the full file inventories, fixture inputs, operation trace, comparisons, checksums and the longitude mutation negative control. Version strings alone do not establish artifact authenticity or source ancestry.

## Denominators

The final run has 91 successful chart-and-receipt scenarios, 11 rejected-input scenarios, and 7 other legacy API/edge scenarios. The chart scenarios include all thirteen house systems at five configurations (equatorial, northern and southern temperate, and northern and southern polar), historical dates, both sides of the reference-span boundaries, unknown-time and missing-location cases, declared time flags, canonical flag echoes, UTC/date input forms and pinned DeltaT.

These are scenario counts, not 91 independent accuracy reference observations: house-system scenarios deliberately reuse their dates and locations.

| Check category | Passing checks |
|---|---:|
| Exact chart, chart-point, receipt and default-position comparisons | 91/91 |
| Baseline and candidate self-replay calculation comparisons | 182/182 |
| Candidate parsing frozen rc.10 receipts | 91/91 |
| Candidate replaying frozen rc.10 receipts under matched operation history | 91/91 |
| Recovered rc.10 replay requests | 91/91 |
| House-system lists, ephemeris identity, operation order and legacy export preservation | 6/6 |
| Rejected-input behaviour | 11/11 |
| Legacy positions/Moon phase, transits, synastry and exact-pole edge behaviour | 7/7 |
| Malformed-receipt rejection set | 1/1 |
| **Total** | **571/571** |

The negative control is separate from that denominator. Increasing one copied Sun longitude by `0.000001` degrees produced a detected mismatch at `$.chart.bodies[0].lon`. It changed neither engine nor artifact.

The workers executed **1,124 public API calls each** in the same recorded order. Their operation traces have the identical SHA-256 `ba7af3a170d8e53753dc79dfd6ac59276647f0de4fea25cb3befb0d6365af2d9`. Fixture inputs and replay-request comparisons establish the corresponding input agreement; recorded engine-version metadata differs intentionally.

## Initial failures and harness corrections

The initial report is preserved unchanged as `compatibility-initial-harness.json`. It reported 567/570 passing checks. All 91 direct chart-and-receipt comparisons already matched. Its three failures had two different causes:

1. **Different operation history during receipt replay.** The initial harness compared the candidate's late replay of rc.10 receipts with the baseline's early self-replay. At exactly 1800-01-01 and 2200-01-01, this exposed very small Sun longitude/latitude differences and derived degree/orb differences. The corrected harness runs the same late rc.10 replay sequence in both workers, after the same preceding calls. Both versions then match exactly.
2. **Wrong rejection expectation at the geographic pole.** The initial invalid-input list assumed `natalChart` would reject `{utc:"2000-01-01",latitude:90,longitude:0}`. Both versions actually return a chart with angles and whole-sign houses; the receipt creator then refuses that chart with `unsupported_feature`. The same input is retained as an API/receipt edge comparison. Its angles are not thereby certified as mathematically valid at the pole.

The correction moved one case from the rejected-input category (12 → 11) into the legacy API/edge category (6 → 7). It added one explicit operation-trace equality check, changing the total from 570 to 571. No original date, coordinate, house system, DeltaT pin or numeric field was removed or relaxed. There is still zero numeric tolerance. The invalid-pole assertion was replaced with comparison of the actual observed API and receipt behaviour.

## Existing sensitivity to call history

The final report separately retains earlier-versus-later replay diagnostics **within each artifact**. Both rc.10 and rc.11 reproduce the same two differing cases and the same differences. The largest recorded longitude change is approximately `4.55e-13` degrees at 2200-01-01.

This establishes an existing sensitivity to evaluation history in the engine/dependency stack for these cases. This review has not isolated the internal cache or mathematical operation responsible. It is not a new rc.11 regression, and the final pass must not be described as bit-identical output under every possible call history. The supported conclusion is exact agreement between the two versions under the matched operation stream used here.

## Comparison rules and limits

Only known engine version metadata paths are normalized. The full list is in `compatibility.json`. Numeric values, Date versus string types, undefined fields, negative zero, array ordering, flag ordering, requested and effective house systems, DeltaT values/source metadata, and receipt conventions remain part of the comparison. Fourteen added public exports are listed; no baseline public export is missing. Adding an export does not itself validate that new feature.

This review does not establish Swiss Ephemeris equivalence, broad-date numerical accuracy, every geographic edge case, all host runtimes, or correctness of the new optional APIs. It does not exercise the complete transit/return-search surface. Use the dedicated numerical and feature tests for those questions.

Reproduce from the engine checkout with absolute artifact and baseline paths:

```bash
node scripts/verify-rc10-compatibility.mjs \
  --candidate /workspace/scratch/c1943cbff40d/opus-continuation/engine/artifacts/zodiacs-engine-0.1.1-rc.11.tgz \
  --baseline /workspace/scratch/c1943cbff40d/parallel-runtime/package/dist/index.js \
  --output /workspace/scratch/c1943cbff40d/opus-continuation/engine/docs/evidence/rc11-20260928/compatibility.json
```
