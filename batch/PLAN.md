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
- [ ] M8 Stream result rows as NDJSON with stable cursors, backpressure and disconnect handling. Test partial reads, reconnects, escaping and large workloads without collecting all output in memory.
- [ ] M9 Add the small HTTP control API for submit, status, progress and streamed results, with bounded request bodies and clear errors. Test routes, idempotency conflicts and client disconnects over real local sockets.
- [ ] M10 Add the CLI for submission, worker/service operation, status and NDJSON export using the same service APIs. Test subprocess exit codes, stdout/stderr separation and restart with SQLite.
- [ ] M11 Add the optional Redis backend behind an injected client and explicit configuration. Run the backend contract suite with a stateful mock and test atomic operations and connection failures; document what the mock cannot establish.
- [ ] M12 Commit the scaling benchmark runner and compact machine-specific evidence for throughput versus worker count using synthetic workloads. Record runtime, engine/source identity, CPU allocation, workload, elapsed time and failures; keep raw generated rows gitignored and every committed file below the file-size limit.
- [ ] M13 Finish operating documentation, examples and an integrated reliability check covering all workloads, backends, interfaces and recovery. Verify batch isolation from npm packing, evidence links, documentation claims and repository constraints.

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
