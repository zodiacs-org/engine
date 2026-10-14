# Planetary visibility and lunar crescents

Work only in `heliacal/`. The engine source, packed files, archives and
release settings stay under the repository's existing rules. Git operations
belong to the harness. Each session completes the next unchecked milestone,
runs its checks, marks it complete and appends a line to `CHANGES.txt`.

The implementation uses relative imports of the engine source. Positions,
time scales and frames come from the engine; horizon crossings and transits
use `src/sky/riseset.ts`. Visibility decisions belong to this project and
must state the model, parameters, conventions and limits alongside engine
provenance. Model predictions are not observations or guarantees of sighting.

- [x] M1 Establish an isolated TypeScript/Vitest project, strict body/site/time inputs, position and rise/set/transit adapters, preserved engine receipts, foundation tests and a source roadmap.
- [x] M2 Add geocentric and topocentric Sun/body geometry, horizontal coordinates derived from engine frames, angular separation and explicit units; test geometric identities and independent published coordinates.
- [ ] M3 Implement phase results for the Moon and visible planets: signed synodic longitude angle, true angular elongation, illumination geometry, morning/evening classification and conjunction/opposition boundary conventions.
- [ ] M4 Implement a published arcus visionis visibility model with explicit solar depression, body altitude, extinction and magnitude parameters; cite the exact definition, expose assumptions, and test independent criterion calculations.
- [ ] M5 Build bounded morning/evening observing windows from the engine's rise/set/transit solver; handle missing crossings, polar conditions, range boundaries and budget refusals without reporting incomplete searches as complete.
- [ ] M6 Search heliacal visibility transitions for the Moon and visible planets, including first morning, last evening, first evening and last morning appearances where applicable; return bracketed model transitions, model parameters, geometry, diagnostics and engine receipts.
- [ ] M7 Add acronychal and cosmical rising/setting with a cited terminology table, explicit geometric versus visibility definitions, and tests of every Sun/body horizon pairing.
- [ ] M8 Implement the published Yallop lunar crescent criterion as a pure function with its specified geometry, best-time rule, category boundaries and independently calculated worked fixtures.
- [ ] M9 Implement the published Odeh lunar crescent criterion as a distinct model, including optical-aid categories and boundary tests; expose model selection without treating unlike categories as equivalent.
- [ ] M10 Search first evening and last morning lunar crescents over a date range; justify morning timing from the sources or mark any extension explicitly, and preserve missing-event reasons, model parameters and engine receipts.
- [ ] M11 Implement `heliacal events`, `heliacal crescent` and `heliacal phase` with strict options, JSON output, explicit units/models, deterministic serialization and CLI integration tests.
- [ ] M12 Complete small cited historical-table or published worked-example fixtures, end-to-end checks, numerical evidence and usage documentation; audit model limits, packaging isolation, file sizes and repository scope.

## Validation policy

Fix each external comparison's tolerance and convention before evaluating
the implementation. Published criteria and independently calculated
arithmetic can check model implementation; observations check predictive
performance and must keep their weather and observer limitations. Engine
parity and synthetic invariants are integration or regression checks, not
independent accuracy evidence. Never use Swiss Ephemeris material.

Keep small, attributed fixtures committed. Bulk output, caches, dependencies
and downloaded research belong in ignored directories. No new file may
exceed the user's file-size limit. Documentation claims need their named
test or committed evidence. Do not present a planned milestone as available.
