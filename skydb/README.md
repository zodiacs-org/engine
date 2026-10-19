# Sky database tools

This private Node project consumes the repository's carried engine archive by
relative file dependency. It does not build or alter the engine package.
It generates compressed position and event tiles with resumable persistence,
integrity verification and a bounded-cache query library. Phase 1 implementation
is recorded in [PLAN.md](PLAN.md), and completed full-database measurements in
[PHASE2.md](PHASE2.md). Recovery and run guidance are in
[OPERATIONS.md](OPERATIONS.md).
Time scales, event definitions and boundary ownership beside the public events
workbench are compared in [CONVENTIONS.md](CONVENTIONS.md), with a pinned source
receipt and explicit limits on interchanging results.

The full database has been generated locally under ignored `generated/full/`
and verified over the half-open span from 1800-01-01T00:00:00Z to
2200-01-01T00:00:00Z. Its default configuration uses hourly position samples
and nominal daily tiles, split at pinned clock changes, for the Sun, Moon,
Mercury, Venus, Mars, Jupiter, Saturn, Uranus, Neptune and Pluto. The
[verification report](benchmarks/VERIFY.md), produced by
[verify-full.mjs](benchmarks/verify-full.mjs), records:

| measured scope | result |
| --- | ---: |
| verified tiles | 146,099 |
| stored support instants, including shared endpoints in each tile | 3,652,427 |
| stored event records | 549,078 |
| file bytes under full/, including metadata and receipts | 968,174,614 |
| allocated bytes under full/, including directories | 2,997,882,880 |

These counts describe the pinned engine and configuration in
[verify-full-output.json](benchmarks/verify-full-output.json). The same database
was compared with direct engine calls at 4,000 deterministic stratified random
interpolation instants across that span, with separate boundary probes. Per-body
maximum, p99 and median differences for longitude, latitude and reported speed
are in the [interpolation evidence](benchmarks/INTERPOLATION.md). This measures
agreement with the consumed engine; it supplies no independent astronomical
accuracy, worst-case interpolation bound or proof of event completeness.

The [query measurements](benchmarks/QUERY.md) record median position lookup
times of 0.886 ms with a fresh application cache and 0.008 ms for immediate
warm repeats, rounded upward to the next thousandth of a millisecond. These
come from 512 cold and 4,096 warm lookups in
[query-full-output.json](benchmarks/query-full-output.json), produced by
[query-full.mjs](benchmarks/query-full.mjs) on its recorded Linux machine and
Node runtime. Opening is timed separately; filesystem caches and host load
are uncontrolled. Event range timings and process memory are recorded there
too. These local measurements establish no performance guarantee. The
[benchmark guide](benchmarks/README.md) links all workloads and reproduction
commands. Generated tiles are local run output, excluded from this repository
and the engine npm package; a fresh checkout must generate its own database.

Use a Node runtime in the series required by [package.json](package.json), with
its matching npm on PATH. From the repository root:

```sh
node skydb/scripts/setup.mjs
npm --prefix skydb test
```

The Node test-runner suites use `test/*.node-test.mjs`, which root Vitest
discovery ignores. Run them with the project's own test command above.

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

[test/bootstrap.node-test.mjs](test/bootstrap.node-test.mjs) enforces the defaults,
coverage endpoints, archive pin, invalid-input rejection and exact agreement
with direct calls at its synthetic instants. This is consumer agreement,
not independent evidence of astronomical accuracy or interpolation error.

Project code and documentation use the repository MIT licence. The installed
engine is MIT AND CC-BY-4.0; retain its LICENSE, LICENSING.md and NOTICE when
redistributing it. Generated sample attribution is recorded in
[samples/ATTRIBUTION.md](samples/ATTRIBUTION.md). Full generated data belongs in the
ignored `generated/` folder and must not be committed.

The lossless position codec is [src/tile.mjs](src/tile.mjs).
[FORMAT.md](FORMAT.md) defines the envelope, records and validation rules.
[test/tile.node-test.mjs](test/tile.node-test.mjs) checks serialization agreement on
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
[test/generate.node-test.mjs](test/generate.node-test.mjs) checks the clock changes on both
sides, tile edges, partial tiles, coverage endpoints and decoded positions
against direct calls over its synthetic short windows and cadence example.
This establishes serialization and sampling agreement only.

