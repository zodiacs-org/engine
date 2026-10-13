# Batch compute workspace

This private project is the batch compute service for this engine checkout.
The completed work is checked off in [PLAN.md](PLAN.md). The current
implementation validates job definitions, expands work lazily, executes it
through the engine, provides in-memory, SQLite and optional Redis queues with retries and
idempotent submission, schedules work on a thread pool, and exposes job control
and NDJSON results through a CLI and a small HTTP API. SQLite crash recovery is
checked with controlled process kills. A [worker scaling benchmark](#worker-scaling-benchmark)
records measured small-job throughput on the development machine.

Start with the [operating guide](docs/operations.md) and its runnable synthetic
examples. [Reliability checks](docs/reliability.md) maps the integrated check to
its tests and states what those checks establish.

All project files stay here. The engine source, npm package and carried archives
are unchanged. Code and documentation in this folder use the repository's
[MIT licence](../LICENSE). Consuming or redistributing the engine still requires
its [licensing and attribution terms](../LICENSING.md).

## Development

Use Node 22 with the runtime range declared in [package.json](package.json):

```sh
cd batch
npm ci --ignore-scripts --cache .cache/npm
npm run check
```

Dependencies and the lockfile belong to this directory. Typechecking emits
nothing. Vitest runs only `test/` here and keeps its cache in `.cache/`.
Generated code belongs in `.generated/`, runtime databases and exports in
`.runtime/`, and raw benchmark output in `.generated/`; these paths are ignored.
Keep committed benchmark evidence compact and link it to its runner.

`npm run check` runs typechecking, the complete Vitest suite, the batch build,
and [the repository audit](scripts/audit.mjs), stopping on a failed step.
The audit checks local documentation/evidence links, source file sizes,
documentation punctuation, generated-data exclusion, working-tree scope and a
scripts-disabled npm packing dry run. It reads git metadata but never writes it.
Individual checks remain available as `npm run typecheck`, `npm test` and
`npm run build`. None invokes the root engine build or writes an archive.

The contracts use the engine's public birth vocabulary, and the execution
bridge imports its public source entry by a relative path. The batch build
bundles that source with the pinned `astronomy-engine` dependency from this
directory into `.generated/index.js`, `.generated/worker-entry.js` and
`.generated/cli.js`. Keep these generated entries together when running the
default worker pool or CLI. The build does not run the engine build. Vitest and
TypeScript resolve the same dependency from this installation. An unbundled root source import cannot
find dependencies installed only here.

[test/build.test.ts](test/build.test.ts) builds from the checkout root and runs
the resulting entry in plain Node with invented chart input. It submits,
claims, computes, commits and reads that job through memory and SQLite, then runs
parallel chart jobs through the scheduler and compares their rows with serial
execution. It checks runtime imports, result shape and engine version without
requiring root dependencies or engine build output.

The repository's `npm run package:contents` check requires an existing engine
`dist/`. If it is absent, record the missing prerequisite; do not run the root
build as part of this project. An npm pack dry run with scripts disabled can
still confirm that `batch/` is excluded from the engine's package.

## Command line operation

Build first, then run `.generated/cli.js` with Node. The commands below run from
`batch/`. They use `--no-warnings` to suppress Node runtime warning lines when
reading stderr as JSON; without it, runtime warnings can accompany the CLI's
own records. `node .generated/cli.js --help` prints the command reference.

`submit`, `status` and `export` open SQLite directly. They do not send HTTP
requests or start calculation workers. The default database is
`batch/.runtime/queue.sqlite` for the standard build, independent of the caller's
working directory. More precisely, it is `../.runtime/queue.sqlite` relative to
the generated entry's directory. Moving the built entries changes that default.
An explicit `--db PATH`, and a submission file path, resolve from the caller's
working directory. Submission and service startup create missing database parent
directories; status and export refuse a missing database without creating one.

Submit a bare job definition, as described below, from a regular UTF-8 JSON file
or from stdin using `-`. The CLI input is the job itself; the HTTP API uses its
own submission envelope. This example uses invented data:

```sh
node --no-warnings .generated/cli.js submit - --idempotency-key synthetic-cli-example <<'JSON'
{
  "version": 1,
  "kind": "charts",
  "births": [{ "id": "synthetic-cli", "birth": { "utc": "2001-02-03T04:05:06Z" } }]
}
JSON
```

Submission prints `{ "job": snapshot }` to stdout. Save the returned job ID.
An optional `--max-attempts N` and `--retry-delay-ms N` select the queue retry
policy. Repeating a submission with the same `--idempotency-key`, canonical job
and effective retry policy recovers its current snapshot; a different job or
policy under that key fails. Neither filenames nor submitted values are copied
into error diagnostics. Input is byte-bounded before JSON parsing and malformed
UTF-8 rejects. Named pipes must be supplied through stdin rather than as files.

Start a worker in another terminal, and replace `JOB_ID` in the read commands
with the submission's returned ID:

```sh
node --no-warnings .generated/cli.js worker
```

```sh
node --no-warnings .generated/cli.js status JOB_ID
node --no-warnings .generated/cli.js export JOB_ID --follow > .runtime/results.ndjson
```

Every process must use the same database path. `status` prints
`{ "job": snapshot }`, including committed progress and retry state.
`export` writes only stored NDJSON rows to stdout and honors destination
backpressure. Without `--follow`, it exports the committed prefix fixed by its
first page read and can succeed with empty output for a queued job. With
`--follow`, it waits for new commits until completion or terminal failure.
`--cursor N` starts at a saved cursor at or behind committed progress;
`--poll-ms N` controls following-result polling in milliseconds. Successful
export does not mean successful calculation: check status separately.

Retain each complete newline-ended result and its `nextCursor` together.
Discard any incomplete trailing line after interruption and resume with the
last retained cursor. Export never claims jobs or changes their progress.
A broken output pipe is an operational failure, and a signal interrupts the
reader and its polling. The database handle is closed after the reader stops.

`serve` starts the worker scheduler and the [HTTP control API](#http-control-api)
in the same process:

```sh
node --no-warnings .generated/cli.js serve
```

The default listening address is `127.0.0.1:3000`. `--host IP` accepts an IP
literal, and `--port 0` asks the operating system for an available port. The
readiness record reports the actual host and port. The API is intended for
trusted local clients; see its access-boundary requirements below.
`serve --memory` runs a disposable in-process queue, accessed through HTTP;
separate CLI commands cannot access it. It cannot be combined with `--db`.

Both `worker` and `serve` accept `--workers N`, `--lease-ms N` and `--poll-ms N`.
These control worker capacity, renewed lease duration and idle queue polling;
timer values are milliseconds. On `serve`, this polling option applies to the
scheduler, while HTTP following streams retain the HTTP API's polling default.
The scheduler and queue constants define the defaults and bounds. Options and
values must be separate tokens; unknown, repeated or command-inappropriate
options reject, as do noncanonical decimal integer values. Invalid arguments
are rejected before opening storage or listening.

Services write a JSON readiness line to stderr: `{ "event": "ready", "command":
"worker" }`, with `host` and `port` also present for `serve`. Readiness means the
scheduler has started and the HTTP socket, when requested, is listening;
calculation threads are started lazily. Services leave stdout empty. Errors
write `{ "error": { "code": "...", "message": "..." } }` to stderr, without
raw storage errors, submitted values or stack traces.

| Exit code | Meaning |
| --- | --- |
| `0` | Command completed, or a service shut down cleanly after SIGINT or SIGTERM. |
| `1` | Operational failure, including input-file, storage, listener or output-pipe failure. |
| `2` | Invalid command arguments, JSON input, job definition or queue arguments. |
| `3` | Missing job or database for status or export. |
| `4` | Idempotency key conflicts with a different submission. |
| `130` | A one-shot command was interrupted by SIGINT. |
| `143` | A one-shot command was interrupted by SIGTERM. |

On SIGINT or SIGTERM, `serve` closes HTTP consumers, stops dispatch, drains and
checkpoints active calculations, releases unfinished work, then closes the
queue. `worker` follows the same scheduler and queue shutdown sequence.
Operational shutdown failures still fail the command. Restart either command
against the same SQLite file to continue queued work. After a crash or SIGKILL,
a replacement scheduler waits for the old lease to expire and applies retry
policy before resuming the committed prefix. See [Crash recovery](#crash-recovery)
for acknowledgement ambiguity and build consistency. Memory service state is
lost on exit.

The command contract and exit mapping are implemented in
[src/cli-options.ts](src/cli-options.ts) and [src/cli.ts](src/cli.ts).
[test/cli.test.ts](test/cli.test.ts) exercises the built CLI through subprocesses,
with synthetic workloads, separate stdout and stderr, argument and input
validation, HTTP service operation and SQLite worker restart. These checks
establish interface and recovery behavior, without a throughput or astronomical
accuracy claim.

## Job definitions

Import `parseJobJson` or `validateJob` from [src/index.ts](src/index.ts).
`parseJobJson(text)` checks the UTF-8 byte budget before JSON parsing;
`validateJob(value)` handles already-parsed data, so it applies row and task
budgets but cannot enforce an original request byte count. Both return
`{ spec, totalTasks }`, a deeply frozen snapshot independent of caller objects.
`spec` fills birth defaults and normalizes timestamp fractions, without
reordering input rows. No astronomy is computed during validation.

This example uses invented data and matches the charts schema:

```json
{
  "version": 1,
  "kind": "charts",
  "births": [
    {
      "id": "synthetic-a",
      "birth": {
        "utc": "2001-02-03T04:05:06Z",
        "latitude": 12,
        "longitude": 34,
        "houseSystem": "whole"
      }
    }
  ]
}
```

| Kind | Required fields in addition to `version` and `kind` | Result row count |
| --- | --- | --- |
| `charts` | `births`, a nonempty array of `{ id, birth }` | Input birth count |
| `transit-grid` | `births`, `start`, `end`, `stepMs` | Birth count multiplied by sample count |
| `synastry-matrix` | `people`, an array of `{ id, birth }` with distinct members | N multiplied by (N minus one) |

For a transit grid, samples are `start + k * stepMs` while strictly before
`end`. The start is included; the end is excluded even when aligned to the
step. The step is a positive safe integer in milliseconds, independent of
calendar days or daylight saving. End must be later than start. A synastry
matrix is directed: both `(a, b)` and `(b, a)` are included and self-pairs are
excluded. The engine's labels and tie ordering depend on argument order.
Enumeration uses input order, birth first then time for a grid and row
first then column for a matrix.

Births accept only `utc`, paired `latitude` and `longitude` in degrees,
`houseSystem`, and `timeKnown`. Omitting the settings means `whole` and `true`.
The supported house names come from the engine's `HouseSystem` type. Instants
must use `YYYY-MM-DDTHH:mm:ss[.sss]Z`, with optional fractional seconds up to
millisecond precision. Valid fractions normalize to milliseconds. Date-only
strings, numeric timestamps, Date objects, offsets, expanded years and local
wall times are not accepted by this transport. Resolve local times before
submission. `timeScale`, `deltaT` and input flags are not part of this schema.
An unknown birth time still requires an explicit reference instant and
`timeKnown: false`.

Validation checks calendar and clock fields, coordinate bounds, boolean and
house settings, unique ASCII identifiers, known fields, and dense JSON arrays.
Identifiers are case-sensitive, start with an ASCII letter or digit, and then
contain only ASCII letters, digits, dots, underscores, colons or hyphens.
It rejects explicit null or undefined settings. JSON parsing follows
`JSON.parse`, including its handling of repeated object keys. Calendar-valid
input is not a guarantee of ephemeris support or astronomical accuracy; the
engine's calculation checks remain necessary at execution time.

Limits are exported as `DEFAULT_LIMITS` in [src/model.ts](src/model.ts).
Callers may override `maxInputBytes`, `maxPeople` and `maxTasks` with positive
safe integers. Workload arithmetic uses integers before comparing the result
with the budget; no expanded work-item array is allocated. `totalTasks` counts
output rows, not engine calls or predicted execution time.

Invalid JSON or ordinary data input throws `JobValidationError` with `code` and `path`.
Codes are `invalid-input`, `unsupported-version`, and `limit-exceeded`.
Messages contain schema paths and fixed descriptions, without submitted IDs,
birth values or JSON parser text.
In-process proxies are executable caller code; their reflection traps may run
and throw their own errors. Use the JSON entry point for transport input.

The synthetic cases in [test/validation.test.ts](test/validation.test.ts)
enforce these schema rules, workload counts, default budgets and boundaries.
They test the wrapper's behavior and make no astronomical accuracy claim.

## Work items and serial execution

`workItems(job, cursor)` returns a lazy iterator over a validated job.
`workItemAt(job, index)` seeks directly to a row. A cursor is the zero-based
index of the next row to process; the default is zero. Passing `totalTasks` to
the iterator returns no rows. Direct lookup requires an index below
`totalTasks`. Both reject negative, fractional, non-finite, unsafe or
out-of-range indices at call time. They do not enumerate preceding rows when
resuming. The job must be the frozen snapshot returned by `validateJob` or
`parseJobJson`; after loading a persisted definition, validate it again.

Work items contain `kind` and `index`, plus `person` for a chart, `person`,
`sampleIndex` and `at` for a transit sample, or `a` and `b` for a directed
synastry pair. Each item is frozen and references the validated job's frozen
people. Grid and matrix index arithmetic uses integers, including when callers
raise the task budget. [test/work.test.ts](test/work.test.ts) checks ordering,
range edges, resume boundaries and seeking near the safe-integer limit without
expanding the workload.

`executeWorkItem(item)` computes a work item through `natalChart`, `transits`
or `synastry`. `executeSerial(job, cursor)` yields those results in order,
computing only when its caller pulls the next row. It runs synchronously in
the calling thread. It retains no chart cache or completed result collection;
each row calls the engine independently. The validated inputs remain in memory,
and callers control whether to retain the yielded rows.

After building, this example runs from `batch/` in an ES module and uses only
invented data:

```js
import { executeSerial, validateJob } from "./.generated/index.js";

const job = validateJob({
  version: 1,
  kind: "charts",
  births: [{ id: "synthetic-a", birth: { utc: "2001-02-03T04:05:06Z" } }]
});
for (const row of executeSerial(job)) {
  console.log(JSON.stringify(row));
}
```

Result rows carry `version`, `kind`, `index`, `nextCursor` and `value`.
`value` is the complete engine result in its JSON representation: dates are
ISO strings, finite numbers use standard JSON serialization, and engine flags
and metadata remain present. Transit results include their natal
chart, and synastry results include both charts. Each row holds fresh JSON
objects; changing one does not change the validated input or a later result.
Chart rows also carry `personId`; transit rows carry `personId`, `sampleIndex`
and `at`; synastry rows carry `aId` and `bId` in the engine's argument order.

`nextCursor` names the row after a successful result. The serial executor does
not persist results or advance a queue. Use it for resumption only after
retaining the corresponding result, for example through the queue's `commit`
operation below. With the same validated definition and engine/runtime,
resuming there produces the remaining suffix. Do not reuse a cursor for a
different job.

An engine exception or non-finite numerical result throws `WorkExecutionError`
with `code: "calculation-failed"`, `kind` and `index`. Its message is fixed
apart from the work kind and row index; it carries no raw engine error or
submitted birth value. A failed serial iterator ends at that row, without
skipping it or computing subsequent rows. Resuming from the failed index
attempts it again. The queue and scheduler below manage retry policy.

[test/execution.test.ts](test/execution.test.ts) compares these JSON values
with direct engine calls on synthetic charts, transit samples and directed
pairs. It checks flags, incremental computation, every resume boundary in its
test jobs, result isolation and failures. These are wrapper parity and
regression checks, with no additional astronomical accuracy claim.

## Queue contract and in-memory backend

[src/queue.ts](src/queue.ts) defines the asynchronous `QueueBackend` contract.
`MemoryQueue` implements it in the calling process. Schedulers sharing an
instance see the same jobs; separate instances and worker threads do not share
its state. All results remain in memory until `close()`, which discards the
queue. This backend cannot recover from a process exit. Use the SQLite backend
below for persistence and [Crash recovery](#crash-recovery) for process-kill tests.

This example runs from `batch/` after building, with invented data:

```js
import { MemoryQueue, executeSerial } from "./.generated/index.js";

const queue = new MemoryQueue();
const submitted = await queue.submit({
  version: 1,
  kind: "charts",
  births: [{ id: "synthetic-queue", birth: { utc: "2001-02-03T04:05:06Z" } }]
});
const claimed = await queue.claim({ owner: "local-worker", leaseMs: 60_000 });
if (claimed) {
  for (const row of executeSerial(claimed.job, claimed.snapshot.nextCursor)) {
    await queue.commit(claimed.lease, [row]);
  }
}
console.log(await queue.getJob(submitted.id));
console.log(await queue.readResults(submitted.id));
await queue.close();
```

The example's lease duration is a caller choice, not a computation-time
guarantee. A scheduler must renew before the deadline while computing work.
The synchronous serial executor blocks its calling thread; the worker pool
lets the scheduler renew leases while calculations run elsewhere.

| Operation | Behavior |
| --- | --- |
| `submit(spec, options)` | Validates a definition and retry policy, then creates a job or returns the current snapshot for an equivalent idempotency key. It does not expand work or compute astronomy. |
| `getJob(id)` | Returns a detached status snapshot, or null for an unknown ID. |
| `claim({ owner, leaseMs })` | Records expired attempts and atomically leases the earliest submitted eligible job. Skips live leases, delayed retries and terminal jobs. Returns null when none is eligible. |
| `renew(lease, leaseMs)` | Extends a current lease from backend time, without shortening its existing deadline. Returns the same token and new deadline. |
| `commit(lease, rows)` | Stores a nonempty contiguous result batch and advances progress together. Its final row completes the job and revokes the lease. |
| `release(lease)` | Requeues unfinished work, revokes the lease and keeps its committed prefix. |
| `fail(lease)` | Records a calculation failure, revokes the lease and schedules a retry or marks the job failed. Keeps the committed prefix. |
| `readResults(id, { cursor, limit })` | Returns an ordered page, its next cursor and the status observed with it, or null for an unknown ID. |
| `close()` | Releases the handle's resources. Repeated close calls succeed; all other calls then reject. |

Status snapshots contain the job ID and kind, `status`, `totalTasks`,
`completedTasks`, `nextCursor`, `claimCount`, `createdAt`, `updatedAt`,
`finishedAt`, `lease`, `retry`, `failureCount`, `retryAt` and `lastFailure`.
States are `queued`, `running`, `completed` and `failed`.
`finishedAt` is null until completion or terminal failure. `lease` is null when no scheduler owns
the job; otherwise it contains only `owner` and `expiresAt`. Status never
includes birth definitions or lease tokens. Claim responses additionally
carry the frozen validated job and a lease containing `jobId` and `token`.
`claimCount` counts granted leases, including explicit release/reclaim; it is
not a failure count or retry policy.

Timestamps and lease durations use safe integer milliseconds. Memory and SQLite
use `Date.now` by default; Redis uses server `TIME`. `MemoryQueue({ now })` accepts a controlled clock
for tests. Deadlines use backend wall time, so wall-clock adjustments can
affect lease timing. A lease is invalid when backend time is at or after
`expiresAt`, even before another scheduler reclaims it. Every claim gets a
fresh token, including a reclaim by the same owner. Only the current,
unexpired token may renew, commit, release or fail. Status reads do not change
stored state: an expired job still reads as running with its past deadline
until a claim operation records that expiry. Claims preserve committed results
and their cursor.

`completedTasks` and `nextCursor` both describe the contiguous committed
prefix. Scheduled work and results still held by a worker do not count as
progress. Batches must start at the current cursor, stay within the workload,
and match each expanded work item's kind, index and routing fields. A malformed
row rejects the entire batch. With a current lease, replaying an already
committed batch is a cursor conflict; read progress before resuming. After
completion, the former lease is lost. The scheduler computes concurrently
and buffers a bounded window of results until their predecessors are ready.

Commit validates JSON data shape and routing, not the truth of the calculated
values. Results come from trusted execution code. It rejects accessors,
functions, undefined values, sparse arrays, non-finite numbers, cycles and
non-JSON objects, instead of letting JSON serialization silently alter them.
`QUEUE_LIMITS` bounds batch rows, encoded UTF-8 bytes, traversal depth and
node count, page rows, owner-label length and job-ID/token length. The byte budget sums the encoded
rows without NDJSON delimiters. Owner labels use the same ASCII character set
as person identifiers. Queue submission uses `validateJob`; a transport must
enforce its input byte limit before parsing, as `parseJobJson` does.

Result pages default to the start cursor and the configured maximum page
length. Their cursor may be at or behind committed progress, never ahead of
it. An empty page on an unfinished job means no rows are available yet.
Pages and snapshots are detached; the job definition supplied by a claim is
deeply frozen. Callers cannot mutate queue state through them. No retention,
eviction or total-memory cap is provided by this development backend.

Queue option objects and lease references must contain ordinary enumerable
data fields; accessors, unknown fields and explicit undefined fields are
rejected. IDs and tokens must be bounded, nonempty strings. Invalid job
definitions retain `JobValidationError`. Queue failures use
`QueueError` with `invalid-argument`, `invalid-result`, `cursor-conflict`,
`lease-lost`, `idempotency-conflict` or `closed`. An unknown job's lease is lost. Diagnostics contain
fixed descriptions without birth data, result values or tokens. These
in-process APIs do not sandbox executable proxies or a supplied clock.

[test/queue-contract.ts](test/queue-contract.ts) is the reusable backend suite;
[test/memory-queue.test.ts](test/memory-queue.test.ts) supplies its memory
fixture. It checks competing claims, expiry and renewal boundaries, stale
tokens, prefix resumption, atomic result validation, completion, pagination
and snapshot isolation using synthetic workloads and a controlled clock.
Its asynchronous fixture accepts separate handles to the same store for
durable-backend tests. This is a state-transition check, not evidence
of process-crash durability or scaling performance.

## Retries and idempotent submission

Submission options accept `retry: { maxAttempts, delayMs }` and an optional
`idempotencyKey`. Omitted policy fields use `RETRY_DEFAULTS`; limits are
`QUEUE_LIMITS.maxAttempts` and `QUEUE_LIMITS.maxRetryDelayMs` in
[src/queue.ts](src/queue.ts). Attempts must be a positive integer and delay a
nonnegative integer in milliseconds. The default delay is zero, so a failed
job can be claimed immediately until its budget is exhausted. Supply a delay
to leave time between failed attempts. The delay is fixed, without backoff
or jitter. The policy is captured at submission and cannot be changed later.

`failureCount` counts failed attempts across the whole job. An explicit
`fail(lease)` records `execution-failed`; an expired lease records
`lease-expired` when a claim operation next checks it. Concurrent row failures
under the same lease consume the budget once. A graceful release consumes
none, and committed progress does not reset the budget. Once the failure
count reaches `maxAttempts`, the job becomes `failed` and cannot be claimed
again. Otherwise it becomes `queued` until `retryAt`, inclusive. The scheduler
may claim later eligible jobs while an earlier job waits for its retry.

Retry timing uses backend time: explicit failure time plus the configured
delay, or the expired lease's deadline plus that delay. Deadline arithmetic
saturates at the largest safe integer timestamp. Expiry is counted once,
even if many claim calls inspect the job. `lastFailure` contains only its
fixed `code`, `at` timestamp and first uncommitted `cursor`; raw exceptions
and worker messages are not stored. The failure record remains after a later
successful attempt. `updatedAt` reflects when the state changed; an expired
terminal attempt's `finishedAt` records its lease deadline. Result pages still
return a failed job's committed prefix. Uncommitted calculations can be repeated.

Keys are case-sensitive ASCII identifiers with the person-identifier character
set and `QUEUE_LIMITS.maxIdempotencyKeyLength` bound. Keys are scoped to the
whole backend store, retained for its lifetime, and omitted from snapshots.
Repeated submission with the same key returns the original job's current
snapshot, including after completion or failure. It never resets progress,
delay or failure count. An unkeyed submission always creates a new job.

Equality compares the full canonical job definition and effective retry
policy. Property order, timestamp fractions and omitted birth/policy defaults
normalize before comparison; input row order remains significant. Reusing a
key with a different definition or policy throws `idempotency-conflict`.
Validation precedes key lookup, so a malformed replay still rejects. Key
reservation and job creation are atomic, including across SQLite connections
and Redis handles sharing a dedicated key.
There is no key expiry or deletion API, and no tenant namespace is inferred.

[test/retry-contract.ts](test/retry-contract.ts), run against memory and SQLite by
[test/retries.test.ts](test/retries.test.ts), enforces policy defaults and
bounds, canonical replay, conflicts, concurrent submissions, delayed claims,
failure exhaustion, prefix preservation, lease fencing and expiry accounting.
[test/sqlite-queue.test.ts](test/sqlite-queue.test.ts) adds persistence and
migration checks. These tests establish queue behavior; the separate
[crash suite](test/crash-recovery.test.ts) exercises process kills.

## Default durable backend: SQLite

`SqliteQueue(filename, options)` in [src/sqlite-queue.ts](src/sqlite-queue.ts)
implements the same contract using Node's built-in `node:sqlite` module. It
needs no extra dependency. It requires SQLite at least
`SQLITE_QUEUE_DEFAULTS.minimumSqliteVersion`, enforced before opening the file
and tested in [test/sqlite-queue.test.ts](test/sqlite-queue.test.ts). This excludes
the releases affected by SQLite's
[WAL-reset corruption bug](https://sqlite.org/wal.html#walresetbug). The general
project Node range also covers the in-memory backend; SQLite needs a Node
runtime whose bundled SQLite meets this additional requirement. Create the
parent directory before opening a file;
runtime files belong under the ignored `.runtime/` directory. For example,
replace the queue construction in the synthetic example above with:

```js
import { mkdirSync } from "node:fs";
import { SqliteQueue } from "./.generated/index.js";

mkdirSync(".runtime", { recursive: true });
const queue = new SqliteQueue(".runtime/jobs.sqlite");
```

Every handle opens its own connection. Handles on the same file share job
definitions, insertion order, claim counts, retry state, idempotency bindings,
leases, progress and result rows.
Closing a handle preserves them and leaves other connections usable. Reopening
revalidates stored definitions when claiming or preparing a result commit.
Definitions stay compact; work items are expanded only when executing or
checking result routing. Results live in a separate table indexed by job and
cursor, and reads select only the requested page.

Schema migrations in [src/sqlite-schema.ts](src/sqlite-schema.ts) run under an
initialization write lock. An application marker distinguishes a queue file
from another application's database; an ordered migration list advances its
schema version in the same transaction. Unsupported versions, foreign markers
and unowned nonempty databases are refused. The constructor rejects empty
filenames and `:memory:`; use `MemoryQueue` for a disposable store.
The retry migration preserves existing queued, running and completed jobs,
their leases and result prefixes, and applies the default retry policy. It
starts their failure count at zero because the earlier schema recorded none.

Mutations acquire `BEGIN IMMEDIATE` before checking current state. Claim order
uses the insertion sequence, independent of wall-clock adjustments. Commit
prepares and validates the result batch outside the write transaction, then
checks the current token, expiry and cursor again after acquiring the lock.
Result inserts and the progress update either commit together or roll back
together. Result pages read metadata and rows inside the same read transaction.
These boundaries follow SQLite's [transaction semantics](https://sqlite.org/lang_transaction.html).

The connection uses WAL journaling, foreign-key enforcement and
`synchronous=FULL`. FULL requests a WAL sync on each commit. SQLite WAL requires
connections on the same host with a local filesystem that supports its locking
and shared memory; use a different backend for distributed hosts. Keep the
database and its live `-wal` and `-shm` companion files together. See SQLite's
[WAL documentation](https://sqlite.org/wal.html) and
[synchronous setting](https://sqlite.org/pragma.html#pragma_synchronous).

The asynchronous interface does not make SQLite IO asynchronous. Opening,
queries, commits and lock waits block the calling thread, as documented for
Node's [DatabaseSync](https://github.com/nodejs/node/blob/v22.22.2/doc/api/sqlite.md).
`busyTimeoutMs` bounds the lock wait; its default and maximum are exported as
`SQLITE_QUEUE_DEFAULTS`. Zero requests an immediate busy result. Choose lease
durations that allow for lock waits and storage latency. The `now` option is
for controlled tests; production connections use the same host's `Date.now`.
There is no implicit retry of a failed storage call.

Besides the shared validation and lease errors, SQLite reports `storage-busy`
for lock contention, `unsupported-schema` for refused schema markers, and
`unsupported-runtime` for an unsupported SQLite library, with `storage-failure`
for other database failures. Messages omit raw SQL diagnostics,
filesystem paths and stored values. If a storage operation's outcome is
uncertain, read the current job and cursor before attempting it again. No
retention policy, disk quota, backup service or database repair is implemented.

[test/sqlite-queue.test.ts](test/sqlite-queue.test.ts) runs the shared backend
contract through independent connections. Its synthetic cases also check
schema creation and refusal, lock contention, handle closure, clock boundaries,
reopen with live or expired leases, stored definitions for each workload,
prefix resumption, completed jobs and SQL failures during row inserts and
checkpoint updates. Those tests establish reopen and transaction behavior;
the separate [crash suite](test/crash-recovery.test.ts) exercises process
termination and restart. Neither suite simulates power loss or establishes
throughput.

The test-only bridge [test/native-sqlite.mjs](test/native-sqlite.mjs) lets the
existing Vitest loader access the real SQLite builtin. The production bundle
keeps its ordinary `node:sqlite` import; the plain Node smoke test exercises it.

## Optional Redis backend

`RedisQueue({ client, key })` in [src/redis-queue.ts](src/redis-queue.ts)
implements the same queue contract through an explicitly injected, connected
client. The key is required, has the identifier length limit in `QUEUE_LIMITS`,
and accepts ASCII letters, digits, dots, underscores, colons and hyphens with a
leading letter or digit. It names a dedicated Redis hash. Different keys are
independent stores; all producers and schedulers for a store must use the same
key and Redis database. SQLite remains the CLI default. Redis is a library
option wired into `Scheduler`, `createControlServer` and result streaming by
the application; the CLI does not create Redis connections.

The client interface only needs `sendCommand(args)`, returning a promise for
the decoded reply. With a caller-owned connected client that takes mutable
command arrays, the wiring is:

```js
import { RedisQueue, Scheduler, createControlServer } from "./.generated/index.js";

// connectedClient is supplied and configured by the host application.
const queue = new RedisQueue({
  client: { sendCommand: args => connectedClient.sendCommand([...args]) },
  key: "synthetic-batch-jobs"
});
const scheduler = new Scheduler(queue);
const control = createControlServer(queue);
// The host owns listening, scheduler.run(), shutdown and connection cleanup.
```

No Redis client package, URL, credentials or automatic connection is supplied.
Use a writable primary and configure command timeouts and disconnect rejection
in the injected client. Disable command replay and offline queuing: an expired
application request must not later create an unexpected submission or claim.
The adapter issues `EVAL` with its constant script and parameter arguments;
it performs no automatic retry. The client must return the script reply as a
string and reject command errors. `close()` only prevents future calls on that
queue handle. It neither cancels an already issued command nor closes the
shared client or removes stored jobs. Close the connection after dependent
schedulers and HTTP consumers have stopped.

The script in [src/redis-script.ts](src/redis-script.ts) accesses only the
explicitly supplied hash key. It retains definitions, status, idempotency
bindings and individual result rows as separate fields. Definitions and rows
stay as opaque JSON strings in Lua, preserving engine numbers and escaping.
Metadata integers use an explicit encoder so large safe integers are not
rounded by Lua CJSON's ordinary encoding precision. Each mutation prepares
its response and all changed fields before a final `HSET`; result rows and
the cursor are changed together. Commit first reads a live lease and its
definition for TypeScript result validation, then fences the token, expiry and
cursor again in the writing script. Reads return a snapshot and bounded row
fields from the same script execution.

Claims scan only unfinished job metadata in submission order, record expired
attempts, and select the earliest eligible job. `REDIS_QUEUE_MAX_PENDING` in
the script bounds the unfinished directory and the final command's argument
count. At that capacity, a new submission returns `storage-busy`; replaying
an existing idempotency key still succeeds. Completed or failed jobs leave
the directory but retain their definitions, rows and key bindings. This is a
job-count limit, independent of each job's task limit, not a bound on stored
bytes. There is no retention, deletion, backup or memory quota service.

Use a dedicated key without TTL or eviction, restrict other writers, and size
server memory for retained results. Wrong key types and unsupported schemas
are refused. Server script and transport errors become fixed `storage-failure`
diagnostics without raw connection messages. A failure can arrive after a
successful write: recover keyed submissions by repeating the same definition
and key, and recover commits by reading status and the committed cursor.
An unacknowledged claim keeps its lease until expiry; restarting a scheduler
then follows the existing retry policy. Do not blindly repeat mutations after
an uncertain acknowledgement.

Redis serializes scripts and blocks other server activity while they run; its
[scripting documentation](https://redis.io/docs/latest/develop/programmability/eval-intro/)
describes this behavior. The adapter targets Redis 7 or later, where scripts
use effects replication and may write after reading server `TIME`; it does
not detect the server version. Validate it against the chosen deployment before use.
Persistence, restart and failover durability depend on the deployment's
[persistence configuration](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/).
The SQLite process-kill evidence does not establish Redis durability.

[test/redis-queue.test.ts](test/redis-queue.test.ts) runs the unchanged backend
and retry contracts through independent mock clients and checks connection
failures before commands and after successful writes. The stateful mock in
[test/redis-mock.ts](test/redis-mock.ts) executes the actual production Lua
script using the test-only Fengari interpreter and mocks Redis hash commands
and server time. Its Lua runtime and CJSON bridge differ from Redis; it checks
our script's state transitions, not Redis networking, ACLs, cluster routing,
memory exhaustion, interpreter limits, replication, persistence or failover.
No live Redis integration or Redis throughput claim is made.

[test/redis-integration.test.ts](test/redis-integration.test.ts) connects the
mock-backed queue to real calculation workers and local HTTP sockets for every
workload. It checks committed progress, following-result disconnect and cursor
resumption, keyed replay, exact stored JSON and worker cleanup after a rejected
Redis command. These establish application wiring, without extending the
mock's storage or deployment guarantees.

## Worker pool and scheduler

`WorkerPool` in [src/worker-pool.ts](src/worker-pool.ts) computes work items
using Node's [worker_threads](https://github.com/nodejs/node/blob/v22.23.3/doc/api/worker_threads.md).
Each thread loads its own engine instance. Threads start on demand and remain
available for subsequent calls. `run(item, signal)` accepts an item from
`workItemAt` or `workItems` and returns its JSON result row. The optional abort
signal terminates the thread assigned to that call. Request IDs and routing
fields are checked before returning a worker response.

`size` sets the pool's `capacity`. At capacity, `run` rejects with
`WorkerPoolError` code `busy`; there is no unbounded waiting queue. A failed,
exited or aborted worker is replaced on a later dispatch, after it terminates.
Its unsuccessful calculation is not automatically resubmitted. Worker and
transport failures use code `worker-failed`, aborted calls use `aborted`, and
calls after `close()` use `closed`. Engine failures retain `WorkExecutionError`
with the work kind and index. Diagnostics omit raw worker errors and abort
reasons. `close()` is idempotent, rejects unfinished calls and waits for thread
termination. Idle threads do not keep an otherwise finished process alive.
An optional `workerUrl` is trusted executable code, intended for tests and
specialized executors; it is not job input.

`Scheduler(queue, options)` in [src/scheduler.ts](src/scheduler.ts) owns a
pool and coordinates its results with a `QueueBackend`. `run()` polls until
stopped or failed; repeated calls return the same promise. Each scheduler
claims a job, seeks to its committed cursor, and computes that job's rows
in parallel before claiming another job. Multiple schedulers can share a
backend. Queue state and lease tokens stay in the scheduler thread; workers
receive only the current work item.

The scheduler limits dispatched but uncommitted rows to pool capacity. Later
results wait for earlier ones inside that same window. It commits rows in
order and reports progress through `queue.getJob(id)`; in-flight calculations
and buffered results never advance progress. Each row is committed separately
through the queue's bounded validation and atomic checkpoint operation.

Options are `workers`, `owner`, `leaseMs`, `heartbeatMs` and `pollMs`. Durations
are positive integer milliseconds; heartbeat must be shorter than the lease.
Defaults and timer/worker limits are exported as `SCHEDULER_DEFAULTS`.
Configuration validation is checked in
[test/scheduler.test.ts](test/scheduler.test.ts). Omitting heartbeat uses a
fraction of the chosen lease duration. Owner defaults to a generated
identifier. A dedicated `TaskPool` may be injected as `pool` instead of
`workers`; its capacity bounds dispatch, its runs must settle when aborted,
and the scheduler closes it when finished.

Renewals continue while calculations or asynchronous commits are pending,
without overlapping other renewals. Backend time decides lease validity.
Lease loss aborts outstanding work, discards uncommitted results and resumes
claiming after the polling delay. Stale tokens cannot advance progress.
Renewal is not a deadline guarantee: an overloaded event loop or blocking
SQLite operation can delay it. Choose a lease that allows for those delays.

`stop()` stops claiming and dispatching new work, drains accepted calculations,
commits their contiguous results, releases an unfinished job, then closes the
pool. Call it from the embedding application's shutdown handler and await its
promise. It also wakes an idle poll immediately. Calling it before `run()`
performs no claim. Graceful shutdown waits for active work and backend calls;
it has no forced-shutdown deadline. The scheduler never closes the queue, so
the caller can read final progress and results before closing its handle.

An execution failure aborts outstanding sibling calculations, discards
uncommitted results and records the failed attempt through `queue.fail`.
The scheduler continues polling, retrying from the committed cursor according
to the stored policy and serving other jobs after terminal failure. An actual
calculation failure while draining for shutdown still counts; shutdown and
its sibling aborts do not add failures of their own.

A backend failure stops the scheduler with `SchedulerError` code `queue-failed`.
For failed claims, renewals or commits it attempts to release any unfinished
lease. If the failure-recording operation itself throws, its outcome may be
uncertain, so the scheduler does not issue a release that could erase a
recorded retry delay. A failed release or failure write can leave a lease until
expiry. A pool-close error uses `execution-failed`. The committed prefix
remains available, and `stop()` propagates the same run failure. A stopped or
failed scheduler is not restartable; create a new instance for another run.

[test/worker-pool.test.ts](test/worker-pool.test.ts) uses real threads for engine
parity, parallel dispatch, replacement, aborts, protocol failures and closure.
[test/scheduler.test.ts](test/scheduler.test.ts) controls task completion and
backend time to check bounded buffering, prefix commits, renewal, fencing,
retries, failure-write uncertainty and shutdown races.
[test/build.test.ts](test/build.test.ts) runs the built default pool and
scheduler against both queue backends in plain Node, including a synthetic
input whose calculation fails and exhausts its retry budget. These checks
use synthetic inputs and establish wrapper behavior, not astronomical
accuracy, process-crash durability or scaling performance.

## Crash recovery

Reopen the same SQLite file and start a new `Scheduler` to resume unfinished
jobs. Preserve the database and its WAL companions. No startup reset, result
deletion or manual lease release is needed. An unexpired lease still belongs
to its recorded owner even after that process dies. A status read can show
that old running state until a scheduler's claim records the expiry. Once
the deadline and any retry delay have passed, claims can resume work, subject
to the stored attempt budget. Process termination itself does not write a
failure record; lease expiry consumes the attempt when a claim observes it.

Only committed rows count as progress. Each result batch and its cursor
advance share a transaction. Interruption before that transaction commits
leaves the previous prefix; interruption after commit preserves the new
prefix even if the caller never received the acknowledgement. The final
transaction also records completion and revokes the lease, so losing its
acknowledgement cannot reopen a completed job or consume a retry. A fresh
scheduler seeks to the persisted `nextCursor` and gives every replacement
claim a new token. Old tokens cannot commit, renew, release or fail that job.

Calculations may run again after a crash: values held by a worker or buffered
by a scheduler are not saved until committed in order. Stored output is a
contiguous prefix with a unique row per cursor; this does not promise that
each calculation runs only once. Custom executors should not depend on
external side effects happening once. A terminally failed job keeps its
committed prefix but is not resumed automatically.

When a submit acknowledgement is lost, resubmit the same canonical definition
and retry policy with the same idempotency key to recover the original job.
An unkeyed resubmission creates another job. After an uncertain commit outcome,
read the job's cursor before choosing any rows to resubmit; replaying an
already committed prefix under a still-current lease is a cursor conflict.

Use the same engine source, dependencies and runtime for an interrupted
workload and its restart. The queue persists the job definition and rows but
does not pin or validate the executable build. Changing it mid-job can mix
results from different builds in the stored prefix and resumed suffix.

[test/crash-recovery.test.ts](test/crash-recovery.test.ts) builds an isolated
bundle and starts child processes using the real SQLite backend. Its
[child fixture](test/fixtures/recovery-child.mjs) pauses native database calls
after a result insert, after the checkpoint update, or after SQLite commits
but before the queue returns. The parent waits for a synchronous boundary
report, sends `SIGKILL` while the connection and WAL remain open, and waits
for process exit before reopening. The pause instrumentation exists only in
the test child; no production failpoint or recovery bypass is exposed.

For each supported workload, the tests interrupt both intermediate and final
batches. They check the retained prefix, SQLite integrity and foreign keys,
raw stored JSON and row cursors, then restart in a fresh process with real
workers and compare paged output to uninterrupted serial execution on the
same synthetic inputs. The restart must dispatch precisely the uncommitted
suffix. Separate cases cover lost submission and claim acknowledgements,
expiry accounting interrupted before commit, stale-token fencing, retry
delay and exhaustion, and a killed scheduler with computed out-of-order
results waiting behind a missing predecessor.

The tests control backend time to check lease and retry boundaries without
timing the kill against a wall-clock sleep. They establish process-crash
behavior at those persistence boundaries on the test host. They do not
simulate host power loss, hardware failure, filesystem corruption or a
network filesystem, and serial parity is not independent astronomical
accuracy evidence. The in-memory backend loses its state when its process
exits and cannot provide this recovery behavior.

## Streaming results as NDJSON

`resultLines(queue, jobId, options)` in
[src/result-stream.ts](src/result-stream.ts) is an async iterator of complete
NDJSON lines. Each line is the stored result row serialized as JSON followed
by a newline. It keeps the row's `version`, workload routing fields, `index`,
`nextCursor` and `value`. Quotes, backslashes and control characters are JSON
escaped; Unicode is preserved. There are no status, heartbeat or error records
mixed into the result rows.

The default finite export freezes its end at the committed cursor in the
first atomic page read. Later commits belong to a later export. An empty
committed prefix produces an empty export, even if the job is queued or
running. Finishing a finite export does not establish that the job completed;
read its status separately.

With `follow: true`, the reader emits the existing prefix, then polls for new
commits while the job is queued, running or waiting to retry. It stops after
draining the committed prefix of a completed or terminally failed job. Failure
does not erase that prefix or add a diagnostic line. A stalled job can leave a
follower waiting indefinitely; its caller can abort the read. The reader does
not start a scheduler, recover expired leases or advance job state.

`cursor` is the next row to include and defaults to the start of the job.
It must be a nonnegative safe integer at or behind committed progress. Save
the job ID and a row's `nextCursor` together only after receiving, parsing and
retaining the complete newline-ended row. On disconnect, discard any partial
trailing line, including incomplete UTF-8, and reconnect from that saved
cursor. Chunks from a byte stream need not align with lines or characters.
A cursor supplied ahead of committed progress rejects instead of waiting for
the job to reach it. Readers do not acknowledge or delete stored results.

`pageSize` bounds fetched rows, and `pollMs` is the positive integer wait in
milliseconds after reaching an active job's current prefix. Defaults and
timer limits are exported as `RESULT_STREAM_DEFAULTS`; the page-size maximum
is `QUEUE_LIMITS.maxPageRows`. Options are captured at creation and validated
before any read. Queue reads are lazy, sequential and do not fetch a later
page until the current page has been consumed. Periodic event-loop yields let
timers and disconnect notifications run during an otherwise immediately ready
export. The boundaries are enforced by
[test/result-stream.test.ts](test/result-stream.test.ts).

`createResultStream(queue, jobId, options)` exposes the same export as a Node
Readable of UTF-8 bytes. It adds a bounded `highWaterMark` option; its default
and upper bound are in `RESULT_STREAM_DEFAULTS`. Use Node's
[`pipeline`](https://nodejs.org/docs/latest-v22.x/api/stream.html#streampipelinesource-transforms-destination-callback)
to propagate destination backpressure and failures to the reader. For example,
with an open queue, an existing `jobId`, and the ignored `.runtime/` directory
already created, this writes a finite export after building:

```js
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { createResultStream } from "./.generated/index.js";

await pipeline(
  createResultStream(queue, jobId),
  createWriteStream(".runtime/results.ndjson", { flags: "wx" })
);
```

The iterator holds a bounded page, not the whole export. The byte stream also
buffers according to its high-water threshold, which a single row can exceed.
Each stored row fits the queue's serialized batch byte limit. Larger page
sizes can therefore retain much more JSON than the byte stream's buffer.
Parsed objects, string encoding and the caller's destination have additional
memory costs. The in-memory queue itself still retains all stored results;
streaming cannot remove that storage cost. The large-workload test uses a lazy
synthetic reader and a counting sink, checks bounded read-ahead while the sink
stalls, and retains no complete export. It is not a heap or throughput benchmark.

Both APIs accept an `AbortSignal`. An abort throws `ResultStreamError` with
code `aborted`, without copying its reason. Destroying the Readable interrupts
its pending page wait or poll timer and removes listeners. Breaking a
`for await` over `resultLines` ends iteration; to interrupt a pending `next()`
that is waiting for rows, abort its signal. Queue backends have no cancellation
method, so an already-started asynchronous read can still finish after the
reader stops; its result is discarded and a late rejection is handled.
Synchronous SQLite reads and JSON encoding cannot be preempted mid-call.
Disconnecting a consumer never closes the shared queue or changes a job's
lease, retry state or progress.

Unknown jobs reject with `ResultStreamError` code `not-found`. Broken page
cursors, routing or serialized row bounds produce `invalid-page`. Queue errors
retain their fixed codes; other backend exceptions become `read-failed` without
raw diagnostics. An error after some rows have streamed ends the stream with
those complete lines still usable. There is no automatic read retry. Backends
must fulfill the queue contract, including detached bounded JSON; an injected
backend is trusted executable code, not untrusted result input.

[test/result-stream-queue.test.ts](test/result-stream-queue.test.ts) checks
exact stored JSON for every workload on both backends, every cursor in its
synthetic jobs, concurrent commits during finite exports, following retry and
failure states, escaping, and resumption after SQLite reopen.
[test/result-stream.test.ts](test/result-stream.test.ts) covers partial Unicode
lines, backpressure, read failures, broken pages, abort during reads and polling,
listener cleanup, and event-loop fairness. The
[plain Node smoke test](test/build.test.ts) checks the built exports too.
These checks establish transport behavior, not astronomical accuracy.

## HTTP control API

`createControlServer(queue, options)` in [src/http-control.ts](src/http-control.ts)
returns `{ server, close }`. The Node HTTP server is initially unbound. The
embedding application chooses its listening address and runs a `Scheduler`
separately; requests never calculate charts, claim work or recover expired
leases. Queue backends use the same routes. This API has no authentication,
TLS or tenant isolation and is intended for trusted local clients. Bind it to
loopback for local operation; exposing it elsewhere requires an authenticated
access boundary provided by the operator.

After building, with an open queue, this starts an HTTP listener on a dynamically
assigned loopback port. The application must call `close()` during shutdown:

```js
import { createControlServer } from "./.generated/index.js";

const control = createControlServer(queue);
await new Promise((resolve, reject) => {
  control.server.once("error", reject);
  control.server.listen(0, "127.0.0.1", resolve);
});
console.log(control.server.address());
// Later, stop accepting HTTP requests and interrupt remaining HTTP consumers:
// await control.close();
// Stop your scheduler before closing the shared queue.
```

Paths are case-sensitive and have no trailing slash. Encode the returned job ID
as a path segment. Unknown routes and unknown jobs return `404`; unsupported
methods on a known route return `405` with an `Allow` header. There is no list,
delete, claim or worker-administration route. Query parameters other
than the ones listed below, or repeated parameters, return `400`.

| Request | Success response |
| --- | --- |
| `POST /v1/jobs` | `202` JSON `{ "job": snapshot }`, with a relative `Location` header for the status route. |
| `GET /v1/jobs/:id` | `200` JSON `{ "job": snapshot }`, including retry and lease status but no definition or lease token. |
| `GET /v1/jobs/:id/progress` | `200` JSON with `id`, `status`, `totalTasks`, `completedTasks` and `nextCursor`. Only committed rows count. |
| `GET /v1/jobs/:id/results?cursor=0&follow=false` | `200` UTF-8 `application/x-ndjson`, with the stored result rows and their cursors. |

Submission requires `Content-Type: application/json`, optionally with
`charset=utf-8`, and an uncompressed body. Its JSON envelope is
`{ "job": <job definition>, "retry": <optional retry policy> }`. Unknown
envelope fields reject. The job schemas and retry policy are the same as the
in-process queue APIs. This request body uses invented birth data:

```json
{
  "job": {
    "version": 1,
    "kind": "charts",
    "births": [{ "id": "synthetic-http", "birth": { "utc": "2001-02-03T04:05:06Z" } }]
  }
}
```

Use the optional `Idempotency-Key` header for retryable submissions. A successful
replay returns `202`, the same job ID and its current snapshot, even if it has
already finished. The API does not claim that every successful request created
a new job. A different canonical job or effective retry policy under the same
key returns `409`. Invalid keys reject and repeated key headers are ambiguous
requests. No key is generated implicitly. If a connection disappears after a
submission reaches storage, the job may still be accepted; retry with the same
key, job and policy to recover the acknowledgement.

`cursor` defaults to the beginning and accepts canonical nonnegative decimal
safe integers. It must not exceed committed progress, including with
`follow=true`. `follow` accepts only `true` or `false` and defaults to `false`.
A finite response freezes its endpoint at its initial atomic page read. An
unfinished job with no committed rows returns an empty response. Following
sends headers after that initial read, then streams and polls until completion
or terminal failure. Empty active jobs can keep a following connection open.
Finishing either kind of response does not prove the job succeeded: read its
status. The queue is unchanged by reads and client disconnects.

The HTTP adapter reuses the result stream's bounded paging and backpressure.
It does not collect an export before sending it. Clients resume by saving each
complete newline-ended row and its `nextCursor` together, discarding a partial
trailing line on interruption, and reconnecting from the saved cursor. Errors
before headers return JSON with the appropriate HTTP status. A storage or
stream failure after headers destroys the response, so the client sees an
incomplete HTTP transfer. No diagnostic or heartbeat lines are inserted into
NDJSON. Complete rows received before the failure remain usable.

Errors from application handlers have shape
`{ "error": { "code": "...", "message": "..." } }`. Messages omit raw storage
diagnostics, submitted values and stack traces. JSON and NDJSON responses set
`Cache-Control: no-store` and `X-Content-Type-Options: nosniff`.

| HTTP status | Error codes and cause |
| --- | --- |
| `400` | `invalid-request` for malformed route options or ambiguous headers; `invalid-json` for malformed JSON or UTF-8; `invalid-argument` for queue argument errors; `invalid-input` or `unsupported-version` for invalid jobs. |
| `404` | `not-found`, for a missing route or job. |
| `405` | `method-not-allowed`, with the accepted method in `Allow`. |
| `408` | `request-timeout`, when a submission body misses its receive deadline. |
| `409` | `idempotency-conflict`, for reuse with a different submission. |
| `413` | `body-too-large` for the transport byte budget, or `limit-exceeded` for workload limits. |
| `415` | `unsupported-media-type`, for unsupported media type, charset or content encoding. |
| `417` | `invalid-request`, for HTTP expectations, including `100-continue`. |
| `503` | `unavailable`, for an occupied handler budget, closed queue or busy storage. |
| `500` | `internal-error`, for other backend or operation failures before headers. |

Node's HTTP parser handles malformed wire framing and oversized headers before
application routing, so those responses need not have this JSON shape.

Options and defaults are exported as `HttpControlOptions` and
`HTTP_CONTROL_DEFAULTS`. `maxBodyBytes` can lower, but cannot raise, the default
job byte budget; it measures the whole envelope before decoding or JSON parsing.
Both declared `Content-Length` and actual streamed bytes are checked. Compressed
bodies are rejected. `requestTimeoutMs` is the total body receive deadline after
headers, in milliseconds, rather than an idle timeout reset by each chunk.
Node retains its header timeout. Rejected unread bodies close their connection.
`streamPollMs` controls following-result polling in milliseconds.
`maxConcurrentRequests` bounds active handlers, including uploads and result
followers; overflow receives `503`. This is not a global socket or storage quota.
All option values must be positive safe integers within the exported limits
and the timer range enforced in the implementation.

`close()` is idempotent and aborts HTTP consumers, closes sockets and waits for
their handlers to settle. Use it instead of only `server.close()`, which can
wait on active following streams. It does not cancel jobs, stop a scheduler or
close a shared queue. An asynchronous backend operation already started may
still settle after disconnect or shutdown; its late rejection is observed.
Synchronous SQLite operations cannot be interrupted mid-call. Create a new
control server to restart after closing it.

[test/http-control.test.ts](test/http-control.test.ts) checks routes, validation,
idempotency and workload parity through local sockets on both queue backends.
[test/http-control-stream.test.ts](test/http-control-stream.test.ts) checks
following, interruption, bounded read-ahead, request deadlines and shutdown.
[test/build.test.ts](test/build.test.ts) exercises the built HTTP export in plain
Node on both backends. These checks establish interface and transport behavior;
they do not measure throughput or astronomical accuracy.

## Worker scaling benchmark

[The measured table](docs/evidence/scaling-20261013.md) and its
[full evidence](docs/evidence/scaling-20261013.json) describe the recorded machine
and source manifest. This is a historical measurement, not a measurement of
later edits or another runtime. The table reports committed result rows per
second against worker count for SQLite and memory. A row is a natal chart, a birth/sample transit
snapshot, or a directed synastry pair. These are different units of work; compare
worker counts within the same workload and backend.

Run from `batch/` on its supported Node runtime:

```sh
node scripts/benchmark.mjs --profile smoke --output .generated/benchmark-smoke.json
node scripts/benchmark.mjs --profile scaling --output .generated/benchmark-scaling.json
```

[The launcher](scripts/benchmark.mjs) rebuilds an isolated runner and worker entry
from the current source, then writes JSON and a Markdown table next to each
other under `.generated/`. It hashes the exact source inputs, installed
computational dependency, build script, lockfile and generated bundles. The
recorded git HEAD can predate a newly added runner; the content manifest identifies
what was measured. Keep the compact JSON and table together when recording new
evidence. Raw result rows are not exported or committed; temporary SQLite stores remain
under `.generated/` and are removed after verification.

The scaling profile in [benchmark/model.ts](benchmark/model.ts) uses worker
counts 1, 2, 4 and 8, with three repetitions per backend and workload. Each
sample processes sixteen fresh, bounded jobs. Charts use 32 invented births;
transit grids use two invented births at sixteen daily UTC samples from
2024-01-01 inclusive to 2024-01-17 exclusive; matrices use six invented people
and all 30 directed, nonself pairs. The profile, definitions and counts are
recorded in the evidence and checked in [test/benchmark.test.ts](test/benchmark.test.ts).
Repeated jobs use the same synthetic inputs. Transit rows recompute their natal
chart, and matrix rows recompute both charts, as the ordinary executor does.
No benchmark-specific result cache or faster execution path is used.

A fresh child process owns each sample's real pool. Before timing, each warmup
round dispatches concurrently to every worker. Within a sample, workers remain
alive while each job gets a fresh queue. The timer starts before submission and
ends at the acknowledged final commit and file-size check. It includes input
validation, scheduler creation, claims, calculation, thread transport, JSON
conversion, ordered single-row commits and the SQLite file-size guard. The
sample rate divides committed rows by the sum of these monotonic job intervals.
It excludes build and process startup, pool warmup, opening and migrating the
database, stopping the scheduler, reading and verifying results, closing and
removing storage, and gaps between jobs. Warmup and whole-sample wall durations
are recorded separately. The coordinator and storage are not warmed explicitly.

The queue sizes keep each database and WAL below the file budget. This measures
repeated small jobs, not a single job containing thousands of rows. In particular,
SQLite revalidates its stored job definition on each row commit, so a large
single-job definition may have different costs. Fresh stores and untimed pauses
also differ from continuous service operation. Scheduler buffering remains
bounded by worker count and commits stay ordered, so slow early rows and
main-thread storage work can limit scaling. Database settings are the service's
WAL and FULL synchronous defaults on the measured filesystem; this run does not
benchmark Redis, HTTP, CLI transport, or host power-loss behavior.

Every stored job is streamed after timing and checked for row count, contiguous
cursors and a full NDJSON digest equal to serial execution on the same build.
These are transport and execution parity checks, not independent astronomy
accuracy evidence. Failure or unexpected retries invalidate a sample, and a
failed repetition makes its group's throughput summary unavailable. Counters
reflect acknowledged snapshots; a lost acknowledgement can leave storage ahead
of those counters. Child-process failures mark their counters unavailable.
The runner exits unsuccessfully if any sample fails and retains the failure
records. Partial reports keep `complete: false`.

Samples run sequentially, with worker and workload/backend order rotated between
repetitions. Run without other intentional workloads for a new measurement.
The evidence records Node, V8, SQLite, CPU model and logical count, affinity,
available parallelism, and readable cgroup quotas, including exposed ancestors.
Missing controls remain unknown. These observations do not prove exclusive CPU
capacity or reveal hidden host limits. [test/benchmark-metadata.test.ts](test/benchmark-metadata.test.ts)
checks parsing and visible-ancestor handling. The reported median and range
cover only the recorded repetitions. More workers need not improve throughput;
no speedup or performance threshold is enforced by the tests.
