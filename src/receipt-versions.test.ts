/*
 * The receipt codec orders engine versions by SemVer 2.0.0 precedence
 * (src/semver.ts, src/semver.test.ts). A receipt of the time-basis set, which
 * 0.1.1-rc.15 released, is refused under any engine version that comes before
 * 0.1.1-rc.15, however it is spelled, and a version that is not SemVer 2.0.0
 * is refused as malformed. The charts are synthetic.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { natalChart } from "./api.js";
import { createNatalEnvelope, parseNatalEnvelope, serializeNatalEnvelope } from "./receipt.js";
import type { NatalEnvelopeErrorCode } from "./receipt.js";

const RC14 = readFileSync(new URL("./fixtures/receipt-rc14.json", import.meta.url), "utf8");
const CURRENT = serializeNatalEnvelope(
  createNatalEnvelope(natalChart({ utc: "1990-06-15T12:30:00Z", latitude: 40.7128, longitude: -74.006, houseSystem: "placidus" }))
);

/** The codec's verdict on a receipt relabelled with another engine version. */
function underVersion(json: string, version: string): "ok" | NatalEnvelopeErrorCode {
  const copy = JSON.parse(json);
  copy.receipt.engine.version = version;
  const parsed = parseNatalEnvelope(JSON.stringify(copy));
  return parsed.ok ? "ok" : parsed.code;
}

describe("the engine version of a receipt, in SemVer 2.0.0 order", () => {
  it.each(["0.1.1-rc.14.1", "0.1.1-beta", "0.1.1-alpha.7", "0.1.1-rc"])(
    "refuses the time-basis set under %s, which comes before 0.1.1-rc.15",
    (version) => {
      expect(underVersion(CURRENT, version)).toBe("inconsistent_result");
    }
  );

  it.each(["0.1.1-rc.01", "00.1.1", "0.1.1-rc..16", "0.1.1-rc.16+.."])(
    "refuses %s, which is not a SemVer 2.0.0 version",
    (version) => {
      expect(underVersion(CURRENT, version)).toBe("invalid_value");
      expect(underVersion(RC14, version)).toBe("invalid_value");
    }
  );

  it("answers as before on every plain 0.1.1-rc.N from 0 to 40, with or without build metadata", () => {
    for (let n = 0; n <= 40; n += 1) {
      for (const build of ["", "+build.1"]) {
        const version = `0.1.1-rc.${n}${build}`;
        expect(underVersion(CURRENT, version), version).toBe(n < 15 ? "inconsistent_result" : "ok");
        expect(underVersion(RC14, version), version).toBe(n >= 8 && n <= 14 ? "ok" : "inconsistent_result");
      }
    }
  });

  it("accepts the time-basis set under versions at or after 0.1.1-rc.15", () => {
    for (const version of ["0.1.1-rc.15", "0.1.1-rc.15+build.7", "0.1.1-rc.15.1", "0.1.1-rc.15-hotfix", "0.1.1", "0.1.2-alpha", "1.0.0"]) {
      expect(underVersion(CURRENT, version), version).toBe("ok");
    }
  });
});
