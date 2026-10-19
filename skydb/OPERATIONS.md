# Operating the sky database

Run setup and tests with the Node series required by package.json. Use the
commands in README.md for a small trial before requesting full coverage.
The completed local database is under ignored `generated/full/`, over the
half-open span from 1800-01-01T00:00:00Z to 2200-01-01T00:00:00Z.
[verify-full-output.json](benchmarks/verify-full-output.json), produced by
[verify-full.mjs](benchmarks/verify-full.mjs), records 146,099 verified tiles,
549,078 event records, 968,174,614 file bytes and 2,997,882,880 allocated bytes
under full/. Allocation includes directories and depends on the filesystem.
The report contains the exact configuration, engine archive pin, manifest
SHA-256 and completed checkpoint. The report stores aggregate evidence.
A fresh checkout does not contain the generated tiles.

For the retained completed database, use verification and queries directly;
generation is already complete. To create the same default database in a
fresh checkout, run from the repository root after setup:

```sh
node skydb/benchmarks/full.mjs
```

The bounded runner resumes the same directory and configuration across
invocations. Follow [FULL.md](benchmarks/FULL.md) for its checkpoint, deadline
and disk-stop behavior. Run one generator process at a time, without other
generated/ writers or concurrent test suites. The project limit is at most
3 worker processes; the current runner spawns no generation workers. Its
12,000,000,000-byte disk cap covers allocated storage across all generated/
contents, including trials, staging, backups and logs. This policy is enforced
by [trial-support.mjs](benchmarks/trial-support.mjs) and checked in
[test/full.node-test.mjs](test/full.node-test.mjs). If a guard stops a run,
record the measured reason in PHASE2.md before continuing. The final generation
[session report](benchmarks/full-sessions/session-0036.json) measured
3,072,811,008 allocated bytes across generated/, below that cap. This is a
recorded measurement, not a current free-space check or an allowance for copies.

The CLI is also available for a different explicit configuration.
The CLI requires a configuration file: a file containing `{}` selects the
coverage and cadence defaults enforced by test/bootstrap.node-test.mjs. Place it
inside generated/, then choose another child of generated/ as the output.
The CLI and raw library do not apply the benchmark runner's whole-generated/
disk policy. Use the guarded runner for the default full run. For a different
configuration, arrange equivalent allocation and free-space checks before
generation; the decade trial's arithmetic is not a storage or runtime bound.

Keep the configuration file, engine archive pin and runtime with the run log.
Redirect CLI stdout and stderr to files under generated/ if needed. Generation
prints its summary after completion. For incremental monitoring, call
`generateDatabase` with an awaited `onProgress` callback; log the descriptor
index and phase. A synchronous engine scan can delay cancellation until the
current tile finishes. Use the same configuration and directory to resume.
Resume verifies all already published tiles, so its verification cost grows
with completed coverage even though it skips their engine computation.

On a normal exception, correct the reported cause and retry. On process death,
confirm the writer is stopped before manually removing its `.lock`. A PID can
be reused; the recorded PID alone is insufficient. Do not delete a live lock.
Leave the checkpoint and published tile directories intact. The next run
verifies published tiles and recovers a tile published before checkpointing;
it removes abandoned staging when it next needs to generate a missing tile.
An incomplete checkpoint cannot be opened by the query library.

A configuration mismatch requires a separate output directory. Corrupt or
missing published data causes resume to fail without replacing it. Preserve the
failed directory for diagnosis, restore a verified backup, or generate a fresh
database in another ignored directory. Do not repair receipts merely to make a
checksum pass. Receipts detect accidental corruption; they do not authenticate
a database whose receipts and files were both replaced.

After generation, run the verification CLI against the completed directory.
It validates every planned tile, event definition and root bracket, body list,
position cadence and receipt. These structural checks do not recompute roots
or establish event completeness. Query libraries load and check tiles lazily.
Only give queries immutable completed directories. Do not run a writer while
serving queries or edit tiles after opening a database: cached tiles can retain
older values. Verify copies again before use. Preserve sample attribution and
upstream notices when redistributing generated data.

