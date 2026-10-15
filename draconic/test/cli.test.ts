import { describe, expect, it, vi } from "vitest";
import type { BirthInput } from "../../src/index.js";
import { parseNatalEnvelope } from "../../src/receipt.js";
import { CliError, HELP, INPUT_LIMIT_BYTES, runCli } from "../src/cli.js";
import { draconicChart, draconicCompare } from "../src/index.js";

// Invented birth input. CLI/library comparisons test wiring, not accuracy.
const birth = {
  utc: "2000-04-05T08:07:00+02:00", latitude: 12.5, longitude: 45.25, houseSystem: "equal"
} satisfies BirthInput;
const request = { synthetic: true, birth };

async function invoke(argv: string[], input: unknown = request) {
  const readInput = vi.fn(async (_path: string) => input instanceof Uint8Array ? input :
    Buffer.from(typeof input === "string" ? input : JSON.stringify(input)));
  const stdout = vi.fn();
  const stderr = vi.fn();
  const code = await runCli(argv, { readInput, stdout, stderr });
  return { code, readInput, stdout, stderr };
}

describe.each(["chart", "compare"] as const)("%s CLI arguments", (command) => {
  it.each([["--help"], [command, "--help"]])("prints help without reading input: %j", async (...argv) => {
    const result = await invoke(argv);
    expect(result.code).toBe(0);
    expect(result.stdout).toHaveBeenCalledTimes(1);
    expect(result.stdout).toHaveBeenCalledWith(HELP);
    expect(result.stderr).not.toHaveBeenCalled();
    expect(result.readInput).not.toHaveBeenCalled();
  });

  it.each([
    [], ["unknown"], ["CHART"], [command], [command, "--input"],
    [command, "--input", ""], [command, "--input", "  "],
    [command, "--input", "--node", "mean"],
    [command, "--input=-"], [command, "-i", "-"],
    [command, "--input", "-", "--input", "-"],
    [command, "--input", "-", "--node", "mean", "--node", "true"],
    [command, "--input", "-", "--format", "json", "--format", "json"],
    [command, "--input", "-", "--node"],
    [command, "--input", "-", "--node", "south"],
    [command, "--input", "-", "--node", "TRUE"],
    [command, "--input", "-", "--format", "yaml"],
    [command, "--input", "-", "--help"], [command, "--help", "--input", "-"],
    [command, "--input", "-", "extra"], [command, "--input", "-", "--unknown", "yes"]
  ])("rejects invalid arguments before reading input: %j", async (...argv) => {
    const result = await invoke(argv);
    expect(result.code).toBe(2);
    expect(result.stdout).not.toHaveBeenCalled();
    expect(result.stderr).toHaveBeenCalledTimes(1);
    expect(result.stderr.mock.calls[0]![0]).toMatch(/^draconic: .+\n$/);
    expect(result.readInput).not.toHaveBeenCalled();
  });
});

