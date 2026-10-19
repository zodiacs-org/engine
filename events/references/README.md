# JPL Horizons event references

The source is NASA/JPL Solar System Dynamics, Horizons DE441. Acquisition uses
its [HTTP API](https://ssd-api.jpl.nasa.gov/doc/horizons.html). Coordinate
semantics come from the [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html),
Observer Table quantity 31, "Observer ecliptic longitude & latitude".
These pages and the returned response headers were fetched and read during M6.

`cases.json` declares the windows, directions, definitions and acceptance
thresholds before engine comparisons. It is the acquisition input, not output
from the engine. `horizons.json` preserves the complete small responses,
request parameters, URLs, raw UTF-8 response digests, retrieval timestamp and
independently reduced TT event labels. No engine output enters either file.
The Mars square uses an invented fixed natal Sun longitude, with no birth data.

## Reproduction

From the repository root, with Python's standard library:

```sh
python3 events/scripts/horizons.py
python3 events/scripts/horizons.py --verify events/references/horizons.json
npm test --prefix events
```

Live acquisition writes `events/generated/horizons.json`, which is ignored.
It never overwrites the reviewed reference. Network requests run sequentially
and have a timeout and response size cap. Review new responses before copying
them into the committed fixture. A later server version, ephemeris or response
header can change the digest; byte-for-byte live regeneration is not promised.
Offline verification rechecks requests, digests, requested time coverage and
all event reductions. Normal tests require Python but no network for Horizons.
The existing npm package-isolation check is a local dry run.

## Definitions and limits

Requests use `500@399` (Earth geocenter), observer tables, TT input and output,
and hourly quantity 31 longitude in degrees. The response labels its longitude
as an apparent IAU76/80 ecliptic-of-date coordinate, including light time,
aberration and gravitational deflection. The engine uses its own true-of-date
frame and omits gravitational deflection. The references do not silently equate
these physical models. The declared timing thresholds allow differences in
frames, ephemerides, interpolation and station derivative conventions; they
are acceptance thresholds for these cases, not general error bounds.

For an ingress or aspect, the reducer forms a signed angular residual and
linearly interpolates its sign-changing hourly bracket. A moving aspect first
subtracts the independently requested longitudes at matching TT labels.
Far-side angular jumps are excluded. For a station it computes short-arc
longitude differences on successive hourly cells, assigns these secants to
cell midpoints, then linearly interpolates the sign-changing speed zero.
Thus a station reference approximates an extremum of Horizons longitude;
it is not a catalogued instantaneous derivative or an exact mathematical root.
The engine's speed instead uses its own shorter finite difference.

The ingress and aspect threshold is 10 minutes; the station threshold is
20 minutes. Both are enforced in [horizons.node-test.ts](../test/horizons.node-test.ts)
using the unchanged thresholds in `cases.json`, over exactly the windows
listed there: March 2023 for Sun ingress and a synthetic Mars square,
December 2022 for Mars-Sun opposition, and July and September 2023 for Venus
stations. These sparse date tests establish no coverage outside those windows,
no exhaustive event completeness and no millisecond physical accuracy.
Analytic reducer tests in [horizons_test.py](../scripts/horizons_test.py) check
angular wrapping, interpolation, quadratic extrema, pair alignment, malformed
responses and provenance tampering; those are numerical tests, not sky evidence.

## Attribution and redistribution

Credit NASA/JPL Solar System Dynamics, Horizons (DE441), for the response
numbers. These are publicly served numerical ephemeris facts, not copied
implementation code, fitted coefficients or proprietary atlas data. The
repository already carries public Horizons response inputs under the policy
recorded in [LICENSING.md](../../LICENSING.md), "Swiss Ephemeris exclusion"
and "The conformance suite". The Horizons API/manual pages and returned
responses state no separate data license. We do not label JPL's responses MIT
or extend this project's license to them. Retain this attribution and source
provenance when redistributing the fixture. No Swiss Ephemeris output is used.

## Paired passes near stations

[loop-cases.json](loop-cases.json) declares invented fixed longitudes for the
existing Venus station responses over July 22 to 24 and September 3 to 5,
2023, on TT. It links the original retrieval timestamp, full fixture digest
and individual response digests. The original request URLs, clock, frame,
response text and redistribution record remain in `horizons.json`; no new
download or engine output enters these references.

[loops.py](../scripts/loops.py) independently reduces every strict target
crossing by linear interpolation of the hourly rows. It verifies that each
window contains opposite-direction passes while both endpoint residuals have
the same sign. [turning-reference.node-test.ts](../test/turning-reference.node-test.ts)
checks default-engine discovery by window and unique direction, without using
a timing cutoff to hide a discovered pass. Separate checks run the scanner on
continuous cubic Hermite interpolation of the independent rows, using centered
secants for nodal slopes and one-sided secants at the edges. That interpolation
checks the numerical method; it is not another physical ephemeris.

The unchanged acceptance threshold is 600000 ms, declared in `loop-cases.json`
before engine comparisons. Default-engine timing fails this threshold for all
the paired dates. [station-loops.json](../evidence/station-loops.json) records
the failed timing verdicts separately from successful discovery. Maximum
absolute timing errors are rounded up to whole seconds. These are measurements
over only the declared source windows and targets, not bounds or accuracy
claims. Small longitude-model differences near a slow turning point can cause
large date differences; this change does not alter the parent's coordinates.

From the repository root, after building the local project:

```sh
python3 events/scripts/loops.py --verify events/references/loop-cases.json
node events/scripts/loop-report.mjs --check
```

Use `--write` on the report script only to regenerate its committed aggregate
evidence. The test suite reproduces it with `--check`, preserves timing
failures and enforces discovery counts and directions. Existing acquisition
fixtures, original cases and their acceptance checks remain unchanged.
