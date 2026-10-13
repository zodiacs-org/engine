import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { ENGINE_VERSION } from "../../src/types.js";

it("builds the relative engine source, queues and streams synthetic work on both backends in plain Node", () => {
  // Run from the checkout root to check that the build does not depend on cwd.
  const cwd = fileURLToPath(new URL("../../", import.meta.url));
  const buildScript = fileURLToPath(new URL("../scripts/build.mjs", import.meta.url));
  const builtEntry = new URL("../.generated/index.js", import.meta.url).href;
  execFileSync(process.execPath, [buildScript], { cwd, stdio: "pipe" });
  const scratch = mkdtempSync(fileURLToPath(new URL("../.generated/sqlite-build-", import.meta.url)));
  try {
    const output = execFileSync(process.execPath, ["--input-type=module", "--eval", `
      import { validateJob, executeSerial, MemoryQueue, SqliteQueue, Scheduler, resultLines, createResultStream, createControlServer } from ${JSON.stringify(builtEntry)};
      import { Writable } from 'node:stream';
      import { pipeline } from 'node:stream/promises';
      import { setTimeout } from 'node:timers/promises';
      const job = validateJob({
        version: 1,
        kind: "charts",
        births: [{ id: "synthetic-build", birth: { utc: "2001-02-03T04:05:06Z" } }],
      });
      const observations = [];
      for (const queue of [new MemoryQueue(), new SqliteQueue(${JSON.stringify(`${scratch}/queue.sqlite`)})]) {
        const submitted = await queue.submit(job.spec, { idempotencyKey: 'synthetic-build-key' });
        const claim = await queue.claim({ owner: "synthetic-build-worker", leaseMs: 60_000 });
        const status = await queue.commit(claim.lease, [...executeSerial(claim.job)]);
        const { rows } = await queue.readResults(submitted.id);
        const serialized = [];
        for await (const line of resultLines(queue, submitted.id)) serialized.push(line);
        const iteratorMatchesRows = serialized.join('') === rows.map(row => JSON.stringify(row) + '\\n').join('');
        const parallelJob = validateJob({
          ...job.spec,
          births: Array.from({ length: 3 }, (_, i) => ({
            id: 'synthetic-parallel-' + i, birth: { utc: '2001-02-03T04:05:0' + i + 'Z' },
          })),
        });
        // Schema-valid synthetic time outside the engine's supported span.
        const poison = await queue.submit({
          ...job.spec, births: [{ id: 'synthetic-unsupported', birth: { utc: '0000-01-01T00:00:00Z' } }],
        }, { retry: { maxAttempts: 2, delayMs: 5 } });
        const parallel = await queue.submit(parallelJob.spec);
        const scheduler = new Scheduler(queue, { workers: 2 });
        const running = scheduler.run();
        const failure = running.then(() => null, error => error);
        try {
          while ((await queue.getJob(parallel.id)).status !== 'completed' || (await queue.getJob(poison.id)).status !== 'failed') {
            await Promise.race([setTimeout(10), running]);
          }
        } finally { await scheduler.stop(); }
        if (await failure) throw await failure;
        const threaded = (await queue.readResults(parallel.id)).rows;
        const parallelMatchesSerial = JSON.stringify(threaded) === JSON.stringify([...executeSerial(parallelJob)]);
        let streamed = '';
        const source = createResultStream(queue, parallel.id);
        await pipeline(source, new Writable({
          write(chunk, encoding, callback) {
            streamed += chunk.toString('utf8');
            callback();
          },
        }));
        const streamMatchesSerial = !source.readableObjectMode
          && streamed === [...executeSerial(parallelJob)].map(row => JSON.stringify(row) + '\\n').join('');
        const poisoned = await queue.getJob(poison.id);
        const replay = await queue.submit(job.spec, { idempotencyKey: 'synthetic-build-key' });
        const control = createControlServer(queue);
        await new Promise(resolve => control.server.listen(0, '127.0.0.1', resolve));
        let httpMatchesQueue;
        try {
          const base = 'http://127.0.0.1:' + control.server.address().port + '/v1/jobs/' + parallel.id;
          const snapshot = await (await fetch(base)).json();
          const results = await (await fetch(base + '/results')).text();
          httpMatchesQueue = snapshot.job.status === 'completed' && results === streamed;
        } finally { await control.close(); }
        await queue.close();
        observations.push({
          status: status.status,
          rowCount: rows.length,
          personId: rows[0].personId,
          nextCursor: rows[0].nextCursor,
          engineVersion: rows[0].value.engineVersion,
          utc: rows[0].value.input.utc,
          longitude: rows[0].value.bodies[0].lon,
          parallelMatchesSerial,
          iteratorMatchesRows,
          streamMatchesSerial,
          httpMatchesQueue,
          replayMatchesCompleted: JSON.stringify(replay) === JSON.stringify(status),
          failedStatus: poisoned.status,
          failedAttempts: poisoned.failureCount,
          failedClaims: poisoned.claimCount,
        });
      }
      process.stdout.write(JSON.stringify(observations));
    `], { cwd, encoding: "utf8", timeout: 10_000 });
    const expected = {
      status: "completed",
      rowCount: 1,
      personId: "synthetic-build",
      nextCursor: 1,
      engineVersion: ENGINE_VERSION,
      utc: "2001-02-03T04:05:06.000Z",
      longitude: expect.any(Number),
      parallelMatchesSerial: true,
      iteratorMatchesRows: true,
      streamMatchesSerial: true,
      httpMatchesQueue: true,
      replayMatchesCompleted: true,
      failedStatus: "failed",
      failedAttempts: 2,
      failedClaims: 2,
    };
    expect(JSON.parse(output)).toEqual([expected, expected]);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}, 15_000);
