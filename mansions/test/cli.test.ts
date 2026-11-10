import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { calc } from "../../src/calc.js";
import type { CalcRefusal } from "../../src/calc.js";
import { runCli } from "../src/cli.js";
import * as engine from "../src/engine.js";
import { mansionAt, mansionRange, MANSION_AYANAMSAS } from "../src/index.js";
import type { MansionAtResult, MansionRangeResult } from "../src/index.js";

// Invented instants only. These checks establish CLI/library parity and receipt
// preservation, not independent astronomical accuracy.
const ISO = "2001-02-03T04:05:06Z";
const FROM = "2001-02-03";
const TO = "2001-02-06";
const TABLE = "equal28-aries-v1";
const tableArgs = ["--table", TABLE];
const jsonArgs = ["--format", "json"];
const project = fileURLToPath(new URL("..", import.meta.url));
const launcher = fileURLToPath(new URL("../scripts/mansions.mjs", import.meta.url));

afterEach(() => vi.restoreAllMocks());

describe("mansions CLI arguments and help", () => {
  it("shows help without evaluating the engine or requiring a table", () => {
    const sample = vi.spyOn(engine, "tropicalMoon");
    for (const args of [[], ["--help"], ["-h"], ["at", "--help"], ["range", "-h"]]) {
      const result = runCli(args);
      expect(result).toMatchObject({ exitCode: 0, stderr: "" });
      expect(result.stdout).toContain("mansions at <instant> --table <id>");
      expect(result.stdout).toContain("mansions range <from> <to> --table <id>");
      for (const name of MANSION_AYANAMSAS) expect(result.stdout).toContain(name);
      expect(result.stdout).toContain("not physical accuracy");
    }
    expect(sample).not.toHaveBeenCalled();
  });

  it("rejects missing commands, wrong arity, missing tables and unknown tables", () => {
    const sample = vi.spyOn(engine, "tropicalMoon");
    for (const args of [
      ["other"], ["help"], ["--help", "at"], ["at"], ["range", FROM],
      ["at", ISO, TO, ...tableArgs], ["range", FROM, TO, ISO, ...tableArgs],
      ["at", ISO], ["range", FROM, TO], ["at", ISO, "--table", "equal28-aries"],
      ["range", FROM, TO, "--table", "unknown-v1"]
    ]) {
      expect(runCli(args)).toMatchObject({ exitCode: 2, stdout: "", stderr: expect.stringContaining("mansions:") });
    }
    expect(sample).not.toHaveBeenCalled();
  });

  it("rejects unknown, repeated, valueless and inapplicable options", () => {
    const sample = vi.spyOn(engine, "tropicalMoon");
    const suffixes = [
      ["--json"], ["--tablo", TABLE], ["--format", "yaml"], ["--zodiac", "Sidereal"],
      ["--table", TABLE], ["--format=json", "--format", "text"],
      ["--format"], ["--format="], ["--format", " "], ["--format", "--help"],
      ["--format", " json"], ["--help=yes"], ["-h", "--help"], ["--", "extra"],
      ["--max-samples", "100"]
    ];
    for (const suffix of suffixes) {
      expect(runCli(["at", ISO, ...tableArgs, ...suffix])).toMatchObject({ exitCode: 2, stdout: "" });
    }
    expect(sample).not.toHaveBeenCalled();
  });

  it("requires explicit sidereal selection and a supported ayanamsa together", () => {
    const sample = vi.spyOn(engine, "tropicalMoon");
    for (const suffix of [
      ["--zodiac", "sidereal"], ["--zodiac", "sidereal", "--ayanamsa", "other"],
      ["--ayanamsa", "lahiri"], ["--zodiac", "tropical", "--ayanamsa", "lahiri"]
    ]) {
      expect(runCli(["at", ISO, ...tableArgs, ...suffix])).toMatchObject({ exitCode: 2, stdout: "" });
    }
    expect(sample).not.toHaveBeenCalled();
  });

  it("rejects malformed range budgets before engine evaluation", () => {
    const sample = vi.spyOn(engine, "tropicalMoon");
    for (const value of ["0", "-1", "1.5", "1e3", "0x10", "Infinity", "NaN", "100001", "9007199254740993"]) {
      expect(runCli(["range", FROM, TO, ...tableArgs, "--max-samples", value]))
        .toMatchObject({ exitCode: 2, stdout: "" });
    }
    expect(sample).not.toHaveBeenCalled();
  });

  it("delegates strict instant and range validation without printing partial output", () => {
    for (const time of ["2001-02-30", "2001-02-03T04:05:06", "2001-02-03T24:00Z", "2001-02-03T04:05:60Z", "0", `${ISO}\n`]) {
      expect(runCli(["at", time, ...tableArgs, ...jsonArgs])).toMatchObject({ exitCode: 2, stdout: "" });
      expect(runCli(["range", FROM, time, ...tableArgs, ...jsonArgs])).toMatchObject({ exitCode: 2, stdout: "" });
    }
    expect(runCli(["range", TO, FROM, ...tableArgs])).toMatchObject({ exitCode: 2, stdout: "" });
    expect(runCli(["range", "2001-01-01", "2003-01-01", ...tableArgs]))
      .toMatchObject({ exitCode: 2, stdout: "" });
  });
});

