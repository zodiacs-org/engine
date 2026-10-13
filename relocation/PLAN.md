# Relocation implementation plan

Work only in `relocation/`. Use the carried engine archive through a relative
file dependency and its public entry points. Keep the engine source, package,
archives and release settings unchanged. Each session completes the next
unchecked milestone, runs its checks, updates this checklist and appends one
line to `CHANGES.txt`. The harness handles git writes and draft PRs.

- [x] M1 Establish an isolated TypeScript project, engine-backed relocated charts, natal envelopes and synthetic Vitest tests.
- [x] M2 Accept existing engine charts and natal envelopes as sources, preserve requested settings on replay, and test validation and polar fallback semantics.
- [x] M3 Add geographic bounds, longitude wrapping, antimeridian splitting and bounded grid sampling with explicit work budgets.
- [x] M4 Define angular-line conventions and add engine-backed planetary equatorial and observer-angle sampling with receipts and undefined-angle handling.
- [x] M5 Generate bounded MC and IC polylines with sampled metadata and engine receipt references.
- [x] M6 Generate ASC and DSC horizon polylines, including circumpolar gaps, tangencies and polar cases, without fabricating positions.
- [x] M7 Extract grid crossings with bounded refinement, structured brackets, residuals and unresolved-cell metadata.
- [x] M8 Sample great-circle paths and find angular crossings along them, with antipodal and antimeridian handling.
- [x] M9 Add optional local-space azimuth lines using engine observer angles and bounded spherical geometry.
- [ ] M10 Implement the offline `relocation chart`, `relocation lines` and `relocation grid` CLI with validated JSON input and structured output.
- [ ] M11 Commit small generated golden polyline regression fixtures, their generator and synthetic integration tests; keep large generated outputs ignored.
- [ ] M12 Finish API and CLI documentation, receipt and numerical-limit explanations, end-to-end checks and package-isolation verification.

## Validation policy

Run the relocation typecheck and Vitest suite for every milestone. Add tests
that exercise new behavior, including invalid inputs and resource limits.
Engine parity tests and golden fixtures are regression checks, not independent
accuracy evidence. Cite committed tests for numerical claims in relocation
documentation. Use synthetic births throughout. Store generated grids,
temporary consumers, runtime downloads and caches in ignored directories.
Keep committed files below the user's file-size limit and documentation free
of em dash characters. Do not create archives, publish or run release commands.

## Completed milestone notes

M1 uses `file:../artifacts/zodiacs-engine-1.0.0.tgz` with lockfile integrity.
`relocateChart` accepts resolved engine birth inputs and returns natal and
relocated engine envelopes. It preserves time/settings and uses canonical
input flags so a source polar fallback does not become a destination claim.
Exact destination poles reject explicitly. Existing charts and envelopes as
inputs remain M2 work.

Validation: clean `npm ci --ignore-scripts`, `npm run typecheck` and `npm test`
passed on Node 22.22.2. `test/chart.vitest.ts` has synthetic parity and replay
checks. The explicit `.vitest.ts` pattern keeps this suite out of root Vitest
discovery. Root `npm pack --dry-run --ignore-scripts --json` excluded all
relocation files without creating an archive or building the engine. The
carried engine archive matched its SHA-256 receipt, and relocation file sizes
and documentation punctuation were checked. Engine CI gates requiring a root
install/build were not run; no engine files were changed.

M2 adds `RelocationSource` for resolved births, full engine charts and decoded
natal envelopes. Source records are validated and copied by the engine receipt
API. Destination requests use `natalReplayInput`, preserving requested houses,
time scale, pinned delta-T, time-known settings and input flags. Existing source
results and context remain source claims; destination receipts describe a fresh
installed-engine calculation without inheriting birthplace resolution or source
artifact claims. Polar Placidus and Koch fallback is recalculated at each place.

Validation: relocation `npm run typecheck` and `npm test` passed on Node 22.22.2.
`test/source.vitest.ts` covers source snapshots, malformed and oversized records,
codec rejection of executable/cyclic data, replay, unknown-time semantics and
successive antimeridian relocations. Root `npm pack --dry-run --ignore-scripts
--json` confirmed relocation remains excluded, without an archive or engine
build. File-size, documentation punctuation and diff-scope checks passed. Root
CI gates that require installing/building the engine remain deferred under the
session's isolation rule; no engine or packed files changed.

M3 adds inclusive geographic bounds, finite longitude wrapping and point
membership, plus antimeridian polyline splitting with sample indices and
explicit interpolated seam provenance. Grid plans traverse wrapped bounds in
eastward order, retain inclusive endpoints and refuse excess work before source
capture or coordinate allocation. `sampleGrid` captures the source once and
returns a fresh engine envelope per destination with replayed settings. Chart
grids exclude exact poles and retain engine polar fallback and unknown-time
behavior. Hard sample limits bound work; generated outputs remain ignored.

