# Arabic lunar mansions implementation plan

All implementation, tests, tooling, documentation and fixtures stay in
`mansions/`. The engine source and its packed files remain untouched. Each
session completes the next unchecked milestone, runs its checks, ticks it
here, and appends a single session summary to `CHANGES.txt`.

- [x] M1 Establish an isolated TypeScript project, local dependency resolution, and Vitest smoke tests for engine Moon positions, receipts and the shared crossing solver.
- [x] M2 Research redistributable sources and commit a cited, versioned equal-segment boundary table and attested Arabic names and Latin or English labels in SOURCES.md. State the chosen zero point and distinguish exact division from rounded sexagesimal widths.
- [x] M3 Implement pure longitude classification with mandatory table selection, half-open segments, wrap handling and tests using independently hand-derived rational arithmetic at every boundary.
- [x] M4 Implement the tropical mansion-at API with strict instant validation, explicit table identity, Moon longitude, engine receipt and documented coverage refusals.
- [x] M5 Find tropical mansion ingresses with src/crossings.ts, bounded work, chronological ordering, explicit endpoint semantics and numerical refinement tests without physical-accuracy claims.
- [ ] M6 Implement range occupancy intervals with start/end instants, clipping markers, ingress receipts and tests for empty windows, adjacent windows and the zodiac wrap.
- [ ] M7 Add explicit sidereal selection and selectable engine ayanamsas to at/range calculations, preserving tropical longitude and ayanamsa receipts without adding nakshatra code.
- [ ] M8 Add the mansions at and mansions range CLI commands with mandatory table choice, JSON and neutral plain text, help and argument-error tests.
- [ ] M9 Seek independently published mansion ingress samples, audit their conventions and redistribution terms, and test any usable cited samples in-tree. Record an evidence gap if none qualifies; never substitute engine output for independent evidence.
- [ ] M10 Harden budgets, refusal propagation, time-basis seams and CLI failure behavior with focused adversarial and integration tests.
- [ ] M11 Document API/CLI examples using synthetic inputs, provenance, numerical resolution versus astronomical accuracy, licensing and local setup; run the full mansions checks and verify package isolation and repository constraints.

The equal-segment table will be an explicit computational convention from a
documented zero point. It will not imply that traditional star asterisms have
equal widths. A named-star table needs its own redistributable source and
version and is outside the initial equal-segment implementation.

Results contain astronomical facts only. No auspicious or inauspicious
labels, date ranking, predictions, weather advice or travel advice belong in
the library or CLI. All results must retain engine receipts. Generated data
and tool caches belong in locally ignored directories; committed files stay
below the requested size limit. Git changes and draft PR updates are handled
by the session harness.
