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
  Use the same synthetic charts and exact bodies for the grouped
  engine-minus-JPL, engine-minus-Swiss and Swiss-minus-JPL channels, split
  by DE440 and DE441. Request each compared body once through
  comparePositionPair; both Swiss comparisons must leave the transport as
  aggregate states only. Preserve the legacy single-comparison wrapper.
- Preserve version and binding labels, adapter and binding SHA-256 digests,
  and external ephemeris file identities by SHA-256 only. Keep installation
  paths out of identities. Record returned flags and fallback verdicts per
  request; paired comparison and coordinate rows describe the same request,
  so do not sum them as independent instrument calls.
- Keep grouped Swiss channels present when the instrument is unavailable,
  with explicit unavailable identity and no numerical measurements.
  Fallback, error and unsupported responses contribute no residual values.
  Use fixed absolute histograms for median, p99 and p99.9 intervals and
  preserve exact sample maxima. Never turn an unavailable channel or empty
  reference group into zero residuals.
- State the remaining conventions with Swiss comparisons: its apparent
  deflection, its lunar corrections versus the JPL campaign's geometric
  Moon, and the frame and TT Julian-date rounding differences. Swiss is a
  second instrument, not a second positional truth. Do not claim a live
  measurement until its aggregate report is committed.
- Keep Swiss optional. Runs without configuration report unavailable.
  A configured but invalid instrument must fail explicitly. CI runs without
  Swiss, using invented protocol peers and absence tests.

The phase 2 brief authorizes a frozen exact path allowlist for pre-existing
test and research tooling. These tools are test-only and never shipped:

- `conformance/adapters/pyswisseph.py`
- `conformance/arbiters/l2/check_swiss.py`
- `conformance/arbiters/l3/check_swiss.py`
- `conformance/harness/lib.mjs`
- `conformance/harness/report.mjs`
- `docs/evidence/houses-extra-2026-09-29/tools/compare-swiss.py`
- `docs/evidence/houses-extra-2026-09-29/tools/diagnose-swiss.py`
- `docs/evidence/houses-extra-2026-09-29/tools/speed-flags.py`
- `docs/evidence/houses-extra-2026-09-29/tools/swiss-self-difference.py`
- `docs/evidence/nutation-2026-09-29/tools/ladder-compare.py`
- `docs/evidence/nutation-2026-09-29/tools/swiss-compare.py`
- `docs/evidence/sky-chinese-2026-09-29/tools/sky_swiss.py`
- `docs/evidence/vedic-2026-09-28/tools/swiss_ayanamsa.py`

lib/swiss-guard.mjs and its negative fixture tests pin this list by path,
without content hashes, so ordinary edits remain possible. Do not broaden it
to folders, globs or new files. Every other tracked source file outside
crosscheck/ fails on a Swiss import or require, including new scripts within
the listed folders and any engine, server, MCP, batch, edge or shipped code.
Dependency declarations remain forbidden throughout the repository,
including crosscheck/ and these tooling folders. Run
`node crosscheck/tools/check-swiss.mjs`; the dedicated Node 22 workflow runs
this scan as a failing gate and exercises the negative fixtures in its own
Node suite. The scanner checks literal module syntax and dependency metadata;
it does not execute scanned programs or prove absence of computed imports.

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
