# Fixed-star library and CLI plan

Complete the next unchecked milestone, run its checks, mark it complete, and
append a session summary to CHANGES.txt. Stop after that milestone (or an
explicitly chosen pair). The harness owns commits, pushes, and the draft PR.

- [x] M1 Establish an isolated TypeScript project, catalog contracts, a direct engine source bridge, and synthetic integration and geometric tests.
- [x] M2 Fetch and read redistributable astrometry sources and primary historical lore sources; commit source, licence, coordinate-frame, epoch, and proper-motion provenance before importing data.
- [x] M3 Generate and commit a small named bright-star catalog within the requested size range, with aliases, source locators, optional proper motion, historical attribution tags, and validation tests.
- [x] M4 Propagate catalog proper motion and rotate positions onto the chart's true equator and ecliptic with the engine frame, equator, nutation, and time-basis helpers; document and test hand-derived geometry.
- [ ] M5 Implement pure conjunction and parallel matching with explicit angular orb units, inclusive boundaries, structured star ids and contact kinds, deterministic ordering, and independent geometric tests.
- [ ] M6 Cast synthetic natal inputs through the engine, include bodies and available angles, preserve native natal receipts, and expose the chart-hit library API with explicit coordinate conventions.
- [ ] M7 Prove an isolated catalog-vector adapter can execute the existing src/sky/riseset.ts solver without editing or copying its algorithms; verify vector substitution is scoped, ordinary bodies are unchanged, and incompatible engine source is refused.
- [ ] M8 Expose catalog rise, set, upper transit, and lower transit searches through that adapter, including solver budgets, complete refusal, circumpolar flags, and explicitly labelled engine-call provenance.
- [ ] M9 Implement paran event pairing for bodies and angular contacts over an explicit observer window, with a configurable time orb, native body-sky results, star-sky provenance, and synthetic simultaneous-contact expectations.
- [ ] M10 Implement the fixedstars list, fixedstars hits, and fixedstars parans CLI commands, strict options, JSON output, meaningful exit codes, and end-to-end synthetic tests.
- [ ] M11 Extend independent geometric coverage for wraparound, poles, proper-motion conventions, frame consistency, unavailable angles, horizon tangencies, event-window boundaries, and sample-budget exhaustion.
- [ ] M12 Finish library and CLI usage documentation, source attributions, limitations, evidence references, and isolated verification of tests, types, file sizes, and engine-package exclusion.

## Boundaries

All authored files belong under fixedstars/. The engine's src/, dist/, root
package manifest, packed documentation, archives, and git metadata stay as they
are. This private checkout tool uses relative engine source imports; it does
not introduce an engine export or a release candidate. Generated downloads,
bundles, caches, and bulk tables belong in locally ignored directories. Code
and original documentation use the repository's MIT licence; source data keeps
its verified redistribution terms and attribution. Tests and examples use
synthetic inputs. Historical lore describes attributed beliefs, not facts.

## Integration findings to carry forward

The engine exposes its precession and nutation internally through frame.ts
and equator.ts. onChartClock supplies the chart's TT and UT1 consistently,
including a caller's time scale and pinned deltaT. Those modules can be read
through relative source imports without changing the engine build.

The existing skyEvents and searchEvents in src/sky/riseset.ts accept only
Solar System bodies. stateAt closes over GeoVector; there is no custom-vector
parameter. M7 must resolve this through a local, scoped dependency adapter
while continuing to run the existing solver. A separate star search algorithm
or a copy of the rise/set implementation does not meet the requested scope.
An isolated bundle-time substitution of the vector import is a candidate
approach to verify, not a completed capability.

createNatalEnvelope supplies a native engine natal receipt. skyEvents returns
events, conventions, flags, and sample counts, but no native receipt. Future
sky provenance must retain those fields and engine identity and explicitly
say that it is a fixedstars call record, without claiming native receipt
support or an accuracy certification.

## Source decisions to carry into M3

