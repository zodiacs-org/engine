# Operating the batch service

The CLI and HTTP API submit jobs, report committed progress and export stored
results. Workers calculate charts, transit snapshots at supplied sample times,
and directed synastry pairs. This service provides neither event search nor an
ephemeris database. All committed examples use invented birth data.

## Install and check

From the repository root, enter this private workspace:

```sh
cd batch
npm ci --ignore-scripts --cache .cache/npm
npm run check
```

Use a Node runtime admitted by [package.json](../package.json). SQLite also
requires the bundled library version accepted by
`SQLITE_QUEUE_DEFAULTS.minimumSqliteVersion` in
[sqlite-queue.ts](../src/sqlite-queue.ts); the constructor checks before opening
a database. A runtime that can run the memory backend may still fail this check.

The check command typechecks, runs the Vitest suite, builds the batch entries,
and audits repository isolation and evidence. For a later rebuild, use
`npm run build` here. The build reads the engine source and the batch directory's
pinned dependency, and writes only under `.generated/`. Keep `index.js`,
`worker-entry.js` and `cli.js` from the same build together. Keep generated code,
databases, result exports and raw measurements in the ignored `.generated/`
or `.runtime/` directories.

## Submit and process an example

All following commands run from `batch/`. Submit a bare job definition:

```sh
node --no-warnings .generated/cli.js submit examples/charts.json \
  --db .runtime/examples.sqlite --idempotency-key synthetic-example-charts
```

Save `job.id` from stdout. Substitute it for `JOB_ID` below. In another terminal
with the same working directory, start a worker against that database:

```sh
node --no-warnings .generated/cli.js worker --db .runtime/examples.sqlite
```

```sh
node --no-warnings .generated/cli.js status JOB_ID --db .runtime/examples.sqlite
node --no-warnings .generated/cli.js export JOB_ID --db .runtime/examples.sqlite \
  --follow > .runtime/charts.ndjson
node --no-warnings .generated/cli.js status JOB_ID --db .runtime/examples.sqlite
```

The worker stays alive for later jobs. Stop it with SIGINT or SIGTERM when
finished. Submission creates missing database parent directories; status and
export refuse a missing database. An explicit database path resolves from the
caller's working directory. Use an absolute path when starting processes from
different directories. Without `--db`, the ordinary build uses
`batch/.runtime/queue.sqlite`; moving the built entries changes that default.

These input files are ready for the same submission command:

| File | Work and ordering |
| --- | --- |
| [charts.json](../examples/charts.json) | A chart for each birth in input order; includes an explicit reference instant with unknown birth time. |
| [transit-grid.json](../examples/transit-grid.json) | Birth first, then UTC samples; `start` is included and `end` excluded. `stepMs` is elapsed milliseconds. |
| [synastry-matrix.json](../examples/synastry-matrix.json) | Directed pairs in input row order; reversed pairs are distinct and self-pairs are absent. |

