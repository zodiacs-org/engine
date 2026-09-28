# Independent numerical and trust review

This review covers the local Verify preview's core serialization, angle comparisons, conditional uncertainty classification, report validation, and explicit claim trust. It does not assess astronomical precision or the truth of an external bound. All sampled functions in the independent tests are analytic synthetic examples and are labelled accordingly.

## Executed result

```sh
node --test tests/reviewer-numerics.test.mjs
```

**17 independent tests passed** after the owners fixed the issues below. The first run of the final uncertainty review found one failure in 17 tests; the corrected run passed all 17. Earlier read-only probes found two core defects before this independent suite was created. The reviewer changed only this document and `tests/reviewer-numerics.test.mjs`; module fixes were made by their owners.

## Findings fixed during review

| Finding | Concrete reproduction | Resolution checked |
|---|---|---|
| Positive longitude normalization crossed sign boundaries | `29.999999999999996` became `30`; `359.99999999999994` became `0` | Avoid the unnecessary addition of 360 for a nonnegative remainder. Independent tests check the immediately preceding representable float at every sign cusp. |
| Array serialization invoked caller-controlled methods | A nonenumerable `map` override or an array subclass substituted serialized content and executed its callback | Reject nonstandard/decorated arrays and visit numeric elements directly. Tests verify that callbacks are never invoked. |
| Adjacent sample comparisons missed a contradicted error bound | Observed longitudes `10, 11.5, 13` at `0, 5, 10` seconds, with asserted rate `0` and position error `1`, passed adjacent checks. No single constant longitude can be within one degree of both endpoints. The report incorrectly claimed stable/full coverage. | Check nonadjacent pairs too, under an explicit comparison budget; a detected contradiction invalidates dependent coverage. Budget exhaustion leaves affected bounds unchecked and dependent results unresolved. The independent regression also checks that removing the contradiction ledger and resealing fails validation, and explicit trust cannot make the contradicted interval claim supported. |

The capped pairwise check is a practical consistency screen. It does not independently establish that a supplied bound is true or prove that all possible error assignments are globally feasible. Stable conclusions remain conditional on the caller's declared assumptions.

## Adversarial coverage

- Circular longitude wrap, every immediately preceding sign-cusp float, typed fact semantics, missing facts, invalid thresholds, and differences in declared conventions.
- Poison JSON keys and decorated/subclass arrays, with content preserved and no prototype mutation or callback execution.
- A narrow sign excursion and a sign tangency hidden between identical sampled signs.
- A zero-orb aspect contact hidden between false sampled memberships.
- A positive evaluation-error allowance across a cusp; huge rate bounds and overflowing enclosures.
- Incompatible nonadjacent samples, mismatched bound model/domain, missing bodies, multiple features, failed callbacks, shared call budgets and disjoint interval components.
- Resealed forged stability, deleted component coverage, changed cell conclusions, enlarged errors, samples placed in excluded gaps, and erased contradiction evidence.
- Separate report and bound trust requirements; even explicitly trusting a resealed invalid report does not bypass evidence validation.

## Interpretation and remaining limits

A passing receipt seal establishes content integrity only. It does not authenticate a publisher, verify the engine's installed source ancestry, or establish astronomical correctness. The comparison checks declared conventions; it does not perform an implicit frame or timescale conversion. Matching facts are not a proof of accuracy.

Identical samples without an external conservative bound remain unresolved. A variable result reports differing sampled values; it does not enumerate every possible value or locate every transition. Stable results require full conditional coverage and trusted contributing bounds. Observed engine speeds do not become conservative derivative bounds.

The report validator recomputes the relevant arithmetic and coverage from the recorded evidence; the reviewer verified representative tampering attempts. This is finite software testing, not a formal proof, a hostile-process sandbox, a complete security audit, or a claim that external bounds are independently certified. The adapter's operating assumption remains a trusted local runtime. Production astronomical uncertainty bounds are not provided by this preview.
