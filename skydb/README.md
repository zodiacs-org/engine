# Sky database tools

This private Node project consumes the repository's carried engine archive by
relative file dependency. It does not build or alter the engine package.
Configuration, direct position sampling and a compressed position tile codec
are implemented. Tile generation and queries remain planned in [PLAN.md](PLAN.md).

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