describe.each(["chart", "compare"] as const)("%s CLI JSON input and output", (command) => {
  const calculate = command === "chart" ? draconicChart : draconicCompare;
  it.each([undefined, "true", "mean"] as const)("matches the receipt-bearing library with node %s", async (node) => {
    const args = [command, "--input", "invented chart.json", "--format", "json"];
    if (node) args.push("--node", node);
    const result = await invoke(args);
    expect(result.code).toBe(0);
    expect(result.readInput).toHaveBeenCalledTimes(1);
    expect(result.readInput).toHaveBeenCalledWith("invented chart.json");
    expect(result.stderr).not.toHaveBeenCalled();
    expect(result.stdout).toHaveBeenCalledTimes(1);
    const text: string = result.stdout.mock.calls[0]![0];
    expect(text.endsWith("\n")).toBe(true);
    const parsed = JSON.parse(text);
    expect(parsed).toEqual(calculate(birth, { node: node ?? "true" }, { sourceInstant: birth.utc }));
    expect(parseNatalEnvelope(JSON.stringify(parsed.natal)).ok).toBe(true);
    expect(parsed.natal.receipt.sourceInstant).toBe(birth.utc);
    expect(parsed.conventions.receiptScope).toBe("engine-natal-only;draconic-derived-by-this-library");
  });

  it.each([
    { utc: birth.utc }, { ...birth, timeKnown: false },
    { ...birth, latitude: 78.5, houseSystem: "placidus" },
    { ...birth, timeScale: "tt", deltaT: 120.5, flags: ["lmt"] },
    { utc: Date.parse(birth.utc) }
  ] satisfies BirthInput[])("delegates birth settings without defaults or coercion: %j", async (input) => {
    const result = await invoke([command, "--node", "mean", "--input", "-"], { synthetic: true, birth: input });
    expect(result.code).toBe(0);
    expect(result.readInput).toHaveBeenCalledTimes(1);
    expect(result.readInput).toHaveBeenCalledWith("-");
    expect(result.stderr).not.toHaveBeenCalled();
    expect(JSON.parse(result.stdout.mock.calls[0]![0])).toEqual(calculate(input, { node: "mean" },
      typeof input.utc === "string" ? { sourceInstant: input.utc } : {}));
  });

  it.each([
    "", "{", "{} {}", "null", "[]", '{"birth":{}}',
    { synthetic: false, birth }, { synthetic: "true", birth }, { synthetic: true },
    { synthetic: true, birth, context: {} }, { synthetic: true, birth, node: "mean" },
    { synthetic: true, birth: [] }, { synthetic: true, birth: null },
    { synthetic: true, birth: {} }, { synthetic: true, birth: { ...birth, timezone: "UTC" } },
    { synthetic: true, birth: { ...birth, timeknown: false } },
    '{"synthetic":true,"birth":{"utc":"2000-04-05","__proto__":{}}}',
    { synthetic: true, birth: { ...birth, utc: null } },
    { synthetic: true, birth: { ...birth, utc: {} } },
    { synthetic: true, birth: { ...birth, utc: "2000-02-30" } },
    { synthetic: true, birth: { ...birth, utc: "2000-04-05T06:07" } },
    { synthetic: true, birth: { ...birth, utc: "+100000-01-01T00:00:00Z" } },
    { synthetic: true, birth: { ...birth, latitude: "12.5" } },
    { synthetic: true, birth: { utc: birth.utc, latitude: 0 } },
    { synthetic: true, birth: { ...birth, longitude: 181 } },
    { synthetic: true, birth: { ...birth, houseSystem: null } },
    { synthetic: true, birth: { ...birth, timeKnown: "false" } },
    { synthetic: true, birth: { ...birth, timeScale: "local" } },
    { synthetic: true, birth: { ...birth, deltaT: null } },
    { synthetic: true, birth: { ...birth, flags: ["unknown"] } },
    { synthetic: true, birth: { ...birth, flags: ["no-time"] } },
    Buffer.from([0xc3, 0x28]),
    '{"synthetic":true,"birth":{"utc":1e400}}'
  ])("refuses malformed, undeclared or invalid input without partial output: %j", async (input) => {
    const result = await invoke([command, "--input", "-"], input);
    expect(result.code).toBe(2);
    expect(result.stdout).not.toHaveBeenCalled();
    expect(result.stderr).toHaveBeenCalledTimes(1);
  });

  it("enforces the input byte limit, accepting the exact limit", async () => {
    const json = JSON.stringify(request);
    const atLimit = Buffer.from(json.padEnd(INPUT_LIMIT_BYTES));
    expect(atLimit.byteLength).toBe(64 * 1024);
    expect((await invoke([command, "--input", "-"], atLimit)).code).toBe(0);
    const tooLarge = await invoke([command, "--input", "-"], Buffer.concat([atLimit, Buffer.from(" ")]));
    expect(tooLarge.code).toBe(2);
    expect(tooLarge.stdout).not.toHaveBeenCalled();
    expect(tooLarge.stderr).toHaveBeenCalledTimes(1);
    expect(tooLarge.stderr).toHaveBeenCalledWith("draconic: Input exceeds the 64 KiB limit.\n");
  });

  it("keeps diagnostics on one bounded line without control characters", async () => {
    const result = await invoke([command, "--input", "-"], {
      synthetic: true, birth: { utc: "bad\n\u001b[31m" + "x".repeat(1000) }
    });
    expect(result.code).toBe(2);
    expect(result.stderr.mock.calls[0]![0]).toMatch(/^draconic: [^\n\u001b]+\n$/);
    expect(result.stderr.mock.calls[0]![0].length).toBeLessThan(450);
  });

  it.each([new CliError("Unable to read input.", 1), new Error("internal detail")])("reports I/O/internal failures without partial output", async (error) => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const code = await runCli([command, "--input", "-"], {
      readInput: async () => { throw error; }, stdout, stderr
    });
    expect(code).toBe(1);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stderr.mock.calls[0]![0]).not.toContain("internal detail");
  });
});


describe.each(["chart", "compare"] as const)("%s CLI text output", (command) => {
  it.each(["true", "mean"])("selects text explicitly and keeps node %s and receipt details", async (node) => {
    const result = await invoke([command, "--format", "text", "--node", node, "--input", "-"]);
    expect(result.code).toBe(0);
    expect(result.stderr).not.toHaveBeenCalled();
    expect(result.stdout).toHaveBeenCalledTimes(1);
    const text: string = result.stdout.mock.calls[0]![0];
    expect(text).toContain(`Selected north node: ${node} (`);
    expect(text).toContain("House systems: requested equal; computed equal.");
    expect(text).toContain("Source instant spelling: 2000-04-05T08:07:00+02:00.");
    expect(text).toContain("Receipt scope: engine natal only; draconic derived by this library.");
    expect(text).toContain("Body\t");
    expect(text).toContain("Angle\t");
    expect(text).toContain("House\t");
    expect(text).toContain("Sun\t");
    expect(text).toContain("asc\t");
    expect(text.endsWith("\n")).toBe(true);
    expect(text).not.toMatch(/[\u001b\u2014]/);
    if (command === "compare") {
      expect(text).toContain("Natal tropical (degrees)\tDraconic (degrees)\tDelta (degrees)");
      expect(text).toContain("draconic minus natal");
    }
  });

  it.each([
    "{", { synthetic: false, birth }, { synthetic: true, birth: { ...birth, utc: null } }
  ])("prints input errors only to stderr in text mode: %j", async (input) => {
    const result = await invoke([command, "--input", "-", "--format", "text"], input);
    expect(result.code).toBe(2);
    expect(result.stdout).not.toHaveBeenCalled();
    expect(result.stderr).toHaveBeenCalledTimes(1);
  });

  it("prints read failures only to stderr in text mode", async () => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const code = await runCli([command, "--input", "-", "--format", "text"], {
      readInput: async () => { throw new CliError("Unable to read input.", 1); }, stdout, stderr
    });
    expect(code).toBe(1);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledWith("draconic: Unable to read input.\n");
  });
});
