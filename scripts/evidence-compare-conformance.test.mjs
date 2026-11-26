// docs/evidence/3.0.0-readme-20261126/compare-conformance.mjs, the comparison
// behind README.md's and docs/comparison.md's statement about the conformance
// runs, on results made up here: it compares each vector's `residual`, the
// field conformance/harness/run.mjs writes, and so finds a residual value
// that differs. Until 3.0.0 it compared `residuals`, which the harness does
// not write, and counted every vector as equal.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const SCRIPT = fileURLToPath(new URL("../docs/evidence/3.0.0-readme-20261126/compare-conformance.mjs", import.meta.url));
const L1 = "position.apparent.ecliptic-true-of-date";

/** A results file as the harness writes one, with the L1 vectors `residuals` gives, [lon, lat] each. */
function results(residuals, meta = {}) {
  const lon = { unit: "arcsec", n: residuals.length, median: 0.001, p95: 0.002, max: 0.003 };
  const lat = { unit: "arcsec", n: residuals.length, median: 0.0001, p95: 0.0002, max: 0.0003 };
  return {
    adapter: { engineVersion: "3.0.0", configuration: { ephemeris: "the pack" } },
    summary: {
      total: { count: residuals.length, pass: residuals.length, fail: 0, unsupported: 0, error: 0 },
      byKind: { [L1]: { count: residuals.length, pass: residuals.length, fail: 0, unsupported: 0, error: 0, residuals: { lon, lat } } }
    },
    results: residuals.map(([lonValue, latValue], index) => ({
      id: `L1-POS-${String(index + 1).padStart(4, "0")}`,
      verdict: "pass",
      residual: { lon: lonValue, lat: latValue },
      meta: { ephemeris: { name: "jpl-de440" }, ...meta }
    }))
  };
}

describe("the conformance comparison of 3.0.0's README evidence", () => {
  const folder = mkdtempSync(join(tmpdir(), "compare-conformance-"));
  afterAll(() => rmSync(folder, { recursive: true, force: true }));
  const compare = (run, committed) => {
    writeFileSync(join(folder, "run.json"), JSON.stringify(run));
    writeFileSync(join(folder, "committed.json"), JSON.stringify(committed));
    return JSON.parse(execFileSync(process.execPath, [SCRIPT, join(folder, "run.json"), join(folder, "committed.json")], { encoding: "utf8" }));
  };

  it("reads the field the harness writes: no committed result has residuals, and 549 of 640 have a residual", () => {
    // The other 91 (polar houses, zone offsets, calendars, one TT − UTC) are compared exactly and record none.
    const committed = JSON.parse(readFileSync(new URL("../conformance/results/zodiacs-engine.json", import.meta.url), "utf8"));
    expect(committed.results.filter((result) => "residuals" in result)).toEqual([]);
    expect(committed.results.filter((result) => "residual" in result)).toHaveLength(549);
  });

  it("finds a residual value that differs, with the significant digit where it first differs", () => {
    const committed = results([[0.0015239703, 0.0000447206], [-0.0023456842, 0.000146979667]]);
    const run = results([[0.0015239714, 0.0000447206], [-0.0023456842, 0.000146979667]]);
    const found = compare(run, committed);
    expect(found.sameVerdict).toBe(2);
    expect(found.sameResidual).toBe(1);
    expect(found.residualValues).toBe(4);
    expect(found.residualDiffers).toEqual([
      { id: "L1-POS-0001", value: "lon", run: 0.0015239714, committed: 0.0015239703, firstDifferingSignificantDigit: 7 }
    ]);
    expect(found.largestResidualDifference).toBeCloseTo(1.1e-9, 15);
    // The summary figures were made up equal, and the comparison says so.
    expect(found.summaryFiguresEqualToTheBit).toBe(true);
    expect(found.summaryFiguresEqualToThreeDecimals).toBe(true);
  });

  it("finds runs that agree to the bit equal, and a recorded value outside the residual apart from it", () => {
    const committed = results([[0.001, 0.0001]], { timingSeconds: 82685.9125561306 });
    expect(compare(committed, committed)).toMatchObject({ sameVerdict: 1, sameResidual: 1, residualDiffers: [], otherDiffers: [] });
    const run = results([[0.001, 0.0001]], { timingSeconds: 82685.9126043901 });
    const found = compare(run, committed);
    expect(found.sameResidual).toBe(1);
    expect(found.otherDiffers).toEqual([
      {
        id: "L1-POS-0001",
        field: "meta",
        numbers: [{ value: "timingSeconds", run: 82685.9126043901, committed: 82685.9125561306, firstDifferingSignificantDigit: 9 }],
        otherThanNumbers: false
      }
    ]);
  });
});
