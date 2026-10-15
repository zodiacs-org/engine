# Independent station reference intake

This record covers the synthetic calendar year 2000 TT and the required
Chiron, Ceres, Pallas, Juno and Vesta targets. It establishes independent
reference brackets, not a full-range event-completeness or physical-orbit
accuracy claim. `tests/station-reference.test.ts` replays the retained original
Horizons sources and enforces the statements below. Package station agreement
is checked separately by the station integration tests.

The references use Horizons geocentric ICRF vectors with receive light time
and stellar aberration, reduced with the pinned ERFA IAU 2006/2000A true
ecliptic and equinox of date. Every original response matches the full-range
source identity; Chiron also matches the pilot identity. The record includes
the target orbit solution, Earth solution, perturber solution, orbit epoch
and state, and EOP file. These are retained-source identities, not assertions
about the current live service. Every requested reference epoch is excluded
from both coefficient-training corpora. No fitted position or prior package
station result selects a reference epoch or expected value.

`STATION_REFERENCE_RECIPE` in `src/station-reference.ts` freezes the method
and acceptance gates before package station evaluation. A daily coarse scan
uses independently reduced longitude positions and sixth-order centered
derivatives with steps of one and two days. Both stencils must agree on each
sample's sign. Each daily sign-change bracket is subdivided into 32 intervals
twice, using independent seven-position derivatives with quarter-day and
half-day steps. Each derivative stencil stays within one original response;
no derivative mixes numerical values from separate requests. Refinement
requires the two rates to agree within 0.01 arcseconds per day and on their
signs. The source velocities are never used as a reference rate.

Final reference brackets must be at most 85 seconds wide. The preregistered
package timing gate is containment in that independently signed bracket,
expanded by 300 seconds on each side. The returned `jdTt` is only the bracket
midpoint, not a claimed exact event time. The two stencil signs and convergence
checks provide finite numerical evidence; they are not a mathematical interval
certificate or a bound on physical small-body orbit uncertainty.

The retained references contain both directions for Chiron, Ceres, Juno and
Vesta, and one retrograde-to-direct event for Pallas in this calendar interval.
The source tests enforce those observed counts and directions. They also
exercise analytic direction changes, longitude wrap, missing stencil values,
source corruption, target substitution and disagreement between reference
stencils. The complete potential refinement lattice is checked against both
training epoch sets, and each actual request repeats that disjointness check.

The first recipe stopped after its Chiron coarse scan because a candidate
refinement stencil overlapped a training midpoint. No package station was
evaluated. `STATION_REFERENCE_RECIPE_V1` preserves that recipe; the revised
recipe shifts the scan phase by 0.000003 days and keeps every stencil,
subdivision, convergence and timing limit unchanged. The rejected original
scan remains in the ignored intake cache. This was a source-selection
failure, not an accuracy result or a reason to weaken an acceptance gate.

From `minorbodies/`, with Node 22 and the pinned reference environment:

```sh
node --experimental-strip-types scripts/capture-station-reference.ts --capture
node --experimental-strip-types scripts/capture-station-reference.ts --replay
node node_modules/vitest/vitest.mjs run --config vitest.config.ts tests/station-reference.test.ts
```

Capture writes candidate original sources and derived reports only under
ignored `generated/station-reference-sources/`, with cached requests under
ignored `.cache/horizons-stations/`. The retained fixture manifests bind
the reviewed original capture files and generator implementation. Replay
reconstructs every adaptive request from independent source signs, checks
those files and hashes, then reruns ERFA. Missing original sources or the
pinned Python environment fail explicitly; no network fallback is used.
