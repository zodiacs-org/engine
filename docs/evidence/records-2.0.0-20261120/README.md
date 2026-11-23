# Natal records across the 2.0.0 major

The 2.0.0 build read all 158 natal envelopes written by the 32
carried archives from 0.1.1-rc.7 through 2.0.0. (The 2.0.0-rc.3 build
first read the 138 written by the 28 archives through 2.0.0-rc.3; when
2.0.0-rc.4 was carried on 20 November 2026 the runner was run again with
the 2.0.0-rc.4 build, and only the reader's version and 2.0.0-rc.4's row
and fixture were added. When 2.0.0-rc.5 was carried on 21 November 2026
the runner was run again with the 2.0.0-rc.5 build, and only the reader's
version and 2.0.0-rc.5's row and fixture were added. When 2.0.0-rc.6 was
carried on 21 November 2026 the runner was run again with the 2.0.0-rc.6
build, adding 2.0.0-rc.6's row and fixture. When 2.0.0 was carried on 21
November 2026 the runner was run again with the 2.0.0 build, adding
2.0.0's row and fixture.) The codec preserved
each writer's engine version and conventions set. Every decoded replay
request was accepted by `natalChart`. This checks record compatibility and
replay input validity. Recomputed positions may differ from stored positions
when the engine or ephemeris changes.

The 2.1.0-rc.1 reader replayed all 163 envelopes from the 33 carried
archives on Node 22.22.2. Its five new envelopes and their result row are
in the fixture directory and the results below.

The [runner](tools/later-reader.mjs) verifies each carried archive against
its SHA-256 in [the archive manifest](../../../artifacts/archives.json).
It unpacks the archive outside the checkout, links the installed
`astronomy-engine` dependency, and uses the archive's own `natalChart`,
`createNatalEnvelope`, and `serializeNatalEnvelope`. The reader comes
from the checkout's `dist/receipt.js`. Rows through 2.0.0-rc.4 were loaded on Node 24.22.1; the 2.0.0-rc.5 row was loaded on Node 22.23.3; the 2.0.0-rc.6 and 2.0.0 rows were loaded on Node 22.22.2. The withdrawn 1.1.0-rc.8 had no archive to run.

The inputs use arbitrary full instants and coordinates of public places.
A requests Placidus, B requests whole-sign houses early in the IERS table,
C requests Koch houses after the table, D requests Placidus inside the
polar circle, and E supplies a reference instant with time and location
unknown. The archives declare whole-sign houses as `"whole"`. The runner
checks each writer's TypeScript declarations before running an input.

| Archive | Inputs written | Inputs read | Refusals and omissions |
| --- | --- | --- | --- |
| 0.1.1-rc.7 | A, B, D, E | A, B, D, E | C: `writer-unsupported`, Koch absent from `HouseSystem` |
| 0.1.1-rc.8 | A, B, D, E | A, B, D, E | C: `writer-unsupported`, Koch absent from `HouseSystem` |
| 0.1.1-rc.9 | A, B, C, D, E | A, B, C, D, E | None |
| 0.1.1-rc.10 | A, B, C, D, E | A, B, C, D, E | None |
| 0.1.1-rc.11 | A, B, C, D, E | A, B, C, D, E | None |
| 0.1.1-rc.12 | A, B, C, D, E | A, B, C, D, E | None |
| 0.1.1-rc.13 | A, B, C, D, E | A, B, C, D, E | None |
| 0.1.1-rc.14 | A, B, C, D, E | A, B, C, D, E | None |
| 0.1.1-rc.15 | A, B, C, D, E | A, B, C, D, E | None |
| 0.1.1-rc.16 | A, B, C, D, E | A, B, C, D, E | None |
| 0.1.1-rc.17 | A, B, C, D, E | A, B, C, D, E | None |
| 1.0.0-rc.1 | A, B, C, D, E | A, B, C, D, E | None |
| 1.0.0-rc.2 | A, B, C, D, E | A, B, C, D, E | None |
| 1.0.0 | A, B, C, D, E | A, B, C, D, E | None |
| 1.1.0-rc.1 | A, B, C, D, E | A, B, C, D, E | None |
| 1.1.0-rc.2 | A, B, C, D, E | A, B, C, D, E | None |
| 1.1.0-rc.3 | A, B, C, D, E | A, B, C, D, E | None |
| 1.1.0-rc.6 | A, B, C, D, E | A, B, C, D, E | None |
| 1.1.0-rc.7 | A, B, C, D, E | A, B, C, D, E | None |
| 1.1.0-rc.8 | | | Withdrawn, no archive |
| 1.1.0-rc.9 | A, B, C, D, E | A, B, C, D, E | None |
| 1.1.0-rc.10 | A, B, C, D, E | A, B, C, D, E | None |
| 1.1.0-rc.11 | A, B, C, D, E | A, B, C, D, E | None |
| 1.1.0-rc.12 | A, B, C, D, E | A, B, C, D, E | None |
| 1.1.0-rc.13 | A, B, C, D, E | A, B, C, D, E | None |
| 1.1.0 | A, B, C, D, E | A, B, C, D, E | None |
| 2.0.0-rc.1 | A, B, C, D, E | A, B, C, D, E | None |
| 2.0.0-rc.2 | A, B, C, D, E | A, B, C, D, E | None |
| 2.0.0-rc.3 | A, B, C, D, E | A, B, C, D, E | None |
| 2.0.0-rc.4 | A, B, C, D, E | A, B, C, D, E | None |
| 2.0.0-rc.5 | A, B, C, D, E | A, B, C, D, E | None |
| 2.0.0-rc.6 | A, B, C, D, E | A, B, C, D, E | None |
| 2.0.0 | A, B, C, D, E | A, B, C, D, E | None |
| 2.1.0-rc.1 | A, B, C, D, E | A, B, C, D, E | None |

For C, writers before 0.1.1-rc.15 omit the time basis. From 0.1.1-rc.15
through 2.0.0-rc.2 the record carries the `delta-t` basis and the
`fallback` source for UT1 minus UTC. The 2.0.0-rc.3, 2.0.0-rc.4, 2.0.0-rc.5,
2.0.0-rc.6 and 2.0.0 records carry `continuous-utc` and `model`. For D, 1.1.0 records `polar-fallback`.
From 2.0.0-rc.1 it also records `polar-angles`. The
[results](results/later-reader.json) identify each decoded conventions set
by its index in the reader's `NATAL_RECEIPT_CONVENTION_SETS`.

The [fixtures](../../../src/fixtures/receipts-by-writer/) preserve the
writers' serialized envelopes byte for byte. The
[test](../../../src/receipt-major-readers.test.ts) verifies their digests,
requires each envelope to be under 16 KiB of UTF-8 JSON, and checks that
serializing and parsing it again gives an equal envelope. It also constructs
continuous-UTC records for both ephemerides and checks the version gate:
`2.0.0`, `2.0.0-rc.6`, `2.0.0-rc.5` and `2.0.0-rc.4` read, and `2.0.0-rc.2` returns
`inconsistent_result`.

Two mutations ran in a scratch copy. Moving `CONTINUOUS_UTC_RELEASE` to
`2.0.0` made the new test reject 2.0.0-rc.3 input C with
`inconsistent_result`. Changing the recognized `convention-ids` feature
string made the new test reject 1.1.0 input A with `unsupported_feature`.
The original codec was restored and the focused test reran.

## Reproduce

Run from the checkout with the recorded Node version.

```sh
npm ci
npm run build
mkdir -p /tmp/later-reader
evidence=docs/evidence/records-2.0.0-20261120
TMPDIR=/tmp/later-reader node "$evidence/tools/later-reader.mjs" > /tmp/later.json
diff /tmp/later.json "$evidence/results/later-reader.json"
npx vitest run src/receipt-major-readers.test.ts
```

Pass `--write-fixtures` to the runner to regenerate the fixtures.
