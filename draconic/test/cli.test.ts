import { describe, expect, it, vi } from "vitest";
import type { BirthInput } from "../../src/index.js";
import { parseNatalEnvelope } from "../../src/receipt.js";
import { CliError, HELP, INPUT_LIMIT_BYTES, runCli } from "../src/cli.js";
import { draconicChart } from "../src/index.js";

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

describe("chart CLI arguments", () => {
  it.each([["--help"], ["chart", "--help"]])("prints help without reading input: %j", async (...argv) => {
    const result = await invoke(argv);
    expect(result.code).toBe(0);
    expect(result.stdout).toHaveBeenCalledTimes(1);
    expect(result.stdout).toHaveBeenCalledWith(HELP);
    expect(result.stderr).not.toHaveBeenCalled();
    expect(result.readInput).not.toHaveBeenCalled();
  });

  it.each([
    [], ["compare"], ["CHART"], ["chart"], ["chart", "--input"],
    ["chart", "--input", ""], ["chart", "--input", "  "],
    ["chart", "--input", "--node", "mean"],
    ["chart", "--input=-"], ["chart", "-i", "-"],
    ["chart", "--input", "-", "--input", "-"],
    ["chart", "--input", "-", "--node", "mean", "--node", "true"],
    ["chart", "--input", "-", "--format", "json", "--format", "json"],
    ["chart", "--input", "-", "--node"],
    ["chart", "--input", "-", "--node", "south"],
    ["chart", "--input", "-", "--node", "TRUE"],
    ["chart", "--input", "-", "--format", "text"],
    ["chart", "--input", "-", "--help"], ["chart", "--help", "--input", "-"],
    ["chart", "--input", "-", "extra"], ["chart", "--input", "-", "--unknown", "yes"]
  ])("rejects invalid arguments before reading input: %j", async (...argv) => {
    const result = await invoke(argv);
    expect(result.code).toBe(2);
    expect(result.stdout).not.toHaveBeenCalled();
    expect(result.stderr).toHaveBeenCalledTimes(1);
    expect(result.stderr.mock.calls[0]![0]).toMatch(/^draconic: .+\n$/);
    expect(result.readInput).not.toHaveBeenCalled();
  });
});

describe("chart CLI JSON input and output", () => {
  it.each([undefined, "true", "mean"] as const)("matches the receipt-bearing library with node %s", async (node) => {
    const args = ["chart", "--input", "invented chart.json", "--format", "json"];
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
    expect(parsed).toEqual(draconicChart(birth, { node: node ?? "true" }, { sourceInstant: birth.utc }));
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
    const result = await invoke(["chart", "--node", "mean", "--input", "-"], { synthetic: true, birth: input });
    expect(result.code).toBe(0);
    expect(result.readInput).toHaveBeenCalledTimes(1);
    expect(result.readInput).toHaveBeenCalledWith("-");
    expect(result.stderr).not.toHaveBeenCalled();
    expect(JSON.parse(result.stdout.mock.calls[0]![0])).toEqual(draconicChart(input, { node: "mean" },
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
    const result = await invoke(["chart", "--input", "-"], input);
    expect(result.code).toBe(2);
    expect(result.stdout).not.toHaveBeenCalled();
    expect(result.stderr).toHaveBeenCalledTimes(1);
  });

  it("enforces the input byte limit, accepting the exact limit", async () => {
    const json = JSON.stringify(request);
    const atLimit = Buffer.from(json.padEnd(INPUT_LIMIT_BYTES));
    expect(atLimit.byteLength).toBe(64 * 1024);
    expect((await invoke(["chart", "--input", "-"], atLimit)).code).toBe(0);
    const tooLarge = await invoke(["chart", "--input", "-"], Buffer.concat([atLimit, Buffer.from(" ")]));
    expect(tooLarge.code).toBe(2);
    expect(tooLarge.stdout).not.toHaveBeenCalled();
    expect(tooLarge.stderr).toHaveBeenCalledTimes(1);
    expect(tooLarge.stderr).toHaveBeenCalledWith("draconic: Input exceeds the 64 KiB limit.\n");
  });

  it("keeps diagnostics on one bounded line without control characters", async () => {
    const result = await invoke(["chart", "--input", "-"], {
      synthetic: true, birth: { utc: "bad\n\u001b[31m" + "x".repeat(1000) }
    });
    expect(result.code).toBe(2);
    expect(result.stderr.mock.calls[0]![0]).toMatch(/^draconic: [^\n\u001b]+\n$/);
    expect(result.stderr.mock.calls[0]![0].length).toBeLessThan(450);
  });

  it.each([new CliError("Unable to read input.", 1), new Error("internal detail")])("reports I/O/internal failures without partial JSON", async (error) => {
    const stdout = vi.fn();
    const stderr = vi.fn();
    const code = await runCli(["chart", "--input", "-"], {
      readInput: async () => { throw error; }, stdout, stderr
    });
    expect(code).toBe(1);
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).toHaveBeenCalledTimes(1);
    expect(stderr.mock.calls[0]![0]).not.toContain("internal detail");
  });
});
