# Independent design and adversarial review

Reviewed on 28 September 2026 by a separate AI reviewer agent. This is a scoped implementation review and executable software check, not a human astronomical audit, security certification, release approval, or validation of astrology.

**Verdict:** no outstanding blocker found for the documented workflow using trusted local installations and the supported comparison profile. The runner produces review evidence and deliberately cannot qualify a Verify adapter or authorize a release.

## Independently executed checks

The reviewer ran the complete final suite on Node 24.19.0 with the actual frozen rc.10 installation configured: **47 tests passed, zero failures and zero skips**. This includes 18 independently authored reviewer controls, 14 worker controls, nine reference controls and six runner/integration controls.

The full run exercised the real baseline self-comparison, a temporary deliberately degraded copy, post-plan byte changes, CLI inspection/planning without target execution, and run-manifest verification. Temporary fixtures were removed after the tests. The original engine installation and preceding research packages were not edited.

| Controlled situation | Reviewed result |
| --- | --- |
| rc.10 compared with itself | Complete 210-row coverage; behavioral and nonregression checks pass; the one-arcsecond coordinate target fails on 168 rows; exit 2 and review remains required. |
| One degree deliberately added to every Sun longitude in a temporary copy | All 21 Sun cases fail per-case nonregression; exit 2. This is a synthetic negative control, not a new engine build. |
| Same-version candidate bytes changed after planning | Blocked at artifact preflight before target execution; exit 1. |
| Identical synthetic results five arcseconds from reference | Nonregression passes while the separate residual target fails. Equality with the baseline cannot imply sufficient accuracy. |
| Broad synthetic improvement with one larger regression | The per-case regression fails despite improved aggregate statistics. |
| Missing, duplicate, unknown, errored, nonfinite or timed-out results | No complete execution/target claim; all 210 expected rows remain represented. |
| Perfect synthetic results with every check passing | `adapterReviewRequired` remains true; `adapterQualified` and `releaseAuthorized` remain false. |

The implementation owner's saved `reports/validation-20260928/VALIDATION.json` and reports agree with these outcomes. Its repeated self-comparison has the same numerical digest in both runs; that digest is separate from variable execution timings and run timestamps. The reviewer inspected this recorded repetition in addition to independently executing the full test suite.

## Trust and integrity flow

Inspection inventories files and recursively resolves declared installed runtime, optional and peer dependencies without importing target code. The reviewer tested relocation, nested packages with different versions of the same dependency, changed non-executable dependency data, missing optional/peer/runtime packages, ancestor resolution outside the installation, and symlinks. The all-file identity is intentionally conservative and supports a standalone installation layout only.

Planning binds the exact artifact identities, operator declaration, selected reference, frozen policy, behavioral probes and harness files. Running requires an explicitly supplied expected hash of the plan bytes. Before evaluation, the runner reconstructs the consumed JPL rows from pinned raw responses and independently retained ERFA matrices, checks the reference identity, and re-inventories both targets. It checks target, harness and reference identities again after execution. The declaration selects a supported comparison profile; it does not authenticate the implementation's claimed equivalence to JPL.

Target imports occur in separate processes. The parent checks protocol framing, exact coverage and observation metadata, and retains explicit errors for missing results. Abnormal termination, excess output and timeouts prevent a complete-execution pass. The evaluator independently binds rows to their requested body, epoch and clock pin, requires complete timing coverage, and separates numerical, behavioral, API and resource checks. No command changes the production Verify inventory or engine release configuration.

## Findings resolved during review

| Initial gap | Final behavior and regression control |
| --- | --- |
| Canonical serialization allowed a sparse-array identity collision and invoked getters. | Non-JSON structural ambiguities and accessors are rejected before hashing; the independent control verifies that an accessor is not invoked. |
| A valid case ID could conceal changed body, epoch or Delta-T metadata in the evaluator. | All three fields must match the expected observation; substituted metadata makes the row invalid. |
| A one-observation timing summary could satisfy the runtime gate for a 21-epoch run. | The timing count must equal the number of unique requested epoch/pin combinations. |
| Output containment compared canonical output paths with noncanonical forbidden-root aliases. | Forbidden installation roots are resolved before containment checks; a temporary symlink-alias negative control passes. |
| Export-name presence alone did not establish that a required API remained a function. | Required function types are checked separately; retaining `houseOf` as a name without a function fails compatibility. |

The final policy wording correctly distinguishes a V8 old-space limit from a total-memory limit. A run attempted during that wording update was blocked by the expected protocol/hash mismatch; the final independently rerun suite passed after source and policy pins were stable. No numerical threshold was relaxed to make a result pass.

## Limits that remain material

- These are the earlier 21 public regression epochs, not newly acquired or blind holdout data. The reference-residual thresholds are research defaults, not production release gates or certified error bounds.
- The reference uses synthetic UT1 labels with a fixed 69-second pin. Moon geometry, planetary apparent corrections, axes, orientation and outer-planet center conventions retain the documented distinctions. A nonzero residual cannot be assigned uniquely to one provider approximation.
- The twelve behavioral probes and export checks are finite contract coverage. They do not establish compatibility of every event solver, node, house system, API edge or prospective Verify adapter.
- Only trusted local candidate code is supported. Process limits are not an OS sandbox; old-space does not cap native memory or total RSS. Filesystem/network side effects, malicious protocol forgery, dynamic external imports and transient mutations are outside the authenticated boundary. Before/after hashes detect persistent content changes, not every possible action during execution.
- SHA-256 identities are unsigned integrity commitments. The local plan timestamp is not independently authenticated preregistration, publisher identity or source ancestry. A reviewer must inspect the source declarations and preserve the expected plan digest independently.
- One host's Node timings and installed regular-file bytes do not measure browser performance, compressed download size or a reproducible performance guarantee. Evaluation order and host conditions can affect timing; numerical identities intentionally exclude those measurements.
- No new astronomical provider improvement, Swiss parity, uncertainty bound, historical applicability or predictive astrology result was established by this software validation. A future candidate still needs independent adapter review, broader coverage and a separate release decision.

## Reproduce

Keep the sibling accuracy-audit reference directory intact. From this package directory:

```sh
ZODIACS_ENGINE_PATH=/absolute/frozen/package/dist/index.js node --test tests/*.node-test.mjs
```

The review used `/workspace/scratch/c1943cbff40d/parallel-runtime/package/dist/index.js`. A missing engine variable skips the real integration controls; that does not reproduce the complete result above. Require zero skips. Use the README's recording command and a fresh output directory to retain another complete report set. The `.node-test.mjs` names intentionally keep these standalone suites outside the engine root's Vitest discovery.
