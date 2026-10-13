import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { ENGINE_VERSION } from "../../src/types.js";

it("builds the relative engine source and executes synthetic work in plain Node", () => {
  // Run from the checkout root to check that the build does not depend on cwd.
  const cwd = fileURLToPath(new URL("../../", import.meta.url));
  const buildScript = fileURLToPath(new URL("../scripts/build.mjs", import.meta.url));
  const builtEntry = new URL("../.generated/index.js", import.meta.url).href;
  execFileSync(process.execPath, [buildScript], { cwd, stdio: "pipe" });
  const output = execFileSync(process.execPath, ["--input-type=module", "--eval", `
    import { validateJob, executeSerial } from ${JSON.stringify(builtEntry)};
    const job = validateJob({
      version: 1,
      kind: "charts",
      births: [{ id: "synthetic-build", birth: { utc: "2001-02-03T04:05:06Z" } }],
    });
    const rows = [...executeSerial(job)];
    process.stdout.write(JSON.stringify({
      rowCount: rows.length,
      personId: rows[0].personId,
      nextCursor: rows[0].nextCursor,
      engineVersion: rows[0].value.engineVersion,
      utc: rows[0].value.input.utc,
      longitude: rows[0].value.bodies[0].lon,
    }));
  `], { cwd, encoding: "utf8" });
  expect(JSON.parse(output)).toEqual({
    rowCount: 1,
    personId: "synthetic-build",
    nextCursor: 1,
    engineVersion: ENGINE_VERSION,
    utc: "2001-02-03T04:05:06.000Z",
    longitude: expect.any(Number),
  });
}, 15_000);
