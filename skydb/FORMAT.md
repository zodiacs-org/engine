# Position tile format

The position tile codec is implemented in [src/tile.mjs](src/tile.mjs).
Its layout, limits and round-trip behavior are enforced by
[test/tile.node-test.mjs](test/tile.node-test.mjs) on synthetic records. This is a storage
format, with no astronomical accuracy claim. Events will use a separate format.

## Envelope

All integer fields below are unsigned little-endian. Offsets are bytes from the
start of the file. The header is followed by exactly one zlib-wrapped DEFLATE
stream. Encoders use compression level 9. Compressed bytes can vary between
zlib versions; checksum manifests should hash the actual emitted file.

| Offset | Length | Field |
| --- | --- | --- |
| 0 | 8 | ASCII `SKYDBTL` followed by a zero byte |
| 8 | 2 | Format version, currently 1 |
| 10 | 1 | Compression id, 1 for zlib-wrapped DEFLATE |
| 11 | 1 | Reserved flags, must be zero |
| 12 | 4 | Uncompressed payload length |
| 16 | 4 | Compressed stream length |
| 20 | 32 | SHA-256 of the entire uncompressed payload |
| 52 | stream length | Compressed payload |

The decoder rejects unknown versions, compression ids and flags. It accepts a
Buffer or Uint8Array, including a view with a nonzero byte offset. It copies
input bytes before decoding. Truncated input, appended bytes, and extra bytes
inside the declared compressed stream are rejected.

The current limits are 1,000,000 uncompressed bytes, 1,500,000 file bytes and
4,096 metadata bytes. Lengths are checked before decompression, which also has
an output limit. These limits are format constraints enforced by the codec and
tests, not measured compression ratios. Larger datasets use additional tiles.

## Payload

The uncompressed payload consists of a uint32 metadata byte length, that many
UTF-8 JSON bytes, a uint32 sample count, then sample records. Invalid UTF-8 and
invalid JSON are rejected. Metadata has exactly these keys:

| Key | Meaning |
| --- | --- |
| `startMs` | Inclusive coverage start, integer Unix epoch milliseconds |
| `endMs` | Exclusive coverage end, integer Unix epoch milliseconds |
| `bodies` | Nonempty ordered list of unique supported planet names |
| `engineSha256` | Carried archive hash pinned in `src/identity.mjs` |
| `timeScale` | `utc`, the engine input time scale |
| `conventions` | `engine-root/tropical-geocentric-ecliptic-of-date/1` |

The interval must be nonempty and contained in `COVERAGE` from
[src/config.mjs](src/config.mjs). Body names come from its `BODIES` list.
The codec validates the archive hash as an identity claim; it does not verify
that an engine computed supplied positions. The conventions label refers to
the root positions API and the time-basis policy described in this project's
README. Unsupported conventions are rejected rather than inferred.

Samples need not be uniformly spaced. Each record contains a little-endian
IEEE 754 binary64 timestamp followed, in metadata body order, by binary64
longitude, latitude and longitude speed for each body. Timestamps must be safe
integer epoch milliseconds, strictly increasing and within `[startMs,endMs]`.
An optional sample at `endMs` supports interpolation at the right edge and
does not expand the tile's half-open coverage. The codec does not require
endpoint samples or guarantee interpolation coverage. Generation and querying
must enforce their own sampling rules.

Longitude is finite degrees in `[0,360)`, latitude is finite north-positive
degrees in `[-90,90]`, and longitude speed is finite degrees per day. Binary64
values are preserved without quantization, including signed zero. Body names
are not repeated in the binary records. Record size is `8 + 24 * bodyCount`
bytes. The sample count must be positive, and the payload length must match
exactly; trailing payload bytes are rejected.

## JavaScript interface

`encodePositionTile({ metadata, samples })` returns a Buffer.
`samples` is an array of `{ atMs, rows }`; each row is exactly
`{ body, lon, lat, speed }`, ordered like `metadata.bodies`.
`decodePositionTile(bytes)` returns the same object shape, newly allocated.
Both functions reject invalid values with RangeError. Unknown object fields
are rejected. Decoded objects are mutable and independent of the encoded bytes.
Inputs supplied as JavaScript objects are trusted local code, not a sandbox
against executable getters or proxies.

The embedded digest detects accidental corruption of the payload. It is not
an authenticated signature: anyone changing a tile can recompute it. The
planned external manifest will record SHA-256 of each complete compressed
file, including its envelope. Generated datasets and temporary tiles belong
in the ignored `generated/` folder; no full dataset is committed.

## Persistent dataset and events

[src/store.mjs](src/store.mjs) stores a distributed checksum manifest.
`manifest.json` records the normalized configuration, pinned archive digest and
format versions. Each sequential `tile-NNNNNNNN/receipt.json` records its planner
descriptor and the byte length and SHA-256 of `positions.sky` and `events.json.gz`.
This avoids a single manifest growing with the entire dataset. Tile receipts
and the root manifest together describe the dataset. Checksums detect corruption;
they do not authenticate the producer. Completion is recorded separately.

The event file is gzip-compressed UTF-8 JSON with `version: 1`, `descriptor` and
`events`. Records retain the event generator's fields and ordering. JSON does
not preserve signed zero; positions retain their binary representation. Stored
and decoded event JSON and each store file are bounded by `STORE_LIMIT` in
[src/store.mjs](src/store.mjs); shorten tile duration if events exceed it.
[test/store.node-test.mjs](test/store.node-test.mjs) enforces persistence agreement,
interruption recovery, exclusive locking and rejection of corrupt stored bytes.

`checkpoint.json` contains its version, root manifest SHA-256, next tile index
and completion flag. Resume verifies all previously published receipts and files
before skipping their computation. A tile published before its checkpoint is
recovered by verification. Missing checkpointed tiles and mismatched configuration
are errors, rather than silently regenerated data. Unpublished staging data is
removed before generating the next missing tile.
