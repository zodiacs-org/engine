# Broader Horizons station and ingress sample

This sample adds independently selected reference windows to the phase 1
fixtures. It does not replace `cases.json`, `horizons.json` or the paired-pass
references. The source is NASA/JPL Solar System Dynamics,
[Horizons observer tables](https://ssd.jpl.nasa.gov/horizons/manual.html).
Requests follow the [Horizons API](https://ssd-api.jpl.nasa.gov/doc/horizons.html).
The API's time-type definition and the manual's Observer Table quantity 31
were fetched and read for this acquisition.

## Selection before engine comparisons

[horizons-sample-plan.json](horizons-sample-plan.json) declares the body-years,
selection rule and acceptance thresholds. The rule takes the first station
and the first tropical sign ingress in each direction found in an independent
daily table for each body-year. It then requests an hourly table over the
daily bracket, padded outward by a day and clipped to the surveyed year.
The engine supplies neither the selection nor a reference time.

The declared surveys are Mercury in 1900, Venus in 1950, Jupiter in 2000,
Mars in 2001, Saturn in 2050 and Neptune in 2100. They are sparse body-year
samples spanning the endpoints of the requested period, rather than a
continuous inventory. An unavailable direction is recorded in
`absentFromDailySelection`; that means the daily selection found no candidate,
not that astronomical absence was established. In particular, Jupiter's direct
station and several retrograde ingress directions are absent from this
selection. No case is silently replaced by another body-year.

The unchanged thresholds are 600000 ms for ingresses and 1200000 ms for
stations, as in the original date checks. They were declared before engine
comparisons and are acceptance criteria for the selected windows, not physical
error bounds. [horizons-sample.node-test.ts](../test/horizons-sample.node-test.ts)
binds the plan and checks the sample's scope and search behavior.

## Acquisition and offline reproduction

From the repository root:

```sh
python3 events/scripts/horizons_sample.py
python3 events/scripts/horizons_sample.py --verify events/references/horizons-sample.json
python3 events/scripts/horizons_sample_test.py
npm test --prefix events
```

Live acquisition is sequential and bounded by response and fixture size checks.
It writes only `events/generated/horizons-sample.json`, an ignored candidate.
Review its requests, headers, reductions and size before copying it to the
committed reference. Downloads are not needed by normal tests. Later server
headers or ephemeris revisions can change source digests and reference dates;
live acquisition does not promise byte-identical regeneration.

[horizons-sample.json](horizons-sample.json) records each request's parameters,
source URL, UTC retrieval timestamp, full-response SHA-256 and byte size. It
also contains a hashed excerpt of the source header and complete numerical
table. The extraction omits the contact footer and the EOP file/coverage lines;
the full raw response is not committed. Offline verification checks excerpt
digests, target identity, Earth geocenter, TT labels, row cadence, window
coverage, deterministic daily selection and hourly reductions. The recorded
full-response digest was calculated during acquisition; offline checks cannot
recompute it from the excerpt or authenticate a remote source.

The retained headers identify the actual ephemerides for each target and
center. Mercury and Venus use DE441. The other returned target solutions
include `jup365_merged`, `mar099`, `sat441l` and `nep098_merged`. The Neptune
responses also label the Earth center `nep098_merged`; this sample does not
describe all body centers as DE441. Tests reject a different target command
or a different observing center.

## Reduction and clocks

Quantity 31 gives apparent geocentric IAU76/80 ecliptic-of-date longitude,
including light time, stellar aberration and gravitational deflection.
The engine's true-of-date frame and correction conventions differ as described
in [README.md](README.md). Both request and result labels are TT. Epoch
milliseconds in the fixture are TT coordinates, with no conversion to UTC.
The retrieval timestamp, separately, records when the HTTP response arrived.

Ingress reduction interpolates a near-side signed longitude crossing of a
tropical sign boundary. Station reduction forms short-arc longitude secants,
assigns them to cell midpoints and interpolates a sign change. These are
extrema of sampled apparent longitude, not catalog entries for an analytic
instantaneous derivative. The engine uses its own shorter finite difference.

An observed run of exact zeros is accepted only between opposite nonzero
signs; its estimate is the midpoint of the zero-valued sample times. A
same-sign touch and an unconfirmed edge zero are omitted. `bracketMs` retains
the surrounding nonzero rows or secant midpoints, including rounded-zero
secants in the Neptune station response. This is a reference sampling bracket,
not the engine's numerical root enclosure or a physical confidence interval.
Hidden turns between daily or hourly samples remain possible. Analytic and
tampering checks in [horizons_sample_test.py](../scripts/horizons_sample_test.py)
exercise these reduction rules without engine output.

## Search comparisons

[horizons-sample-timing.json](../evidence/horizons-sample-timing.json) records
discovery separately from timing acceptance over only the selected hourly
windows. [sample-timing.mjs](../scripts/sample-timing.mjs) reproduces the
measurement after a local build:

```sh
node events/scripts/sample-timing.mjs --check
```

Use `--write` only to regenerate the evidence. Matching uses body, kind,
direction and ingress longitude before applying the declared timing threshold.
Both the original hourly scan and the station-aware daily scan with six-hour
speed cells find the selected identities. The Saturn ingress in 2050 fails
the unchanged ingress timing threshold under both policies. The evidence keeps
that failure, with absolute timing errors rounded up to whole seconds; tests
reproduce its verdict instead of widening the threshold. No physical error
bound or full-span completeness claim follows from these source windows.

## Attribution

Credit NASA/JPL Solar System Dynamics, Horizons, for the numerical source
facts. The attribution and redistribution record in
[README.md](README.md#attribution-and-redistribution) also applies to these
excerpts. They retain their source provenance; this project's MIT license
does not assign a new license to JPL's responses. No Swiss Ephemeris material
or personal birth data is used.
