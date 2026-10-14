# Horary implementation plan

Work only inside `horary/`. The engine package, its build output and carried
archives stay unchanged. Complete the next unchecked milestone in each session,
run its tests, tick it here and append a session summary to `CHANGES.txt`.

- [x] M1 Establish an isolated TypeScript project, validated declarative question input, an engine-backed cast API, and synthetic Vitest fixtures with written derivations.
- [x] M2 Select traditional cusp rulers for querent and quesited, Moon as co-significator and optional natural significators; explain shared rulers and preserve each role.
- [x] M3 Define a sourced, toggleable rule policy and structured explanation records; implement early/late Ascendant, Saturn in the first/seventh and Moon Via Combusta considerations with boundary tests.
- [x] M4 Add the traditional void-of-course consideration using the engine's existing scanner, with explicit sign-boundary semantics and scan limitations.
- [ ] M5 Report essential dignities and directional/mutual receptions using the engine tables and APIs; add configurable sourced essential scores and hand-derived fixtures.
- [ ] M6 Add configurable accidental dignity scoring using engine houses, sect and speed helpers; expose each contribution and avoid counting the same condition twice.
- [ ] M7 Classify significator aspects using the engine's aspects and exact arithmetic; search relative longitude with engine crossings for time-to-perfection, bounded horizons and explicit search status.
- [ ] M8 Identify direct aspect perfection and sign changes or stations before perfection; reuse engine position/speed helpers and retain the ordered event evidence.
- [ ] M9 Identify translation of light from ordered separating/applying contacts, with configurable traditional eligibility and hand-derived motion fixtures.
- [ ] M10 Identify collection of light from converging contacts and receptions, documenting the selected tradition and testing ambiguous/shared significator roles.
- [ ] M11 Identify prohibition, frustration and station-driven refranation from the event sequence; explain competing interpretations without emitting a verdict.
- [ ] M12 Add optional timing hints from degrees to perfection and configurable modality/house units; distinguish symbolic hints from ephemeris elapsed time.
- [ ] M13 Compose the pure analyze/explain APIs and implement the offline `horary cast`, `horary analyze` and `horary explain` CLI with JSON input/output and readable explanations.
- [ ] M14 Complete integration and CLI tests, document source traditions and fixture derivations, and verify folder isolation, file limits and exclusion from the engine npm package.

## Design and evidence

The question declares its quesited house; the library does not infer a house
from free text. Rules return observations and explanations, never an
authoritative yes/no answer. Every traditional rule names its source and can
be disabled. Competing traditions belong in explicit policy choices.

Keep engine reuse behind a local adapter: chart casting and houses from the
root API, dignities and receptions from `src/techniques/dignities.ts`, the
void-of-course scanner from `src/techniques/void-of-course.ts`, aspect decisions
from `src/aspects.ts` and `src/exact.ts`, and event roots from
`src/crossings.ts`. Inspect existing speed/station helpers before adding event
logic. Do not copy another project's event, electional, calendar, relocation,
HTTP or KP implementation.

Use invented question instants and locations. Derive rule expectations from
published definitions or separately worked angular arithmetic, and document
each fixture. Tests of adapter delegation are integration/regression checks,
not independent ephemeris accuracy evidence. Generated outputs go in ignored
directories and no file may reach the user's file-size limit.
