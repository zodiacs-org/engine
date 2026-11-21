# Submitting an engine to the conformance suite

Anyone may run an astrology or ephemeris library against the conformance suite
and submit its adapter and results for listing in [RESULTS.md](RESULTS.md) and
`results/summary.json`.

## What an adapter is

An adapter is a small program that reads JSON Lines requests on standard input
and writes JSON Lines responses on standard output. Its first line is a
handshake object (`{"adapter": {...}}`) naming the adapter, engine, exact
version and configuration. Each subsequent line answers one test vector with
`output`, `unsupported` (with a plain-language reason), or `error`. The wire
format, vector kinds, tolerances and judgement rules are specified in
[SPEC.md](SPEC.md).

An adapter must call the engine's own public functions for each quantity it
answers. Do not implement missing astronomy or coordinate frames inside the
adapter; return `unsupported` with the reason instead.

## Three commands to run an adapter

From a checkout of this repository (with Node.js 20.19+ or 22.7+):

```sh
# 1. Verify the vector files against SPEC.md and their pinned digests
node conformance/harness/validate.mjs --expect-total 640

# 2. Run your adapter over the suite and write a results file
node conformance/harness/run.mjs \
  --adapter "<command to start your adapter>" \
  --out conformance/results/<engine>.json

# 3. Regenerate RESULTS.md and results/summary.json and check they match
node conformance/harness/report.mjs && node conformance/harness/report.mjs --check
```

Pass `--values none` to `run.mjs` if the engine's licence does not permit
redistributing per-vector numeric residuals; verdicts and summary statistics
are still recorded.

## What to send in a pull request

Keep all files inside `conformance/` so the npm package build and carried
release archives are untouched:

1. **Adapter source** under `conformance/adapters/` (with any pinned runtime
   dependency manifest inside `conformance/adapters/`, never the root
   `package.json`).
2. **Results JSON** under `conformance/results/<engine>.json`, produced by
   `run.mjs` with the engine's exact released version and configuration.
3. **Notes file** at `conformance/results/<engine>.notes.md` stating the
   exact version, licence, planetary or lunar theory, which kinds were
   answered, any coordinate conversion performed with the engine's own
   routine, and why omitted kinds are `unsupported`.
4. **Regenerated reports**: `conformance/RESULTS.md` and
   `conformance/results/summary.json` produced by `report.mjs`.

## How submissions are checked and listed

Before merging, maintainers rerun the submitted adapter from a clean install
of the pinned release (using `--check`) and verify that:

- the engine's licence permits the adapter and the committed level of output;
- the adapter answers each kind with the engine's own public API and never
  reads expected values (the harness sends only `id`, `kind` and `input`);
- `validate.mjs`, `selftest.mjs`, `--check` and `report.mjs --check` all pass.

Results are listed as measured, pass or fail, by level and kind with no
composite ranking score.

## Disputing a vector

Released vectors never change in place. If you believe a vector's expected
value, input or tolerance is wrong, open an issue citing the vector ID and an
independent primary arbiter (such as JPL Horizons, ERFA, IANA tzdb or IERS);
confirmed errors are withdrawn and replaced under a new ID in
[DISCREPANCIES.md](DISCREPANCIES.md).
