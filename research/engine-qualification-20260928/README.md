# Engine candidate qualification — research runner

Compare a new trusted local engine installation with the frozen rc.10 baseline, using the existing independently reconstructed JPL regression references. The runner records artifact identity, API and behavioral differences, all-case position residuals, per-coordinate regressions, Node timings, and installed size. It emits JSON and Markdown evidence for a subsequent adapter review.

**This does not qualify an adapter automatically.** Every result has `adapterQualified: false`, `adapterReviewRequired: true`, and `releaseAuthorized: false`. No engine source, Verify inventory, root package, workflow, release gate or production integration is changed.

The retained 210 rows cover 10 bodies at 21 already examined epochs. They are known regression data, **not a new blind holdout**. The one-arcsecond residual target and the other budgets are explicitly research defaults. Meeting them would not certify a universal error bound, Swiss Ephemeris equivalence, or astrology's predictive validity.

## Requirements

- Node 20 or newer. This private package has no install-time dependencies.
- Keep the sibling `research/accuracy-audit-20260928/` directory from the preceding research handoff. Its 26 consumed reference files are hash-pinned and checked offline; raw JPL CSV is reconstructed before projection through the retained independent ERFA matrices.
- Prepare the exact frozen standalone `@zodiacs/engine 0.1.1-rc.10` installation used in that handoff, including its installed `astronomy-engine 2.1.19` dependency. `data/baseline-artifact.json` records its complete identity. The earlier `accuracy-audit-20260928/bootstrap.py` can prepare that runtime; see its README for the bootstrap command. Inventory mismatches fail instead of being silently adopted.
- Stage the candidate as a separate standalone installed package with `dist/index.js`, `package.json`, and its runtime dependencies beneath the package root. The runner does not install dependencies or build a candidate. It rejects symlinks, missing declared runtime/optional/peer dependencies, and dependencies resolved from outside that root. Some import-only resolution layouts are unsupported and must be adapted and reviewed explicitly.
- Execute trusted local code only. A child process bounds wall time, V8 **old-space** and output bytes. It is not an OS security sandbox, and it does not cap total RSS or prevent hostile filesystem/network access. Pre/post hashes detect lasting changes, not transient or malicious behavior.

## Candidate workflow

Run from this directory. Paths below are placeholders for your isolated installations. Create the parent of each output directory beforehand; each final output directory must be new and outside the engine installations.

1. Inventory the candidate without importing it:

```sh
node src/cli.mjs inspect \
  --engine /absolute/candidate/package/dist/index.js \
  --out /absolute/runs/candidate-inspection
```

2. Review the candidate source and fill `declaration-template.json`. It binds the declaration to the inspected bytes. Every null field must be completed. Record the actual origin, zodiac, frame, clock, correction algorithm, axes, physical centers, rotation model, known differences and review source. `referenceSelection` chooses the comparison reference; it does **not** assert exact equivalence to that reference. The supported profile requires geocentric tropical true-of-date coordinates, the encoded-UT1/pinned-DeltaT benchmark clock, and a geometric Moon. Other profiles need an explicitly reviewed extension rather than a guessed conversion.

`examples/rc10-declaration.json` is only for a self-comparison of the exact frozen baseline. Do not copy its implementation assertions onto a new provider without inspecting it. There is no general-purpose automatic declaration or trust promotion.

3. Freeze the plan before running either target:

```sh
node src/cli.mjs plan \
  --baseline /absolute/baseline/package/dist/index.js \
  --candidate /absolute/candidate/package/dist/index.js \
  --declaration /absolute/runs/candidate-inspection/declaration-template.json \
  --out /absolute/runs/candidate-plan
```

Retain the printed SHA-256 independently. The plan binds the installed files and dependency resolution, declaration, reference dataset, protocol, behavioral probes and harness code. Its local timestamp is not independently authenticated preregistration. Once candidate results have been examined, a different protocol or case set is a new experiment and should be described that way.

4. Run the committed plan with its explicit expected digest:

