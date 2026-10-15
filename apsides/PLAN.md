# Apsides implementation plan

Work only in `apsides/`. Complete the next unchecked milestone, run its
checks, tick it, append one session summary to `CHANGES.txt`, then stop.
The harness owns git operations. The engine package and carried archives
remain unchanged.

- [x] M1 Establish the private TypeScript project, engine geometric distance sampler, explicit units and center conventions, initial design, and Vitest contract tests.
- [x] M2 Preregister independent reference cases and accuracy budgets; add a reproducible JPL Horizons collector, small cited fixtures, and source-integrity tests. Reserve held-out cases before tuning the search.
- [x] M3 Implement a pure bounded distance-extremum solver with bracketing, golden-section refinement, evaluation accounting, and analytic synthetic tests for minima, maxima, flat curves, and failures.
- [x] M4 Implement lunar window searches with edge padding, deterministic half-open boundaries, deduplication, explicit refusal on incomplete work, and lunar reference tests.
- [x] M5 Implement heliocentric searches for Mercury through Pluto, including Earth, with body-specific sampling policy, center disclosure, slow-orbit cases, and independent planetary tests.
- [x] M6 Add the combined window API, chronological merging, input validation, reference-span handling, completeness diagnostics, and partition-equivalence tests.
- [x] M7 Finalize event records with distance, total speed, signed radial speed before/at/after each extremum, replayable engine receipts, and JSON serialization tests.
- [x] M8 Add optional lunar syzygy annotations using an explicit angular orb, measured Moon-Sun elongation, candidate-only labels, receipts, and boundary tests.
- [x] M9 Implement `apsides lunar`, `apsides planetary`, and `apsides window` with strict arguments, JSON output, help, exit statuses, and subprocess tests.
- [x] M10 Run the reserved independent validation corpus, record timing/distance/speed errors and missed/extra events, and publish only the measured coverage and unresolved limitations.
- [x] M11 Finish library and CLI examples, reproducibility instructions, source and license records, local checks, and evidence that apsides stays outside the engine package.
- [ ] M12 Review scientific semantics and failure paths; complete robustness and CLI acceptance checks, document remaining limitations, and leave a reviewable project for the harness.

M1 tests establish integration and validation contracts. They are not
astronomical accuracy evidence. The numerical accuracy budget and fixture
selection are registered in M2 before engine/reference comparisons.

M5's implementation is complete. Its independent Pluto distance assertions
remain failing under the original budget; [VALIDATION.md](VALIDATION.md)
records the affected development case and checks. This checkbox does not
mark the accuracy gate as passing. Preserve that failure during subsequent
milestones; the engine, frozen fixtures and acceptance limits are unchanged.

M10's evaluation and reporting are complete, with independent acceptance
still failing. [The measured report](docs/evidence/m10/RESULTS.md) records
held-out Mercury total-speed failures, a Neptune event-time failure, and
Pluto's search refusal and same-TT distance failures, alongside the original
development Pluto failure. The reserved cases are now consumed; future
tuning requires new held-out cases. No search source or original limit was
changed to obtain these results.

M11 completes runnable library and motion-replay examples, reproduction and
license records, and a local check runner that executes every gate while
preserving failures. [The M11 check record](docs/evidence/m11/RESULTS.md)
records passing type and isolation gates and failing independent acceptance.
The new example and check-runner tests pass; the original accuracy failures
remain unchanged. M12 remains unfinished.