`generateEventTiles(config)` in [src/events.mjs](src/events.mjs) yields the
position planner's descriptors with an `events` array instead of position
bytes. It uses the same selected bodies, clock splits and half-open ownership.
The store persists and compresses these event records.
`scanEvents(descriptor, config, sample)` exposes the same scan with an injected
sampler for synthetic tests. Descriptors crossing a known clock jump are rejected.

Major aspects are conjunction, sextile, square, trine and opposition. Both
oriented branches of sextile, square and trine are searched. Body pairs use the
canonical body order, regardless of input order. Ingress targets
are tropical sign boundaries, including the longitude wrap. Stations are zeros
of the engine's reported longitude speed, which is its finite-difference speed,
not an analytic velocity. Lunations are Sun-Moon longitude conjunctions and
oppositions, labelled new and full; they also appear as aspect records. These
are longitude definitions, not extrema of illuminated fraction. A body omitted
from configuration contributes no events, including lunations when a luminary
is omitted.

Each record includes `kind`, `bodies`, `atMs`, `bracket`, `residual`, `unit` and
`direction`. Angular events include an oriented `target`; aspects also include
an unsigned `angle`, and lunations a `phase`. Residuals are signed angular
errors in degrees or station speeds in degrees per day, evaluated directly at
`atMs`. Direction describes the scalar change over the scan interval that
found the root. At an exactly sampled touch it describes that interval's
approach, rather than asserting a crossing. Constant-zero sampled plateaus
are skipped. Duplicate roots at shared scan samples are removed per descriptor.

The scan uses the position cadence, capped at one hour, brackets scalar sign
changes and exactly sampled zeros, rejects the angular branch cut, then bisects
with direct calls until the bracket is exact or spans adjacent integer
milliseconds. The endpoint with the smaller absolute residual is reported,
with ties assigned to the earlier instant. This is an approximation to an
exact event; its timestamp and residual retain millisecond and engine numerical
limits. Ownership uses the reported timestamp. Clock jumps themselves are not
reported as smooth roots.

This is a sampled search, with no completeness proof over the full coverage.
Multiple roots within a scan interval and tangencies between samples can be
missed. Reduce cadence for finer searches; refinement precision does not remove
sampling limitations. Tests in [test/events.node-test.mjs](test/events.node-test.mjs)
check synthetic roots, aspect branches, wraparound, retrograde repeats, touches,
plateaus, ownership and clock splits. Its direct comparison covers the synthetic
window beginning 2001-01-01 for forty days, checking residual agreement and
adjacent-millisecond brackets. Test residual thresholds are consumer agreement
checks, not astronomical accuracy guarantees or full-coverage error bounds.

`generateDatabase(directory, config, options)` in
[src/store.mjs](src/store.mjs) persists positions and compressed events, with
SHA-256 receipts and a checkpoint. Use a directory under ignored `generated/`
for real runs. The same configuration resumes an interrupted run, verifies its
published tiles and skips their computation. It returns the directory and tile
count. `verifyStoredTile(directory, descriptor)` checks receipt digests, event schema and root brackets, and
position support endpoints, then returns decoded data. Passing configuration
also checks the selected bodies and position cadence. This integrity check is
not an astronomical accuracy check or proof of event completeness.

An exclusive `.lock` prevents concurrent writers. Exceptions and cancellation
release it; process termination may leave it behind. Remove a stale lock only
after independently confirming its writer has stopped. The lock records a PID
and start time for diagnosis; it is never automatically stolen. `options.signal`
is checked between tiles and before publication. `options.onProgress` is awaited
after tile publication and checkpoint updates; callbacks may interrupt a run.
Engine sampling within a tile remains synchronous.

