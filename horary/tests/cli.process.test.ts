import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLI_INPUT_LIMIT_BYTES } from "../src/cli.js";
import { questionInput } from "./fixtures.js";

const executable = fileURLToPath(new URL("../bin/horary.mjs", import.meta.url));
const options = { considerations: { rules: { "moon-void-of-course": false } }, aspects: { search: false } };
function run(args: string[], input: string, cwd = tmpdir()) {
  return spawnSync(process.execPath, [executable, ...args], { input, cwd, encoding: "utf8", timeout: 30_000, maxBuffer: 1_900_000 });
}

describe("offline executable from outside the checkout", () => {
  it("runs the committed synthetic examples", () => {
    const question = fileURLToPath(new URL("../examples/question.json", import.meta.url));
    const request = fileURLToPath(new URL("../examples/analysis-request.json", import.meta.url));
    expect(JSON.parse(readFileSync(question, "utf8"))).toEqual(questionInput);
    expect(JSON.parse(readFileSync(request, "utf8"))).toEqual({ input: questionInput, options });
    const cast = run(["cast", "--input", question], "");
    expect(cast.status).toBe(0);
    expect(JSON.parse(cast.stdout).schema).toBe("horary.cast/v1");
    const explanation = run(["explain", "--input", request], "");
    expect(explanation.status).toBe(0);
    expect(explanation.stdout).toContain("moon-void-of-course (disabled)");
  }, 30_000);

  it("runs cast, analyze and explain from stdin with checkout-local dependency resolution", () => {
    for (const command of ["cast", "analyze", "explain"]) {
      const value = command === "cast" ? questionInput : { input: questionInput, options };
      const output = run([command, "--format", "json"], JSON.stringify(value));
      expect(output.error).toBeUndefined();
      expect(output.status).toBe(0);
      expect(output.stderr).toBe("");
      const data = JSON.parse(output.stdout);
      expect(data.schema).toBe(command === "cast" ? "horary.cast/v1" : command === "analyze" ? "horary.analysis/v1" : "horary.explanation/v1");
      if (command === "explain") expect(data.text).toContain("moon-void-of-course (disabled)");
      else expect(data.input.question.id).toBe("lost-object");
    }
  }, 30_000);

  it("reads a file relative to the caller and handles unreadable files and oversized streams", () => {
    const folder = mkdtempSync(join(tmpdir(), "horary-cli-"));
    try {
      writeFileSync(join(folder, "question.json"), JSON.stringify(questionInput));
      const file = run(["cast", "--input", "question.json"], "", folder);
      expect(file.status).toBe(0);
      expect(JSON.parse(file.stdout).input.question.id).toBe("lost-object");
      const absent = run(["cast", "--input", "absent.json"], "", folder);
      expect(absent.status).toBe(1);
      expect(absent.stdout).toBe("");
      expect(JSON.parse(absent.stderr).error.message).toBe("Unable to read CLI input.");
      const oversized = run(["cast"], " ".repeat(CLI_INPUT_LIMIT_BYTES + 1));
      expect(oversized.status).toBe(1);
      expect(oversized.stdout).toBe("");
      expect(JSON.parse(oversized.stderr).error.message).toContain("byte limit");
    } finally { rmSync(folder, { recursive: true, force: true }); }
  }, 30_000);

  it("executes enabled motion and lunar scans and explains their limits from a committed job request", () => {
    const file = fileURLToPath(new URL("../examples/scanned-analysis-request.json", import.meta.url));
    const request = JSON.parse(readFileSync(file, "utf8"));
    expect(request).toEqual({ input: { ...questionInput, houseSystem: "regiomontanus",
      question: { id: "synthetic-job", quesitedHouse: 10, naturalSignificators: ["Moon", "Venus"] } },
      options: { aspects: { horizonDays: 0.5 }, translation: { lookbackDays: 0.5 } } });
    const output = run(["analyze", "--input", file], "");
    expect(output.error).toBeUndefined();
    expect(output.status).toBe(0);
    expect(output.stderr).toBe("");
    const report = JSON.parse(output.stdout);
    expect(report.aspects.search.status).toBe("complete");
    expect(report.direct.eventSearch.status).toBe("complete");
    expect(report.considerations.observations.find((row: { rule: string }) => row.rule === "moon-void-of-course").scan.at)
      .toBe("2000-01-01T12:00:00.000Z");
    expect(report.significators.assignments.find((row: { role: string }) => row.role === "quesited").basis.house).toBe(10);
    expect(report.timing.policy.enabled).toBe(false);
    expect(report).not.toHaveProperty("verdict");
    const explanation = run(["explain", "--input", file, "--format", "json"], "");
    expect(explanation.status).toBe(0);
    const entries = JSON.parse(explanation.stdout).entries;
    for (const section of ["aspects", "direct", "translation", "collection", "impediments", "timing"]) {
      expect(entries.some((row: { section: string; status: string }) => row.section === section && row.status === "limitation")).toBe(true);
    }
  }, 30_000);

  it("treats budget refusal as data while calculation errors fail with no partial stdout", () => {
    const request = { input: questionInput, options: { considerations: options.considerations,
      aspects: { horizonDays: 0.5, maxSamples: 1 }, direct: { maxSamples: 1 } } };
    const output = run(["analyze"], JSON.stringify(request));
    expect(output.status).toBe(0);
    expect(output.stderr).toBe("");
    const report = JSON.parse(output.stdout);
    expect(report.aspects.search).toMatchObject({ status: "refused", reason: "sample-budget" });
    expect(report.aspects.aspects.every((row: { contacts: unknown[] }) => row.contacts.length === 0)).toBe(true);
    const explanation = run(["explain"], JSON.stringify(request));
    expect(explanation.status).toBe(0);
    expect(explanation.stdout).toContain("Reason: sample-budget");
    // Casting works here; the enabled lunar scan samples before the supported span.
    const edge = run(["analyze"], JSON.stringify({ ...questionInput, instant: "0001-05-02T00:00:00Z" }));
    expect(edge.status).toBe(1);
    expect(edge.stdout).toBe("");
    expect(JSON.parse(edge.stderr).error.message).toContain("ephemeris span");
  }, 30_000);

  it("normalizes an explicit offset independently of the process timezone", () => {
    const input = JSON.stringify({ ...questionInput, instant: "2000-01-01T19:00:00+07:00" });
    const outputs = ["UTC", "America/Los_Angeles"].map(TZ => spawnSync(process.execPath, [executable, "cast"], {
      input, cwd: tmpdir(), env: { ...process.env, TZ }, encoding: "utf8", timeout: 30_000, maxBuffer: 1_900_000
    }));
    for (const output of outputs) {
      expect(output.status).toBe(0);
      expect(output.stderr).toBe("");
      expect(JSON.parse(output.stdout).input.instant).toBe("2000-01-01T12:00:00.000Z");
    }
    // Reproducibility of the same instant, not an independent sky reference.
    expect(outputs[0]!.stdout).toBe(outputs[1]!.stdout);
  }, 30_000);
});
