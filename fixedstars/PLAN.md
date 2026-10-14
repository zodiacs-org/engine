# Fixed-star library and CLI plan

Complete the next unchecked milestone, run its checks, mark it complete, and
append a session summary to CHANGES.txt. Stop after that milestone (or an
explicitly chosen pair). The harness owns commits, pushes, and the draft PR.

- [x] M1 Establish an isolated TypeScript project, catalog contracts, a direct engine source bridge, and synthetic integration and geometric tests.
- [x] M2 Fetch and read redistributable astrometry sources and primary historical lore sources; commit source, licence, coordinate-frame, epoch, and proper-motion provenance before importing data.
- [ ] M3 Generate and commit a small named bright-star catalog within the requested size range, with aliases, source locators, optional proper motion, historical attribution tags, and validation tests.
- [ ] M4 Propagate catalog proper motion and rotate positions onto the chart's true equator and ecliptic with the engine frame, equator, nutation, and time-basis helpers; document and test hand-derived geometry.
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
