import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import {
  APSIS_BODIES, searchApsidesWindow, searchLunarApsides, searchPlanetaryApsides
} from "../src/index.js";
import type { LunarSearchResult } from "../src/index.js";
import * as sampling from "../src/sample.js";

const project = fileURLToPath(new URL("../", import.meta.url));
const executable = fileURLToPath(new URL("../bin/apsides.mjs", import.meta.url));
const compiler = fileURLToPath(new URL("../node_modules/typescript/bin/tsc", import.meta.url));
const fromJd = 2_451_544.5;
const toJd = 2_451_575.5;
const tt = (jd: number) => ({ jd, scale: "tt" as const });
const month = { from: tt(fromJd), to: tt(toJd) };
const ttArgs = ["--from-jd-tt", String(fromJd), "--to-jd-tt", String(toJd)];
const isoArgs = ["--from", "2000-01-01", "--to", "2000-02-01"];
let lunar: Extract<LunarSearchResult, { status: "complete" }>;

beforeAll(() => {
  const built = spawnSync(process.execPath, [compiler, "-p", "tsconfig.build.json"], {
    cwd: project, encoding: "utf8", timeout: 30_000, maxBuffer: 2_000_000
  });
  if (built.error) throw built.error;
  if (built.status !== 0) throw new Error(`CLI build failed: ${built.stdout}${built.stderr}`);
  const result = searchLunarApsides(month);
  if (result.status !== "complete") throw new Error(`Development lunar search refused: ${result.reason}`);
  lunar = result;
}, 30_000);
afterEach(() => vi.restoreAllMocks());

function invoke(args: readonly string[], cwd = project, timezone = "UTC") {
  const result = spawnSync(process.execPath, [executable, ...args], {
    cwd, encoding: "utf8", timeout: 30_000, maxBuffer: 4_000_000,
    env: { ...process.env, TZ: timezone }
  });
  if (result.error) throw result.error;
  expect(result.signal).toBeNull();
  return { stdout: result.stdout, stderr: result.stderr, exitCode: result.status };
}

function expectJsonResult(args: readonly string[], expected: { readonly status: "complete" | "refused" }) {
  const result = invoke(args);
  expect(result.exitCode).toBe(expected.status === "complete" ? 0 : 3);
  expect(result.stderr).toBe("");
  // Exact serialization catches banners, precision loss and missing receipts.
  expect(result.stdout).toBe(`${JSON.stringify(expected)}\n`);
  return JSON.parse(result.stdout) as typeof expected;
}

