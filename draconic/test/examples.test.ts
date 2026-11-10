import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseNatalEnvelope } from "../../src/receipt.js";
import { runCli } from "../src/cli.js";

describe("committed synthetic usage examples", () => {
  it.each(["synthetic.json", "unknown-time.json", "polar-fallback.json"])(
    "supports chart and comparison with either node for %s", async (name) => {
      const bytes = readFileSync(new URL(`../examples/${name}`, import.meta.url));
      const input = JSON.parse(bytes.toString("utf8"));
      expect(input.synthetic).toBe(true);
      for (const command of ["chart", "compare"] as const) {
        for (const node of ["true", "mean"]) {
          let stdout = "";
          let stderr = "";
          const code = await runCli([command, "--input", name, "--node", node], {
            readInput: async () => bytes,
            stdout: (text) => { stdout += text; },
            stderr: (text) => { stderr += text; }
          });
          expect(code).toBe(0);
          expect(stderr).toBe("");
          const result = JSON.parse(stdout);
          expect(parseNatalEnvelope(JSON.stringify(result.natal)).ok).toBe(true);
          expect(result.natal.receipt.sourceInstant).toBe(input.birth.utc);
          expect(result.conventions.northNode.kind).toBe(node);
          const derived = command === "chart" ? result.draconic : result.comparison;
          if (name === "unknown-time.json") {
            expect(derived.angles).toBeNull();
            expect(derived.houses).toBeNull();
            expect(result.natal.receipt.resultFlags).toContain("no-time");
          } else {
            expect(derived.angles).not.toBeNull();
            expect(derived.houses.system).toBe("whole");
            if (name === "polar-fallback.json") {
              expect(result.natal.receipt.resultFlags).toContain("polar-fallback");
            } else {
              expect(result.natal.receipt.resultFlags).not.toContain("polar-fallback");
            }
          }
        }
      }
    }
  );

  it("runs the library example outside the checkout with hand-derived arithmetic and natal envelopes", () => {
    const example = fileURLToPath(new URL("../examples/library.mjs", import.meta.url));
    const result = spawnSync(process.execPath, [example], {
      cwd: tmpdir(), encoding: "utf8", timeout: 20000
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout);
    // Exact synthetic arithmetic from ARITHMETIC.md, never engine output.
    expect(output.arithmetic).toEqual({
      sunLongitude: 25.25, moonLongitude: 299.75, moonDeltaDegrees: -75.25
    });
    expect(output.chart.conventions.northNode.kind).toBe("true");
    expect(output.comparison.conventions.northNode.kind).toBe("mean");
    for (const wrapper of [output.chart, output.comparison]) {
      expect(parseNatalEnvelope(JSON.stringify(wrapper.natal)).ok).toBe(true);
      expect(wrapper.natal.receipt.sourceInstant).toBe("2000-04-05T08:07:00+02:00");
      expect(wrapper.conventions.receiptScope).toBe("engine-natal-only;draconic-derived-by-this-library");
    }
  }, 25000);
});
