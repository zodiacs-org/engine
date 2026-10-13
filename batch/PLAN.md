# Batch compute service plan

All implementation, tests, tooling, documentation and evidence stay in `batch/`.
This private project consumes the engine by a relative source import. It does
not change the engine package, build output, release archives or dependencies.
Examples, tests and benchmarks use invented birth data only. Ephemeris storage
and event search are outside this project.

Complete the next unchecked milestone, run its checks, tick it, and append a
session summary to `CHANGES.txt`. The harness handles all git writes. On this
initial session complete M1 only; later sessions complete one or two milestones.

- [x] M1 Establish the private TypeScript project, Vitest setup, versioned JSON job contracts, bounded validation and workload counts. Test valid synthetic jobs, malformed inputs and resource limits.
- [x] M2 Implement deterministic, lazy work-item expansion and serial engine execution for charts, sampled transit grids and directed synastry matrices. Test ordering, range boundaries, resume cursors and parity with direct engine calls.
- [x] M3 Define the asynchronous queue backend contract and implement the in-memory queue with atomic claims, lease tokens, status and progress snapshots. Run a reusable backend contract suite including competing claims.
- [x] M4 Implement the default SQLite backend with migrations, transactions, durable job definitions, leases and result checkpoints. Run the backend contract suite against independent connections and reopen tests.
- [x] M5 Add the worker_threads pool and scheduler with bounded dispatch, worker replacement, progress updates and graceful shutdown. Test parallel work, worker failure and shutdown during active work.
- [x] M6 Add bounded retries, retry delays, terminal failure and idempotency keys with payload conflict detection. Test duplicate submissions, stale lease fencing and retry exhaustion on both backends.
- [x] M7 Complete crash recovery and resumable jobs with atomic result/checkpoint commits and expired-lease recovery. Use child processes killed at controlled persistence boundaries to prove resumed output has no lost or duplicate rows.
- [x] M8 Stream result rows as NDJSON with stable cursors, backpressure and disconnect handling. Test partial reads, reconnects, escaping and large workloads without collecting all output in memory.
- [x] M9 Add the small HTTP control API for submit, status, progress and streamed results, with bounded request bodies and clear errors. Test routes, idempotency conflicts and client disconnects over real local sockets.
- [x] M10 Add the CLI for submission, worker/service operation, status and NDJSON export using the same service APIs. Test subprocess exit codes, stdout/stderr separation and restart with SQLite.
- [x] M11 Add the optional Redis backend behind an injected client and explicit configuration. Run the backend contract suite with a stateful mock and test atomic operations and connection failures; document what the mock cannot establish.
- [x] M12 Commit the scaling benchmark runner and compact machine-specific evidence for throughput versus worker count using synthetic workloads. Record runtime, engine/source identity, CPU allocation, workload, elapsed time and failures; keep raw generated rows gitignored and every committed file below the file-size limit.
- [x] M13 Finish operating documentation, examples and an integrated reliability check covering all workloads, backends, interfaces and recovery. Verify batch isolation from npm packing, evidence links, documentation claims and repository constraints.

Milestone checks run from this directory using its own test and typecheck
commands. Root checks that require unavailable engine build output are recorded
as blocked rather than generating `dist/` in this worktree. New performance
claims require the committed benchmark script and its measured output.

## M1 session checks

`npm run typecheck` and `npm test` passed from `batch/` on Node 22.23.3.
The root `npm run package:contents` was attempted and stopped because
`dist/calc.d.ts` is absent; the checkout has no engine build output. An npm
pack dry run with `--ignore-scripts --json` confirmed that no `batch/` file is
included. No archive was written and no engine build was run.

## M2 session checks

`npm run typecheck`, `npm test` and `npm run build` passed from `batch/` on
Node 22.23.3. The tests cover work ordering, direct cursor seeking, half-open
transit ranges, serial engine JSON parity, lazy calculation, failure positions
and plain Node execution of the generated bundle. The build writes only to
the ignored `.generated/` directory and resolves the engine's pinned dependency
from the batch installation.

The root `npm run package:contents` stopped because `dist/calc.d.ts` is absent.
An npm pack dry run with `--ignore-scripts --json` confirmed that no `batch/`
file is included. All changes stay inside `batch/`, all tracked and new batch
files are below the file-size limit, and batch documentation contains no em
dashes. No root build, archive creation or git write was performed.