```sh
node src/cli.mjs run \
  --plan /absolute/runs/candidate-plan/plan.json \
  --expect-sha256 PASTE_THE_PRINTED_64_CHARACTER_SHA256 \
  --out /absolute/runs/candidate-evaluation
```

Outputs include `report.json`, `report.md`, preflight artifact inventories, and `run-manifest.json`. Existing outputs are never overwritten. Reports omit configured installation-path fields, but diagnostics and declarations may contain local paths. The local plan contains the paths needed to execute the selected installations. Review reports and plans before sharing them.

## Meaning of the checks

| Check | Meaning |
| --- | --- |
| Integrity | The explicit plan hash, committed protocol/probes/harness, references and complete installed artifact inventories match before and after execution. Hashes do not authenticate a publisher or prove source ancestry. |
| Execution | All 210 expected rows are present, unique, finite and bound to body, epoch and clock pin. A timeout, missing row or failed child cannot shrink the denominator. |
| API compatibility | Required public exports remain functions where required; existing export names and aspect policy remain compatible; the exported version matches installed metadata. This is not exhaustive API conformance. |
| Behavioral contract | Both targets pass the same 12 frozen checks: invalid-input refusals, unknown-time house suppression, requested located houses, deterministic repeated geometry and pin honor/isolation. |
| Nonregression | No individual longitude or latitude absolute residual worsens by more than 0.1 arcsecond. Broad improvement cannot hide a single larger regression. A valid complete baseline is required. |
| Reference residual target | Every candidate longitude and latitude residual is at most one arcsecond under the stated comparison profile. Correction/frame/center caveats remain. |
| Node runtime budget | All 21 deduplicated epoch/pin calculations were timed. Candidate p95 is at most 100 ms and at most 3 times baseline p95 with a 1 ms denominator floor. These are diagnostic measurements on one host, not a stable performance guarantee. |
| Installed size budget | Candidate regular-file bytes are at most 64 MiB and at most 3 times baseline bytes with a 1 MiB denominator floor. This includes installed dependencies and retained files, not compressed download size. |

Exit `0` means a command succeeded or every diagnostic check passed, with review still required. Exit `1` means malformed input or blocked integrity/orchestration. Exit `2` means the runner completed its evaluation but one or more diagnostic checks failed or could not be evaluated, including a failed/partial worker. The real rc.10 self-comparison correctly returns `2`: no regression, but 168 of 210 known rows exceed the one-arcsecond coordinate target.

The numerical digest excludes run timestamps and performance timing while binding observation epochs, artifact identities, residuals and numerical thresholds. The full report digest includes the run measurements. Timing can vary even when numerical results repeat exactly.

## Validation and limitations

```sh
# Synthetic transport/reference/evaluator controls; real-engine cases skip without the variable.
npm test

# Required full suite, including the actual frozen baseline and adverse candidate copy.
ZODIACS_ENGINE_PATH=/absolute/baseline/package/dist/index.js npm test

# Record the full suite, repeated numerical self-comparison, one-degree Sun
# regression, and post-plan mutation refusal into a fresh directory.
node scripts/record-validation.mjs \
  --engine /absolute/baseline/package/dist/index.js \
  --out /absolute/runs/qualification-validation
```

Standalone suites use `*.node-test.mjs` to avoid the engine root's Vitest discovery. Recorded evidence is under `reports/validation-20260928/`; the full run has zero integration skips. The degraded candidate is deliberately synthetic and is never represented as an Opus build.

The runner measures positions under the current public natal-chart interface. It does not qualify event solvers, all house systems, historical civil-time resolution, birth-time uncertainty bounds, browser/mobile runtimes, arbitrary provider adapters, or predictive interpretations. Reference corrections, axes and target centers remain separately declared. Future fresh holdout acquisition is still needed for stronger generalization evidence.

See `docs/OPUS-HANDOFF.md` for the next candidate, `docs/CONTRACT.md` for the frozen plan boundary, and `docs/REVIEW.md` for independent review.