describe("mansions CLI output", () => {
  it("serializes the complete at result and unmodified receipts for either zodiac", () => {
    for (const name of [undefined, ...MANSION_AYANAMSAS]) {
      const zodiac = name === undefined ? "tropical" : { sidereal: name };
      const args = ["at", ISO, ...tableArgs, ...jsonArgs,
        ...(name === undefined ? [] : ["--zodiac", "sidereal", "--ayanamsa", name])];
      const input = Object.freeze(args);
      const output = runCli(input);
      expect(output).toMatchObject({ exitCode: 0, stderr: "" });
      const result = JSON.parse(output.stdout) as MansionAtResult;
      expect(result).toEqual(mansionAt({ time: ISO, table: TABLE, zodiac }));
      const replay = calc(result.receipt.request);
      expect(replay).toMatchObject({ status: "ok", lon: result.longitude, receipt: result.receipt });
      expect(output.stdout.endsWith("\n")).toBe(true);
      expect(input).toEqual(args);
    }
  });

  it("accepts equals syntax and normalizes offsets and date-only inputs", () => {
    const offsetTime = "2001-02-03T06:05:06+02:00";
    const result = runCli(["at", "--format=json", `--table=${TABLE}`, offsetTime, "--zodiac=tropical"]);
    expect(result.exitCode).toBe(0);
    const decoded = JSON.parse(result.stdout) as MansionAtResult;
    // The UTC result label normalizes, while the original engine request
    // retains the supplied offset spelling for replay and provenance.
    expect(decoded).toEqual(mansionAt({ time: offsetTime, table: TABLE }));
    expect(decoded.at).toBe("2001-02-03T04:05:06.000Z");
    expect(decoded.receipt.request.time).toEqual({ iso: offsetTime });
    const dateOnly = runCli(["at", FROM, ...tableArgs, ...jsonArgs]);
    expect(JSON.parse(dateOnly.stdout).at).toBe("2001-02-03T00:00:00.000Z");
  });

  it("preserves range intervals, ingresses and receipts in chronological order", () => {
    for (const zodiac of ["tropical", { sidereal: "lahiri" }] as const) {
      const output = runCli(["range", FROM, TO, ...tableArgs, ...jsonArgs, "--max-samples", "20000",
        ...(zodiac === "tropical" ? [] : ["--zodiac", "sidereal", "--ayanamsa", zodiac.sidereal])]);
      expect(output).toMatchObject({ exitCode: 0, stderr: "" });
      const result = JSON.parse(output.stdout) as MansionRangeResult;
      expect(result).toEqual(mansionRange({ from: FROM, to: TO, table: TABLE, zodiac, maxSamples: 20000 }));
      expect(result.endpointConvention).toBe("[from,to)");
      expect(result.intervals.length).toBeGreaterThan(1);
      expect(result.intervals[0]!.startClipped).toBe(true);
      for (const [index, interval] of result.intervals.entries()) {
        expect(interval.start < interval.end).toBe(true);
        if (index > 0) expect(result.intervals[index - 1]!.end).toBe(interval.start);
        if (interval.entry) {
          expect(interval.entry.at).toBe(interval.start);
          expect(calc(interval.entry.receipt.request)).toMatchObject({ status: "ok", lon: interval.entry.longitude });
        }
      }
    }
  });

  it("renders neutral text with names, units, clipped edges and complete receipts", () => {
    const at = mansionAt({ time: ISO, table: TABLE, zodiac: { sidereal: "lahiri" } });
    if (at.status !== "ok") throw new Error("Unexpected refusal");
    const text = runCli(["at", ISO, ...tableArgs, "--zodiac", "sidereal", "--ayanamsa", "lahiri"]).stdout;
    expect(text).toContain(`Table: ${TABLE}\nZodiac: sidereal (lahiri)`);
    expect(text).toContain(`Position mansion: ${at.mansion.index} | ${at.mansion.arabicName} | ${at.mansion.latinLabel}`);
    expect(text).toContain(`Position Moon longitude (degrees): ${at.longitude}`);
    expect(text).toContain(`Position ayanamsa: ${JSON.stringify(at.ayanamsa)}`);
    expect(text).toContain(`Position engine receipt: ${JSON.stringify(at.receipt)}`);
    expect(text).toContain(`Position tropical engine receipt: ${JSON.stringify(at.tropicalReceipt)}`);

    const range = mansionRange({ from: FROM, to: TO, table: TABLE });
    if (range.status !== "ok") throw new Error("Unexpected refusal");
    const output = runCli(["range", FROM, TO, ...tableArgs, "--format", "text"]);
    expect(output).toMatchObject({ exitCode: 0, stderr: "" });
    expect(output.stdout).toContain(`Endpoint engine receipts: ${JSON.stringify(range.receipts)}`);
    expect(output.stdout).toContain(`Resolution: ${range.resolution}`);
    let previous = -1;
    for (const interval of range.intervals) {
      const offset = output.stdout.indexOf(`Interval: [${interval.start}, ${interval.end})`);
      expect(offset).toBeGreaterThan(previous);
      previous = offset;
      expect(output.stdout).toContain(`Start clipped: ${interval.startClipped}; end clipped: ${interval.endClipped}`);
      expect(output.stdout).toContain(`Start position engine receipt: ${JSON.stringify(interval.startPosition.receipt)}`);
      expect(output.stdout).toContain(`End position engine receipt: ${JSON.stringify(interval.endPosition.receipt)}`);
      expect(output.stdout).toContain(`Entry ingress: ${JSON.stringify(interval.entry)}`);
      expect(output.stdout).toContain(`Exit ingress: ${JSON.stringify(interval.exit)}`);
    }
  });

  it("retains endpoint receipts for empty JSON and text ranges", () => {
    const json = runCli(["range", FROM, FROM, ...tableArgs, ...jsonArgs]);
    expect(json.exitCode).toBe(0);
    const result = JSON.parse(json.stdout) as MansionRangeResult;
    expect(result.intervals).toEqual([]);
    expect(result.receipts.from).toEqual(result.receipts.to);
    const text = runCli(["range", FROM, FROM, ...tableArgs]);
    expect(text.stdout).toContain("Intervals: none (empty range)");
    expect(text.stdout).toContain(JSON.stringify(result.receipts));
  });

  it("returns typed coverage and budget refusals with no partial positions", () => {
    for (const args of [
      ["at", "1701-02-03"], ["range", "1701-02-03", "1701-02-04"],
      ["range", FROM, TO, "--max-samples", "1"]
    ]) {
      const result = runCli([...args, ...tableArgs, ...jsonArgs]);
      expect(result).toMatchObject({ exitCode: 3, stderr: "" });
      const refusal = JSON.parse(result.stdout) as CalcRefusal;
      expect(refusal.status).toBe("refused");
      expect(refusal).not.toHaveProperty("intervals");
      expect(refusal).not.toHaveProperty("mansion");
      const text = runCli([...args, ...tableArgs]);
      expect(text).toMatchObject({ exitCode: 3, stderr: "" });
      expect(text.stdout).toBe(`Refused: ${JSON.stringify(refusal)}\n`);
    }
  });

  it("does not expose a partial result or raw internal exception on failure", () => {
    vi.spyOn(engine, "tropicalMoon").mockImplementationOnce(() => { throw new Error("Synthetic internal failure"); });
    expect(runCli(["at", ISO, ...tableArgs, ...jsonArgs])).toEqual({
      exitCode: 1, stdout: "", stderr: "mansions: calculation failed.\n"
    });
  });
});

