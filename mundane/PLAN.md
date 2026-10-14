# Mundane library and CLI plan

Work stays inside `mundane/`. The engine source and release archives are read
only. Each session completes the next unchecked milestone, runs its checks,
ticks it here, and appends a commit summary to `CHANGES.txt` for the harness.

- [x] M1 Establish a private TypeScript project, pure place and date-range input normalization using engine validation, isolated Vitest checks, and scope documentation.
- [x] M2 Cast event charts through the engine, returning angles, requested and actual houses, body positions, time basis, provenance, and calculation flags. Test synthetic places and polar fallback.
- [x] M3 Identify classical planets in angular houses and near angles with an explicit convention and configurable orb. Test hand-derived synthetic geometry and boundary cases.
- [x] M4 Return domicile rulers of each angle and their essential dignities, using engine dignity tables and chart sect. Test synthetic day and night cases.
- [x] M5 Find cardinal solar ingress instants with the engine crossing solver, expose the ingress library API, and enforce range boundaries and search budgets.
- [x] M6 Commit small independent ingress references with source and derivation records, then test ingress timing and chart integration against them.
- [x] M7 Find New and Full Moon instants using engine Sun and Moon positions and the engine crossing solver, with a pure lunation API and explicit range semantics.
- [x] M8 Commit small independently published lunation references with source and derivation records, then test lunation timing and chart integration against them.
- [x] M9 Produce short structured factor lists labelled as traditional conventions, not predictions, with tests for wording and traceability to chart factors.
- [ ] M10 Combine ingress and lunation charts into a chronological year or range report, with deterministic ordering and tests for empty ranges and adjacent windows.
- [ ] M11 Add an optional events eclipse adapter through relative imports when available, preserving supplied contact kinds, search completeness, and provenance. Test supplied synthetic contacts and unavailable adapters; never implement an eclipse solver.
- [ ] M12 Implement the `mundane ingresses`, `mundane lunations`, and `mundane year` CLI with strict arguments, JSON and plain-text output, help, and process-level tests.
- [ ] M13 Finish usage examples and convention/source documentation, run the complete mundane checks, audit size and package isolation, and record remaining limitations.

## Implementation boundaries

Use relative engine source imports from this checkout. Reuse chart casting,
houses, sect, dignities, and crossing searches. No electional or birth-window
search, scoring, calendar export, relocation grids, horary, or HTTP API belongs
here. The events branch can be inspected through git objects; an optional
adapter must not modify that branch or another worktree.

Use invented places and event inputs. Astronomical timing references must come
from hand derivation or a primary independent source, with source terms and
time scale recorded before comparison. Engine comparisons are integration or
regression checks, never independent accuracy evidence. Documentation claims
must cite committed tests or scripts and their recorded output.

Generated output, dependencies, caches, and large downloads stay gitignored.
Do not change root configuration or any input to the engine build. Do not
create archives, publish, or run git mutations; the harness handles git.
