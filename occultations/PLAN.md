# Occultations implementation plan

Work only in `occultations/`. Each session implements the next unchecked
milestone, runs its checks, ticks it, appends a line to `CHANGES.txt`, and
stops. The external harness owns git commits and draft PR updates. No root
package, source, build output, archive or release changes are part of this plan.

- [x] M1 Establish the private TypeScript package, local test/build tooling,
  strict instant/window/observer validation, a receipted engine position
  adapter, and initial geometry/provenance design. Verify isolation from the
  engine package. Adapter tests establish integration, not sky accuracy.
- [x] M2 Establish explicit public-domain catalogue provenance and a
  reproducible compact subset generator. Include Regulus, Spica, Antares,
  Aldebaran, Pleiades members and other eligible bright stars; document
  selection, aliases, multiplicity, magnitude and missing-motion policies.
  Commit only compact source records; ignore downloaded and generated bulk data.
- [x] M3 Implement catalogue epoch and proper-motion propagation, parallax
  where available, and consistent apparent star frames using the engine's
  frame/nutation/time machinery. Check against independent astrometric
  references and analytic geometric cases.
- [x] M4 Freeze cited independent published reference cases and maximum-error
  criteria before event fitting or tuning. Separate development cases from
  held-out lunar contacts, planetary appulses and global visibility cases;
  record reference time scales, stations, limb conventions and precision.
- [x] M5 Search geocentric conjunctions in right ascension and ecliptic
  longitude through `src/crossings.ts`. Implement explicit window ownership,
  wrap handling, budget refusals, seam handling and receipts; test boundaries
  and independent conjunction references.
- [x] M6 Find close Moon/planet and planet/planet appulses by spherical
  separation minima. Distinguish them from coordinate conjunctions; support
  caller-supplied angular limits, bounded searches and independent tests.
- [x] M7 Identify geocentric lunar occultation candidates and series using
  target distance, lunar radius and the terrestrial parallax envelope.
  Separate geocentric disk overlap from possible observer occultation; test
  series membership, near misses and candidate completeness on reference windows.
- [x] M8 Solve topocentric spherical-limb contacts for stars and planetary
  disks. Report disappearance/reappearance and partial/full disk contact
  semantics, grazing/ambiguous outcomes and clipped-window contacts; compare
  against preregistered independent published times.
- [x] M9 Add contact position angles, bright/dark/terminator limb, Sun
  altitude, Moon phase and horizon facts using existing engine sky/rise-set
  machinery. Define refracted versus geometric quantities and test polar,
  daylight and horizon cases without ranking observing dates.
- [x] M10 Compute coarse global visibility outlines from a Besselian-style
  fundamental plane and Earth ellipsoid intersections. Return northern and
  southern latitude intervals per longitude band, dateline/polar cases and
  sampling uncertainty; compare limits with independent published outlines.
- [x] M11 Finish the window API and small offline JSON CLI with receipts on
  every event, search refusal and visibility result. Test parsing, reproducible
  serialization, bounded resource use and factual output.
- [ ] M12 Run the held-out validation suite with explicit maximum errors in
  seconds, document measured scope and unresolved cases, and finish the
  accuracy budget, source/licence audit, usage examples and isolation checks.
  Complete deferred reference quantities, including separately calculated
  local closest approach, before claiming full source-case coverage.

An unchecked milestone is a requirement still to implement, not a claim that
its design or accuracy has already been established. Numerical acceptance
criteria must be recorded with their sources before running those comparisons.
