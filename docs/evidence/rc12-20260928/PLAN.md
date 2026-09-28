# rc.12 secondary progressions checkpoint

2026-09-28. Base: merged engine `537ecaf4d5ebf8ffbf34dfd8b1d2082ab13ca0e2`.
This is a bounded Phase 2 timing/package candidate. Site adoption, npm
publication, progressed angles and additional timing techniques are later
checkpoints.

## Contract

- Export the site's fixed `365.2422` tropical-year convention and its
  `progressedInstant` and `progressedBodies` operations from the package.
- Accept the engine's validated `DateInput` forms for both endpoints.
  Preserve signed elapsed-time mapping, the old floating operation order,
  and JavaScript Date millisecond clipping. Do not mutate caller inputs.
- Return the ordinary twelve body rows at the progressed instant, including
  the true lunar nodes. Speeds retain ephemeris degrees/day units.
- No progressed angles, houses, additional chart points, or receipt are
  implied. Date acceptance is distinct from physical reference coverage.

## Acceptance before publication

1. Meaningful boundary, invalid-input, ownership and convention tests.
2. Reuse the existing literal JPL ten-body fixture and its unchanged 0.01
   degree gate for a constructed mapping-plus-ephemeris component case.
3. Compare a cited published date-mapping example with its documented
   arithmetic rounding; independently check rational time mapping to within
   one millisecond against the packed runtime. Sources and tolerances are
   recorded separately. No new planet-table tolerance is inferred from
   observed package results.
4. Full unit suite, typecheck, exports and unchanged package-size gates.
5. Fresh packed consumer with TypeScript; immutable rc.10 legacy comparison;
   exact site-adapter comparison on a declared finite valid-input corpus.
6. Two clean builds/packs match; tested source, archive and evidence hashes
   agree; independent source/API review has no unresolved blocker.

Preserve earlier candidate archives and reports. Evidence identifies the
new archive rather than carrying forward results for a different build.
The site-adoption handoff must list all coupled metadata, MCP, generated
documentation and bundle gates. This checkpoint does not claim that the
site already imports the packaged progression API.
