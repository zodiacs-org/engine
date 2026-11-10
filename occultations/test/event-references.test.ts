import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assertReferenceChecks, type ReferenceCheck } from "./reference-checks.js";

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/events/${name}`, import.meta.url), "utf8");
interface ReferenceCase {
  id: string; partition: string; eventGroup: string; kind: string; pair: string[];
  sourceId: string; locator: string; validationUse: string; criteriaId: string;
  window: { from: string; to: string; scale: string };
  qualifications: string[]; checks: ReferenceCheck[];
  published: unknown;
  observerSource?: { printedLongitude: string; clockOffsetSecondsWestOfGreenwich?: number };
}
interface Corpus { schema: string; partition: string; cases: ReferenceCase[] }
const development = JSON.parse(fixture("development.json")) as Corpus;
const heldOut = JSON.parse(fixture("held-out.json")) as Corpus;
const cases = [...development.cases, ...heldOut.cases];
const sources = JSON.parse(fixture("sources.json")) as { sources: {
  id: string; url: string; retrieved: string; verification: {
    url: string; bytes: number; sha256: string;
    normalization?: string; normalizedBytes?: number; normalizedSha256?: string;
    normalizationReceipt?: { retrieved: string; bytes: number; sha256: string; note: string }
  }
}[] };
const frozen = JSON.parse(fixture("freeze.json")) as {
  files: Record<string, string>; caseIds: Record<string, string[]>; astronomicalComparisonsPerformed: boolean
};
const nominalSeconds = (label: string): number => Date.parse(label.endsWith("Z") ? label : label + "Z") / 1000;
const byKey = (c: ReferenceCase, key: string): ReferenceCheck => {
  const check = c.checks.find((item) => item.key === key);
  expect(check, `${c.id}: missing ${key}`).toBeDefined();
  return check!;
};

// These tests validate frozen SOURCE transcriptions and the acceptance contract.
// No event solver is imported. They must never be reported as sky accuracy tests.
describe("M4 frozen independent event reference contract", () => {
  it("preserves every source transcription, threshold and partition", () => {
    expect(frozen.astronomicalComparisonsPerformed).toBe(false);
    expect(Object.keys(frozen.files).sort()).toEqual([
      "EVENTS.md", "NOTICE.txt", "development.json", "held-out.json", "sources.json"
    ]);
    for (const [name, digest] of Object.entries(frozen.files)) {
      expect(createHash("sha256").update(fixture(name)).digest("hex"), name).toBe(digest);
    }
    expect(cases).toHaveLength(20);
    for (const corpus of [development, heldOut]) {
      expect(corpus.schema).toBe("occultations-event-references/1");
      expect(corpus.cases.map((c) => c.id)).toEqual(frozen.caseIds[corpus.partition]);
    }
  });

  it("keeps whole events and alternate observers in one partition", () => {
    const ownership = new Map<string, string>();
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length);
    for (const corpus of [development, heldOut]) {
      for (const c of corpus.cases) {
        expect(c.partition).toBe(corpus.partition);
        expect(ownership.get(c.eventGroup) ?? c.partition, c.eventGroup).toBe(c.partition);
        ownership.set(c.eventGroup, c.partition);
      }
      expect(new Set(corpus.cases.map((c) => c.kind))).toEqual(new Set([
        "right-ascension-conjunction", "ecliptic-longitude-conjunction", "appulse",
        "stellar-contacts", "planetary-contacts", "visibility-outline"
      ]));
    }
    const washington = heldOut.cases.filter((c) => c.eventGroup === "moon-aldebaran-1923-04-19");
    expect(washington).toHaveLength(2);
    expect(new Set(washington.map((c) => c.observerSource?.clockOffsetSecondsWestOfGreenwich)))
      .toEqual(new Set([18495.78, 18492.15]));
  });

  it("requires source receipts, locators, explicit qualifications and complete finite checks", () => {
    expect(new Set(sources.sources.map((s) => s.id)).size).toBe(sources.sources.length);
    for (const source of sources.sources) {
      expect(new URL(source.url).protocol).toBe("https:");
      expect(new URL(source.verification.url).protocol).toBe("https:");
      expect(source.verification.bytes).toBeGreaterThan(0);
      expect(source.verification.sha256).toMatch(/^[a-f0-9]{64}$/u);
      expect(source.retrieved).toBe("2026-10-15");
      if (source.verification.normalization) {
        expect(["naoj-conjunction-illustration-v1", "naoj-contact-illustration-v1"])
          .toContain(source.verification.normalization);
        expect(source.verification.normalizedBytes).toBeGreaterThan(0);
        expect(source.verification.normalizedSha256).toMatch(/^[a-f0-9]{64}$/u);
        if (source.verification.normalization === "naoj-contact-illustration-v1") {
          const receipt = source.verification.normalizationReceipt!;
          expect(receipt.retrieved).toBe("2026-10-15");
          expect(receipt.bytes).toBeGreaterThan(0);
          expect(receipt.sha256).toMatch(/^[a-f0-9]{64}$/u);
          expect(receipt.note).toContain("every retained contact row");
        }
      }
    }
    for (const c of cases) {
      expect(sources.sources.some((s) => s.id === c.sourceId), c.id).toBe(true);
      expect(c.locator.length).toBeGreaterThan(0);
      expect(c.qualifications.length).toBeGreaterThan(0);
      expect(c.validationUse.length).toBeGreaterThan(0);
      expect(nominalSeconds(c.window.to)).toBeGreaterThan(nominalSeconds(c.window.from));
      const exactSourceValues = Object.fromEntries(c.checks.map((ch) => [ch.key, ch.value]));
      // Testing the gate with its own input values is only arithmetic validation.
      expect(() => assertReferenceChecks(c.checks, exactSourceValues)).not.toThrow();
      const first = c.checks[0]!;
      expect(() => assertReferenceChecks(c.checks, {
        ...exactSourceValues, [first.key]: first.value + first.maximumAbsoluteError + 1
      })).toThrow(/exceeds/);
    }
  });

  it("enforces the preregistered maxima without treating precision as accuracy", () => {
    for (const c of cases) {
      for (const ch of c.checks) {
        let budget: number;
        if (ch.key.endsWith("PositionAngle")) {
          budget = 2;
          expect(ch.difference).toBe("circular-degrees");
        } else if (ch.key.endsWith("MoonAltitude")) budget = 0.5;
        else if (ch.key.endsWith("DiskCrossingDuration")) budget = 10;
        else if (c.kind === "visibility-outline") budget = 1;
        else if (c.criteriaId === "lunar-contact") budget = 120;
        else if (c.criteriaId === "moon-conjunction-minute") budget = 180;
        else {
          expect(c.criteriaId).toBe("coarse-planet-hour");
          budget = 3600;
        }
        expect(ch.maximumAbsoluteError, c.id + ":" + ch.key).toBe(budget);
        if (ch.key.endsWith("Time")) {
          expect(ch.unit).toBe(`nominal-${c.window.scale}-seconds`);
          expect(ch.value).toBeGreaterThan(nominalSeconds(c.window.from));
          expect(ch.value).toBeLessThanOrEqual(nominalSeconds(c.window.to));
        }
      }
    }
  });

  it("retains source TT conjunctions and only coarse UTC outreach conversions", () => {
    for (const c of cases.filter((item) => item.kind.includes("conjunction") || item.kind === "appulse")) {
      const p = c.published as { date: string; time: string; timeScale: string; utcFromStatedZone?: string };
      if (c.kind === "appulse") {
        expect(c.validationUse).toBe("coarse-occurrence");
        const converted = nominalSeconds(p.date + "T" + p.time) - 9 * 3600;
        expect(byKey(c, "eventTime").value).toBe(converted);
        expect(converted).toBe(nominalSeconds(p.utcFromStatedZone!));
        expect(c.pair).not.toContain("Moon");
      } else {
        expect(p.timeScale).toBe("TT");
        expect(byKey(c, "eventTime").value).toBe(nominalSeconds(p.date + "T" + p.time));
      }
    }
  });

  it("checks historical noon-day and local-longitude conversions independently", () => {
    for (const c of cases.filter((item) => item.kind === "stellar-contacts")) {
      expect(c.pair).toEqual(["Moon", "sao:94027"]);
      const rows = c.published as { kind: string; canonicalUt1: string; positionAngleDegrees: number }[];
      const boston = c.eventGroup.endsWith("01-27");
      const midnight = nominalSeconds(boston ? "1923-01-27T00:00:00" : "1923-04-19T00:00:00");
      const longitude = boston ? 0 : c.observerSource!.clockOffsetSecondsWestOfGreenwich!;
      const sourceMeanSeconds = boston ? [10 * 3600 + 49.8 * 60, 12 * 3600 + 14.4 * 60]
        : [5 * 3600 + 14 * 60, 6 * 3600 + 31 * 60];
      rows.forEach((row, i) => {
        const expected = midnight + 12 * 3600 + sourceMeanSeconds[i]! + longitude;
        expect(Math.abs(byKey(c, row.kind + "Time").value - expected)).toBeLessThan(1e-6);
        expect(byKey(c, row.kind + "Time").value).toBe(nominalSeconds(row.canonicalUt1));
        expect(byKey(c, row.kind + "PositionAngle").value).toBe(row.positionAngleDegrees);
      });
    }
    expect(0.2725 * 6378.388).toBeCloseTo(1738.11073, 9);
    expect(0.2725 * 6378.388 - 1737.4).toBeCloseTo(0.71073, 9);
  });

  it("keeps all external/internal planet contacts, position angles and altitude rows", () => {
    const labels: Record<string, string> = {
      "Disappearance starts": "disappearanceStart", "Disappearance ends": "disappearanceEnd",
      "Least angular distance": "closestApproach", "Reappearance starts": "reappearanceStart",
      "Reappearance ends": "reappearanceEnd"
    };
    for (const c of cases.filter((item) => item.kind === "planetary-contacts")) {
      const p = c.published as { rows: string[][] };
      expect(p.rows.map((row) => row.at(-1))).toEqual(Object.keys(labels));
      for (const row of p.rows) {
        const key = labels[row.at(-1)!]!;
        const [h, m, s] = row[1]!.split(":").map(Number);
        const time = nominalSeconds(row[0] + "T00:00:00") + h! * 3600 + m! * 60 + s!;
        expect(byKey(c, key + "Time").value).toBe(time);
        if (key !== "closestApproach") {
          expect(byKey(c, key + "PositionAngle").value).toBe(Number(row[2]));
          expect(byKey(c, key + "MoonAltitude").value).toBe(Number(row[6]));
        }
      }
      for (const prefix of ["disappearance", "reappearance"]) {
        const duration = byKey(c, prefix + "DiskCrossingDuration");
        expect(duration.value).toBe(byKey(c, prefix + "EndTime").value - byKey(c, prefix + "StartTime").value);
        expect(duration.value).toBeGreaterThan(duration.maximumAbsoluteError);
      }
    }
  });

  it("preserves exact map-node longitudes and all four distinct curve identities", () => {
    for (const c of cases.filter((item) => item.kind === "visibility-outline")) {
      const points = c.published as {
        side: string; contactLimit: string; array: string; indexZeroBased: number;
        latitudeDeg: number; longitudeEastDeg: number; sourceText: string
      }[];
      expect(points).toHaveLength(8);
      expect(new Set(points.map((p) => `${p.side}-${p.contactLimit}`))).toEqual(new Set([
        "north-inner", "south-inner", "north-outer", "south-outer"
      ]));
      points.forEach((p, i) => {
        expect(p.indexZeroBased).toBeGreaterThanOrEqual(0);
        expect(p.array).toMatch(/^points[1-4]$/u);
        const values = p.sourceText.match(/^new google\.maps\.LatLng\((-?\d+\.\d+), (-?\d+\.\d+)\)$/u)!;
        expect(values).not.toBeNull();
        expect(p.latitudeDeg).toBe(Number(values[1]));
        expect(p.longitudeEastDeg).toBe(Number(values[2]));
        expect(byKey(c, `node${i}Latitude`).value).toBe(p.latitudeDeg);
      });
    }
  });
});
