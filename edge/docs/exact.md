# Exact result comparison

`src/exact.ts` defines the lab's `edge-exact/1` transport. It encodes the full
result before ordinary JSON serialization, preserving number bits, Date types
and explicitly present `undefined` values. It does not round values or apply
tolerances. This checks runtime compatibility with Node, not astronomical
accuracy.

`src/workloads.ts` exports `runExactSmokeCases()`. Call it in the runtime being
tested and carry its returned string unchanged to the comparison process.
It encodes everything returned by `runSmokeCases()`, including chart metadata,
bodies, aspects, angles, houses, flags, time records and transit results.
Do not encode the HTTP endpoint's JSON response: that response has already
converted Dates to strings and lost signed zero.

The module uses JavaScript built-ins and no runtime imports, network access,
Node globals or engine state. Each target's workload entry includes it;
the engine library and chart endpoint do not.

## API

| Function | Result |
| --- | --- |
| `serializeExact(value)` | Canonical JSON text containing the versioned tagged value tree. |
| `parseExact(text)` | The validated tagged envelope for inspection, without reconstructing engine objects. |
| `compareExact(expectedText, actualText)` | `null` for equality, otherwise the first mismatch with `path`, `reason`, `expected` and `actual`. |

Both complete reports are validated before comparison. Malformed or unsupported
data throws `ExactProtocolError`, a `TypeError` with a `path`. Identically
malformed reports cannot pass. Process errors, runtime metadata and missing
runtimes belong to the runners planned in M6 and M7.

Paths refer to original data, for example
`$["charts"][0]["result"]["bodies"][0]["lon"]`. Keys use JSON escaping inside
brackets. Reasons distinguish value, type, array length, object prototype,
missing property and unexpected property. Number descriptions retain hex bits;
container descriptions summarize their shape. Only the first mismatch is
reported; later fields are not claimed to match.

## Wire format and equality

The envelope is `["edge-exact/1", taggedValue]`.

| Value | Encoding |
| --- | --- |
| Null, undefined | `["null"]`, `["undefined"]` |
| Boolean, string | `["boolean", value]`, `["string", value]` |
| Number | `["number", hexBits]` |
| Date | `["date", epochMillisecondsBits]`, or `["date", "invalid"]` |
| Array | `["array", taggedSlots]`; an absent slot is `["hole"]` |
| Plain record | `["object", "ordinary", sortedEntries]` |
| Null-prototype record | `["object", "null", sortedEntries]` |

Each record entry is `[key, taggedValue]`, sorted by JavaScript string order.
Keys are never assigned into an object while parsing: `__proto__` and
`constructor` are ordinary keys. Property insertion order does not affect
equality. Array order, length and holes do. An absent property, undefined,
null and a hole are distinct.

Numbers use binary64 bytes observed by `DataView.setFloat64` in big-endian
order, written as lowercase hex. Every bit participates, including signed zero,
infinities and observable NaN payloads. JavaScript may canonicalize a NaN
before encoding; the protocol cannot recover bits already lost. Comparison
does not decode numeric hex. Dates retain their type and epoch milliseconds;
an invalid Date has its own marker. Impossible Date timestamps are rejected.

Inputs are trusted engine data and ordinary same-realm values with unmodified
prototypes, including null-prototype records. Class instances, boxed primitives,
maps, sets, typed arrays, bigint, functions and symbols are rejected. Symbol keys, accessors,
non-enumerable record data and extra array or Date properties are rejected
rather than omitted. Getters and result `toJSON` methods are not called.
These checks do not sandbox proxies, re-prototyped exotic objects or modified
globals.

Cycles are rejected with a path. Shared objects are encoded independently at
each occurrence, as needed for the houses workload's shared angles. Object
identity and writable, configurable or frozen status are outside this data
comparison.

The parser requires canonical JSON spelling. It rejects whitespace variants,
extra tuple items, unknown schemas or tags, unsorted or duplicate keys, bad
hex and holes outside array slots. A line-based runner must remove its framing
newline before parsing; do not pretty-print the payload.

`EXACT_LIMITS` declares limits on depth, visited values and UTF-8 payload bytes.
`tests/exact.check.mjs` exercises their boundaries. The byte limit is below
the project file cap. These guard accidental runaway output, not hostile
in-process objects.

## Validation scope

Run from the repository root with the local Node toolchain installed:

```sh
node --test edge/tests/exact.check.mjs edge/tests/exact-workloads.check.mjs
npm --prefix edge test
npm --prefix edge run smoke:node
```

`tests/exact.check.mjs` covers differences ordinary JSON hides, numerical bit
patterns, Dates, holes, properties, paths, malformed wire data and limits.
`tests/exact-workloads.check.mjs` reconstructs the entire synthetic result with
a separate test-only decoder and compares it with the original. It also
detects a changed body longitude and a Date replaced with its ISO string.
`tests/bundles.check.mjs` compares every target's encoded workload report with
the Node source build while both execute in Node.

These checks establish the mechanism and Node execution only. Native Deno,
Bun, Workers and browser parity remain unchecked by this milestone. Their
mathematical implementations may differ at the bit level; future runners
must report those differences as failures.
