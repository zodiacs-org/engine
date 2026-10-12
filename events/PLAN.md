# Event search engine plan

All implementation, configuration, documentation, fixtures and local output
stay under `events/`. The parent engine and its carried archives stay unchanged.
Each session completes the next unchecked milestone, runs its checks, records
its outcome in `CHANGES.txt`, and stops. Analytic tests check numerical methods;
astronomical accuracy claims require independent references with provenance.

- [x] M1 Bootstrap a private TypeScript project, shared search contracts and a bounded bracketed root refiner with analytic tests.
- [x] M2 Add a relative-source engine adapter, explicit clock and coordinate conventions, strict window validation and evaluation budgets.
- [x] M3 Implement longitude crossings and sign ingresses, including wrap handling, directions and window boundaries.
- [x] M4 Implement moving-to-fixed natal aspects and moving-to-moving aspects, returning every exact pass under an explicit aspect policy.
- [x] M5 Implement stations and retrograde intervals with sign filters, including intervals clipped by the search window.
- [ ] M6 Add a reproducible JPL Horizons reference acquisition tool, provenance and independent date tests for aspects, ingresses and stations.
- [ ] M7 Implement solar and lunar eclipse searches with explicit event definitions and time scales.
- [ ] M8 Add published NASA eclipse catalog fixtures, attribution and independent eclipse date tests.
- [ ] M9 Implement void-of-course Moon intervals under a documented body and aspect policy, including boundary tests.
- [ ] M10 Implement a bounded query DSL parser with typed syntax errors and grammar documentation for next/all searches and filters.
- [ ] M11 Wire the programmatic search API and DSL execution, including next-event horizons, cancellation and complete/refused results.
- [ ] M12 Add a small HTTP API with validated requests, bounded work, structured errors and integration tests.
- [ ] M13 Exercise long-span searches, reconcile independent references, document limitations and examples, and verify repository/package isolation.

## Build order and evidence

Root refinement does not discover brackets or prove a scan complete. Later
search milestones must state their sampling assumptions and station handling.
An exact numerical root is subject to the engine's physical and time-model
errors. Results must distinguish budget refusal from an empty completed search.
The long-span Venus query must cover retrograde intervals intersecting Leo,
with its overlap convention documented before implementation.

Reference acquisition must record the request, source URL, time scale, frame,
retrieval date, digest and redistribution terms. Set reference tolerances before
comparing engine values. Keep downloads and generated bulk output gitignored;
commit only small reviewed fixtures with their acquisition scripts. Use no Swiss
Ephemeris expectations and only synthetic natal inputs.
