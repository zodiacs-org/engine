# Completed database verification

P3 uses the retained completed database from [FULL.md](FULL.md). Its aggregate
verification and manifest summary are in
[verify-full-output.json](verify-full-output.json), produced by
[verify-full.mjs](verify-full.mjs). Generated tiles remain ignored.

The recorded run passed over the default half-open span from
1800-01-01T00:00:00Z to 2200-01-01T00:00:00Z, with these aggregate results:

| measurement | value |
| --- | ---: |
| verified tiles | 146,099 |
| stored support instants, including shared endpoints | 3,652,427 |
| stored event records | 549,078 |
| total file bytes under full/ | 968,174,614 |
| allocated bytes under full/, including directories | 2,997,882,880 |

The report includes the manifest SHA-256, engine archive pin, full configuration
and completed checkpoint. Storage totals match the completed generation report
in [session-0036.json](full-sessions/session-0036.json). The evidence test below
checks that binding and the planned tile and support counts. These are measured
storage and verification results for the recorded build and span.

With the project Node runtime on PATH and locked dependencies installed, run
from the repository root:

```sh
node skydb/benchmarks/verify-full.mjs > skydb/generated/verify-full-output.json
```

After a successful exit, copy that small JSON report to the committed evidence
path. The runner accepts no arguments and invokes this existing CLI with the
same Node executable, without a shell:

```sh
node skydb/scripts/skydb.mjs verify --directory skydb/generated/full
```

The CLI requires a completed checkpoint and visits every planned tile. It
checks receipt digests, decoded positions, body selection, sample cadence,
event definitions, root brackets, ownership and ordering, and exercises the
public event iterator. The report records its aggregate counts and exact
arguments. A sample count means stored support instants, with shared endpoints
counted in each tile; it is not a count of unique instants or body rows.

The runner verifies the carried engine archive pin and binds the CLI result
to the actual manifest bytes, parsed configuration and completed checkpoint.
It rejects a writer lock, incomplete state, CLI failure or metadata change
during measurement. The database must remain immutable on a trusted local
filesystem, as in [OPERATIONS.md](../OPERATIONS.md). Lock checks and metadata
comparisons do not protect against hostile concurrent filesystem changes.

The storage summary counts every regular file under full/, including receipts,
manifest and checkpoint. `bytes` is the sum of file lengths. `allocatedBytes`
also includes allocated directory blocks, and depends on the filesystem.
These totals describe full/ only; the generation reports separately measure
all generated/ contents against the disk policy. Verification creates no new
tiles and does not rewrite database metadata.

`elapsedMs` measures the child CLI from process startup through successful
exit. Archive checks, surrounding metadata reads and the storage walk are
excluded. Runtime, CPU model, operating system and total host memory are
recorded. Filesystem caching and host load are uncontrolled. No parent-process
CPU or memory figure is presented as the child's resource use.

The manifest SHA-256 identifies root metadata, configuration and the receipt
path template. It is not a digest of every tile or an authenticity signature.
Tile receipts provide the integrity checks performed during this run.
Verification establishes structural integrity and consumer behavior, without
independent astronomical accuracy, full-span interpolation error or a proof of
event completeness. Those distinctions also apply to the measured counts.

[test/verify-full.node-test.mjs](../test/verify-full.node-test.mjs) exercises
the measurement on short synthetic-time stores, rejects failed and incomplete
verification, and binds committed evidence to the planner, engine pin and
completed generation report. CI does not need the retained full database.