// CLI equality and receipt checks are integration evidence, not independent
// accuracy evidence. Actual event searches use the registered development
// window, January 2000 TT, or a subwindow of the same development cases.
describe("CLI subprocess results", () => {
  it("prints the lunar library result with every motion sample and receipt", () => {
    expectJsonResult(["lunar", ...ttArgs], lunar);
    expect(lunar.events.length).toBeGreaterThan(0);
    for (const event of lunar.events) {
      expect(event.motion.at.receipt).toEqual(event.receipt);
      expect(event.receipt.request.time).toEqual(tt(event.instant.jdTt));
    }
  });

  it("preserves heliocentric metadata and accepts equals-form flags", () => {
    const expected = searchPlanetaryApsides("Earth", month);
    expectJsonResult([
      "planetary", "--body=Earth", `--from-jd-tt=${fromJd}`, `--to-jd-tt=${toJd}`
    ], expected);
    expect(expected.status).toBe("complete");
    expect(expected.events.every(({ target }) => target.center === "heliocentric")).toBe(true);
  });

  it("passes window selection, shared budget and explicit lunar orb to the library", () => {
    const expected = searchApsidesWindow({
      ...month, bodies: ["Earth", "Moon", "Mercury"], maxEvaluations: 10_000,
      syzygyOrbDegrees: 5
    });
    expectJsonResult([
      "window", ...ttArgs, "--bodies=Earth,Moon,Mercury", "--max-evaluations", "10000",
      "--syzygy-orb-degrees=5"
    ], expected);
    expect(expected.status).toBe("complete");
    expect(expected.events.some((event) => event.body === "Moon" && event.syzygy !== undefined)).toBe(true);
  });

  it("applies an explicit zero orb without inventing an annotation when omitted", () => {
    expectJsonResult(["lunar", ...ttArgs, "--syzygy-orb-degrees", "0"],
      searchLunarApsides({ ...month, syzygyOrbDegrees: 0 }));
    expect(lunar.events.every((event) => !Object.hasOwn(event, "syzygy"))).toBe(true);
  });

  it("defaults window selection to all bodies for an empty interval", () => {
    const expected = searchApsidesWindow({ from: month.from, to: month.from });
    expectJsonResult(["window", "--from-jd-tt", String(fromJd), "--to-jd-tt", String(fromJd)], expected);
    expect(expected.events).toEqual([]);
    expect(expected.diagnostics.bodies.map(({ body }) => body)).toEqual(APSIS_BODIES);
  });

  it("keeps ISO offsets and mixed TT endpoints on the engine's time basis", () => {
    const from = "2000-01-02T05:30:00+05:30";
    const args = ["lunar", "--from", from, "--to-jd-tt", String(toJd)];
    const expected = searchLunarApsides({ from, to: month.to });
    expectJsonResult(args, expected);
    const result = invoke(args, fileURLToPath(new URL("../../", import.meta.url)), "America/New_York");
    expect(result).toEqual({ stdout: `${JSON.stringify(expected)}\n`, stderr: "", exitCode: 0 });
  });

  it("round-trips a returned TT coordinate as the owned partition boundary", () => {
    const event = lunar.events[0];
    if (!event) throw new Error("The development lunar window needs an event for partition testing");
    const cut = event.instant.jdTt;
    const left = searchLunarApsides({ ...month, to: tt(cut) });
    const right = searchLunarApsides({ ...month, from: tt(cut) });
    expectJsonResult(["lunar", "--from-jd-tt", String(fromJd), "--to-jd-tt", String(cut)], left);
    expectJsonResult(["lunar", "--from-jd-tt", String(cut), "--to-jd-tt", String(toJd)], right);
    expect(left.status).toBe("complete");
    expect(right.status).toBe("complete");
    expect([...left.events, ...right.events]).toEqual(lunar.events);
    expect(left.events.some(({ instant }) => instant.jdTt === cut)).toBe(true);
    expect(right.events.some(({ instant }) => instant.jdTt === cut)).toBe(false);
  });

  it("serializes budget refusals on stdout and uses a separate exit status", () => {
    const expected = searchApsidesWindow({ ...month, bodies: ["Moon", "Earth"], maxEvaluations: 1 });
    expectJsonResult(["window", ...ttArgs, "--bodies", "Moon,Earth", "--max-evaluations", "1"], expected);
    expect(expected).toMatchObject({ status: "refused", reason: "evaluation-budget", events: [] });
  });

  it("retains engine coverage refusal details without producing partial events", () => {
    const expected = searchLunarApsides({ from: "1799-12-31", to: "1800-01-10" });
    expectJsonResult(["lunar", "--from", "1799-12-31", "--to", "1800-01-10"], expected);
    expect(expected).toMatchObject({
      status: "refused", reason: "engine-refusal", events: [], engineRefusal: { reason: "out-of-range" }
    });
  });
});

