# Fixed stars

This private source-checkout project is being built according to
[PLAN.md](PLAN.md). It supplies a licensed catalog, source provenance, and a
direct bridge to the parent engine with synthetic integration and geometric
tests, and proper-motion propagation and true-of-date stellar positions.
Contact matching, parans, and the CLI are pending milestones.

Use Node as specified by this folder's package.json. Install and check only
this project from the repository root:

```sh
npm --prefix fixedstars ci
npm --prefix fixedstars run typecheck
npm --prefix fixedstars test
npm --prefix fixedstars run catalog:check
npm --prefix fixedstars run check:isolation
```

The engine is consumed by relative imports from its existing source. This
folder has its own lockfile and pinned ephemeris dependency, resolved locally
by the test configuration and TypeScript paths. Its tests do not need a
parent engine build or installation. The engine's packed files and export
map are unchanged. The bridge uses internal source APIs, so a different
engine checkout must be checked again; this is not a standalone npm package.
The tests use explicit .fixedstars.ts or .fixedstars.mjs suffixes and local
Vitest configuration to stay outside the parent engine's default test discovery. The isolation
check enforces the file-size and documentation-character constraints and
checks package exclusion with a parent package dry run that skips scripts.

Catalog contracts use degrees for right ascension and declination and
milliarcseconds per Julian year for proper motion. Right-ascension proper
motion includes the cosine of declination. Missing motion is explicit.
Each historical lore tag must carry an author, work, locator, source, and
the label historical-attribution. These tags describe historical beliefs
and do not assert physical or predictive effects.

[GEOMETRY.md](GEOMETRY.md) derives the expectations used in the geometric
tests. Integration tests exercise chart receipts and the existing sky
solver's refusal semantics; they do not measure stellar astrometric accuracy.
The sky custom-vector limitation and receipt distinction are recorded in
PLAN.md for the later adapter milestone.

Original code and documentation use the repository's [MIT licence](../LICENSE).
Source decisions, pinned retrieval receipts and short historical passages
are in [sources/README.md](sources/README.md). The selected HYG catalog data
retain CC BY-SA terms. [LICENSING.md](LICENSING.md) and [NOTICE.txt](NOTICE.txt)
state the redistribution terms and required attributions. Bulk generated
tables and downloads belong in ignored folders.

## Catalog snapshot

The catalog contains 44 HIP-backed named bright stars, enforced by
[tests/catalog.fixedstars.mjs](tests/catalog.fixedstars.mjs) over the full
selection in [sources/selection.json](sources/selection.json). This is a
curated selection, not a complete historical list. HYG names label specific
selected components; they do not resolve every member of a multiple system.
Coordinates describe the J2000 mean equator/equinox at the J2000 epoch.
The source-frame interpretation is an inference described in the source notes;
the catalog is not an independent astrometric arbiter and has no measured
error bound. It includes direction and optional angular motion, without
stellar parallax, perspective acceleration, annual aberration or light
deflection.

```ts
import { catalog, findStar } from "./src/index.js";

const star = findStar("Spica");
console.log(star?.raDeg, star?.decDeg, star?.properMotion);
console.log(star?.historicalAttributions);
console.log(catalog.map(({ id, name }) => ({ id, name })));
```

These are TypeScript source imports for a runner or bundler, not emitted
JavaScript files. The catalog and all nested records are frozen. findStar
returns the matching record or undefined; it matches an id, name or alias
case-insensitively after trimming outer whitespace. Empty or non-string
queries throw RangeError. Bayer/Flamsteed, HIP and HR aliases come from HYG;
historical aliases name their passage in the selection metadata. Unsupported
lore identifications remain empty, with a reason in the selection record.
Scope and graded wording are preserved: a constellation attribution does
not claim that the passage names every star individually.

Regenerate only this folder's catalog, without an engine build:

```sh
npm --prefix fixedstars run catalog:build
npm --prefix fixedstars run catalog:check
npm --prefix fixedstars run catalog:fetch
```

The first command rebuilds from committed selected raw rows. The second
checks for identical generated source. The third explicitly streams the
pinned remote HYG file, verifies its digest and header, retains only selected
raw records, and rebuilds. It never writes the bulk source catalog to disk.
The import compiler runs in memory and consumes the existing engine helpers.
Regeneration checks prove traceability and arithmetic consistency; the
independent geometric cases in GEOMETRY.md test the conversion's construction.

## Positions on a chart clock

```ts
import { catalog, starPositions } from "./src/index.js";

// Invented instant, with the same clock fields accepted by natalChart.
const result = starPositions({ utc: "2000-03-20T06:00:00Z" }, catalog);
console.log(result.positions, result.timeBasis, result.conventions);
```

starPositions defaults to the committed catalog. A supplied array selects stars
in caller order and must have unique ids. Its clock fields are utc, timeScale
and deltaT, resolved through the existing engine onChartClock helper. Positions
use TT for both motion and frame orientation, including a caller's pinned
deltaT. The native time-basis record describes that resolution; this function
casts no chart and makes no sky search, so it does not create either receipt.

Each row carries starId, ttDays, elapsedJulianYears, directionJ2000, motion,
lonDeg, latDeg, raDeg and decDeg. Longitudes and RA are degrees in [0,360);
latitudes and declinations are north positive. A numerical pole has null RA
or longitude and a false raDefined or lonDefined flag. The engine's
RA_POLE_TOLERANCE governs that singularity convention. The position rows,
their direction vectors and the positions array are frozen.

propagateStarDirection is a pure vector calculation on the catalog's J2000
axes. It uses the cosine-weighted RA motion and declination motion as tangent
components, advances a linear tangent vector over elapsed Julian years, and
normalizes the resulting direction. Null motion leaves the catalog direction
unchanged and reports unavailable; tabulated zero remains available motion.
starPositionAtTt accepts days of TT from J2000 and applies the existing
engine's eclipticRows and equatorRows true-of-date rotations. It and the clock
wrapper refuse instants outside the engine EPHEMERIS_SPAN. A catalog pole
with nonzero motion is refused because its RA tangent convention is undefined.

These positions omit radial motion, stellar parallax, perspective acceleration,
annual aberration and gravitational deflection. They are rotated catalog
directions with transverse motion, not fully apparent stellar places. Natal
bodies have the engine's own corrections, so comparisons with stars must
retain this difference in conventions. No physical accuracy bound is claimed.
[GEOMETRY.md](GEOMETRY.md) derives the motion and rotation checks in
[tests/positions.fixedstars.ts](tests/positions.fixedstars.ts), distinguishes
independent ERFA comparisons from engine integration checks, and names their
reference span.

