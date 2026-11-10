import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CLI_LIMITS, runCli } from "../src/cli.js";
import * as windows from "../src/window.js";
import * as catalogue from "../src/catalogue.js";

const WINDOW = { window: { from: "2020-12-21", to: "2020-12-22" }, queries: [
  { kind: "conjunction", first: "Jupiter", second: "Saturn", coordinate: "right-ascension" }
] };
async function* chunks(...values: Array<string | Uint8Array>) { yield* values; }
const requestInput = (value: unknown) => chunks(JSON.stringify(value));
const project = fileURLToPath(new URL("../", import.meta.url));
const launcher = fileURLToPath(new URL("../.generated/cli.mjs", import.meta.url));
afterEach(() => vi.restoreAllMocks());

describe("offline CLI parsing and output", () => {
  it("prints receipted help and catalogue without reading stdin", async () => {
    async function* unread() { throw new Error("stdin must not be read"); yield ""; }
    for (const args of [[], ["help"], ["--help"], ["-h"], ["catalogue"]]) {
      const result = await runCli(args, unread());
      expect(result.exitCode).toBe(0);
      const json = JSON.parse(result.stdout);
      expect(json.status).toBe("ok");
      expect(json.receipt).toMatchObject({ schema: "zodiacs.occultations.cli-receipt.v1", version: 1 });
      expect(Buffer.byteLength(result.stdout)).toBeLessThan(2_000_000);
      if (args[0] === "catalogue") expect(json.result).toEqual(catalogue.starCatalogue());
      else expect(Object.keys(json.commands).sort()).toEqual(["catalogue", "help", "window"]);
    }
  });

  it.each([["--version"], ["window", "input.json"], ["catalogue", "--all"], ["help", "window"],
    ["unknown-private-argument"], ["-h", "-h"]].map((args) => ({ args })))("rejects unsupported arguments without echoing them %#", async ({ args }) => {
    const result = await runCli(args, chunks());
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "error", error: { code: "invalid-arguments" },
      receipt: { command: null } });
    expect(result.stdout).not.toContain("unknown-private-argument");
  });

  it("preserves all event receipts and deterministic bytes through stdin", async () => {
    const a = await runCli(["window"], requestInput(WINDOW));
    const reordered = { queries: [{ coordinate: "right-ascension", second: "Saturn", first: "Jupiter", kind: "conjunction" }],
      window: { to: "2020-12-22", from: "2020-12-21" } };
    const text = JSON.stringify(reordered);
    const b = await runCli(["window"], chunks(text.slice(0, 30), "", text.slice(30)));
    expect(a.exitCode).toBe(0);
    expect(a).toEqual(b);
    const json = JSON.parse(a.stdout);
    expect(json).toMatchObject({ status: "complete", result: { status: "complete" }, receipt: { command: "window" } });
    expect(json.result.results[0].result.events).toHaveLength(1);
    expect(json.result.results[0].result.events[0].receipt.schema).toBe("zodiacs.occultations.conjunction-event-receipt.v1");
    expect(json.result.receipt.schema).toBe("zodiacs.occultations.window-receipt.v1");
    expect(a.stdout.endsWith("\n")).toBe(true);
    expect(a.stdout.slice(0, -1)).not.toContain("\n");
  });

  it("uses exit2 for scientific and sample refusals without partial facts", async () => {
    for (const input of [ { ...WINDOW, maxSamples: 1 },
      { ...WINDOW, window: { from: "1700-01-01", to: "1700-01-02" } } ]) {
      const result = await runCli(["window"], requestInput(input));
      expect(result.exitCode).toBe(2);
      expect(JSON.parse(result.stdout)).toMatchObject({ status: "refused",
        result: { status: "refused", results: [], receipt: { request: {} } }, receipt: { command: "window" } });
    }
  });

  it.each(["", " ", "{", "null true", "[]{}", '{"private-token":', "\ufeff{}"])(
    "rejects malformed JSON without disclosing parser input %#", async (text) => {
      const result = await runCli(["window"], chunks(text));
      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ error: { code: "invalid-json" }, receipt: { command: "window" } });
      expect(result.stdout).not.toContain("private-token");
    });

  it.each([null, [], {}, { ...WINDOW, url: "https://invalid.example/private-token" },
    { ...WINDOW, queries: [{ ...WINDOW.queries[0], private: "private-token" }] },
    { ...WINDOW, window: { from: "2020-02-30", to: "2020-12-22" } }].map((input) => ({ input })))(
    "rejects invalid requests without echoing raw values %#", async ({ input }) => {
      const result = await runCli(["window"], requestInput(input));
      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stdout)).toMatchObject({ error: { code: "invalid-request" } });
      expect(result.stdout).not.toContain("private-token");
    });

  it("accepts exactly the input byte limit and refuses the next byte before search", async () => {
    const request = JSON.stringify(WINDOW);
    const padded = request + " ".repeat(CLI_LIMITS.inputBytes - Buffer.byteLength(request));
    expect((await runCli(["window"], chunks(padded))).exitCode).toBe(0);
    const search = vi.spyOn(windows, "searchWindow");
    let overrunRead = false;
    async function* oversized() {
      yield padded;
      yield "é";
      overrunRead = true;
      yield "should-not-read";
    }
    const result = await runCli(["window"], oversized());
    expect(result.exitCode).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ error: { code: "input-too-large" } });
    expect(search).not.toHaveBeenCalled();
    expect(overrunRead).toBe(false);
  });

  it("decodes chunked UTF8 strictly and handles stream errors without details", async () => {
    const invalidUtf8 = await runCli(["window"], chunks(new Uint8Array([0x22, 0xc3, 0x28, 0x22])));
    expect(JSON.parse(invalidUtf8.stdout)).toMatchObject({ error: { code: "invalid-utf8" } });
    async function* broken() { yield "{"; throw new Error("private stream path"); }
    const brokenReply = await runCli(["window"], broken());
    expect(JSON.parse(brokenReply.stdout)).toMatchObject({ error: { code: "input-read-failed" } });
    expect(brokenReply.stdout).not.toContain("private stream path");
    const bytes = Buffer.from('{"é":true}');
    const split = await runCli(["window"], chunks(bytes.subarray(0, 3), bytes.subarray(3)));
    expect(JSON.parse(split.stdout)).toMatchObject({ error: { code: "invalid-request" } });
  });

  it("replaces oversized output with one receipted refusal and no partial result", async () => {
    const original = windows.searchWindow(WINDOW as windows.WindowRequest);
    vi.spyOn(windows, "searchWindow").mockReturnValue({ ...original,
      huge: "private-output".repeat(CLI_LIMITS.outputBytes) } as unknown as windows.WindowResult);
    const result = await runCli(["window"], requestInput(WINDOW));
    expect(result.exitCode).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: "refused", reason: "output-budget", results: [],
      window: { from: "2020-12-21T00:00:00.000Z", to: "2020-12-22T00:00:00.000Z" },
      receipt: { command: "window" } });
    expect(result.stdout).not.toContain("private-output");
    expect(Buffer.byteLength(result.stdout)).toBeLessThan(CLI_LIMITS.outputBytes);
  });

  it("counts the terminating newline inside the stdout byte limit", async () => {
    const source = vi.spyOn(catalogue, "starCatalogue");
    source.mockReturnValue({ huge: "" } as unknown as catalogue.StarCatalogue);
    const empty = await runCli(["catalogue"], chunks());
    const size = CLI_LIMITS.outputBytes - Buffer.byteLength(empty.stdout);
    source.mockReturnValue({ huge: "x".repeat(size) } as unknown as catalogue.StarCatalogue);
    const exact = await runCli(["catalogue"], chunks());
    expect(exact.exitCode).toBe(0);
    expect(Buffer.byteLength(exact.stdout)).toBe(CLI_LIMITS.outputBytes);
    source.mockReturnValue({ huge: "x".repeat(size + 1) } as unknown as catalogue.StarCatalogue);
    const over = await runCli(["catalogue"], chunks());
    expect(over.exitCode).toBe(2);
    expect(JSON.parse(over.stdout)).toMatchObject({ status: "refused", reason: "output-budget", results: [] });
  });

  it("reports unexpected calculation or nonfinite output failures without details", async () => {
    vi.spyOn(windows, "searchWindow").mockImplementation(() => { throw new Error("private computation details"); });
    const failed = await runCli(["window"], requestInput(WINDOW));
    expect(failed.exitCode).toBe(1);
    expect(JSON.parse(failed.stdout)).toMatchObject({ error: { code: "calculation-failed" } });
    expect(failed.stdout).not.toContain("private computation details");
    vi.spyOn(catalogue, "starCatalogue").mockReturnValue({ value: Infinity } as unknown as catalogue.StarCatalogue);
    const invalid = await runCli(["catalogue"], chunks());
    expect(invalid.exitCode).toBe(1);
    expect(JSON.parse(invalid.stdout)).toMatchObject({ status: "error", reason: "output-invalid", results: [] });
    vi.spyOn(catalogue, "starCatalogue").mockImplementation(() => { throw new Error("private source"); });
    const sourceFailure = await runCli(["catalogue"], chunks());
    expect(sourceFailure.exitCode).toBe(1);
    expect(JSON.parse(sourceFailure.stdout)).toMatchObject({ error: { code: "calculation-failed" } });
    expect(sourceFailure.stdout).not.toContain("private source");
  });
});

