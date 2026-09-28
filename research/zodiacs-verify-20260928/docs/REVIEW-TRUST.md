# Independent trust and integration review

Reviewed 2026-09-28 by a separate AI reviewer agent. This is a scoped code review and executable adversarial check, not a human audit, security certification, astronomical accuracy assessment, or validation of astrology.

**Verdict:** no remaining blocker found for the documented local, operator-controlled preview. Public hosting, authentication, signatures and hostile multi-tenant execution are outside this verdict. The caller must own the trust decisions described below.

## What was examined

The review covered `CONTRACT.md`, core receipt validation and sealing, comparison, the rc.10 engine adapter, uncertainty model binding, claims, the CLI, and the interpretation registry. The independent tests are in `tests/reviewer-trust.test.mjs`; they use synthetic facts for trust tests and the frozen engine installation only for byte qualification and integration checks.

The initial complete suite passed **96 tests, zero failures and zero skips** with the frozen rc.10 installation available. The final tool-session addition is reviewed below. The independent trust suite contributes **12 tests**, including:

- Altered subject, observation instant, clock convention, artifact declaration and fact values lose the original receipt seal. Resealing produces a different ID and does not inherit trust in the original content.
- A provider-looking name or valid digest does not automatically create trust. Fact equality preserves JSON types, and malformed or additional claim assertions are rejected.
- Bounded reports bind assumptions to the declared model, including observer and pinned Delta-T when supplied by the CLI. Changing report content requires renewed report trust even if a bound label is unchanged.
- Comparison refuses mismatched observation inputs and clock conventions. A misspelled comparison threshold or CLI envelope field is rejected.
- Interpretation checks expose their provenance-only scope even when text contains false factual prose or instructions to approve it. The checker does not execute the prose or claim to establish its meaning.
- The CLI rejects malformed JSON and invalid options, returns an error status without a success document, and preserves an existing output file.
- An internal executable symlink in a temporary engine copy is refused before import. The full suite also tests distribution and dependency byte tampering, unsupported versions and unexpected executable files.
- A real CLI uncertainty run records observer settings and pinned Delta-T in its sealed model. Without external bounds it remains sampled and unresolved.

The numerical reviewer separately examined floating-point enclosures, hidden excursions, tangencies, disjoint intervals, budget accounting and contradictory bounds; see `REVIEW-NUMERICS.md`.

## Defect found and resolved

Comparison options originally ignored unknown keys. A request for a zero-arcsecond threshold with a misspelled key could silently use the one-arcsecond default and report agreement. The implementation owner added validation of the options object and allowed keys, and of the CLI comparison envelope. Independent regression controls now pass for these cases.

## Required trust boundary

1. **The operator supplies trust.** Do not let an untrusted client submit the effective `trustedReceiptIds`, `trustedReportIds`, `trustedBoundIds` or `trustedRuleIds`. The CLI deliberately accepts an operator-authored file containing these lists; it is not an authorization service. A user can reseal fabricated data and explicitly trust it themselves. The library does not prevent that policy decision.
2. **Rule labels are not content identities.** `trustedRuleIds` does not detect replacing a rule's statement under the same ID. An independent test demonstrates this boundary. Load the exact reviewed registry from operator-controlled storage and pin its bytes or digest outside the checker. Never merge arbitrary user-supplied rule bodies into that registry by trusted ID. The registry documentation states this limitation.
3. **Model binding is a declaration, not measurement.** The CLI binds its observer and clock settings before sampling. Direct `analyzeUncertainty` callers must include all settings affecting their callback in the model and ensure the callback actually implements them. No generic callback validator can authenticate that assertion. Supplied bounds remain externally justified assumptions, even after consistency checks pass.
4. **Content hashes are not signatures.** A chart/report seal identifies content. It authenticates neither the provider nor the source of a birth record. The adapter qualifies installed executable bytes before importing the known version; it does not prove source ancestry or physical accuracy.
5. **Keep the runtime trusted.** This preview is not a sandbox against a hostile process, custom module loader, concurrent filesystem mutation, or mutation of shared dependency state after loading. The CLI's request-size limit and the uncertainty work limits are useful local guards, not a general denial-of-service defense for a public API.
6. **Display the right meaning of support.** Do not present an interpretation's `supported` result as “verified true.” It means reviewed-rule provenance and supported same-subject dependencies. It does not check prose entailment, scientific truth, predictions or hidden factual assertions. Instant facts are tied to the specified instant; a reference instant does not become a known birth time. Finite comparison agreement does not establish engine-wide accuracy or Swiss Ephemeris parity.

## Reproduction

From the package directory, using Node 20 or later:

```sh
ZODIACS_ENGINE_PATH=/absolute/qualified/package/dist/index.js node --test tests/reviewer-trust.test.mjs
ZODIACS_ENGINE_PATH=/absolute/qualified/package/dist/index.js node --test tests/*.test.mjs
```

For this review, the installed entry was `/workspace/scratch/c1943cbff40d/parallel-runtime/package/dist/index.js`. Temporary tamper fixtures were deleted after testing; the original engine and production code were not modified. A missing installation skips the real-engine controls, so zero skipped tests is required to reproduce the full result above.

## Final tool-session review — 2026-09-28

The reviewer additionally read `src/tools.mjs`, its seven tests, the final contract and README, and `reports/VALIDATION.json`. All seven tool-session tests were independently rerun and passed. The final integration record reports **103 tests passed, zero failures and zero skips**, plus an actual rc.10 session smoke check showing that a computed fact is usable and cleared evidence is refused. That smoke check was recorded by the implementation owner; it is not an independent astronomical comparison.

No critical trust or lifecycle mismatch was found. The session snapshots and freezes the operator's registry, binds the operator's adapter methods, keeps validated evidence privately, and returns detached copies. Tool requests cannot supply replacement evidence, trust lists, rules, models or bounds. Only retained receipts/reports and the captured operator registry enter the claim checker. The combined FIFO limit applies to both evidence types, and a generation check prevents operations started before `clear()` from retaining results afterward. Session uncertainty binds observer and clock declarations and supplies no conservative bounds, so it cannot promote sampled agreement to stable interval support.

The local-preview verdict remains unchanged. The host must provide a trustworthy adapter and a separate session per authorization context. `clear()` invalidates retention; it is not a promise to cancel an already running adapter computation or securely erase returned copies. The FIFO limits entry count, not total bytes, and these protocol-neutral tool descriptions supply neither transport nor authentication. These limits are consistent with the final contract and README; host-enforced computation and memory limits remain necessary before remote exposure.
