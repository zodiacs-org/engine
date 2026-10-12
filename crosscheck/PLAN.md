# Crosscheck plan

Each session completes the next unchecked milestone, runs its checks, marks
it complete and appends a summary to CHANGES.txt, then stops. The external
harness handles commits, pushes and the draft PR. Agents never run those
operations. All authored and generated files stay inside crosscheck/.

- [x] M1 Record scope, licensing, retention rules and executable safeguards.
- [x] M2 Establish isolated Node 22 tooling and an engine build inside the ignored runtime folder; fingerprint source, dependencies and output.
- [x] M3 Implement index-addressable deterministic synthetic sampling and mergeable streaming statistics, with independent arithmetic tests.
- [x] M4 Acquire public DE440/DE441 kernels at runtime with source receipts, digest verification, coverage checks and bounded cache chunks.
- [ ] M5 Implement an independent JPL reduction with explicit TT/TDB, frames, centers and corrections; validate against public JPL references.
- [ ] M6 Connect the user-installed external Swiss instrument through the permitted conformance adapter, retaining only verdicts, flags and aggregates.
- [ ] M7 Implement bounded-memory sharding, atomic checkpoints and resume with configuration and build identity checks.
- [ ] M8 Generate deterministic markdown and CSV aggregate reports with exact commands, build identities, coverage and exclusions.
- [ ] M9 Run a real bounded synthetic sample and commit its aggregate report under reports/; report unavailable references explicitly.
- [ ] M10 Validate shard coverage, interrupted resume, report reproduction, retention, file size and npm exclusion; document million-chart campaigns.

Completion means the milestone's tests pass, not that future milestones are
implemented. Million-chart execution is the intended runner capacity, not a
measurement claim. Only actual completed comparisons support error reports.
Kernels must be chunked so every local file stays below the user's file limit.
Swiss software and data must reside outside the checkout, even in ignored
folders. No source or expected value comes from Swiss Ephemeris.