Use a different idempotency key for each different job. The schemas accept
resolved UTC instants and a subset of engine birth settings; local clock
resolution happens before submission. See
[job definitions](../README.md#job-definitions) for accepted fields and limits.
[examples.batch-test.ts](../test/examples.batch-test.ts) validates these exact files, submits
them through the built CLI, processes them with real workers, and checks status,
key replay and resumed NDJSON against serial execution on the same build.

## Start the HTTP service

`serve` starts both workers and the HTTP listener. It can replace the standalone
worker above, or share its SQLite database:

```sh
node --no-warnings .generated/cli.js serve --db .runtime/examples.sqlite
```

Use the host and port from its readiness record on stderr. The listener defaults
to loopback. It has no authentication, TLS or tenant isolation; provide an
authenticated access boundary before exposing it beyond trusted local clients.
The `--no-warnings` option suppresses Node warning lines so stderr contains the
CLI's own JSON records. It does not change queue behavior.

Set `BASE_URL` to the listening origin, then wrap an example in the HTTP
submission envelope and send it with curl:

```sh
node --input-type=module -e '
  import { readFileSync } from "node:fs";
  console.log(JSON.stringify({
    job: JSON.parse(readFileSync("examples/transit-grid.json", "utf8"))
  }));
' | curl --fail-with-body --silent --show-error "$BASE_URL/v1/jobs" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: synthetic-example-transits' --data-binary @-
```

Set `JOB_ID` to the returned `job.id`. The status includes retry and lease state;
the progress route contains only progress fields:

```sh
curl --fail-with-body --silent --show-error "$BASE_URL/v1/jobs/$JOB_ID"
curl --fail-with-body --silent --show-error "$BASE_URL/v1/jobs/$JOB_ID/progress"
curl --fail-with-body --silent --show-error --no-buffer \
  "$BASE_URL/v1/jobs/$JOB_ID/results?follow=true" > .runtime/transits.ndjson
```

The CLI takes the bare job; HTTP takes `{ "job": ..., "retry": ... }`, with
`retry` optional. HTTP submits through the same backend as CLI commands sharing
the file. Read-only requests do not start workers or recover expired leases.
`serve --memory` instead uses a disposable queue reachable only through that
process's HTTP API. See the [HTTP reference](../README.md#http-control-api) for
routes, request budgets, errors and embedding with an injected backend.

## Read and resume results

`completedTasks` and `nextCursor` describe committed rows. Work in flight and
results waiting for earlier rows do not advance them. A finite export ends at
the committed prefix captured by its first read. `--follow` or `follow=true`
waits for further commits until the job completes or fails terminally. Neither
an empty export nor a successful HTTP transfer proves calculation succeeded;
read status after consuming the stream.

Store the job ID, each complete newline-ended row, and its `nextCursor` together.
After a disconnect, discard an incomplete trailing line, including incomplete
UTF-8. Set `CURSOR` to the last durably retained `nextCursor` and read the suffix:

```sh
node --no-warnings .generated/cli.js export "$JOB_ID" \
  --db .runtime/examples.sqlite --cursor "$CURSOR" --follow \
  > .runtime/results-suffix.ndjson
```

The HTTP equivalent adds `cursor=$CURSOR&follow=true` to the results query.
Persist a cursor only with its corresponding result. Saving it first can skip
a result after a client crash. A cursor ahead of committed progress is rejected.
Reads do not delete results, acknowledge consumption, or change job state.
Backpressure limits transport read-ahead; the backend still retains the results.
An error after streaming begins ends the transfer without an NDJSON error row.

## Retry, stop and restart

Select `--max-attempts` and `--retry-delay-ms` on CLI submission, or
`retry: { maxAttempts, delayMs }` in the HTTP envelope. Defaults and bounds are
defined by [queue.ts](../src/queue.ts). The fixed delay is in milliseconds.
Failed calculation attempts and expired leases consume the job's failure budget;
graceful release does not. `lastFailure` records a fixed code, backend timestamp
and first uncommitted cursor. Successful progress does not reset the budget.

Reusing a key with the same canonical job and effective retry policy returns
the original job, including its progress and terminal state. Reusing it with a
different job or policy conflicts. If a submission acknowledgement is lost,
repeat the same keyed request. Without a key, a repeat creates a separate job.
Keys have no expiry. Choose and record a key before the first submission.

SIGINT and SIGTERM stop new dispatch, drain accepted calculations, checkpoint
their contiguous results, release unfinished work and close the service's
resources. Graceful shutdown has no forced deadline. Restart against the same
SQLite file with the same computational build to continue work. After abrupt
termination, a replacement scheduler waits for the old lease to expire and
applies the saved retry policy. It resumes from the committed cursor; uncommitted
calculations can run again. A job at its failure budget stays `failed` and keeps
its committed prefix. Inspect the failure before submitting a corrected job
with a new key. There is no API to reset a failed job or edit its retry policy.

Lease duration must allow for calculation coordination, event-loop delays and
blocking storage calls. `--workers`, `--lease-ms` and `--poll-ms` configure the
scheduler; increased worker count need not improve throughput. Read the
[scaling evidence](evidence/scaling-20261013.md) with its measured workload and
machine scope before using it to choose capacity. Storage failures stop the
scheduler; inspect status after reopening storage because an acknowledgement
may be lost after a successful write.

## Storage ownership and capacity

| Backend | Ownership and operating limits |
| --- | --- |
| SQLite, the CLI default | Use a local filesystem on the same host for every connection. Preserve the database and live WAL/shared-memory companions together. Connections close independently and data survives process exit. Opening, lock waits, queries and commits block the coordinator thread. |
| Memory | All users must share the same queue object in the same process. Closing it discards jobs and results. Separate CLI commands cannot attach to it. |
| Optional Redis | The host application supplies a connected client and a dedicated hash key through `RedisQueue`; the CLI does not connect Redis. The host owns command deadlines, persistence, failover and connection shutdown. The bounded pending-job directory does not bound retained result bytes. See the [adapter requirements](../README.md#optional-redis-backend). |

The library caller owns the queue: close HTTP consumers, stop schedulers, then
close queue handles and any injected Redis client. The CLI manages that sequence
for the resources it creates. Export readers and HTTP control objects do not
close an injected queue. The scheduler owns and closes its worker pool.

Per-job validation, dispatch and page budgets are not an aggregate storage
quota. Completed and failed jobs, their results and idempotency bindings remain
stored. There is no list, delete, retention or backup API. Monitor disk or memory
and maintain an external inventory of submitted job IDs and stores. Before
retiring a store, stop its producers and schedulers, export required results and
status, close every handle and retain any required backup. Rotating to a new
store also starts a new idempotency scope; retain the mapping to old job IDs.
Do not remove a live SQLite file or its companion files to free space.

## Build identity and verification limits

Record the source revision, dependency lockfile, runtime and generated bundle
identity alongside each store outside the job payload. A queue does not pin or
verify the computational build used by replacement workers. Mixing builds or
runtime versions can therefore mix numerical results within a resumed job;
matching a version label alone is insufficient. Keep a consistent build for a
store's unfinished jobs. [build.batch-test.ts](../test/build.batch-test.ts) checks the built
interfaces; it does not authenticate deployed artifacts.

[crash-recovery.batch-test.ts](../test/crash-recovery.batch-test.ts) checks controlled SQLite
process kills at persistence boundaries and suffix resumption. It does not
simulate host power loss or filesystem corruption.
[cli.batch-test.ts](../test/cli.batch-test.ts) checks command exits, signals and restart;
[http-control.batch-test.ts](../test/http-control.batch-test.ts) and
[http-control-stream.batch-test.ts](../test/http-control-stream.batch-test.ts) check local
socket requests and disconnects.
[result-stream.batch-test.ts](../test/result-stream.batch-test.ts) checks partial-line
resumption and bounded reads. The
[Redis integration tests](../test/redis-integration.batch-test.ts) use a stateful mock,
so they do not establish live Redis durability or failover behavior. These
checks establish service and transport behavior. Astronomical accuracy remains
the engine's independently documented scope.