describe("CLI strict syntax and streams", () => {
  it("reports a missing local build as error JSON without touching the shared build", () => {
    const temporary = mkdtempSync(join(project, ".generated/cli-load-test-"));
    try {
      const bin = join(temporary, "bin");
      mkdirSync(bin);
      const copied = join(bin, "apsides.mjs");
      copyFileSync(executable, copied);
      const result = spawnSync(process.execPath, [copied, "--help"], {
        cwd: temporary, encoding: "utf8", timeout: 10_000, maxBuffer: 2_000_000
      });
      if (result.error) throw result.error;
      expect(result.signal).toBeNull();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      const error = JSON.parse(result.stderr) as { status: string; code: string; message: string };
      expect(error).toMatchObject({ status: "error", code: "unexpected-error" });
      expect(error.message).toContain("npm run build");
      expect(result.stderr).toBe(`${JSON.stringify(error)}\n`);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });

  it.each([
    ["--help"], ["-h"], ["lunar", "--help"], ["planetary", "-h"], ["window", "--help"]
  ])("prints help without calculation or error for %j", (...args) => {
    const result = invoke(args);
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("apsides");
    expect(result.stdout).toContain("--from");
    expect(result.stdout.endsWith("\n")).toBe(true);
  });

  const malformed: readonly (readonly string[])[] = [
    [], ["unknown"], ["lunar"], ["lunar", "--from", "2000-01-01"],
    ["lunar", ...isoArgs, "extra"], ["lunar", ...isoArgs, "--unknown=1"],
    ["lunar", ...isoArgs, "--help"], ["--help", "lunar"],
    ["lunar", ...isoArgs, "--from=2000-01-02"],
    ["lunar", ...isoArgs, "--from-jd-tt", String(fromJd)],
    ["lunar", ...isoArgs, "--to-jd-tt", String(toJd)],
    ["lunar", "--from", "--to", "2000-02-01"],
    ["lunar", "--from=", "--to=2000-02-01"],
    ["lunar", "--from", "2000-02-30", "--to", "2000-03-01"],
    ["lunar", "--from", "2000-01-01T12:00:00", "--to", "2000-02-01"],
    ["lunar", "--from", "2000-02-01", "--to", "2000-01-01"],
    ["lunar", ...isoArgs, "--body", "Moon"],
    ["planetary", ...isoArgs], ["planetary", ...isoArgs, "--body", "earth"],
    ["planetary", ...isoArgs, "--body", "Moon"],
    ["planetary", ...isoArgs, "--body", "Earth", "--syzygy-orb-degrees", "5"],
    ["window", ...isoArgs, "--bodies=Moon,Moon"],
    ["window", ...isoArgs, "--bodies=Moon, Earth"],
    ["window", ...isoArgs, "--bodies=Moon,"],
    ["window", ...isoArgs, "--bodies="],
    ["window", ...isoArgs, "--bodies=Sun"],
    ["window", ...isoArgs, "--bodies=Earth", "--syzygy-orb-degrees=5"]
  ];
  it.each(malformed.map((args) => ({ args })))("rejects invalid arguments $args with only error JSON on stderr", ({ args }) => {
    const result = invoke(args);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe("");
    const error = JSON.parse(result.stderr) as { status: string; code: string; message: string };
    expect(error).toEqual({ status: "error", code: "invalid-arguments", message: expect.any(String) });
    expect(error.message.length).toBeGreaterThan(0);
    expect(result.stderr).toBe(`${JSON.stringify(error)}\n`);
  });

  it.each(["0", "-1", "1.5", "1e3", "0x10", "Infinity", "NaN", "", " 2", "9007199254740992"])(
    "rejects non-positive, unsafe or noninteger-decimal budgets %j", (value) => {
      expect(invoke(["lunar", ...isoArgs, `--max-evaluations=${value}`])).toMatchObject({
        exitCode: 2, stdout: ""
      });
    }
  );

  it.each(["-1", "90", "1e1", "0x5", "Infinity", "NaN", "", " 5"])(
    "rejects invalid angular orb syntax or range %j", (value) => {
      expect(invoke(["lunar", ...isoArgs, `--syzygy-orb-degrees=${value}`])).toMatchObject({
        exitCode: 2, stdout: ""
      });
    }
  );

  it.each(["2451544.5junk", "2.4515445e6", "0x256859", "Infinity", "NaN", "", " 2451544.5"])(
    "rejects nondecimal TT Julian dates %j", (value) => {
      expect(invoke(["lunar", `--from-jd-tt=${value}`, "--to-jd-tt", String(toJd)])).toMatchObject({
        exitCode: 2, stdout: ""
      });
    }
  );
});

describe("pure CLI error mapping", () => {
  it("returns output without writing process streams", () => {
    const stdout = vi.spyOn(process.stdout, "write");
    const stderr = vi.spyOn(process.stderr, "write");
    const result = runCli(["lunar", ...ttArgs]);
    expect(result).toEqual({ stdout: `${JSON.stringify(lunar)}\n`, stderr: "", exitCode: 0 });
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
  });

  it("maps library RangeErrors to argument errors", () => {
    vi.spyOn(sampling, "sampleDistance").mockImplementation(() => { throw new RangeError("Synthetic invalid endpoint"); });
    const result = runCli(["lunar", ...ttArgs]);
    expect(result).toMatchObject({ stdout: "", exitCode: 2 });
    expect(JSON.parse(result.stderr)).toMatchObject({ status: "error", code: "invalid-arguments" });
  });

  it("maps unexpected failures to their own status without emitting a partial result", () => {
    vi.spyOn(sampling, "sampleDistance").mockImplementation(() => { throw new Error("Synthetic dependency failure"); });
    const result = runCli(["lunar", ...ttArgs]);
    expect(result).toMatchObject({ stdout: "", exitCode: 1 });
    expect(JSON.parse(result.stderr)).toMatchObject({ status: "error", code: "unexpected-error" });
  });
});
