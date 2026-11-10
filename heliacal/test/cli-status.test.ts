import { afterEach, describe, expect, it, vi } from "vitest";
import { runCli } from "../src/cli.js";
import { horizonPhenomena } from "../src/phenomena.js";

vi.mock("../src/phenomena.js", async (original) => ({
  ...await original<typeof import("../src/phenomena.js")>(), horizonPhenomena: vi.fn()
}));

const args = ["events", "--mode", "horizon", "--body", "Mars", "--latitude", "13", "--longitude", "-42",
  "--from", "2001-02-03", "--to", "2001-02-06"];
afterEach(() => vi.resetAllMocks());

describe("CLI failure propagation", () => {
  it("keeps unresolved diagnostics with nonzero exit and no stderr", () => {
    const unresolved = { status: "unresolved", reason: "event-sequence", detail: "synthetic missing solar anchor", events: [], opportunities: [] };
    vi.mocked(horizonPhenomena).mockReturnValue(unresolved as unknown as ReturnType<typeof horizonPhenomena>);
    const result = runCli(args);
    expect(result.exitCode).toBe(3);
    expect(JSON.parse(result.stdout).result).toEqual(unresolved);
    expect(result.stderr).toBe("");
  });

  it("does not serialize nonfinite engine output as a successful null", () => {
    vi.mocked(horizonPhenomena).mockReturnValue({ status: "complete", samples: NaN } as unknown as ReturnType<typeof horizonPhenomena>);
    const result = runCli(args);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(JSON.parse(result.stderr).error.code).toBe("execution-error");
  });

  it("puts an escaped runtime error on stderr without stack or partial JSON", () => {
    vi.mocked(horizonPhenomena).mockImplementation(() => { throw new Error("synthetic\nfailure"); });
    const result = runCli(args);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr.trim().split("\n")).toHaveLength(1);
    expect(JSON.parse(result.stderr).error).toEqual({ code: "execution-error", message: "synthetic\nfailure" });
  });
});
