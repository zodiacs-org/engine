/*
 * SemVer 2.0.0 precedence (src/semver.ts), which the receipt codec's version
 * gates use. Until rc.15's review three of those gates were regular
 * expressions that listed spellings (OLD_GATES, copied from src/receipt.ts of
 * rc.15's first cut, d90a00a, a local commit that was never pushed). They
 * missed 0.1.1-rc.14.1, 0.1.1-beta, 0.1.1-alpha.7 and 0.1.1-rc, which come
 * before 0.1.1-rc.15 (and all but the first before rc.9 and rc.10). On every
 * plain 0.1.1-rc.N, with or without build metadata, the comparison answers as
 * they did.
 */
import { describe, expect, it } from "vitest";
import { compareVersions, isVersion } from "./semver.js";

/** The first cut's gates, keyed by the release each one named every version before. */
const OLD_GATES: Record<string, RegExp> = {
  "0.1.1-rc.9": /^0\.(?:0\.\d+(?:-[A-Za-z0-9.-]+)?|1\.0(?:-[A-Za-z0-9.-]+)?|1\.1-rc\.[0-8])(?:\+[A-Za-z0-9.-]+)?$/,
  "0.1.1-rc.10": /^0\.(?:0\.\d+(?:-[A-Za-z0-9.-]+)?|1\.0(?:-[A-Za-z0-9.-]+)?|1\.1-rc\.[0-9])(?:\+[A-Za-z0-9.-]+)?$/,
  "0.1.1-rc.15":
    /^0\.(?:0\.\d+(?:-[A-Za-z0-9.-]+)?|1\.0(?:-[A-Za-z0-9.-]+)?|1\.1-rc\.(?:[0-9]|1[0-4]))(?:\+[A-Za-z0-9.-]+)?$/
};
const before = (version: string, release: string): boolean => compareVersions(version, release) < 0;
const BUILDS = ["", "+build.1", "+001", "+exp.sha.5114f85", "+a-b.0-c"];

describe("SemVer 2.0.0 precedence", () => {
  it("orders the specification's examples, each against each", () => {
    const ordered = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-alpha.beta",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
      "2.0.0",
      "2.1.0",
      "2.1.1"
    ];
    for (const [i, a] of ordered.entries()) {
      for (const [j, b] of ordered.entries()) expect(compareVersions(a, b)).toBe(Math.sign(i - j));
    }
  });

  it("ignores build metadata", () => {
    expect(compareVersions("1.0.0-alpha+001", "1.0.0-alpha")).toBe(0);
    expect(compareVersions("1.0.0+20130313144700", "1.0.0+exp.sha.5114f85")).toBe(0);
    expect(compareVersions("1.0.0-beta+exp.sha.5114f85", "1.0.0-beta.0")).toBe(-1);
  });

  it("compares numeric identifiers as integers of any size, before any other identifier", () => {
    expect(compareVersions("0.1.1-rc.9007199254740993", "0.1.1-rc.9007199254740992")).toBe(1);
    expect(compareVersions("18446744073709551616.0.0", "18446744073709551615.99.99")).toBe(1);
    expect(compareVersions("0.1.1-rc.100", "0.1.1-rc.99")).toBe(1);
    expect(compareVersions("0.1.1-rc.99999", "0.1.1-rc.a")).toBe(-1);
    expect(compareVersions("0.1.1-rc.15-hotfix", "0.1.1-rc.15")).toBe(1);
    expect(compareVersions("0.1.1-RC.16", "0.1.1-rc.1")).toBe(-1);
  });

  it.each([
    "v0.1.1",
    "0.1",
    "0.1.1-",
    "0.1.1+",
    "00.1.1",
    "0.01.1",
    "0.1.01",
    "0.1.1-rc.01",
    "0.1.1-rc..15",
    "0.1.1-rc.15+a..b",
    "0.1.1-rc_15",
    " 0.1.1",
    "0.1.1-rc.15\n"
  ])("refuses %j, which is not a SemVer 2.0.0 version", (value) => {
    expect(isVersion(value)).toBe(false);
    expect(() => compareVersions(value, "0.1.1")).toThrow(RangeError);
    expect(() => compareVersions("0.1.1", value)).toThrow(RangeError);
  });
});

describe("the receipt codec's version gates", () => {
  it.each([
    ["0.1.1-rc.14.1", { "0.1.1-rc.9": false, "0.1.1-rc.10": false, "0.1.1-rc.15": true }],
    ["0.1.1-beta", { "0.1.1-rc.9": true, "0.1.1-rc.10": true, "0.1.1-rc.15": true }],
    ["0.1.1-alpha.7", { "0.1.1-rc.9": true, "0.1.1-rc.10": true, "0.1.1-rc.15": true }],
    ["0.1.1-rc", { "0.1.1-rc.9": true, "0.1.1-rc.10": true, "0.1.1-rc.15": true }]
  ])("put %s where SemVer does, which the old gates did not", (version, expected) => {
    for (const [release, isBefore] of Object.entries(expected)) {
      expect(before(version, release), `${version} before ${release}`).toBe(isBefore);
      for (const build of BUILDS) expect(before(`${version}${build}`, release)).toBe(isBefore);
    }
    // The first cut's gates put none of them before 0.1.1-rc.15.
    expect(OLD_GATES["0.1.1-rc.15"]!.test(version)).toBe(false);
  });

  it("answer as the old gates did on every plain 0.1.1-rc.N, with or without build metadata", () => {
    const counts = [...Array.from({ length: 10_001 }, (_, n) => String(n)), "9007199254740993", "1".repeat(40)];
    const disagreements: string[] = [];
    let compared = 0;
    for (const n of counts) {
      for (const build of BUILDS) {
        const version = `0.1.1-rc.${n}${build}`;
        for (const [release, gate] of Object.entries(OLD_GATES)) {
          compared += 1;
          if (before(version, release) !== gate.test(version)) disagreements.push(`${version} / ${release}`);
        }
      }
    }
    expect(compared).toBe(10_003 * BUILDS.length * 3);
    expect(disagreements).toEqual([]);
  });

  it("answer as the old gates did on the other versions they named", () => {
    const versions = ["0.0.0", "0.0.7", "0.0.7-rc.1", "0.1.0", "0.1.0-rc.3", "0.1.0-0", "0.1.1", "0.1.2", "0.2.0", "1.0.0"];
    for (const version of versions) {
      for (const build of BUILDS) {
        for (const [release, gate] of Object.entries(OLD_GATES)) {
          expect(before(`${version}${build}`, release), `${version}${build} / ${release}`).toBe(gate.test(`${version}${build}`));
        }
      }
    }
  });
});
