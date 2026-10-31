import { describe, expect, it } from "vitest";
import { CHECKS, main, renderChecks, runChecks } from "../scripts/check-local.mjs";

describe("local check orchestration", () => {
  it("runs the full gates, including independent validation and isolation after failure", () => {
    const seen: string[][] = [];
    const result = runChecks((args: string[]) => {
      seen.push([...args]);
      return { status: args.includes("test") || args.includes("validate:references") ? 1 : 0 };
    });
    expect(seen).toEqual([
      ["run", "typecheck"], ["run", "test"],
      ["run", "validate:references", "--", "--check-evidence"], ["run", "check:isolation"]
    ]);
    expect(result.passed).toBe(false);
    expect(result.stages.map((stage) => stage.passed)).toEqual([true, false, false, true]);
  });

  it.each([
    { status: null, signal: "SIGTERM" },
    { status: null, error: new Error("could not launch") },
    { status: 0, error: new Error("failed despite status") }
  ])("treats abnormal child termination as a failure and runs later gates", (failure) => {
    let calls = 0;
    const result = runChecks(() => ++calls === 1 ? failure : { status: 0 });
    expect(calls).toBe(CHECKS.length);
    expect(result.passed).toBe(false);
    expect(result.stages.at(-1)?.passed).toBe(true);
  });

  it("continues after a launch exception without writing exception content to evidence", () => {
    let calls = 0;
    const result = runChecks(() => {
      if (++calls === 1) throw new Error("arbitrary subprocess text");
      return { status: 0 };
    });
    expect(result.stages[0]).toMatchObject({ launchError: true, exitCode: null, passed: false });
    expect(calls).toBe(CHECKS.length);
    expect(JSON.stringify(result)).not.toContain("arbitrary subprocess text");
  });

  it("passes only when every gate passed, and renders every verdict without hiding failures", () => {
    const result = runChecks(() => ({ status: 0 }));
    expect(result.passed).toBe(true);
    const markdown = renderChecks({ ...result,
      runtime: { node: "test", platform: "test", arch: "test" }, identities: {} });
    for (const stage of result.stages) expect(markdown).toContain(`\`${stage.command}\` | 0 | none | false | PASS`);
    expect(markdown).not.toContain("\u2014");
  });

  it("rejects unknown switches before launching a gate", () => {
    expect(() => main(["--skip-tests"])).toThrow("Usage:");
    expect(() => main(["--write-evidence", "--write-evidence"])).toThrow("Usage:");
  });
});
