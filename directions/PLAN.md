# Primary directions implementation plan

All implementation, tests, fixtures, documentation and local tooling belong in
`directions/`. This project does not change the engine's source, package,
build output or carried archives. The harness owns git writes and the draft
pull request. Complete the next unchecked milestone, run its checks, tick it,
append a session summary to `CHANGES.txt`, then stop.

- [x] M1 Establish the isolated TypeScript and Vitest project, a strict explicit convention contract, source register and evidence rules. Test rejection of omitted, unknown and incompatible convention choices; document which calculations remain unimplemented.
- [x] M2 Adapt synthetic natal inputs through the engine's public source exports. Preserve its time basis, positions, equatorial rows, houses and angles; expose auditable RAMC and obliquity without recalculating cusps. Test geometry provenance, missing time/place and polar refusals.
- [x] M3 Implement sphere primitives for hour angle, ascensional difference, diurnal/nocturnal semi-arcs and quadrant position. Commit hand-derived equatorial and oblique examples with independent expectations, including both hemispheres and circumpolar failures.
- [x] M4 Implement primary conjunction arcs to the meridian and horizon under explicitly sourced motion constructions. Respect the traditional role-swap restriction on converse angles; any broader converse construction needs its own named option and evidence. Test wraparound, coincident contacts and ascending versus descending branches against hand-derived examples; emit the intermediate geometry.
- [x] M5 Implement zodiacal Placidus semi-arc directions to body significators, with explicit latitude treatment and ecliptic aspect branches. Verify equations and orientation against the cited definition and independent spherical examples before enabling each combination.
- [ ] M6 Implement mundane Placidus semi-arc conjunctions and aspects using explicit mundane-position definitions. Verify above/below horizon, east/west and aspect branch cases independently; refuse undefined semi-arcs instead of changing systems.
- [ ] M7 Implement Ptolemy, Naibod and a precisely sourced solar-equatorial timing key as separate explicit choices. Preserve the key's rate or solar samples in results. Test exact arithmetic and synthetic solar samples, year units and refusal conditions.
- [ ] M8 Assemble the pure `hit` library API and structured results: significator, promissor, conjunction/aspect and body/angle contact kind, arc in degrees, directed age, full conventions, geometry and typed failures. Test complete hand-derived cases and immutable input handling.
- [ ] M9 Implement bounded `scan` over explicitly selected contacts, motions and age range. Define endpoints, stable sorting, deduplication and work limits; compare every scan row with independent enumerated cases and the single-hit API.
- [ ] M10 Add the `directions hit` and `directions scan` CLI, strict JSON input, JSON results, help and documented exit codes. Test subprocess success, malformed input, unsupported options and deterministic output with synthetic charts.
- [ ] M11 Expand independent numerical evidence across hemisphere, quadrant, latitude, aspect and key boundaries. Record residuals and limitations with reproducible scripts; separate analytic accuracy checks from engine integration regressions.
- [ ] M12 Finish API and CLI guides with runnable synthetic examples, source-by-source convention explanations and audit walkthroughs. Use existing engine solar-arc and secondary-progression helpers only for separate comparisons. Run all local checks and verify that directions stays outside the npm package.

Each numerical milestone must commit its derivation or independently authored
fixture before treating a computed value as accuracy evidence. Large generated
reports and tool caches stay in ignored directories; tracked files remain below
the user's file-size limit. No Swiss Ephemeris material or personal birth data
is an input to this project.
