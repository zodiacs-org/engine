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
