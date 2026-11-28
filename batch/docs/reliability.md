# Reliability and repository checks

Run from `batch/` after installing its locked dependencies on the runtime
declared in [package.json](../package.json):

```sh
npm run check
```

[The check runner](../scripts/check.mjs) runs typechecking, the full Vitest suite,
the batch build and the repository audit, in that order. It stops on failure.
The suite includes real worker threads, loopback HTTP sockets, CLI subprocesses,
controlled SQLite process kills and the benchmark smoke profile. It does not
need a Redis service. Build and test scratch files stay in ignored batch paths.
The root engine build, package creation and release workflows are not invoked.

The [operating guide](operations.md) covers normal use and restart. The matrix
below identifies executable checks for the service contract. Serial engine
comparisons check execution and transport parity; they are not independent
astronomical accuracy evidence.

| Check | Coverage |
| --- | --- |
| [Integrated reliability](../test/reliability.batch-test.ts) | A mixed queue of charts, transit grids and directed synastry matrices through HTTP and real workers, on memory, SQLite and mocked Redis. A committed prefix survives an abandoned lease, handle reopening where supported, a worker calculation failure and a retry. Key replay/conflict, stale-token fencing, ordered following NDJSON, final status and suffix-only dispatch are checked together. |
| [Large chart job](../test/large-job.batch-test.ts) | A single job of 2,000 invented charts on memory with real workers, consumed as NDJSON with contiguous cursors and a digest compared with incremental serial output. This is a correctness check, not a throughput or heap measurement; the memory backend retains its stored rows. |
| [Runnable examples](../test/examples.batch-test.ts) | The committed JSON example for every workload passes validation, built CLI submission, worker execution, status, keyed replay and resumed export. |
| [SQLite crash recovery](../test/crash-recovery.batch-test.ts) | Child processes are killed at result-insert, checkpoint and transaction-commit boundaries, then reopened with real workers. Prefixes, dispatch cursors, lost acknowledgements, lease expiry and retry accounting are checked against serial output. |
| [CLI](../test/cli.batch-test.ts) | Command parsing and input bounds, exit codes, output separation, service startup, signals, interrupted exports and SQLite worker restart. SQLite and memory service modes are covered; the CLI does not expose Redis. |
| [HTTP control](../test/http-control.batch-test.ts) and [streaming](../test/http-control-stream.batch-test.ts) | Real local sockets for routes, errors, input bounds, status, retries, backpressure, disconnects, upload deadlines and shutdown on memory and SQLite. |
| [Redis contracts](../test/redis-queue.batch-test.ts) and [integration](../test/redis-integration.batch-test.ts) | Production Lua transitions run in a stateful mock through independent clients, including uncertain acknowledgements and connection failures, plus real workers and HTTP for every workload. |
| [Queue contract](../test/queue-contract.ts) and [retry contract](../test/retry-contract.ts) | Backend suites enforce atomic claims, token fencing, progress snapshots, ordered commits, delays, exhaustion and idempotency. Backend test files supply their own fixtures. |
| [Pool](../test/worker-pool.batch-test.ts) and [scheduler](../test/scheduler.batch-test.ts) | Worker replacement, aborts and capacity; bounded dispatch and ordered buffering, heartbeats, backend failures and shutdown races. |
| [Result streams](../test/result-stream.batch-test.ts) and [queue streams](../test/result-stream-queue.batch-test.ts) | Finite snapshots, following, every cursor of small synthetic workloads, partial UTF-8/JSON lines, bounded read-ahead, cancellation and retained failed prefixes. |
| [Build](../test/build.batch-test.ts) | Generated entries load in plain Node and use the source engine and pinned computational dependency without requiring root dependencies or root build output. |

Memory reopening in the integrated check means keeping its original live object;
it makes no persistence claim. Redis reopening reconnects to simulated server
state. The [mock](../test/redis-mock.ts) interprets the actual Lua but differs
from Redis in runtime, JSON conversion and command implementation. It establishes
neither live server compatibility nor replication, persistence or failover.
SQLite process termination checks do not simulate host power loss, corruption
or distributed storage. All astronomy input here is synthetic.

## Benchmark evidence

The [recorded observation](evidence/scaling-20261013.md) links the machine facts,
exact inputs and source/bundle hashes in its [JSON](evidence/scaling-20261013.json).
[evidence.batch-test.ts](../test/evidence.batch-test.ts) checks the manifest digest, canonical
input hashes, complete sample matrix, duration sums, result and failure counts,
rate arithmetic, summary calculations and exact rendering of the table. This
checks internal consistency of the retained record, not its authenticity or
the performance of today's checkout. Source revisions and runtimes can differ
from that record; do not relabel its rates as measurements of another build.

[benchmark.batch-test.ts](../test/benchmark.batch-test.ts) executes the smoke profile with
real workers and fresh stores, verifies result digests and exercises deliberate
verification failure. [benchmark-metadata.batch-test.ts](../test/benchmark-metadata.batch-test.ts)
checks CPU allocation parsing. The longer scaling profile is explicit:

```sh
node scripts/benchmark.mjs --profile scaling --output .generated/scaling.json
```

The recorded scaling run measures repeated bounded jobs with warmed workers.
Its intervals exclude database opening and post-run verification. It does not
establish large-single-job, HTTP or CLI throughput, or exclusive host capacity.
No throughput threshold is used as a correctness gate.

## Repository audit scope

[audit.mjs](../scripts/audit.mjs) reads tracked and nonignored new batch files.
It rejects files reaching the source file budget, tracked runtime data or build
directories, source symlinks, and em dashes in documentation. It checks ordinary
inline local Markdown links and heading fragments, including evidence links;
it does not fetch external websites or prove prose claims automatically.
[project-audit.batch-test.ts](../test/project-audit.batch-test.ts) exercises broken links,
escaping paths, missing fragments, generated files and the size boundary.

The audit checks that current tracked modifications and nonignored new files
stay in `batch/`. This is a working-tree check, not an audit of past commits.
An npm pack dry run with scripts disabled checks that the engine's current pack
list excludes `batch/` without creating an archive or running `prepack`.
Installed dependencies and ignored runtime files are outside the source scan.

The root `npm run package:contents` gate needs existing engine `dist/` output.
When that prerequisite is absent, the audit reports it explicitly; package
exclusion alone does not pass the root size/export gates. Full root CI, archive
binding and supported-runtime release checks remain the repository's gates,
as [CONTRIBUTING.md](../../CONTRIBUTING.md) specifies. They are not replaced by
the private batch check. No git writes are part of either batch script.