## M3 session checks

`npm run typecheck`, `npm test` and `npm run build` passed from `batch/` on
Node 22.23.3. The reusable backend suite and memory-clock tests cover atomic
competing claims, FIFO eligibility, renewal and expiry boundaries, token
fencing, progress snapshots, ordered atomic result commits, prefix resumption,
bounded pages, JSON and argument validation, snapshot isolation and closure.
The plain Node bundle test also submits, claims, computes, commits and reads
a synthetic job through the exported queue. These checks establish in-process
queue behavior; durable storage and process-crash recovery remain later work.

The root `npm run package:contents` stopped because `dist/calc.d.ts` is absent.
An npm pack dry run with `--ignore-scripts --json` confirmed that no `batch/`
file is included. All changes stay inside `batch/`, all tracked and new batch
files are below the file-size limit, and batch documentation contains no em
dashes. No root build, archive creation or git write was performed.

## M4 session checks

`npm run typecheck`, `npm test` and `npm run build` passed from `batch/` on
Node 22.23.3. SQLite runs the shared backend contract with independent
connections. Its additional tests cover schema migration and refusal, lock
contention during initialization and writes, FIFO under a backward clock,
reopen with canonical definitions for every workload, persisted leases and
committed prefixes, completion, handle-local closure, and injected SQL failures
during result insertion and checkpoint updates. The plain Node bundle test
executes a synthetic job through both backends. All database scratch files
stay under ignored `.generated/` paths.

The SQLite constructor checks its runtime library version before opening a
file, excluding the mainline releases affected by the upstream WAL-reset bug;
`test/sqlite-queue.test.ts` enforces the boundary and checks that refused opens
create no files. `README.md` links the upstream explanation. Process-kill
recovery tests and throughput measurements remain later milestones.

The root `npm run package:contents`, using the batch npm cache, stopped because
`dist/calc.d.ts` is absent. An npm pack dry run with `--ignore-scripts --json`
confirmed that no `batch/` file is included. All changes stay inside `batch/`,
all tracked and new batch files are below the file-size limit, and batch
documentation contains no em dashes. No root build, archive creation or git
write was performed.

## M5 session checks

`npm run typecheck`, `npm test` and `npm run build` passed from `batch/` on
Node 22.23.3. Real worker tests cover charts, transit grids and directed
synastry parity with serial execution, pool saturation, worker replacement,
abort isolation, malformed responses and closure. Deterministic scheduler
tests cover bounded out-of-order buffering, ordered progress, prefix
resumption, renewal while computation or commits wait, graceful shutdown
during claims and active work, error cleanup and stale lease fencing. The
final-commit race test keeps a completed result when a delayed renewal loses
its lease. The built default pool and scheduler also complete synthetic jobs
through both queue backends in plain Node.

The build writes the worker entry beside the main entry under ignored
`.generated/` paths. Execution failures stop and release unfinished work;
bounded retries and terminal failure records remain M6. Process-kill recovery
and throughput measurements remain later milestones.

The root `npm run package:contents`, using the batch npm cache, stopped because
`dist/calc.d.ts` is absent. An npm pack dry run with `--ignore-scripts --json`
confirmed that no `batch/` file is included. All changes stay inside `batch/`,
all tracked and new batch files are below the file-size limit, and batch
documentation contains no em dashes. No root build, archive creation or git
write was performed.

## M6 session checks

`npm run typecheck`, `npm test` and `npm run build` passed from `batch/` on
Node 22.23.3. The shared retry suite checks canonical keyed replay, conflicting
and concurrent submissions, effective policy defaults and bounds, delayed
eligibility, terminal exhaustion, committed-prefix preservation, stale failure
reports, expiry accounting and detached snapshots on both backends. Failures
are counted separately from claims so graceful release preserves the budget.

SQLite tests cover persisted keys and retry state across reopen, migrations
from the earlier schema with live leases and stored results, sequence
preservation, foreign-key constraints, and rollback of failed migrations,
submissions, failure transitions and expired-lease claims. Scheduler tests
cover sibling cancellation, delayed resumption, continued service after a
terminal failure, shutdown during retries and uncertain failure writes. The
plain Node bundle test exhausts a synthetic calculation's retry budget with
real workers and still completes other work through both backends. These
checks establish state transitions and reopen behavior; controlled process
termination remains M7.