Files are flushed before publication; a same-filesystem directory rename makes
the position/event pair visible together, and checkpoint replacement is atomic.
This supports process interruption recovery on local filesystems with atomic
rename. Directory entries are not fsynced, so power-loss durability is not
promised. Use a private trusted local directory; hostile filesystem mutation,
symlink races and network filesystem locking are outside this contract.
The distributed manifest and event layout are documented in [FORMAT.md](FORMAT.md).


`openDatabase(directory, { cacheTiles })` in [src/query.mjs](src/query.mjs)
opens a completed database and returns `config`, `positions(atMs)`,
`events(startMs, endMs, { kind, body })` and `cacheInfo()`. Query times are integer
UTC epoch milliseconds. Position coverage and event ranges are half-open;
out-of-range requests throw rather than extrapolate. Event queries are async
iterators, ordered by stored timestamp, with optional exact kind and body
filters. They return stored events and inherit the scan's completeness limits.

Opening validates the pinned manifest, configuration and completed checkpoint.
Each tile is checksum-verified on its first load or after eviction. The cache
retains only the configured number of decoded tiles, evicting the least recently
used entry; disk loads are serialized even with concurrent callers. Tile lookup
uses arithmetic and the pinned clock boundaries without loading a full-coverage
index. Returned rows, events and cache diagnostics are independent copies.
Callers should consume event iterators incrementally to bound their own memory.

Position queries return `{ atMs, rows }`. Exact stored samples retain their
binary values. Between samples, latitude and reported longitude speed are
interpolated linearly; longitude follows the shortest circular arc, including
retrograde motion and wraparound. Exactly antipodal support longitudes are
rejected as ambiguous. Speed is interpolated from stored engine speeds, not
computed as the derivative of the interpolated longitude. No interpolation
crosses a clock discontinuity or extends past recorded support. Coarse cadence
can alias a longitude path or hide a turn; this library supplies no error bound.

Use a completed immutable database in a trusted local directory. Checksums
establish agreement with local receipts, not authenticity if receipts and tiles
are replaced together. Cached tiles do not detect subsequent disk mutation;
reopen the database to recheck files. Missing, corrupt and incomplete data fail
explicitly. [test/query.node-test.mjs](test/query.node-test.mjs) checks descriptor lookup
against the planner over target coverage, synthetic circular arithmetic, direct
sample agreement at seams and boundaries, and interpolation agreement at the
midpoint of its synthetic window beginning 2001-01-01. Its test thresholds apply
only to that midpoint and measure consumer agreement, not astronomical accuracy.
Small-window regression measurements and completed full-database evidence are
described in [benchmarks/README.md](benchmarks/README.md). The full-span
stratified sample measures agreement only at its selected instants and does
not establish a full-span bound.

The command-line entry is `node skydb/scripts/skydb.mjs`. Each command emits
JSON lines to stdout; errors go to stderr with a failing exit status. Arguments
are strict: unknown and duplicate options, missing values and noninteger query
times are rejected. Commands are:

```sh
node skydb/scripts/skydb.mjs generate --directory skydb/generated/example --config skydb/samples/config.json
node skydb/scripts/skydb.mjs verify --directory skydb/generated/example
node skydb/scripts/skydb.mjs positions --directory skydb/generated/example --at 978307200000
node skydb/scripts/skydb.mjs events --directory skydb/generated/example --start 978307200000 --end 978480000000 --kind ingress --body Moon
```

Generation requires an explicit JSON configuration file and a directory beneath
`skydb/generated/`. It uses the store's resume and locking rules. The filesystem
must be trusted, including parent directories; path containment is lexical and
does not defend against symlinks. Queries and verification accept existing local
databases. Event output is streamed. Verification walks every planned tile,
checks digests, decoded positions and event ownership/order, and emits a summary.
It requires a completed checkpoint and does not compare to an independent arbiter.

The committed [sample](samples/ATTRIBUTION.md) is reproduced by
`node skydb/scripts/sample.mjs`. Its configuration is separate from the full
coverage defaults. [test/cli.node-test.mjs](test/cli.node-test.mjs) verifies deterministic
regeneration, direct sample agreement and end-to-end command use, including
checksum rejection. Retain the sample attribution and upstream licensing notices
when copying these tiles. Full generation output remains ignored.