describe("built CLI subprocess", () => {
  beforeAll(() => {
    execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: project, stdio: "pipe" });
  });
  it.each([
    { args: ["help"], input: "", code: 0, status: "ok" },
    { args: ["catalogue"], input: "", code: 0, status: "ok" },
    { args: ["window"], input: JSON.stringify(WINDOW), code: 0, status: "complete" },
    { args: ["window"], input: JSON.stringify({ ...WINDOW, maxSamples: 1 }), code: 2, status: "refused" },
    { args: ["window"], input: "not JSON", code: 1, status: "error" },
    { args: ["window", "private-filename"], input: "", code: 1, status: "error" }
  ])("runs the actual offline launcher %#", ({ args, input, code, status }) => {
    const result = spawnSync(process.execPath, [launcher, ...args], { input, encoding: "utf8", maxBuffer: 2_000_000 });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(code);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toMatchObject({ status, receipt: { schema: "zodiacs.occultations.cli-receipt.v1" } });
    expect(result.stdout).not.toContain("private-filename");
  });

  it("keeps every generated executable under the file bound", () => {
    for (const name of ["index.mjs", "cli.mjs"]) {
      expect(readFileSync(new URL(`../.generated/${name}`, import.meta.url)).byteLength).toBeLessThan(2_000_000);
    }
  });
});