The root `npm run package:contents`, using the batch npm cache, stopped because
`dist/calc.d.ts` is absent. An npm pack dry run with `--ignore-scripts --json`
confirmed that no `batch/` file is included. All changes stay inside `batch/`,
all tracked and new batch files are below the file-size limit, and batch
documentation contains no em dashes. No root build, archive creation or git
write was performed.

## M7 session checks

`npm run typecheck`, `npm test` and `npm run build` passed from `batch/` on
Node 22.23.3. The new crash suite kills child processes with open SQLite
connections at native result-insert, checkpoint-update and commit boundaries.
For each workload, it checks intermediate and final batches, then restarts
with real workers and verifies exact stored JSON, contiguous cursors, paged
output and dispatch of only the uncommitted suffix against serial execution.

Additional cases check lost submission and claim acknowledgements, keyed
replay, expiry accounting rolled back with an interrupted replacement claim,
stale-token fencing, retry delays and terminal exhaustion. A real scheduler
is also killed with a committed prefix and computed out-of-order results
still buffered. The tests use synthetic inputs and controlled backend time;
they establish process-kill recovery at these boundaries, not host power-loss
or astronomical accuracy. Existing transactions and leases passed without a
production-code change. The README now documents restart steps, uncertain
acknowledgements, repeated calculation and build consistency.

The root `npm run package:contents`, using the batch npm cache, stopped because
`dist/calc.d.ts` is absent. An npm pack dry run with `--ignore-scripts --json`
confirmed that no `batch/` file is included. All changes stay inside `batch/`,
all tracked and new batch files are below the file-size limit, and batch
documentation contains no em dashes. No root build, archive creation or git
write was performed.

## M8 session checks

`npm run typecheck`, `npm test` and `npm run build` passed from `batch/` on
Node 22.23.3. The new result iterator and UTF-8 Readable stream support finite
exports fixed at the first committed snapshot, explicit following through
retry and terminal states, bounded paging, backpressure and aborts. Periodic
event-loop yields keep immediately ready exports interruptible and allow
scheduler timers to run. Disconnects do not change job state or close the queue.

The streaming suites check all workloads on both backends, every cursor in
their synthetic jobs, concurrent commits during finite exports, failed prefixes,
escaping and Unicode, partial-line reconnects, SQLite reopen, read failures,
broken page framing, pending-read cancellation and listener cleanup. A large
lazy synthetic reader and counting sink check bounded read-ahead without
collecting the full export. These are transport and retention-behavior checks,
not heap measurements or throughput claims. The plain Node build smoke test
checks both streaming exports, and the complete existing crash suite passes.
The README documents cursor retention, stream ownership and memory bounds.

The root `npm run package:contents`, using the batch npm cache, stopped because
`dist/calc.d.ts` is absent. An npm pack dry run with `--ignore-scripts --json`
confirmed that no `batch/` file is included. All changes stay inside `batch/`,
all tracked and new batch files are below the file-size limit, and batch
documentation contains no em dashes. No root build, archive creation or git
write was performed.

## M9 session checks

`npm run typecheck`, `npm test` and `npm run build` passed from `batch/` on
Node 22.23.3. The HTTP control server exposes submission, status, committed
progress and resumable NDJSON routes over an injected queue. It enforces
body byte limits before parsing, fatal UTF-8 decoding, a total upload deadline,
strict route and header options, an active-handler budget and fixed error
responses. Idempotency and retry policy use the existing queue contract.

The socket route suite checks all workloads on memory and independent SQLite
connections, exact stored result parity, canonical keyed replay, concurrent
conflicts, validation and body boundaries, status transitions, retry exhaustion,
and persisted resumption after reopen. The streaming socket suite checks
finite snapshot boundaries, following from an empty prefix, interrupted output,
partial Unicode-line reconnects, backpressure, disconnect during pending reads,
late backend failures, upload deadlines and shutdown without closing the queue.
The plain Node smoke test exercises the built HTTP export on both backends.
The full existing suite, including controlled process-crash recovery, passes.
These are interface and transport checks, not scaling or accuracy evidence.

