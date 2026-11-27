// scripts/minor-bodies/fetch-horizons.py's reuse of the responses it saved,
// by its offline Python tests (scripts/minor-bodies/test-fetch-horizons.py,
// which replace the network, the clock and the pauses): a saved response is
// read again only where its sidecar records the same query and the file's
// SHA-256, and provenance.json then gives the time it was first fetched; a
// changed query, a missing sidecar or changed bytes fetch it again. They need
// python3 on PATH, as CI's runners have it.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("fetch-horizons.py reuses a saved response only for the same query, and keeps the time it was first fetched", () => {
  const tests = fileURLToPath(new URL("./test-fetch-horizons.py", import.meta.url));
  const run = spawnSync("python3", ["-I", "-B", tests], { encoding: "utf8", timeout: 60_000 });
  expect(run.error).toBeUndefined();
  expect(run.status, run.stderr).toBe(0);
  expect(run.stderr).toMatch(/^Ran 6 tests in /mu);
  expect(run.stderr).toMatch(/^OK$/mu);
});