To repeat the completed database measurements without replacing committed
evidence, run these sequentially from the repository root with no writer:

```sh
node skydb/scripts/skydb.mjs verify --directory skydb/generated/full
node skydb/benchmarks/verify-full.mjs > skydb/generated/verify-full-output.json
node skydb/benchmarks/interpolate-full.mjs > skydb/generated/interpolate-full-output.json
node skydb/benchmarks/query-full.mjs > skydb/generated/query-full-output.json
```

The first command prints the structural CLI summary. The following commands
write new aggregate reports outside the database directory; the verification
report also records that CLI traversal. Compare a rerun's manifest identity,
configuration, engine pin and completed checkpoint with the committed report
before comparing measurements. The manifest digest covers root metadata;
verification must still check the per-tile receipts. Full-store verification
and the query benchmark traverse the database, so schedule them separately
from serving queries. [VERIFY.md](benchmarks/VERIFY.md),
[INTERPOLATION.md](benchmarks/INTERPOLATION.md) and [QUERY.md](benchmarks/QUERY.md)
state the exact workloads, resource observations and failure behavior. CI
checks small synthetic stores and committed report bindings; it does not
regenerate or remeasure the full database.

Choose a trusted local filesystem with atomic same-filesystem renames. The
writer flushes files but does not sync directories, so recovery after power loss
is outside its guarantee. Symlink races, hostile mutation and network filesystem
locking are also outside the contract. Check available storage using a trial
on the actual workload. Keep generation output, backups and logs untracked.

Interpolation uses circular linear longitude and linear latitude and speed.
The completed stratified comparison records per-body maximum, p99 and median
differences from direct engine calls, with boundary probes kept separate.
Its error depends on cadence, body and instant; those observations do not
bound unmeasured instants or establish independent astronomical accuracy.
Reported speed is not the interpolated longitude's derivative. Event searches
can miss multiple roots or unsampled tangencies. Smaller sampling steps can
help but do not prove completeness. Only pinned engine clock changes split
tiles. Input clocks, half-open ownership and differences from the public events
workbench are documented in [CONVENTIONS.md](CONVENTIONS.md); record mapping needs the checks
described there. Local query timings and observed memory in QUERY.md apply to
its recorded machine, cache conditions and workload. Engine upgrades require
a deliberate new pin and regenerated data. Keep each run's tiles together.
The current format has no remote serving, distributed worker coordination or
engine-version migration facility.

Large datasets use the sharded layout described in [FORMAT.md](FORMAT.md).
An existing flat database can reach a filesystem directory-link limit before
its storage budget is spent. Stop its writer, keep its checkpoint and run the
layout migration from the repository root:

```sh
node skydb/scripts/migrate-layout.mjs --directory skydb/generated/full
```

The command verifies and moves existing tiles without recomputing them. Keep
the same directory, configuration and engine pin for subsequent generation.
If migration is interrupted, rerun that command; retain its journal and sibling
staging directory. Ordinary generation and queries refuse an incomplete
migration. Stale-lock diagnosis follows the same rules as generation. This
operation supports process interruption on a trusted local filesystem, with
the same power-loss limitations as the store.
If the old flat root contains unpublished `.tile.tmp` data, migration retains
it unchanged. Sharded readers do not use it, and storage walks still count it.

For review, run `node skydb/scripts/check-project.mjs`, the project suite and
the repository checks that need no engine rebuild. The project checker checks
candidate file sizes, documentation characters, folder isolation and npm's dry
run file list. It does not generate an archive. Checks requiring dist/ cannot
pass in a checkout without it; this task expressly prohibits building it.
The harness handles commits, pushes and the draft pull request. It must keep
the pull request draft; no merge, publishing or release action is part of this
project session.