The README documents routes, errors, local deployment, ownership and cursor
recovery. The root `npm run package:contents`, using the batch npm cache,
stopped because `dist/calc.d.ts` is absent. A scripts-disabled npm pack dry run
confirmed that no `batch/` file is included. All changes stay inside `batch/`,
all tracked and new batch files are below the file-size limit, and batch
documentation contains no em dashes. No root build, archive creation or git
write was performed. M10 remains the next milestone.

## M10 session checks

`npm run typecheck`, `npm test` and `npm run build` passed from `batch/` on
Node 22.23.3. The build now includes a CLI beside the worker entry under the
ignored `.generated/` directory. Commands submit bounded UTF-8 job definitions
from files or stdin, read status and progress, export resumable NDJSON, run
SQLite workers, or start workers with the HTTP API on SQLite or explicit memory
storage. They reuse the existing queue, scheduler, control and streaming APIs.

[test/cli.test.ts](test/cli.test.ts) checks the built CLI in subprocesses with
synthetic jobs for all workloads. It covers canonical keyed replay and conflicts,
argument and input boundaries, malformed UTF-8, default and explicit paths,
fixed exit codes, stdout/stderr separation, finite and following exports, cursor
resumption, signals during input and output waits, and broken output pipes.
Socket tests check memory service operation, SQLite sharing between CLI and
HTTP, and failed-listener cleanup without claiming queued work. Worker tests
interrupt active SQLite work with SIGTERM and SIGKILL, restart against the same
file, and compare retained prefixes and resumed suffixes with serial execution.
The full existing suite, including controlled persistence-boundary crash tests,
also passes. These checks establish interface and recovery behavior, not scaling
or astronomical accuracy.

The README documents command ownership, output conventions, signals, retry and
cursor recovery. The root `npm run package:contents`, using the batch npm cache,
stopped because `dist/calc.d.ts` is absent. A scripts-disabled npm pack dry run
confirmed that no `batch/` file is included. All changes stay inside `batch/`,
all tracked and new batch files are below the file-size limit, and batch
documentation contains no em dashes. No root build, archive creation or git
write was performed. M11 remains the next milestone.

## M11 session checks

`npm run typecheck`, `npm test` and `npm run build` passed from `batch/` on
Node 22.23.3. The optional `RedisQueue` uses a caller-owned connected client
and an explicit dedicated hash key. Its Lua script stages mutations before
the final hash write, uses server time for lease fencing and retries, retains
opaque definition/result JSON, and bounds its unfinished-job directory.
The CLI retains SQLite as its default; applications can inject Redis into
the existing scheduler, HTTP control and streaming APIs.

[test/redis-queue.test.ts](test/redis-queue.test.ts) runs the unchanged queue
and retry contracts through independent clients backed by a stateful mock.
Additional tests cover lost acknowledgements, failures before execution,
write-time lease and cursor races, independent closure, retained prefixes,
exact numeric metadata, schema refusal, bounded paging, capacity and staged
mutation failures. The test-only Fengari dependency executes the production
Lua source; [test/redis-mock.test.ts](test/redis-mock.test.ts) checks the mock's
command and failure behavior. Its Lua runtime and JSON bridge differ from
Redis, and no live server, replication, persistence or failover guarantee is
claimed. The README records client ownership and deployment assumptions.

[test/redis-integration.test.ts](test/redis-integration.test.ts) uses real
workers and local HTTP sockets with mocked Redis for every workload. It
checks status, following NDJSON disconnect and cursor resumption, keyed replay,
exact stored engine JSON and cleanup after a connection failure. Existing
SQLite crash recovery and CLI tests also pass. These are state-transition and
integration checks, not throughput or astronomical accuracy evidence.

The root `npm run package:contents`, using the batch npm cache, stopped because
`dist/calc.d.ts` is absent. A scripts-disabled npm pack dry run confirmed that
no `batch/` file is included. All changes stay inside `batch/`, all tracked and
new batch files are below the file-size limit, and batch documentation contains
no em dashes. No root build, archive creation or git write was performed.
M12 remains the next milestone.

## M12 session checks

