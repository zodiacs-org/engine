# Bounded full-span generation

Full-span generation is in progress. P2 stays unchecked in
[PHASE2.md](../PHASE2.md) until the store's checkpoint is complete. Generated
tiles remain under ignored `generated/full/`. The session reports in
[full-sessions/](full-sessions/) contain aggregate resource measurements and
checkpoint metadata, without position samples or event records.

With the project Node runtime on PATH and the locked dependencies installed,
run from the repository root:

```sh
node skydb/benchmarks/full.mjs
```

The command accepts no arguments. It selects the default half-open coverage
using the pinned trial evidence in [trial-output.json](trial-output.json),
recomputes that report's arithmetic, and checks the engine archive identity.
Its remaining-storage estimate uses the trial's full-span allocation estimate
scaled by the fraction of tiles not yet checkpointed, plus current usage of
all generated/ contents and the next-tile reserve. Recovered publications not
yet checkpointed can be counted again in this estimate. The estimate is a
computing-resource assumption, not a bound. If it fails the disk policy, the
command stops before generation; record the measured reason in PHASE2.md
before considering a smaller span.

The runner calls the existing store sequentially in the same full/ directory
with the same configuration on every invocation. Completed tiles are verified
before the store skips their computation. A new invocation includes that
prefix verification in its session budget. Configuration, checksum, lock and
unexpected callback failures remain errors; the runner does not replace
published tiles to make an error disappear.

Each invocation has a cooperative wall-time budget, recorded as `maxWallMs`
in its report. The deadline covers the initial storage walk, engine loading,
resume verification and generation. The store checks cancellation between
tiles and before publication. A current tile or filesystem walk can finish
after the requested deadline. Final reporting walks also run after it. SIGINT
and SIGTERM request the same graceful pause; forced process death still has
the stale-lock recovery limitations in [OPERATIONS.md](../OPERATIONS.md).

The disk checks cover all generated/ contents, including the retained trial,
other datasets, staging files and file and directory allocation. After each
checkpoint the runner checks incremental allocation and filesystem free space;
periodic whole-root walks reconcile metadata, parent-directory growth and
recovered tiles. Preflight and final whole-root usage are in every report.
The reserves and cap are shared with [trial-support.mjs](trial-support.mjs).
Run generation by itself without other writers or test suites creating and
deleting files in generated/. Trusted local filesystem assumptions remain the
same as the store's. No generation workers are spawned.

A normal deadline or signal pause releases the writer lock and returns an
aggregate report with `status: "paused"`. The last published checkpoint remains
available for resume. An interrupted tile can leave `.tile.tmp`; its allocation
is included in the report, and the store removes it when it next generates a
missing tile. A disk stop returns `status: "disk-stopped"` and a failing command
exit status. Record that stop and its measured usage in PHASE2.md before
continuing. Other failures propagate without emitting a successful report.

The command writes each report exclusively to a new numbered JSON file under
full-sessions/, preserving earlier session measurements. It prints the report
path and checkpoint summary to stdout and periodic progress to stderr. Each
report records the exact command, runtime, machine, engine pin, trial digest,
configuration, initial and final checkpoints, wall and CPU time, process peak
resident memory and actual storage. Wall and CPU include final reporting
walks; peak memory is the process lifetime high-water mark. Filesystem caching
and host load are uncontrolled. Selection and configuration planning precede
the reported timer.

`publishedTiles` and `checkpointedTiles` count this invocation's callbacks.
`resumedVerifiedTiles` counts previously stored tiles only when prefix
verification is known to have finished. If a deadline interrupts verification
before progress is observable, it is null. The checkpoint's completion flag
describes stored generation state, while the report status describes the
current invocation. A paused verification of an already complete database
therefore retains a complete checkpoint. These checks establish storage
integrity and resume behavior, not independent astronomical accuracy or event
completeness. Whole-database verification and interpolation measurement remain
separate milestones.

The original flat store reached a filesystem directory-link limit before its
disk cap. [LAYOUT.md](LAYOUT.md) records the stopped-store diagnostic and the
sharded-layout recovery. New large stores use sharding; retained flat stores
require the explicit migration command before resuming beyond that limit.
Migration changes the root manifest digest while retaining the configuration,
engine pin and tile contents. The aggregate migration evidence binds that
change between session reports. The original trial estimate describes its flat
layout and remains a resource assumption; current whole-root measurements and
disk guards account for the sharded layout's actual allocation.

[test/full.node-test.mjs](../test/full.node-test.mjs) checks trial-based
selection, bounded interruption, byte-identical resume, completed reruns,
disk stops, deadline behavior, failure propagation and report evidence. CI
uses short synthetic-time windows and does not run full-span generation.
