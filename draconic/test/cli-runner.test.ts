import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseNatalEnvelope } from "../../src/receipt.js";
import { draconicChart, draconicCompare } from "../src/index.js";

const runner = fileURLToPath(new URL("../bin/draconic.mjs", import.meta.url));

describe("source-checkout CLI runner", () => {
  it.each(["chart", "compare"] as const)("runs %s JSON from outside the checkout with local dependencies and no engine build", (command) => {
    const birth = { utc: "2000-04-05T06:07:00Z", timeKnown: false };
    const result = spawnSync(process.execPath, [runner, command, "--input", "-", "--node", "mean"], {
      cwd: tmpdir(), input: JSON.stringify({ synthetic: true, birth }), encoding: "utf8", timeout: 20000
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    const output = JSON.parse(result.stdout);
    const calculate = command === "chart" ? draconicChart : draconicCompare;
    expect(output).toEqual(calculate(birth, { node: "mean" }, { sourceInstant: birth.utc }));
    const derived = command === "chart" ? output.draconic : output.comparison;
    expect(derived.node.kind).toBe("mean");
    expect(derived.angles).toBeNull();
    expect(derived.houses).toBeNull();
    expect(output.natal.receipt.resultFlags).toContain("no-time");
    expect(output.conventions.northNode).toEqual(derived.node);
    expect(parseNatalEnvelope(JSON.stringify(output.natal)).ok).toBe(true);
  }, 25000);

  it.each(["chart", "compare"] as const)("reads %s from local paths with spaces and reports file failures without output", (command) => {
    const root = mkdtempSync(fileURLToPath(new URL("../.cache/cli-test-", import.meta.url)));
    try {
      const file = join(root, "synthetic chart.json");
      const directory = join(root, "directory");
      writeFileSync(file, JSON.stringify({ synthetic: true, birth: { utc: "2000-04-05" } }));
      mkdirSync(directory);
      for (const [input, code, message] of [
        [file, 0, ""], [join(root, "missing.json"), 1, "Input file does not exist."],
        [directory, 1, "Input must be a file, not a directory."]
      ] as const) {
        const result = spawnSync(process.execPath, [runner, command, "--input", input], {
          cwd: tmpdir(), encoding: "utf8", timeout: 20000
        });
        expect(result.error).toBeUndefined();
        expect(result.status).toBe(code);
        if (code === 0) {
          expect(result.stderr).toBe("");
          expect(JSON.parse(result.stdout).conventions.northNode.kind).toBe("true");
        } else {
          expect(result.stdout).toBe("");
          expect(result.stderr).toBe(`draconic: ${message}\n`);
        }
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 65000);

  it.each(["chart", "compare"] as const)("stops oversized %s input streams without printing a partial result", (command) => {
    const result = spawnSync(process.execPath, [runner, command, "--input", "-"], {
      cwd: tmpdir(), input: " ".repeat(64 * 1024 + 1), encoding: "utf8", timeout: 20000
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("draconic: Input exceeds the 64 KiB limit.\n");
  }, 25000);

  it.each(["chart", "compare"] as const)("runs %s text with complete coordinate rows and receipt scope", (command) => {
    const birth = { utc: "2000-04-05T06:07:00Z", latitude: 78.5, longitude: 45.25, houseSystem: "placidus" } as const;
    const result = spawnSync(process.execPath, [runner, command, "--input", "-", "--format", "text"], {
      cwd: tmpdir(), input: JSON.stringify({ synthetic: true, birth }), encoding: "utf8", timeout: 20000
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("Selected north node: true (North Node)");
    expect(result.stdout).toContain("House systems: requested placidus; computed whole.");
    expect(result.stdout).toContain("Natal flags: polar-fallback.");
    expect(result.stdout).toContain("Receipt scope: engine natal only; draconic derived by this library.");
    // Match the existing wrapper's values, not an independent astronomy reference.
    if (command === "chart") {
      const chart = draconicChart(birth).draconic;
      for (const body of chart.bodies) {
        expect(result.stdout).toContain([body.body, body.lon, body.lat, body.sign, body.degree, body.house].join("\t") + "\n");
      }
      for (const [angle, longitude] of Object.entries(chart.angles!)) {
        expect(result.stdout).toContain(`${angle}\t${longitude}\n`);
      }
      chart.houses!.cusps.forEach((longitude, i) => expect(result.stdout).toContain(`${i + 1}\t${longitude}\n`));
    } else {
      const comparison = draconicCompare(birth).comparison;
      for (const row of comparison.bodies) {
        expect(result.stdout).toContain([row.body, row.natalLongitude, row.draconicLongitude, row.deltaDegrees].join("\t") + "\n");
      }
      for (const [angle, row] of Object.entries(comparison.angles!)) {
        expect(result.stdout).toContain([angle, row.natalLongitude, row.draconicLongitude, row.deltaDegrees].join("\t") + "\n");
      }
      for (const row of comparison.houses!.cusps) {
        expect(result.stdout).toContain([row.house, row.natalLongitude, row.draconicLongitude, row.deltaDegrees].join("\t") + "\n");
      }
      expect(result.stdout).toContain("draconic minus natal");
    }
    expect(result.stdout).not.toMatch(/[\u001b\u2014]/);
    expect(result.stdout.endsWith("\n")).toBe(true);
  }, 25000);

  it.each(["chart", "compare"] as const)("uses stdout for %s help and stderr for invalid arguments and text input", (command) => {
    for (const [args, input, status, message] of [
      [[command, "--help"], "", 0, "Usage: draconic chart"],
      [[command, "--input", "-", "--format", "yaml"], "", 2, '--format must be "json" or "text".'],
      [[command, "--input", "-", "--format", "text"], "{", 2, "Input must be one valid UTF-8 JSON object."],
      [[command, "--input", "-", "--format", "text"], '{"synthetic":false,"birth":{}}', 2, 'Input must contain only "synthetic": true']
    ] as const) {
      const result = spawnSync(process.execPath, [runner, ...args], {
        cwd: tmpdir(), input, encoding: "utf8", timeout: 20000
      });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(status);
      if (status === 0) {
        expect(result.stdout).toContain(message);
        expect(result.stderr).toBe("");
      } else {
        expect(result.stdout).toBe("");
        expect(result.stderr).toContain(message);
        expect(result.stderr).toMatch(/^draconic: [^\n]+\n$/);
      }
    }
  }, 85000);
});
