import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { ENGINE_VERSION } from "../../src/types.js";

it("builds the relative engine source and queues synthetic work on both backends in plain Node", () => {
  // Run from the checkout root to check that the build does not depend on cwd.
  const cwd = fileURLToPath(new URL("../../", import.meta.url));
  const buildScript = fileURLToPath(new URL("../scripts/build.mjs", import.meta.url));
  const builtEntry = new URL("../.generated/index.js", import.meta.url).href;
  execFileSync(process.execPath, [buildScript], { cwd, stdio: "pipe" });
  const scratch = mkdtempSync(fileURLToPath(new URL("../.generated/sqlite-build-", import.meta.url)));
  try {
    const output = execFileSync(process.execPath, ["--input-type=module", "--eval", `
      import { validateJob, executeSerial, MemoryQueue, SqliteQueue } from ${JSON.stringify(builtEntry)};
      const job = validateJob({
        version: 1,
        kind: "charts",
        births: [{ id: "synthetic-build", birth: { utc: "2001-02-03T04:05:06Z" } }],
      });
      const observations = [];
      for (const queue of [new MemoryQueue(), new SqliteQueue(${JSON.stringify(`${scratch}/queue.sqlite`)})]) {
        const submitted = await queue.submit(job.spec);
        const claim = await queue.claim({ owner: "synthetic-build-worker", leaseMs: 60_000 });
        const status = await queue.commit(claim.lease, [...executeSerial(claim.job)]);
        const { rows } = await queue.readResults(submitted.id);
        await queue.close();
        observations.push({
          status: status.status,
          rowCount: rows.length,
          personId: rows[0].personId,
          nextCursor: rows[0].nextCursor,
          engineVersion: rows[0].value.engineVersion,
          utc: rows[0].value.input.utc,
          longitude: rows[0].value.bodies[0].lon,
        });
      }
      process.stdout.write(JSON.stringify(observations));
    `], { cwd, encoding: "utf8" });
    const expected = {
      status: "completed",
      rowCount: 1,
      personId: "synthetic-build",
      nextCursor: 1,
      engineVersion: ENGINE_VERSION,
      utc: "2001-02-03T04:05:06.000Z",
      longitude: expect.any(Number),
    };
    expect(JSON.parse(output)).toEqual([expected, expected]);
  } finally { rmSync(scratch, { recursive: true, force: true }); }
}, 15_000);
