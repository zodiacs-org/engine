# Independent arithmetic checks: fixed scope

Recorded before comparing the candidate's new exports. These checks use Python's standard-library trigonometry and deterministic synthetic inputs, with a Node bridge only to call the built candidate. They do not reuse candidate expectations, existing tests, or any physical ephemeris reference.

## Premises to challenge

- Folding circular longitude separation into [0, 180] introduces corners at 0 and 180 degrees. Away from an exact target, either direction at a fold can initially decrease an aspect's orb. A signed derivative valid away from those corners is insufficient there.
- Exact aspects with nonzero relative speed separate under forward linear motion; equal or sufficiently close speeds are stationary under the documented threshold.
- Per-body caps and motion caps must follow the published combination rule and never silently widen a stricter cap. Boundary equality, one-body versus two-body caps, and pair reversal need explicit cases.
- RA in degrees and RA in hours differ by 15. Rotation must include latitude, retain the correct quadrant, and handle longitude wrap.
- RA is undefined at an equatorial pole. Near a pole, RA alone is an ill-conditioned error measure; compare reconstructed unit vectors as well.
- Declination aspects use signed latitude-like angles, not circular longitudes. Zero declination can satisfy both numerical parallel and contra-parallel conditions if the published API intentionally reports both.
- Rotating the same input vector checks the transformation only. It cannot certify the input ephemeris, time model, obliquity model, or agreement with Swiss Ephemeris.

## Deterministic families and acceptance

Rotation fixtures cover cardinal and quadrant longitudes, nonzero positive/negative latitudes, ecliptic poles, equatorial poles, near-pole positions, and deterministic additional points. Python constructs an ecliptic unit vector, applies an x-axis rotation, and reconstructs the candidate's output vector. Maximum Euclidean unit-vector discrepancy must be at most 5e-13 (a numerical transformation gate, not an astronomical accuracy target). Explicit RA degree/hour consistency and stated null-pole behavior are checked separately.

Aspect fixtures cover every published named angle, synthetic interior angles, both signed orientations, forward/backward relative speeds, speed threshold equality, exact targets, exact 0/180 folds, wrap, orb equality and just-outside limits, body-cap precedence, motion filters, and pair reversal. Expected motion comes from the change in independently folded orb under linear forward motion, with the documented stationary threshold handled first. Expected membership uses the published policy semantics; the bridge does not compute expectations. Discrete outcomes must match exactly; reported degree values may differ by at most 1e-10.

Declination fixtures cover same/opposite signs, zero, both poles, exact parallel/contra-parallel equality, just-outside limits, body caps where supported, and out-of-bounds equality. Pure synthetic arithmetic is independent of any astronomical provider.

API names and JSON field names will be adapted to the released signatures without changing these premises or tolerances. Unsupported families will be identified explicitly, not counted as passed. Record the built-artifact and script hashes with each run. Preserve failures and any rerun following a source fix.