Validation: relocation typecheck and all tests passed on Node 22.22.2.
`test/geography.vitest.ts` checks bounds, seam aliases, interpolation, precision,
ownership and polyline limits. `test/grid.vitest.ts` checks grid endpoints,
resource preflight, engine evaluation counts, receipts, replay, polar fallback
and subnormal coordinate spans. Root package dry-run exclusion, archive SHA-256,
file-size, documentation punctuation and diff-scope checks passed. The root
`npm run package:contents` was attempted with an isolated writable npm cache;
it cannot pass because this checkout has no `dist/calc.d.ts`. No root build
was run under the user's rule forbidding changes to `dist/`; engine CI gates
requiring that build remain deferred. No engine or packed files changed.

M4 adds `sampleAngles`, bounded fresh planetary equatorial calculations and
observer axes through the carried engine's public calc and houses APIs. Every
position and nonpolar observer keeps its full engine result and receipt. Local
altitude, azimuth, hour angle and angular residuals are derived spherical
geometry with separately versioned conventions. ASC/DSC use the planetary
horizon direction; MC/IC use the upper/lower meridian. Exact geographic poles,
celestial-pole RA, zenith/nadir azimuth and ecliptic/horizon coincidence have
explicit undefined metadata. Unknown time and engine refusals produce no
partial geometry. Source replay preserves time scale, pins and house requests;
non-UTC clocks disclose their Julian-date sampling request and rounding.

Validation: clean relocation `npm ci --ignore-scripts`, typecheck and all
Vitest tests passed on Node 22.22.2. `test/angles.vitest.ts` covers engine
receipt replay, source ownership, synthetic spherical projections, singular
directions, time scales, pinned delta-T, polar fallback, antimeridian aliases,
work budgets and typed refusals. Root package dry-run exclusion, archive
SHA-256, file-size, documentation punctuation and diff-scope checks passed.
Root `npm run package:contents` still fails because `dist/calc.d.ts` is absent;
no root build was run under the rule forbidding writes to `dist/`. Engine CI
gates requiring a root build remain deferred. No engine or packed files changed.

M5 adds `planMeridianLines` and `meridianLines` for bounded MC and IC geometry.
The planner reserves worst-case engine work before source capture, with a
separate cap on observer metadata. Fresh engine equatorial directions and a
Greenwich observer receipt determine each meridian longitude. Every emitted
nonpolar vertex has an engine houses receipt and a measured meridian residual;
global sample indices link polyline vertices to that provenance. Inclusive
longitude clipping skips outside observers. Exact geographic poles remain
undefined metadata outside polylines; undefined celestial-pole RA produces no
meridian. Engine refusals discard all partial geometry. A shared internal
observer continuation reuses captured directions without repeating position
calls. Documentation explains singleton and empty polar geometry, conservative
budgets, receipt scope and numerical limitations.

Validation: relocation typecheck and the full Vitest suite passed on Node
22.22.2. `test/meridian-lines.vitest.ts` covers receipt replay, Cartesian
meridian projections, residuals, both branches, clipping, seam aliases, polar
fallback and undefined endpoints, clocks, source ownership, planning limits,
precision and refusals. Root package dry-run exclusion, archive SHA-256,
file-size, documentation punctuation and diff-scope checks passed. Root
`npm run package:contents` still fails because `dist/calc.d.ts` is absent;
no root build was run under the rule forbidding writes to `dist/`. Engine CI
gates requiring a root build remain deferred. No engine or packed files changed.

M6 adds `planHorizonLines` and `horizonLines` for bounded ASC and DSC curves.
Fresh engine equatorial directions and Greenwich ARMC define the unrefracted
geocentric horizon. Analytic tangent endpoints are inserted between latitude
rows and share stationary locations across branches. Circumpolar gaps and
exact poles retain explicit metadata without invented observer receipts.
Every admitted nonpolar vertex has a fresh engine houses receipt and altitude
residual. Polylines break at clipped rows and excluded longitude arcs, and
seam interpolation retains global observer references. Explicit half-world
direction selection preserves the branch arc in coarse tangent-only geometry.
Worst-case work is reserved before source capture. Typed engine refusals
discard partial geometry. Documentation states sampling and clipping limits.

Validation: relocation typecheck and the full Vitest suite passed on Node
22.22.2. `test/horizon-lines.vitest.ts` checks receipt replay, Cartesian horizon
projections, branch motion, tangent insertion, both polar hemispheres,
circumpolar gaps, seam aliases and provenance, longitude clipping, clocks,
pins, source ownership, budgets and refusals. `test/geography.vitest.ts` checks
explicit half-world arc selection. Root package dry-run exclusion, archive
SHA-256, file-size, documentation punctuation and diff-scope checks passed.
Root `npm run package:contents` still fails because `dist/calc.d.ts` is absent;
no root build was run under the rule forbidding writes to `dist/`. Engine CI
gates requiring a root build remain deferred. No engine or packed files changed.

