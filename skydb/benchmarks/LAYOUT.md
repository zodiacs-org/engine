# Directory layout evidence

Full generation reached a filesystem directory-link limit in the original flat
layout. The retained checkpoint contains 64,998 tiles and the parent directory
reports 65,000 links. A fresh `mkdir` probe reproduced `EMLINK`. At that point,
all generated/ contents allocated 1,407,664,128 bytes, below the configured disk
cap. These observations come from [layout-limit-output.json](layout-limit-output.json),
recorded by [layout-limit.mjs](layout-limit.mjs) on its stated runtime and machine.

The failed generation invocation did not produce a full-session report. Its
wall time and CPU time were not captured and are not reconstructed here.
[session-0010.json](full-sessions/session-0010.json) ends at the preceding saved
session checkpoint; the diagnostic records the additional retained progress.
The diagnostic checks that the writer lock is absent and refuses to report a
link-limit failure unless its fresh probe actually reproduces it.

The sharded layout bounds the number of tile directories in each parent, using
the index rule in [FORMAT.md](../FORMAT.md). Small new datasets retain the flat
layout and the committed sample remains byte-identical. Existing flat stores
remain supported. An explicit migration verifies tile receipts and contents,
then moves directories without recalculating positions or events. Its journal
blocks ordinary readers and writers until the new manifest and checkpoint
binding have both been published. Sibling staging allows the first move even
when the original parent has no remaining directory links.

The stopped-store probe and migration measurement commands are:

```sh
node skydb/benchmarks/layout-limit.mjs
node skydb/benchmarks/migrate-layout.mjs
```

Each writes an exclusive aggregate report beside its script. The probe must
run before migration; it refuses a database that no longer uses the flat
layout. The migration measurement includes storage walks, directory moves and
metadata publication in its wall and CPU measurements. It measures computing
resources and structural integrity, not independent astronomical accuracy or
event completeness. Its disk checks include all generated/ contents, including
the sibling staging directory.

[layout-migration-output.json](layout-migration-output.json) records the actual
migration of the retained checkpoint: all 64,998 tiles were verified and moved
into 64 shards. The before and after checkpoints retain the same tile index and
completion flag, while the manifest digest changes to bind the sharded layout.
All generated/ contents allocated 1,409,507,328 bytes after migration. The
report includes the exact command, runtime, machine, resource measurements and
both manifest digests. Its measured span is the retained prefix recorded in
the diagnostic, not the completed full database.

[test/layout.node-test.mjs](../test/layout.node-test.mjs) crosses a shard boundary
and checks new generation, resume and queries. The existing CLI test enforces
byte-identical sample reproduction. [test/migrate-layout.node-test.mjs](../test/migrate-layout.node-test.mjs)
checks migration across a shard boundary, original tile bytes and modification
times, metadata rebinding, interrupted recovery, locking and corruption errors.
[test/layout-evidence.node-test.mjs](../test/layout-evidence.node-test.mjs) checks
the committed diagnostic against its preceding session and disk policy.
