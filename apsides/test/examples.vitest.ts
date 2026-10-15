import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { searchApsidesWindow } from "../src/index.js";

const project = fileURLToPath(new URL("../", import.meta.url));
const compiler = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
const options = {
  from: { jd: 2_451_544.5, scale: "tt" as const },
  to: { jd: 2_451_575.5, scale: "tt" as const },
  bodies: ["Moon", "Mercury", "Earth"] as const,
  syzygyOrbDegrees: 5,
  maxEvaluations: 10_000
};
let expected: ReturnType<typeof searchApsidesWindow>;
let temporary: string | undefined;

beforeAll(() => {
  mkdirSync(join(project, ".generated"), { recursive: true });
  temporary = mkdtempSync(join(project, ".generated/example-test-"));
  // Other test workers can build the normal CLI concurrently. This example
  // copy keeps its relative imports while owning a separate output directory.
  const built = spawnSync(process.execPath, [compiler, "-p", "tsconfig.build.json",
    "--outDir", join(temporary, ".generated/cli")], {
    cwd: project, encoding: "utf8", timeout: 30_000, maxBuffer: 2_000_000
  });
  if (built.error) throw built.error;
  if (built.status !== 0) throw new Error(`Example build failed: ${built.stdout}${built.stderr}`);
  mkdirSync(join(temporary, "examples"));
  for (const name of ["library", "replay-motion"]) {
    copyFileSync(join(project, "examples", `${name}.mjs`), join(temporary, "examples", `${name}.mjs`));
  }
  expected = searchApsidesWindow(options);
  if (expected.status !== "complete" || expected.events.length === 0) {
    throw new Error("The example needs complete events in its development window.");
  }
}, 30_000);

afterAll(() => {
  if (temporary) rmSync(temporary, { recursive: true, force: true });
});

function invoke(name: string, input?: string, args: string[] = []) {
  if (!temporary) throw new Error("Example test build is not ready.");
  const path = join(temporary, "examples", `${name}.mjs`);
  const result = spawnSync(process.execPath, [path, ...args], {
    // Check that imports and execution do not rely on apsides as the cwd.
    cwd: fileURLToPath(new URL("../../", import.meta.url)), encoding: "utf8",
    input, timeout: 30_000, maxBuffer: 4_000_000,
    env: { ...process.env, TZ: "Pacific/Honolulu" }
  });
  if (result.error) throw result.error;
  expect(result.signal).toBeNull();
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status };
}

// Live API equality and receipt replay check integration. They are not
// independent accuracy evidence and do not pin any engine-derived values.
describe("runnable library examples", () => {
  it("prints the complete annotated combined library record", () => {
    expect(invoke("library")).toEqual({
      stdout: `${JSON.stringify(expected)}\n`, stderr: "", exitCode: 0
    });
  });

  it("replays every motion request from the JSON example without claiming authentication", () => {
    const library = invoke("library");
    const replay = invoke("replay-motion", library.stdout);
    expect(replay.exitCode).toBe(0);
    expect(replay.stderr).toBe("");
    expect(JSON.parse(replay.stdout)).toEqual({
      status: "matching", scope: "motion-probes-only", authenticated: false,
      comparedProbes: expected.events.length * 3, differentProbes: []
    });
  });

  it("identifies a changed stored measurement without treating it as a matching replay", () => {
    const changed = structuredClone(expected);
    const first = changed.events[0]!;
    const encoded = JSON.stringify({ ...changed, events: [
      { ...first, motion: { ...first.motion, at: { ...first.motion.at, distanceKm: first.distanceKm + 1 } } },
      ...changed.events.slice(1)
    ] });
    const result = invoke("replay-motion", encoded);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({
      status: "different", authenticated: false, comparedProbes: expected.events.length * 3,
      differentProbes: [{ eventIndex: 0, body: first.body, probe: "at", fields: ["distanceKm"] }]
    });
  });

  it("accepts a complete empty result as zero comparisons", () => {
    const empty = searchApsidesWindow({ ...options, to: options.from });
    const result = invoke("replay-motion", JSON.stringify(empty));
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "matching", comparedProbes: 0 });
  });

  it.each(["", "not JSON", "null", "{}", '{"status":"refused","events":[]}',
    '{"status":"complete","events":[{"body":"Moon"}]}'])
  ("rejects invalid or refused replay input %j", (input) => {
    const result = invoke("replay-motion", input);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr)).toEqual({ status: "error", message: expect.any(String) });
  });

  it("rejects a changed receipt request that no longer describes its motion sample", () => {
    const changed = JSON.parse(JSON.stringify(expected));
    changed.events[0].motion.at.receipt.request.center = "barycentric";
    const result = invoke("replay-motion", JSON.stringify(changed));
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).message).toContain("geometric distance receipt request");
  });

  it.each(["library", "replay-motion"])("rejects unused arguments to %s", (name) => {
    const result = invoke(name, "", ["unexpected"]);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).message).toContain("takes no arguments");
  });
});
