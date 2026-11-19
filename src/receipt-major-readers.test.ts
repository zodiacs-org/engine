/*
 * Records across the major: this codec reads every natal envelope that a
 * carried archive wrote (docs/evidence/records-2.0.0-20261120/README.md).
 *
 * src/fixtures/receipts-by-writer/<version>.json holds, byte for byte, the
 * envelopes that each archive with status "carried" in artifacts/archives.json
 * serialized with its own natalChart, createNatalEnvelope and
 * serializeNatalEnvelope, for five synthetic charts (public places, arbitrary
 * instants). They were written by
 * docs/evidence/records-2.0.0-20261120/tools/later-reader.mjs, which checked
 * each archive against its SHA-256 before use and recorded every envelope's
 * SHA-256 in results/later-reader.json beside it.
 *
 * The codec must accept the record and preserve the engine version and
 * conventions that its writer recorded. Replays are checked for acceptance.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";

import { natalChart } from "./api.js";
import { natalConventionIds } from "./conventions.js";
import { setDefaultEphemeris } from "./ephemeris.js";
import { compareVersions } from "./semver.js";
import {
  NATAL_RECEIPT_CONVENTION_SETS,
  createNatalEnvelope,
  natalReplayInput,
  parseNatalEnvelope,
  serializeNatalEnvelope
} from "./receipt.js";
import type { NatalEnvelope } from "./receipt.js";

interface Fixture {
  version: string;
  archive: string;
  sha256: string;
  envelopes: Record<string, string>;
  notWritten: Record<string, string>;
}
interface ResultRow {
  version: string;
  status: string;
  sha256?: string;
  run: string;
  inputs?: Record<string, { written: string; read?: string; sha256?: string }>;
}

const DIR = new URL("./fixtures/receipts-by-writer/", import.meta.url);
const RESULTS: { archives: ResultRow[]; inputs: string[] } = JSON.parse(
  readFileSync(new URL("../docs/evidence/records-2.0.0-20261120/results/later-reader.json", import.meta.url), "utf8")
);
const ARCHIVES: { version: string; file: string; sha256: string; status: string }[] = JSON.parse(
  readFileSync(new URL("../artifacts/archives.json", import.meta.url), "utf8")
).archives;
const CARRIED = ARCHIVES.filter((archive) => archive.status === "carried");
const FIXTURES = readdirSync(DIR)
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({ ...(JSON.parse(readFileSync(new URL(name, DIR), "utf8")) as Fixture), name }))
  .sort((a, b) => compareVersions(a.version, b.version));
const PAIRS = FIXTURES.flatMap((fixture) =>
  Object.entries(fixture.envelopes).map(([input, json]) => ({ version: fixture.version, input, json }))
);
const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");
const parsed = (json: string): NatalEnvelope => {
  const result = parseNatalEnvelope(json);
  if (!result.ok) throw new Error(result.code);
  return result.envelope;
};
const envelopeOf = (version: string, input: string) => {
  const json = FIXTURES.find((fixture) => fixture.version === version)?.envelopes[input];
  if (json === undefined) throw new Error(`no ${version} envelope for ${input}`);
  return json;
};

afterAll(() => setDefaultEphemeris("astronomy-engine"));

describe("the fixtures of records by writer", () => {
  it("hold one file for each carried archive, from that archive, as the evidence recorded", () => {
    const versions = CARRIED.map((archive) => archive.version);
    expect(FIXTURES.map((fixture) => fixture.version)).toEqual(versions);
    expect(RESULTS.archives.filter((archive) => archive.status === "carried").map((archive) => archive.version)).toEqual(versions);
    for (const fixture of FIXTURES) {
      const archive = CARRIED.find((entry) => entry.version === fixture.version)!;
      expect(fixture.name).toBe(`${fixture.version}.json`);
      expect(fixture).toMatchObject({ archive: archive.file, sha256: archive.sha256 });
      const row = RESULTS.archives.find((entry) => entry.version === fixture.version)!;
      expect(row, fixture.version).toMatchObject({ sha256: archive.sha256, run: "loaded" });
      expect(Object.keys(row.inputs!), fixture.version).toEqual(RESULTS.inputs);
      expect([...Object.keys(fixture.envelopes), ...Object.keys(fixture.notWritten)].sort(), fixture.version).toEqual(RESULTS.inputs);
      for (const [input, answer] of Object.entries(row.inputs!)) {
        const pair = `${fixture.version} ${input}`;
        if (answer.written === "ok") {
          const json = fixture.envelopes[input];
          if (json === undefined) throw new Error(`missing fixture for ${pair}`);
          expect(answer, pair).toMatchObject({ read: "ok", sha256: sha256(json) });
        } else {
          expect(fixture.notWritten, pair).toHaveProperty(input);
        }
      }
    }
  });

  it("account for the withdrawn 1.1.0-rc.8 in the evidence", () => {
    expect(CARRIED.some((archive) => archive.version === "1.1.0-rc.8")).toBe(false);
    expect(RESULTS.archives.find((row) => row.version === "1.1.0-rc.8")).toMatchObject({ run: "no archive" });
  });

  it("leave out only Koch houses before 0.1.1-rc.9, which those engines did not offer", () => {
    const missing = FIXTURES.flatMap((fixture) => Object.keys(fixture.notWritten).map((input) => `${fixture.version} ${input}`));
    expect(missing).toEqual(["0.1.1-rc.7 C", "0.1.1-rc.8 C"]);
  });
});

describe.each(PAIRS)("the $version record of chart $input", ({ version, input, json }) => {
  it("is under 16 KiB of UTF-8 JSON", () => {
    expect(Buffer.byteLength(json)).toBeLessThan(16 * 1024);
  });

  it("reads, naming the engine version and conventions set its writer recorded", () => {
    const result = parseNatalEnvelope(json);
    expect(result.ok ? "ok" : result.code).toBe("ok");
    const envelope = parsed(json);
    const written = JSON.parse(json);
    expect(envelope.receipt.engine.version).toBe(version);
    expect(envelope.receipt.conventions).toEqual(written.receipt.conventions);
    expect(NATAL_RECEIPT_CONVENTION_SETS).toContainEqual(envelope.receipt.conventions);
  });

  it("goes through this codec and back to an equal envelope", () => {
    const envelope = parsed(json);
    expect(parsed(serializeNatalEnvelope(envelope))).toEqual(envelope);
  });

  it("gives a replay request this engine accepts", () => {
    expect(() => natalChart(natalReplayInput(parsed(json)))).not.toThrow();
  });
});

describe("the records where the rules changed", () => {
  const timeScale = (version: string, input: string) => parsed(envelopeOf(version, input)).result.timeScale;
  const flags = (version: string, input: string) => parsed(envelopeOf(version, input)).receipt.resultFlags;
  const from = (first: string) => FIXTURES.filter((fixture) => compareVersions(fixture.version, first) >= 0).map((f) => f.version);
  const between = (first: string, end: string) => from(first).filter((version) => compareVersions(version, end) < 0);

  it("read chart C after the IERS table on the delta-t basis before 2.0.0-rc.3, and on continuous UTC from it", () => {
    // 0.1.1-rc.15 is the first archive whose result carries a time scale.
    for (const version of between("0.1.1-rc.15", "2.0.0-rc.3"))
      expect(timeScale(version, "C"), version).toMatchObject({ basis: "delta-t", ut1MinusUtc: { source: "fallback" } });
    expect(timeScale("2.0.0-rc.3", "C")).toMatchObject({ basis: "continuous-utc", ut1MinusUtc: { source: "model" } });
    expect(parsed(envelopeOf("2.0.0-rc.3", "C")).requiredFeatures).toContain("time-basis-continuous-utc");
  });

  it("read the polar chart D without polar-angles through 1.1.0, and with it from 2.0.0-rc.1", () => {
    for (const version of FIXTURES.map((fixture) => fixture.version)) {
      const expected = compareVersions(version, "2.0.0-rc.1") >= 0 ? ["polar-fallback", "polar-angles"] : ["polar-fallback"];
      expect(flags(version, "D"), version).toEqual(expected);
    }
    expect(parsed(envelopeOf("1.1.0", "D")).result.houses?.system).toBe("whole");
  });

  it("read chart E with no time and no place", () => {
    for (const version of FIXTURES.map((fixture) => fixture.version)) {
      const { receipt, result } = parsed(envelopeOf(version, "E"));
      expect(receipt.timeKnown, version).toBe(false);
      expect(receipt.coordinates, version).toBeNull();
      expect(result.houses, version).toBeNull();
    }
  });
});

describe.each(["de440", "astronomy-engine"] as const)("the engine version a continuous-UTC record may name on %s", (ephemeris) => {
  // Chart C, after the IERS table, computed by this tree: a continuous-UTC set.
  const C = { utc: "2030-01-01T00:00:00Z", latitude: 51.4779, longitude: 0, houseSystem: "koch" } as const;
  const cases = [
    ["2.0.0", "ok"],
    ["2.0.0-rc.4", "ok"],
    ["2.0.0-rc.2", "inconsistent_result"]
  ] as const;

  it.each(cases)("returns the expected result for %s (%s)", (version, expected) => {
    setDefaultEphemeris(ephemeris);
    const envelope = JSON.parse(serializeNatalEnvelope(createNatalEnvelope(natalChart(C))));
    expect(envelope.result.timeScale.basis).toBe("continuous-utc");
    expect(envelope.requiredFeatures).toContain("time-basis-continuous-utc");
    envelope.receipt.engine.version = version;
    // The ids the edited record names, so that only the version rule can refuse it.
    envelope.receipt.conventionIds = natalConventionIds(envelope);
    const result = parseNatalEnvelope(JSON.stringify(envelope));
    expect(result.ok ? "ok" : result.code).toBe(expected);
  });
});
