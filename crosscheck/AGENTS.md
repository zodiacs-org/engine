# Crosscheck contributor instructions

Read the repository's [AGENTS.md](../AGENTS.md),
[CONTRIBUTING.md](../CONTRIBUTING.md), [LICENSING.md](../LICENSING.md) and
[README.md](../README.md), then the root BRIEF.md, [README.md](README.md),
[PLAN.md](PLAN.md), [PHASE2.md](PHASE2.md) and the tail of the root STATUS.md.
Fix a root CI-FAILURE.txt first when present. Follow the session process in
PHASE2.md, preserve completed work and historical measurement identities,
and append a plain summary to CHANGES.txt after the affected checks.

Only change files inside crosscheck/ and .github/workflows/crosscheck.yml.
Do not change engine sources, packed inputs, root manifests or lockfiles,
other workflows, dist/, package versions or artifacts/. The external harness
handles git writes and CI; never commit, push, use gh, merge, publish or run
the release workflow.

Swiss Ephemeris and pyswisseph are optional dev/test-only dependencies used
only by this harness. The owner has approved an external installation.
The binding declares AGPL v3; Swiss Ephemeris is available under the AGPL or
an Astrodienst professional licence. Read the
[licensing sources](README.md) and comply with the applicable terms; external
execution is not a licence exemption.

- Keep all Swiss software and ephemeris data outside the checkout, including
  ignored folders. Do not install, copy, vendor or commit any Swiss code,
  binary, ephemeris file, table or generated fixture here.
- Never add a Swiss dependency to repository manifests or lockfiles. Never
  import or require Swiss from engine or application runtime code. Never
  ship Swiss in any package, server or container.
- Use only the unchanged sanctioned conformance/adapters/pyswisseph.py
  adapter through lib/swiss.mjs. Document setup through CROSSCHECK_PYTHON
  and SE_EPHE_PATH; never commit machine-specific installation paths.
- Retain only verdicts, returned flags, summary statistics and identity
  hashes. Never retain raw adapter stdout, stderr, exceptions containing
  values, per-case positions, tables or Swiss-derived test expectations.
- JPL is the positional accuracy reference. Keep Swiss instrument
  comparisons and convention differences separate from JPL numerical error.
  Preserve version and returned-flag counts, including fallback, and record
  ephemeris file identities by SHA-256 only.
- Keep Swiss optional. Runs without configuration report unavailable.
  A configured but invalid instrument must fail explicitly. CI runs without
  Swiss, using invented protocol peers and absence tests.

Use synthetic inputs only. Retain aggregate reports with the exact command,
actual completed count, seed, span, units, conventions and verified build and
reference identities. Every accuracy claim needs committed evidence. No
predictions, forecasts, personal email addresses, secrets or tokens belong
in files. Use plain documentation without em or en dash characters.

Use the project's lockfile and Node 22 for installation, syntax, build,
verification, tests and safeguards as documented in README.md. Keep kernels,
intermediate data and generated test fixtures under ignored runtime/; commit
only aggregate reports and their reproducibility receipts. Keep files below
the file-size boundary and combined runtime/cache usage within the brief's
disk cap; stop and record a projected excess in PHASE2.md. Run at most three
worker processes. Do not modify other repositories, worktrees or folders.