`npm run typecheck`, `npm test` and `npm run build` passed from `batch/` on
Node 22.23.3. [scripts/benchmark.mjs](scripts/benchmark.mjs) builds an isolated
runner and worker bundle, captures exact source and dependency hashes, and
measures the real scheduler on memory and default SQLite. The scaling run's
[compact JSON](docs/evidence/scaling-20261013.json) and
[generated table](docs/evidence/scaling-20261013.md) retain all samples, runtime
and CPU allocation observations, synthetic workloads, per-job elapsed times,
failures, rates and observed file sizes. Every sample passed, and every stored
NDJSON digest matched serial execution on this build. Source and bundle hashes,
timing sums and throughput arithmetic were checked before retaining the evidence.

The benchmark measures repeated bounded jobs with warmed workers. SQLite opens,
verification, cleanup and pauses are outside the measured intervals; their
sample wall time is recorded separately. This scope keeps runtime databases and
WAL files below the file-size limit and does not establish throughput for a
single large job or a continuously running service. The README describes the
method and limitations. Raw output is retained only in ignored temporary stores;
the committed evidence contains metadata and summaries, not result rows.

[test/benchmark.test.ts](test/benchmark.test.ts) checks deterministic synthetic
workloads and counts, serial digests, summary medians and matching baselines,
failed-group suppression, actual worker execution on both backends, deliberate
digest failure, file budgets, cleanup and invalid command options.
[test/benchmark-metadata.test.ts](test/benchmark-metadata.test.ts) checks CPU
quota and affinity parsing, cgroup mount resolution and visible ancestor limits.
The full existing suite, including process-crash recovery, also passes. These
checks establish benchmark and transport behavior, not astronomical accuracy.

The root `npm run package:contents`, using the batch npm cache, stopped because
`dist/calc.d.ts` is absent. A scripts-disabled npm pack dry run confirmed that
no `batch/` file is included. All changes stay inside `batch/`, all tracked and
new batch files are below the file-size limit, documentation contains no em
dashes, and the new evidence links resolve. No root build, archive creation or
git write was performed. M13 remains the next milestone.

## M13 session checks

`npm run check` passed from `batch/` on Node 22.23.3: typechecking, the complete
Vitest suite, the batch build and repository audit. The new
[operating guide](docs/operations.md) covers installation, submission, workers,
HTTP, cursor recovery, retries, shutdown, storage ownership and build identity.
Committed [examples](examples/charts.json) cover every workload, and
[test/examples.test.ts](test/examples.test.ts) runs their exact input through the
built CLI and real workers, checking status, keyed replay and resumed exports.

[test/reliability.test.ts](test/reliability.test.ts) runs mixed workloads through
real workers and local HTTP sockets on memory, SQLite and mocked Redis. It
checks a committed prefix, lease abandonment and expiry, persistent-handle
reopening, stale-token fencing, an execution failure and retry, idempotency,
following NDJSON and exact serial transport parity. Memory retains its original
live queue; mocked Redis does not establish real server durability. Existing
controlled SQLite process-kill and CLI restart tests also pass.

[test/large-job.test.ts](test/large-job.test.ts) completes a single job of 2,000
invented charts with bounded real-worker dispatch, contiguous streamed cursors,
no failed attempts and incremental serial/NDJSON digest parity. It writes no
export file and makes no throughput or heap claim. The queue retains its stored
rows. [docs/reliability.md](docs/reliability.md) maps the checks to their scope
and limitations.

[test/evidence.test.ts](test/evidence.test.ts) verifies the historical scaling
record's manifest digest, input hashes, complete sample matrix, interval sums,
counts, throughput arithmetic and exact table rendering. The README now scopes
those figures to the recorded source manifest. No old benchmark evidence was
changed. [scripts/audit.mjs](scripts/audit.mjs) checks local links, source sizes,
documentation punctuation, ignored-data boundaries, source symlinks, working-tree
scope and npm exclusion. After review corrected dangling-link detection and
test failure cleanup, typechecking, the affected tests and the audit passed again.

The root `npm run package:contents`, using the batch npm cache, stopped because
`dist/calc.d.ts` is absent. The scripts-disabled npm pack dry run passed exclusion
of `batch/`; it is not a substitute for root size/export checks. All changes
stay inside `batch/`, all tracked and new batch files are below the file-size
limit, and documentation has no em dashes. No engine build, archive creation,
release action or git write was performed. All planned milestones are complete.