M7 adds `planGridCrossings` and `gridCrossings` for engine-backed angular grid
sampling, unique edge extraction and bounded bisection. Coarse work is reserved
before source capture; refinement spends a shared evaluation budget and a
per-edge cap. Every admitted root references a sampled engine observer and
position receipt, with initial and final bracket endpoints and residuals.
Adjacent cells share edge roots. Unambiguous cell pairs produce seam-split
segments with global observer provenance. Hidden horizon pairs, stationary
roots, ambiguous cells, undefined directions, wide and coincident edges,
budget exhaustion and precision limits retain explicit unresolved metadata.
Successful partial brackets survive budget exhaustion; engine refusals discard
all geometry. Documentation explains tolerances, geometric exclusions and the
limits of sampled cell connections.

Validation: relocation typecheck and the full Vitest suite passed on Node
22.22.2. `test/grid-crossings.vitest.ts` checks receipt replay, Cartesian
meridian and horizon projections, residual and bracket acceptance, shared
edges, antimeridian provenance, polar fallback, source ownership, clocks,
resource limits and refusals. Synthetic injections cover hidden horizon pairs,
stationary directions, exact endpoints and ambiguous cell topology. Root
package dry-run exclusion, archive SHA-256, file-size, documentation punctuation
and diff-scope checks passed. Root `npm run package:contents` still fails
because `dist/calc.d.ts` is absent; no root build was run under the rule
forbidding writes to `dist/`. Engine CI gates requiring that build remain
deferred. No engine or packed files changed.

M8 adds `planGreatCircle`, `planPathCrossings` and `pathCrossings` for bounded
shortest spherical arcs and engine-backed angular intersections. Geographic
samples retain arc distances and fractions, inclusive endpoints, inserted
meridional poles and seam provenance. Antipodal and numerically ambiguous
directions reject without choosing an arbitrary route. Continuous horizon
and meridian plane projections guide bounded bisection; every new nonpolar
midpoint has a fresh engine houses receipt. Crossings retain global observer
and position references, sampled residuals and initial/final arc brackets.
Shared endpoints and midpoint observers are reused. Undefined poles,
celestial meridians, coincident paths, uncertain endpoint signs, work limits
and coordinate stagnation retain explicit unresolved metadata. Successful
partial results survive exhausted budgets; engine refusals discard all output.
Documentation states spherical route, interpolation and receipt limitations.

Validation: relocation typecheck and the full Vitest suite passed on Node
22.22.2. `test/great-circle.vitest.ts` checks separate haversine distances,
Cartesian arc planes, seams, poles, antipodal ambiguity, endpoint ownership
and planning limits. `test/path-crossings.vitest.ts` checks engine receipt
replay, all angular branches, separate Cartesian projections, arc brackets,
shared endpoints, cached refinement, reversal, polar fallback, clock replay,
budgets and refusals using synthetic births. Root package dry-run exclusion,
archive SHA-256, file-size, documentation punctuation and diff-scope checks
passed. Root `npm run package:contents` still fails because `dist/calc.d.ts`
is absent; no root build was run under the rule forbidding writes to `dist/`.
Engine CI gates requiring that build remain deferred. No engine or packed
files changed.

M9 adds `planLocalSpaceLines` and `localSpaceLines` for bounded forward and
opposite spherical rays from an explicit observer. Fresh engine equatorial
positions and observer axes define the origin bearing. All rays share the
origin receipt; every additional nonpolar vertex has a fresh engine houses
result and receipt. Samples retain angular distance, fraction, changing course,
body azimuth, alignment residual and global observer indices. A defined bearing
resolves antipodal endpoints. Exact meridional routes insert poles and break
display geometry; pole origins and zenith/nadir bearings remain undefined
without invented routes. Destination zenith/nadir samples retain the geographic
route and a null diagnostic residual. Seam interpolation keeps explicit
provenance and uses the known direction on exact half-world links. Planning
reserves worst-case work before source capture. Unknown time and typed engine
refusals discard partial output; numerical stagnation rejects explicitly.
Documentation explains conventions, receipt scope, budgets and limitations.

Validation: relocation typecheck and the full Vitest suite passed on Node
22.22.2. `test/local-space-lines.vitest.ts` checks fresh engine receipt replay,
separate haversine distances, inverse bearings and Cartesian arc planes, both
directions, arbitrary origins, polar fallback, exact poles, zenith/nadir cases,
celestial-pole directions, antipodal endpoints, seam provenance, source
ownership, clocks, budgets, precision and refusals with synthetic births.
Root package dry-run exclusion, archive SHA-256, file-size, documentation
punctuation and diff-scope checks passed. Root `npm run package:contents`
still fails because `dist/calc.d.ts` is absent; no root build was run under
the rule forbidding writes to `dist/`. Engine CI gates requiring that build
remain deferred. No engine or packed files changed.
