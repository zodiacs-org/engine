# Executed validation

Frozen target: engine `0.1.1-rc.10`, commit `f5f33892a95cd0d6cd4a11a80e66f802b11bccfa`.

The parent acquired a distributable with SHA-256 `a377cdc8c12e25ff7de4fe95ddf77a4cdee8d2da97071b0f8454e340b374565c`. The loaded `dist/index.js` has SHA-256 `d3a2ef95bdff80c70c2edeb95b89569894eb58e235ffbbbd73035f08b81602c3`. An entry-module hash alone does not cover its imported chunks or installed dependencies; use the enclosing toolkit's frozen-source/distribution manifest for full reproducibility.

Executed in Node `v24.19.0`:

- 14 analytic acceptance scenarios and 11 request/output/provenance checks passed. These are 25 **companion-tool contract checks**, not 25 independent astronomical accuracy tests.
- A synthetic example birth window, `2000-01-01T00:00:00.000Z` to `00:30:00.000Z`, with an explicit point in Bangkok, was evaluated at 1,801 UTC instants for each of whole-sign and Placidus: 3,602 engine chart calls. This is not a real person's birth record.
- All requested sample evaluations completed, with no issues. Each feature was observed constant within its house-model branch. Moon house differed between models (whole-sign 11; Placidus 10), illustrating convention sensitivity. These are actual rc.10 results under the example input, not independently established astronomical reference expectations.
- Both JSON Schemas and all three request/result examples validated using `jsonschema 4.26.0`, draft 2020-12.

The first real-engine smoke run revealed an adapter mistake: `signForLongitude` returns a definition object, not a slug string. The adapter and its analytic stand-in were corrected to consume `.slug`; the full real-engine run and schema validation were repeated successfully. This was a companion implementation error, **not an engine defect**.

Independent review also supplied fail-closed probes: an unknown `model.zodiac` field, an adapter that ignores the requested ΔT pin, and an invalid `houseOf` result. The tool now rejects unknown request properties, validates returned chart input/model and ΔT receipts, and validates house/sign/angle outputs. Dedicated regressions are included in the 25 checks.

An independent reviewer reran the first 24 checks, both schemas and three examples after the fixes and found no remaining blocker in this companion's stated scope. A subsequent 25th provenance check verifies that an unknown candidate retains `engineCommit:null`; all 25 checks pass. The baseline example still records its known frozen source claim.

Ten additional cases specify future acceptance for local-clock normalization, coordinate/ΔT domains, priors and certification. They are explicitly marked **specified, not implemented**, and are not included in the 25-pass count. No completeness certificate, probabilities, root partitions or production integration were shipped.

Re-run:

```sh
node uncertainty/tests/verify.mjs --output /tmp/uncertainty-contract-results.json
node uncertainty/src/preview.mjs --engine /absolute/frozen/dist/index.js --request uncertainty/examples/utc-window.json --output uncertainty/examples/rc10-finite-preview.json
python -m venv /tmp/zodiacs-uncertainty-validation
/tmp/zodiacs-uncertainty-validation/bin/python -m pip install jsonschema==4.26.0
/tmp/zodiacs-uncertainty-validation/bin/python uncertainty/tests/validate-schemas.py
```

The schema validation script has an optional development dependency (`jsonschema==4.26.0`). The preview and analytic tests use only Node built-ins; the separately provided engine brings its own dependencies.
