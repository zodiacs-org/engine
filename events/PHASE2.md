# Phase 2 event search plan

Complete one milestone per session and retain the phase 1 checks. All work
stays in `events/` and its dedicated workflow. Use Node 22, at most three
test workers, files below 2 MB and ignored folders for generated data. Stop
and record the reason here before any run that would exceed the 2 GB disk
cap from `../BRIEF.md`. Independent references supply astronomical
expectations; analytic motion checks numerical behavior only.

- [x] P1 Add opt-in station-aware bracketing for longitude crossings, ingresses and fixed or moving aspects, with shared budgets, boundary tests and independent repeated-pass dates reduced from the existing Horizons responses.
- [x] P2 Carry the station-aware policy through query execution, HTTP, retrograde sign partitions and void-of-course searches; test relative turning points, clipping, refusal and phase 1 compatibility.
- [x] P3 Acquire and verify a broader small Horizons station and ingress reference sample spanning 1900 to 2100, with source requests, retrieval dates, digests and thresholds declared before engine comparisons.
- [x] P4 Expand the independently verified NASA solar and lunar eclipse sample across 1900 to 2100, preserving catalog provenance, clocks and supported classification limits.
- [x] P5 Add a reproducible completeness report for fixed queries over 1900 to 2100, matching against the independent references and committing aggregate misses, unmatched results and timing errors with their measured scope.
- [x] P6 Measure long-range query cost including Mercury stations from 1800 to 2200, improve the slowest measured path and commit before and after evidence with unchanged-result checks.
- [x] P7 Reconcile remaining sampling, reference, numerical and operating limits in LIMITATIONS.md and the project guides; run all events checks and preserve the isolated Events Node 22 CI job.
