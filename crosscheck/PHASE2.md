# Crosscheck phase 2

Phase 1 and its review fixes are complete. This checklist follows the root
BRIEF.md. Complete one milestone per session, run the project tests and
checks, tick it, append a plain summary to CHANGES.txt, then stop. The
external harness handles git writes and CI.

- [x] P1 Reconcile the README, plan, validation history and JPL report with the implemented frames, Swiss transport, runner and bounded chart campaign; preserve historical measurement identities and check aggregate report rendering.
- [x] P2 Establish a disk-budgeted reference plan for synthetic TT charts across 1800 to 2200: verify DE440 and DE441 coverage, exact centers and span selection, enforce the combined runtime/cache cap before acquisition, and record any unavailable comparisons without downloading Swiss.
- [x] P3 Add bounded, mergeable absolute-error quantiles and distance residual channels with independent arithmetic tests; report median, p99, p99.9 and maximum with explicit units and quantile approximation limits.
- [x] S1 Document the approved optional external Swiss dev/test-only instrument, its AGPL or professional licensing, runtime and distribution exclusions, environment selectors and aggregate-only retention in README.md, a new AGENTS.md and VALIDATION.md; preserve historical unavailable measurements.
- [ ] S2 Add a dedicated Node import and dependency guard over tracked repository files, exempting only crosscheck/ and the sanctioned conformance adapter for imports; reject Swiss dependencies in manifests, lockfiles, requirements, pyproject and Dockerfiles, prove rejection with negative fixtures and run it in the dedicated crosscheck CI job.
- [ ] P4 Extend the campaign and aggregate reports to group each body's longitude, latitude and distance errors by DE440 and DE441 span, separate convention differences, and pass a real bounded pilot with exact commands, seed and verified build/kernel identities.
- [ ] S3 Extend the campaign for the same synthetic charts with separate engine-versus-JPL, engine-versus-Swiss and Swiss-versus-JPL per-body angular aggregates, including max, p99.9, p99 and median; bind Swiss version, returned flags, fallback counts and ephemeris SHA-256 identities, test unavailable operation and include the comparison in the large run below.
- [ ] P5 Start the larger campaign toward at least 1,000,000 synthetic charts with at most three active worker processes; validate a budget stop and checkpoint resume and commit only completed aggregate progress with actual counts and resource evidence.
- [ ] P6 Continue that checkpointed campaign in a later session; finish the requested count if practical or retain the largest completed campaign with a plain explanation of the measured time or disk limit, and publish aggregate markdown and CSV with a short arcsecond summary and its measured span.
- [ ] S4 Add a short plain-language headline to the final report stating measured engine accuracy versus JPL and versus Swiss in arcseconds, the sampled span and actual chart count; keep unavailable comparisons explicit.
- [ ] P7 Audit final counts, per-body and per-span statistics, command/build/kernel/seed receipts and report reproduction; keep Swiss absence explicit and tested, update current documentation, and pass the dedicated Node 22 project checks.

Runtime and cache data, including kernels, must fit within the brief's
combined 6 GB disk cap. Stop before a run would exceed it and record the
reason here. Every file must stay below the existing file-size limit;
generated data stays ignored and per-case values are never committed.
Reference or build changes require a new campaign identity. A requested
count is not a completed measurement, and an empty or unavailable DE441
group must not be presented as measured coverage.

The brief's Swiss update approves an owner-provided external test instrument
and replaces the original instruction to keep it absent. S1 and S2 precede
campaign expansion; S3 prepares comparisons for the large campaign and its
execution is folded into P5 and P6. S4 summarizes the completed measurement.
The completed P1 to P3 records and their historical Swiss absence remain
unchanged. Environment selectors are documented without local paths.

P1 local validation: syntax, aggregate rendering, safeguards and the runtime
independent tests passed. The available Node 20 runtime was rejected by the
existing Node 22 build checks. VALIDATION.md records the commands and this
limitation; the external harness runs the dedicated Node 22 CI job.

P2 completed with the aggregate reference plan in reports/reference-plan.md,
.csv and .json. Full DE440 covers the requested TT interval, leaving the
DE441 outside-span group empty. Public DE441 catalog coverage was checked;
those parts were not acquired. Exact unavailable centers remain explicit.
Kernel and ERFA acquisition share a fixed disk cap and exclusive lock. The
download fit the cap. Syntax, new tests, artifact reproduction and safeguards
passed locally; existing runtime/build checks still require the unavailable
Node 22 executable. Commands and limits are recorded in VALIDATION.md.

P3 adds opt-in versioned absolute histograms, exact nearest-rank selection
and conservative percentile intervals alongside exact sample maxima.
Checkpoints bind the selected channels and reject mixed versions; historical
aggregate report bytes still reproduce. Optional distance channels use the
engine calculation entry and explicit km screening criteria. Independent
arithmetic, boundary, continuation, merging, unit and report tests pass.
Syntax, npm exclusion and local file/storage safeguards pass. The existing
runtime/build checks still reject the available Node 20 executable;
VALIDATION.md records this limitation. P4 connects these capabilities to
the wider campaign, including its reference groups, range conventions and
binary64 TT Julian-date conversion. No new physical accuracy measurement
or live Swiss run was made in P3.

S1 documents the approved external test instrument and its licensing,
runtime, distribution and retention boundaries in README.md, AGENTS.md and
VALIDATION.md. Historical reports and measurement identities are unchanged.
Syntax, runtime independent tests, absence and invented transport checks,
aggregate reproduction and safeguards passed. Existing build checks still
reject the available Node 20 runtime; full Node 22 validation remains with
the dedicated CI job. S2 is the next unchecked milestone.

S2 is partially implemented, with a strict tracked-working-file scanner and
negative fixture tests in tests/swiss-guard.node-test.mjs. The strict scan
finds existing Swiss imports in historical conformance arbiter and evidence
scripts outside the permitted import paths. Those files are outside this
session's edit scope. VALIDATION.md records the command and exact findings.
No legacy exemption or baseline is authorized by the brief, and none has
been added. A scope decision has been requested: either permit a frozen
path-and-SHA-256 baseline for these existing scripts, rejecting every new or
changed violation and every manifest dependency, or retain the strict rule
and leave S2 incomplete until the existing imports can be resolved.

The fixture tests run with the existing dedicated Node test glob. The strict
repository check is deliberately not wired as a failing CI gate while that
decision is pending. S2 is not ticked and campaign expansion has not started.
Syntax, runtime independent tests, retained aggregate reproduction and
file/storage safeguards passed locally. The build checks still refuse the
available Node 20 executable and require Node 22.
