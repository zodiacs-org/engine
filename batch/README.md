# Batch compute workspace

This private project is the batch service under development for this engine
checkout. The completed work is checked off in [PLAN.md](PLAN.md). The current
implementation validates job definitions, expands work lazily, executes it
serially through the engine and provides in-memory and SQLite queues. Workers,
process-crash recovery checks, NDJSON streaming, HTTP, CLI and scaling measurements
are later milestones.

All project files stay here. The engine source, npm package and carried archives
are unchanged. Code and documentation in this folder use the repository's
[MIT licence](../LICENSE). Consuming or redistributing the engine still requires
its [licensing and attribution terms](../LICENSING.md).

## Development

Use Node 22 with the runtime range declared in [package.json](package.json):

```sh
cd batch
npm ci --ignore-scripts --cache .cache/npm
npm run typecheck
npm test
npm run build
```

Dependencies and the lockfile belong to this directory. Typechecking emits
nothing. Vitest runs only `test/` here and keeps its cache in `.cache/`.
Generated code belongs in `.generated/`, runtime databases and exports in
`.runtime/`, and raw benchmark output in `.generated/`; these paths are ignored.
Keep committed benchmark evidence compact and link it to its runner.

The contracts use the engine's public birth vocabulary, and the execution
bridge imports its public source entry by a relative path. The batch build
bundles that source with the pinned `astronomy-engine` dependency from this
directory into `.generated/index.js`. It does not run the engine build. Vitest
and TypeScript resolve the same dependency from this installation. An unbundled
root source import cannot find dependencies installed only here.

[test/build.test.ts](test/build.test.ts) builds from the checkout root and runs
the resulting entry in plain Node with invented chart input. It submits,
claims, computes, commits and reads that job through both backends, checking the runtime import,
result shape and engine version without requiring root dependencies or engine
build output.

The repository's `npm run package:contents` check requires an existing engine
`dist/`. If it is absent, record the missing prerequisite; do not run the root
build as part of this project. An npm pack dry run with scripts disabled can
still confirm that `batch/` is excluded from the engine's package.

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
attempts it again. Retry scheduling belongs to the queue milestones.

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
below for persistence. Process-crash testing remains in [PLAN.md](PLAN.md).

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
The synchronous serial executor blocks its calling thread; the planned worker
pool will let the scheduler renew leases while calculations run elsewhere.

| Operation | Behavior |
| --- | --- |
| `submit(spec)` | Validates a definition with the default job limits, allocates a unique job ID and returns a queued snapshot. It does not expand work or compute astronomy. |
| `getJob(id)` | Returns a detached status snapshot, or null for an unknown ID. |
| `claim({ owner, leaseMs })` | Atomically leases the earliest submitted eligible job. Skips live leases and completed jobs. Returns null when none is eligible. |
| `renew(lease, leaseMs)` | Extends a current lease from backend time, without shortening its existing deadline. Returns the same token and new deadline. |
| `commit(lease, rows)` | Stores a nonempty contiguous result batch and advances progress together. Its final row completes the job and revokes the lease. |
| `release(lease)` | Requeues unfinished work, revokes the lease and keeps its committed prefix. |
| `readResults(id, { cursor, limit })` | Returns an ordered page, its next cursor and the status observed with it, or null for an unknown ID. |
| `close()` | Releases the handle's resources. Repeated close calls succeed; all other calls then reject. |

Status snapshots contain the job ID and kind, `status`, `totalTasks`,
`completedTasks`, `nextCursor`, `claimCount`, `createdAt`, `updatedAt`,
`finishedAt` and `lease`. States are `queued`, `running` and `completed`.
`finishedAt` is null until completion. `lease` is null when no scheduler owns
the job; otherwise it contains only `owner` and `expiresAt`. Status never
includes birth definitions or lease tokens. Claim responses additionally
carry the frozen validated job and a lease containing `jobId` and `token`.
`claimCount` counts granted leases, including explicit release/reclaim; it is
not a failure count or retry policy.

Timestamps and lease durations use safe integer milliseconds. The default
backend clock is `Date.now`; `MemoryQueue({ now })` accepts a controlled clock
for tests. Deadlines use backend wall time, so wall-clock adjustments can
affect lease timing. A lease is invalid when backend time is at or after
`expiresAt`, even before another scheduler reclaims it. Every claim gets a
fresh token, including a reclaim by the same owner. Only the current,
unexpired token may renew, commit or release. Status reads do not change
stored state: an expired job still reads as running with its past deadline
until a claim reclaims it. Claims preserve committed results and their cursor.

`completedTasks` and `nextCursor` both describe the contiguous committed
prefix. Scheduled work and results still held by a worker do not count as
progress. Batches must start at the current cursor, stay within the workload,
and match each expanded work item's kind, index and routing fields. A malformed
row rejects the entire batch. With a current lease, replaying an already
committed batch is a cursor conflict; read progress before resuming. After
completion, the former lease is lost. The planned pool can compute concurrently
and buffer a bounded window of results until their predecessors are ready.

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
`lease-lost` or `closed`. An unknown job's lease is lost. Diagnostics contain
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
definitions, insertion order, claim counts, leases, progress and result rows.
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
controlled process termination and restart belong to the crash-recovery
milestone. They do not simulate power loss or establish throughput.

The test-only bridge [test/native-sqlite.mjs](test/native-sqlite.mjs) lets the
existing Vitest loader access the real SQLite builtin. The production bundle
keeps its ordinary `node:sqlite` import; the plain Node smoke test exercises it.
