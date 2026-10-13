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
- [ ] M4 Implement the default SQLite backend with migrations, transactions, durable job definitions, leases and result checkpoints. Run the backend contract suite against independent connections and reopen tests.
- [ ] M5 Add the worker_threads pool and scheduler with bounded dispatch, worker replacement, progress updates and graceful shutdown. Test parallel work, worker failure and shutdown during active work.
- [ ] M6 Add bounded retries, retry delays, terminal failure and idempotency keys with payload conflict detection. Test duplicate submissions, stale lease fencing and retry exhaustion on both backends.
- [ ] M7 Complete crash recovery and resumable jobs with atomic result/checkpoint commits and expired-lease recovery. Use child processes killed at controlled persistence boundaries to prove resumed output has no lost or duplicate rows.
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
