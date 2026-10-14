# Independent rule references

Eclipse avoidance references use selected published NASA GSFC catalog rows in
[avoidance-nasa.json](avoidance-nasa.json), with independent acquisition and
clock arithmetic. Station avoidance reuses the verified Horizons extrema
below. [AVOIDANCE.md](../AVOIDANCE.md) documents the model, attribution,
acquisition, checked spans and comparison thresholds.

Applying-aspect references reuse the verified Moon/Sun and planetary longitude
series below. [chart-horizons.json](chart-horizons.json) records independent
orb-entry and exact-exit windows with bound input digests. The policy, span,
reduction and comparison limits are documented in [CHARTS.md](../CHARTS.md).

Planetary-hour references use the parent US Naval Observatory ephemeris
fixture, bound by digest in [hour-cases.json](hour-cases.json), with expected
windows reduced by hand from the published rise/set minutes. [HOURS.md](../HOURS.md)
describes their date, clock comparison, terms and acceptance threshold.
These do not reuse the Horizons longitude series below.

Moon-not-void references extend this acquisition with the additional planetary
longitudes in [void-horizons.json](void-horizons.json). Their independent
reduction, declared span, policy comparisons and test-run receipt are described
in [VOID.md](../VOID.md). The source, clock, frame and redistribution terms
below apply to that reference as well. Its offline verifier also checks the
digest of the Moon/Sun source file reused from this milestone.

The astronomical source is NASA/JPL Solar System Dynamics, Horizons DE441,
queried through its [HTTP API](https://ssd-api.jpl.nasa.gov/doc/horizons.html).
The [Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html), Observer
Table quantity 31, defines the longitude convention. The API/manual pages and
returned response headers were fetched and read for this milestone.

[cases.json](cases.json) declares the reference series and acceptance thresholds
before engine comparisons. [horizons.json](horizons.json) preserves the raw
responses, request parameters and URLs, UTF-8 SHA-256 digests, retrieval time,
and independently reduced event labels. It contains no engine-produced
expected positions, instants or windows. No birth data is used.

Requests use the Earth geocenter, apparent observer ecliptic longitude of date
in degrees, and TT input and output. Returned headers label the frame IAU76/80
and include light time, aberration and gravitational deflection. The engine
instead uses its own true-of-date frame and omits gravitational deflection;
the Moon's series has the engine's documented correction convention. The
comparison retains these model differences. Numeric epoch labels in this
fixture are TT coordinates; they must never be presented as UTC timestamps.

## Reduction and reproduction

[scripts/horizons.mjs](../scripts/horizons.mjs) is an independent reference
reducer, outside the search library. It never calls the engine. For an ingress
or phase boundary it linearly interpolates a sign-changing hourly short-arc
longitude residual. Phase residuals subtract independently requested Moon and
Sun longitudes at matching TT labels. It rejects far-side wrap jumps. For a
station it assigns each hourly short-arc longitude secant to its cell midpoint,
then interpolates the speed zero between neighboring midpoints. This
approximates an extremum of the independent longitude series, not an exact
instantaneous derivative. Reference hourly brackets remain in the fixture.

From `electional/`, on the declared Node runtime:

```sh
node scripts/horizons.mjs --verify
npm test
node scripts/horizons.mjs --acquire
```

Verification is offline. It checks source metadata, exact requests, raw
digests, target identity, coverage, time scale and every reduction. Acquisition
uses bounded sequential network requests and writes only the gitignored
`generated/horizons.json` for review. It never overwrites the committed fixture.
Live response headers and server versions can change, so regeneration need
not be byte-identical. The reducer tests independently check wrapping, a
quadratic extremum and provenance tampering.

## Checked span and limits

[references.electional-check.ts](../test/references.electional-check.ts) compares
native delegated ingress and phase-sector dates across the entire series
from 2023-10-01 to 2023-11-01 TT. It also compares the assembled selected-sign
and New Moon/Full Moon windows against those independent boundaries.
Mercury station references span 2023-04-20 to 2023-04-23 and 2023-09-14 to
2023-09-17 TT; Venus references span 2023-07-22 to 2023-07-25 and
2023-09-03 to 2023-09-06 TT. Both changes of direction are checked for each
selected motion body, including the eligible side of its station window.

The acceptance thresholds are 600000 milliseconds for ingress and phase
boundaries, and 1200000 milliseconds for stations, enforced by the unchanged
values in cases.json and that test. They allow model, frame and interpolation
differences in these declared cases. They are not general error bounds,
physical uncertainty intervals, proof of event completeness or evidence for
any predictive interpretation. No comparison extends outside these series.
Native comparison requires an already built read-only events module; its
absence is reported as skipped integration, never as passing sky evidence.
The local run record is [m4-tests.json](../docs/evidence/m4-tests.json), with
runtime, test statuses, native-comparison status and source/reference digests.
It was produced by [record-m4-tests.mjs](../scripts/record-m4-tests.mjs) from
Vitest's JSON report generated by the command recorded in that file. The
summary is written to `generated/` first, then reviewed before carrying it
under `docs/evidence/`. It is a test-run receipt, not sky output used as an
expectation.

The separate [basic-windows.json](../test/fixtures/basic-windows.json) fixtures
derive interval ownership and state composition by hand on synthetic integer
labels. They establish set behavior and control flow only. Expected numerical
astronomical instants come exclusively from Horizons.

## Attribution and redistribution

Credit NASA/JPL Solar System Dynamics, Horizons (DE441), for the numerical
response data. These are publicly served ephemeris facts, not copied code,
fitted coefficients or proprietary atlas material. This follows the public
Horizons input policy recorded in the parent [LICENSING.md](../../LICENSING.md),
"Swiss Ephemeris exclusion" and "The conformance suite". The fetched API,
manual and responses state no separate data license. This workbench's MIT
license applies to its code and documentation; it does not assert a new license
for JPL's responses. Retain this credit, clock, frame and acquisition provenance
when redistributing the reference. No Swiss Ephemeris material is used.