sources/manifest.json and sources/retrieval.json pin HYG v4.1, its licence
and documentation, the author's HYG build notes, ESA's Hipparcos conventions,
and the original Ashmand edition. sources/README.md explains the import
contract and the limitations of the source-frame inference. Only HIP-backed
HYG rows are eligible initially. Preserve their raw selected rows and HYG/HIP
locators. Rotate both the interpreted ICRS direction and its motion tangent
through the existing engine bias matrix before producing a CatalogStar on
J2000 mean equator/equinox axes. Do not silently relabel the input or apply
Hipparcos's original epoch shift a second time.

The extracted/transformed HYG catalog and raw selected-row fixture will be
CC BY-SA, with notices describing selection and conversions. Keep that data
licence distinct from the original MIT code. sources/lore-passages.json holds
short transcriptions checked against the original printed pages. Preserve
named-star, described-group and constellation scope, graded wording, and
the explicit historical-attribution label. The Sacred Texts files remain
unimported because of their stated file-use condition and different pagination.

M2 checks passed on Node 22: local Vitest, TypeScript, source digest re-fetch,
and the isolation check. No catalog rows or engine-package files were added
or changed in this milestone.

## M3 completion and M4 handoff

src/catalog-data.ts now holds the catalog selected by sources/selection.json.
sources/hyg-selected.json retains the exact raw selected CSV records from the
digest-verified HYG stream. The generated catalog, raw fixture and selection
metadata retain CC BY-SA terms; original code remains MIT. The importer uses
the existing engine bias matrix on both direction and motion tangent, with
hand-derived rotation and first-order bias checks in GEOMETRY.md and the
catalog tests. Regeneration is a provenance check, not accuracy evidence.

The public source API exports a frozen catalog and findStar. Catalog records
include HYG/HIP locators and explicit source-frame inference. Historical
attributions retain passage ids, subjects, scopes, identification notes and
graded tags. Unsupported lore is left empty with an omission reason. The
Gemini excerpt's separate Apollo and Hercules clauses remain separate.

M4 starts from J2000 mean-equator/equinox directions and tangent components
already converted into that frame. Do not apply frame bias or a Hipparcos
epoch shift again. Follow the chart's TT clock for subsequent motion and the
engine's true-of-date matrices. The catalog import intentionally omits
parallax, perspective acceleration, annual aberration and light deflection.

M3 validation passed on Node 22: local Vitest, TypeScript, offline catalog
regeneration, digest-verified remote selection, and the isolation check.
The parent package:contents command was attempted but cannot pass in this
checkout because dist/calc.d.ts is absent. The session's hard rule forbids
creating an engine build. The isolation check's package dry run confirms
fixedstars is excluded; it does not claim the absent engine build's budgets
were checked. All authored changes remain under fixedstars/.

## M4 completion and M5 handoff

src/positions.ts exports propagateStarDirection, starPositionAtTt and
starPositions through the library index. Motion advances and normalizes the
J2000 transverse tangent on TT Julian years. Both true-of-date rotations use
the existing engine equatorRows/eclipticRows helpers; the clock wrapper uses
onChartClock, with UTC/UT1/TT and optional pinned deltaT. No second frame bias
or original Hipparcos epoch shift occurs. Missing motion remains explicit.
The model's omitted corrections and lack of physical accuracy bounds are
documented in README.md and GEOMETRY.md.

Position rows include star ids, elapsed epoch, J2000 direction and angular
coordinates in degrees. Numerical poles have null longitude or RA and explicit
defined flags. M5 must handle unavailable longitude rather than assign it zero;
declination remains available for parallels. Output preserves caller order and
refuses duplicate ids. The wrapper returns the native time-basis record without
casting a chart or claiming a chart/sky receipt. M6 will attach chart receipts.

tests/positions.fixedstars.ts documents hand-derived tangent expectations and
checks Cartesian basis directions against the parent's independent ERFA frame
fixture across its TT epochs. Catalog frame consistency, constructed poles and
synthetic chart clocks are explicitly integration checks. The tests do not use
saved library output as an accuracy reference.

M4 validation passed on Node 22.22.2: local Vitest, TypeScript, offline catalog
regeneration and file/package isolation. The parent package:contents check
still fails because dist/calc.d.ts is absent; the session's hard rule forbids
creating an engine build. The isolation check confirms fixedstars exclusion
with a package dry run, without claiming the missing build's budgets passed.
All authored changes remain under fixedstars/.
