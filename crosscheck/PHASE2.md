# Crosscheck phase 2

Phase 1 and its review fixes are complete. This checklist follows the root
BRIEF.md. Complete one milestone per session, run the project tests and
checks, tick it, append a plain summary to CHANGES.txt, then stop. The
external harness handles git writes and CI.

- [x] P1 Reconcile the README, plan, validation history and JPL report with the implemented frames, Swiss transport, runner and bounded chart campaign; preserve historical measurement identities and check aggregate report rendering.
- [ ] P2 Establish a disk-budgeted reference plan for synthetic TT charts across 1800 to 2200: verify DE440 and DE441 coverage, exact centers and span selection, enforce the combined runtime/cache cap before acquisition, and record any unavailable comparisons without downloading Swiss.
- [ ] P3 Add bounded, mergeable absolute-error quantiles and distance residual channels with independent arithmetic tests; report median, p99, p99.9 and maximum with explicit units and quantile approximation limits.
- [ ] P4 Extend the campaign and aggregate reports to group each body's longitude, latitude and distance errors by DE440 and DE441 span, separate convention differences, and pass a real bounded pilot with exact commands, seed and verified build/kernel identities.
- [ ] P5 Start the larger campaign toward at least 1,000,000 synthetic charts with at most three active worker processes; validate a budget stop and checkpoint resume and commit only completed aggregate progress with actual counts and resource evidence.
- [ ] P6 Continue that checkpointed campaign in a later session; finish the requested count if practical or retain the largest completed campaign with a plain explanation of the measured time or disk limit, and publish aggregate markdown and CSV with a short arcsecond summary and its measured span.
- [ ] P7 Audit final counts, per-body and per-span statistics, command/build/kernel/seed receipts and report reproduction; keep Swiss absence explicit and tested, update current documentation, and pass the dedicated Node 22 project checks.

Runtime and cache data, including kernels, must fit within the brief's
combined 6 GB disk cap. Stop before a run would exceed it and record the
reason here. Every file must stay below the existing file-size limit;
generated data stays ignored and per-case values are never committed.
Reference or build changes require a new campaign identity. A requested
count is not a completed measurement, and an empty or unavailable DE441
group must not be presented as measured coverage.

P1 local validation: syntax, aggregate rendering, safeguards and the runtime
independent tests passed. The available Node 20 runtime was rejected by the
existing Node 22 build checks. VALIDATION.md records the commands and this
limitation; the external harness runs the dedicated Node 22 CI job.
