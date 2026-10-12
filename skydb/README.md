# Sky database tools

This private Node project consumes the repository's carried engine archive by
relative file dependency. It does not build or alter the engine package.
Configuration, direct position sampling and a compressed position tile codec
and lazy tile generation are implemented. Events, persistence and queries remain
planned in [PLAN.md](PLAN.md).

Use a Node runtime in the series required by [package.json](package.json), with
its matching npm on PATH. From the repository root:

```sh
node skydb/scripts/setup.mjs
npm --prefix skydb test
```

Setup verifies the archive against the fixed identity in
[src/identity.mjs](src/identity.mjs) and the carried archive manifest before
installing. Subsequent setup uses the committed lockfile with npm ci. Install
scripts are disabled. Dependencies and the npm cache stay inside ignored
project folders. The archive hash authenticates the local input against the
committed pin; it is not a signature. Installed dependencies are trusted local
files, restored by setup, rather than checked byte by byte at each call.

`loadEngine()` in [src/engine.mjs](src/engine.mjs) loads only the project's own
installed engine. Its `sample(epochMilliseconds, config)` returns selected
planet rows with longitude and latitude in degrees and longitude speed in
degrees per day. Coordinates and corrections are the engine root position
API's tropical geocentric ecliptic of date conventions. The UTC input basis
uses the engine's historical and future UT1 fallback as described in the
repository README. It is not a uniform TT clock.

[src/config.mjs](src/config.mjs) defines the half-open coverage, default
cadence and tile duration. Configuration takes integer epoch milliseconds,
positive sample and tile durations in milliseconds, and unique body names.
The tile duration must be divisible by the sample step. The default body list
includes the luminaries and planets; true lunar nodes are excluded because
their jitter requires a separate event and interpolation policy. Only UTC
input is currently supported. Returned configuration and body lists are frozen.

[test/bootstrap.test.mjs](test/bootstrap.test.mjs) enforces the defaults,
coverage endpoints, archive pin, invalid-input rejection and exact agreement
with direct calls at its synthetic instants. This is consumer agreement,
not independent evidence of astronomical accuracy or interpolation error.

Project code and documentation use the repository MIT licence. The installed
engine is MIT AND CC-BY-4.0; retain its LICENSE, LICENSING.md and NOTICE when
redistributing it. Generated data attribution will be recorded with the sample
tiles when that milestone is implemented. Full generated data belongs in the
ignored `generated/` folder and must not be committed.

The lossless position codec is [src/tile.mjs](src/tile.mjs).
[FORMAT.md](FORMAT.md) defines the envelope, records and validation rules.
[test/tile.test.mjs](test/tile.test.mjs) checks serialization agreement on
synthetic records and rejects corrupt or malformed tiles. These checks do not
measure interpolation error or astronomical accuracy.

`planPositionTiles(config)` and `generatePositionTiles(config)` in
[src/generate.mjs](src/generate.mjs) iterate descriptors and encoded tiles,
respectively. The asynchronous generator loads the pinned consumer and yields
`{ index, startMs, endMs, lastSampleMs, bytes }`; it does not write files.
Consumption is lazy and retains only the current tile's samples internally.
Tile durations are anchored to the requested start, with the final tile clipped
to the requested end. Configurations that exceed the codec's raw capacity are
rejected before sampling; shorten the tile duration or increase the sample step.

Each tile samples its start, advances by the configured step, and appends its
last interpolation support instant. Smooth adjacent tiles share an identical
endpoint sample. At a time-basis discontinuity the left tile instead stops at
the preceding integer millisecond; the right tile starts at the discontinuity.
At the global coverage end the final support sample is also the preceding
millisecond. Queries must use these recorded support bounds and must never
interpolate across the missing interval at a jump. A tile covering only its
start millisecond can contain a single sample.

The boundary list is pinned to the carried engine's model handover, the
public-domain IERS leap-second list carried by that engine, and its UT1 table
end. The table's final timestamp is included by the engine, so the fallback
starts at the following millisecond. Future leap seconds are not forecast.
[test/generate.test.mjs](test/generate.test.mjs) checks the clock changes on both
sides, tile edges, partial tiles, coverage endpoints and decoded positions
against direct calls over its synthetic short windows and cadence example.
This establishes serialization and sampling agreement only.
