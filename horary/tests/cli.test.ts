import { describe, expect, it } from "vitest";
import { runCli, CLI_INPUT_LIMIT_BYTES } from "../src/cli.js";
import { questionInput } from "./fixtures.js";

const options = { considerations: { rules: { "moon-void-of-course": false } }, aspects: { search: false } };
async function command(args: string[], value: unknown = questionInput, raw?: string) {
  const out: string[] = [], err: string[] = [], paths: string[] = [];
  const code = await runCli(args, { readInput: async path => { paths.push(path); return raw ?? JSON.stringify(value); },
    stdout: text => out.push(text), stderr: text => err.push(text) });
  return { code, stdout: out.join(""), stderr: err.join(""), paths };
}

describe("CLI request and output boundary", () => {
  it("casts JSON with normalized input, actual houses and engine metadata", async () => {
    const output = await command(["cast"]);
    expect(output.code).toBe(0);
    expect(output.stderr).toBe("");
    expect(output.paths).toEqual(["-"]);
    const data = JSON.parse(output.stdout);
    expect(data.schema).toBe("horary.cast/v1");
    expect(data.input.instant).toBe("2000-01-01T12:00:00.000Z");
    expect(data.chart.input.utc).toBe(data.input.instant);
    expect(data.chart.houses.system).toBe("regiomontanus");
  });
  it("analyzes policy groups and emits source-bearing JSON or readable explanations", async () => {
    const request = { input: questionInput, options };
    const analysis = await command(["analyze", "--input", "question.json"], request);
    expect(analysis.paths).toEqual(["question.json"]);
    expect(analysis.code).toBe(0);
    const data = JSON.parse(analysis.stdout);
    expect(data.schema).toBe("horary.analysis/v1");
    expect(data.aspects.search.status).toBe("disabled");
    expect(data.considerations.policy.rules["moon-void-of-course"]).toBe(false);
    const text = await command(["explain"], request);
    expect(text.code).toBe(0);
    expect(text.stdout).toContain("[considerations] moon-void-of-course (disabled)");
    expect(text.stdout).toContain("Source: Lilly");
    const json = await command(["explain", "--format", "json"], request);
    expect(JSON.parse(json.stdout)).toMatchObject({ schema: "horary.explanation/v1", text: text.stdout.trimEnd() });
  });
  it("prints help without reading input and rejects invalid arguments before reading", async () => {
    for (const args of [["--help"], ["cast", "--help"], ["analyze", "-h"], ["explain", "--help"]]) {
      const output = await command(args);
      expect(output.code).toBe(0);
      expect(output.paths).toEqual([]);
    }
    for (const args of [[], ["unknown"], ["cast", "--input"], ["cast", "--input", "--format"],
      ["cast", "--input", "a", "--input", "b"], ["analyze", "--format", "text"],
      ["explain", "--format", "unknown"], ["cast", "question.json"], ["cast", "--invented", "x"]]) {
      const output = await command(args);
      expect(output.code).toBe(1);
      expect(output.paths).toEqual([]);
      expect(output.stdout).toBe("");
      expect(JSON.parse(output.stderr).error.code).toBe("horary-cli-error");
    }
  });
  it("fails atomically on bad JSON, input, options and oversized UTF-8 data", async () => {
    for (const value of [null, [], { ...questionInput, instant: "2000-02-30" },
      { input: questionInput, options: null }, { input: questionInput, options: { timing: { enabled: "yes" } } },
      { input: questionInput, extra: true }, { ...questionInput, extra: true }]) {
      const output = await command(["analyze"], value);
      expect(output.code).toBe(1);
      expect(output.stdout).toBe("");
      expect(JSON.parse(output.stderr).error.message).toBeTruthy();
    }
    expect((await command(["cast"], { input: questionInput })).code).toBe(1);
    const broken = await command(["cast"], null, '{"secret":"do-not-echo",');
    expect(broken.code).toBe(1);
    expect(broken.stderr).not.toContain("do-not-echo");
    const oversized = await command(["cast"], null, "é".repeat(CLI_INPUT_LIMIT_BYTES / 2 + 1));
    expect(oversized.code).toBe(1);
    expect(JSON.parse(oversized.stderr).error.message).toContain("byte limit");
    expect(oversized.stdout).toBe("");
  });
  it("reports a reader failure without leaking its details", async () => {
    let stderr = "", stdout = "";
    expect(await runCli(["cast"], { readInput: async () => { throw new Error("private host detail"); },
      stdout: value => { stdout += value; }, stderr: value => { stderr += value; } })).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).not.toContain("private host detail");
  });
});