describe("checkout-local CLI process", () => {
  const launch = (args: string[], timezone = "UTC") => spawnSync(process.execPath, [launcher, ...args], {
    // Run outside the project to check path-independent local resolution.
    cwd: "/tmp", encoding: "utf8", env: { ...process.env, TZ: timezone },
    timeout: 30000, maxBuffer: 1_500_000
  });

  it("launches the bin entry and produces one JSON result, independent of host timezone", () => {
    for (const timezone of ["UTC", "Asia/Bangkok"]) {
      const child = launch(["at", FROM, ...tableArgs, ...jsonArgs], timezone);
      expect(child.error).toBeUndefined();
      expect(child.status).toBe(0);
      expect(child.stderr).toBe("");
      expect(JSON.parse(child.stdout)).toEqual(mansionAt({ time: FROM, table: TABLE }));
    }
  });

  it("runs range through the npm command and retains sidereal ingress receipts", () => {
    const child = spawnSync("npm", ["run", "--silent", "mansions", "--", "range", FROM, TO,
      ...tableArgs, ...jsonArgs, "--zodiac", "sidereal", "--ayanamsa", "lahiri"], {
      cwd: project, encoding: "utf8", timeout: 30000, maxBuffer: 1_500_000
    });
    expect(child.error).toBeUndefined();
    expect(child.status).toBe(0);
    expect(child.stderr).toBe("");
    expect(JSON.parse(child.stdout)).toEqual(mansionRange({ from: FROM, to: TO, table: TABLE, zodiac: { sidereal: "lahiri" } }));
  });

  it("writes help and errors to the documented streams and exits without an archive or build", () => {
    const help = launch(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("Usage:");
    expect(help.stderr).toBe("");
    const invalid = launch(["at", ISO]);
    expect(invalid.status).toBe(2);
    expect(invalid.stdout).toBe("");
    expect(invalid.stderr).toContain("--table is required");
    const refused = launch(["range", FROM, TO, ...tableArgs, ...jsonArgs, "--max-samples", "1"]);
    expect(refused.status).toBe(3);
    expect(refused.stderr).toBe("");
    expect(JSON.parse(refused.stdout)).toMatchObject({ status: "refused", reason: "sample-budget" });
  });
});
