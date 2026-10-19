# Operating the sky database

Run setup and tests with the Node series required by package.json. Use the
commands in README.md for a small trial before requesting full coverage.
The CLI requires a configuration file: a file containing `{}` selects the
coverage and cadence defaults enforced by test/bootstrap.node-test.mjs. Place it
inside generated/, then choose another child of generated/ as the output.
The project supplies tools for full coverage; no full dataset has been generated
or committed, and the scoped benchmarks do not predict its cost.

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

Choose a trusted local filesystem with atomic same-filesystem renames. The
writer flushes files but does not sync directories, so recovery after power loss
is outside its guarantee. Symlink races, hostile mutation and network filesystem
locking are also outside the contract. Check available storage using a trial
on the actual workload. Keep generation output, backups and logs untracked.

Interpolation uses circular linear longitude and linear latitude and speed.
Its error depends on cadence, body and instant. Reported speed is not the
interpolated longitude's derivative. Event searches can miss multiple roots or
unsampled tangencies. Smaller sampling steps can help but do not prove
completeness. Known engine clock jumps split tiles; future leap seconds are not
predicted. Engine upgrades require a deliberate new pin and regenerated data,
not mixing tiles between runs. The current format has no remote serving,
distributed worker coordination or engine-version migration facility.

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
