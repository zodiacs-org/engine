# rc.11 continuation: scope and checks

Recorded 2026-09-28, before the candidate's independent checks. Base:
`f5f33892a95cd0d6cd4a11a80e66f802b11bccfa` (rc.10). The programme is the
site's `docs/platform/ENGINE-AND-PLATFORM-BRIEF.md`, version 2, Phase 2 A3.
This is a feature slice, not completion of Phase 2 or a precision-provider
release. The separate site continuation adopts rc.10 and preserves the
pending deployment-budget fix in site PR #588.

## Scope

- Explicit configurable longitude-aspect policies, including minor angles,
  per-aspect and per-body orb limits, and applying/separating/stationary rules.
- Equatorial coordinates derived from the chart's full ecliptic longitude
  and latitude using true obliquity at the chart instant and its pinned or
  model Delta T; parallel/contra-parallel and out-of-bounds checks.
- Preserve the existing natal, transit, synastry and receipt conventions.
  New analyses are separate results; the existing natal envelope does not
  attest to them.

## Required checks

1. Existing typecheck, full test suite, build, export and package gates.
   Baseline before edits: 25 files / 2,526 tests passed on Node 24.19.0.
2. Named mathematical and input-boundary fixtures for every new aspect
   definition, policy precedence, exact angles, circular wrap and motion.
3. Independent arithmetic checks of coordinate rotation and aspect rules.
   Distinguish the precision of transforming identical input vectors from
   the astronomical accuracy of the underlying ephemeris.
4. Finite comparison of legacy outputs with the immutable rc.10 package,
   including all 13 house systems, polar cases, unknown time, historical
   dates, reference-span edges and pinned Delta T. The only permitted
   metadata difference is the candidate engine version.
5. Install the exact packed candidate in a fresh consumer and exercise its
   runtime exports and TypeScript declarations. Record SHA-256 and package
   size. Do not widen an existing size gate to pass the candidate.
6. Independent review of the new API, error cases and claims. Record any
   limitations and unresolved programme gates in RESULTS.md.

## Claims excluded

This change does not replace astronomy-engine, change the physical reduction,
or establish superiority to Swiss Ephemeris. The brief's physical declination
target of 0.01 arcsecond against Swiss remains a separate gate; mathematical
rotation tests cannot establish it. No claim of proven event completeness,
absolute sky error bounds, or validity of astrological interpretation is made.
No new bulk Swiss output or kernel data is added to the package.
