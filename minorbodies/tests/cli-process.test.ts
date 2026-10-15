import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeAll, expect, it } from "vitest";
import { createBodyAdapter } from "../src/body-adapter.ts";
import { loadChironPilot } from "../src/pilot.ts";
import { createStationSearcher } from "../src/stations.ts";
import { createRetrogradeWindowSearcher } from "../src/retrogrades.ts";
import { createIngressSearcher } from "../src/ingresses.ts";
import { invokeCli, projectDirectory } from "./cli-process-helper.ts";

let adapter: Awaited<ReturnType<typeof createBodyAdapter>>;
const sourceResolver = fileURLToPath(new URL("../scripts/register-source.mjs", import.meta.url));
const bodyFlags = ["--body", "Chiron", "--dataset", "pilot"];
const eventFlags = ["--from-jd", "2451545.5", "--to-jd", "2451908.5", "--scale", "tt"];
const eventRequest = { body: "Chiron" as const, from: { jd: 2451545.5, scale: "tt" as const },
  to: { jd: 2451908.5, scale: "tt" as const } };

beforeAll(async () => {
  // Reconstruct ignored pilot files from the frozen originals. Native CLI calls
  // below only load, and cannot silently generate them or contact Horizons.
  execFileSync(process.execPath, ["--experimental-strip-types", "scripts/generate-pilot.ts", "--build"], {
    cwd: projectDirectory, encoding: "utf8", timeout: 60_000
  });
  adapter = await createBodyAdapter([await loadChironPilot()]);
}, 60_000);

it("runs the documented package command with JSON-only output", () => {
  const stdout = execFileSync("npm", ["run", "--silent", "cli", "--", "position", ...bodyFlags,
    "--iso", "2000-06-01T00:00:00Z"], { cwd: projectDirectory, encoding: "utf8", timeout: 60_000 });
  expect(JSON.parse(stdout)).toEqual(JSON.parse(JSON.stringify(adapter.calcWithMinorBodies({
    body: "Chiron", time: { iso: "2000-06-01T00:00:00Z" }
  }))));
});

it("loads the CLI help as a native source checkout without root build output", () => {
  const result = invokeCli(["--help"]);
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  expect(result.stdout).toContain("Minor bodies local CLI");
  expect(result.stdout).toContain("jdTt, never UTC labels");
});

it("preserves exact TT and a Delta T pin through native execution from another CWD", () => {
  const jd = 2451600.250000123;
  const result = invokeCli(["position", ...bodyFlags, "--jd", String(jd), "--scale", "tt", "--delta-t", "80"]);
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  const expected = adapter.calcWithMinorBodies({ body: "Chiron", time: { jd, scale: "tt", deltaT: 80 } });
  expect(JSON.parse(result.stdout)).toEqual(JSON.parse(JSON.stringify(expected)));
  expect(JSON.parse(result.stdout).result.jdTt).toBe(jd);
});

it("interprets offset ISO input independently of the process timezone", () => {
  const args = ["position", ...bodyFlags, "--iso", "2000-06-01T07:00:00+07:00"];
  const utc = invokeCli(args, "UTC");
  const other = invokeCli(args, "Pacific/Honolulu");
  expect(utc.code).toBe(0);
  expect(other.code).toBe(0);
  expect(utc.stderr + other.stderr).toBe("");
  expect(other.stdout).toBe(utc.stdout);
  const expected = adapter.calcWithMinorBodies({ body: "Chiron", time: { iso: "2000-06-01T07:00:00+07:00" } });
  expect(JSON.parse(utc.stdout)).toEqual(JSON.parse(JSON.stringify(expected)));
});

it.each(["stations", "retrogrades", "ingresses"] as const)("preserves native %s JSON and receipts", async command => {
  const expected = command === "stations" ? (await createStationSearcher(adapter)).searchStations(eventRequest)
    : command === "retrogrades" ? (await createRetrogradeWindowSearcher(adapter)).searchRetrogradeWindows(eventRequest)
    : (await createIngressSearcher(adapter)).searchIngresses(eventRequest);
  expect(expected.status).toBe("complete");
  if (expected.status === "complete" && "stations" in expected) expect(expected.stations.length).toBeGreaterThan(0);
  const result = invokeCli([command, ...bodyFlags, ...eventFlags]);
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual(JSON.parse(JSON.stringify(expected)));
}, 60_000);

it.each(["stations", "retrogrades", "ingresses"] as const)("returns status 3 and intact %s budget refusal", command => {
  const result = invokeCli([command, ...bodyFlags, ...eventFlags, "--max-samples", "1"]);
  expect(result.code).toBe(3);
  expect(result.stderr).toBe("");
  const actual = JSON.parse(result.stdout);
  expect(actual).toMatchObject({ status: "refused", reason: "sample-budget", samples: 0 });
  const searchReceipt = command === "retrogrades" ? actual.receipt.stationSearch : actual.receipt;
  expect(searchReceipt.settings.maxSamples).toBe(1);
  expect(searchReceipt.dataset.sourceIdentity.body).toBe("Chiron");
});

it("returns a structured coverage refusal and no stderr", () => {
  const result = invokeCli(["position", ...bodyFlags, "--iso", "2001-06-01"]);
  expect(result.code).toBe(3);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toMatchObject({ status: "refused", reason: "outside-coverage",
    receipt: { request: { body: "Chiron", time: { iso: "2001-06-01" } } } });
});

it("reports native invalid input on stderr without a stack or stdout", () => {
  const result = invokeCli(["position", ...bodyFlags, "--iso", "2000-02-30"]);
  expect(result.code).toBe(2);
  expect(result.stdout).toBe("");
  expect(JSON.parse(result.stderr)).toMatchObject({ schema: "minorbodies-cli-error-v1", status: "error", code: "invalid-arguments" });
  expect(result.stderr).not.toContain(" at ");
});

it("does not execute the command when the CLI library module is imported", () => {
  const result = execFileSync(process.execPath, ["--import", sourceResolver, "--experimental-strip-types", "--input-type=module", "-e",
    'await import("./src/cli.ts"); console.log("imported");'], { cwd: projectDirectory, encoding: "utf8" });
  expect(result).toBe("imported\n");
});
