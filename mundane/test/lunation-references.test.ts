import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { natalChart } from "../../src/api.js";
import { analyzeAngularity, analyzeAngleRulers, searchLunations } from "../src/index.js";

const directory = new URL("./fixtures/usno/", import.meta.url);
const sources = JSON.parse(readFileSync(new URL("lunation-sources.json", directory), "utf8")) as {
  comparison: { maximumAbsoluteDifferenceSeconds: number; fixedBeforeEngineComparison: boolean };
  responses: {
    year: number; file: string; url: string; sha256: string; primaryPhaseCount: number; lunationCount: number;
  }[];
};
interface PhaseRow {
  year: number;
  month: number;
  day: number;
  time: string;
  phase: string;
}
interface PhaseResponse {
  apiversion: string;
  year: number;
  numphases: number;
  phasedata: PhaseRow[];
}

// Defined independently of the engine and LUNATION_PHASES, from the USNO
// technical definition. Derivation and source clock qualifications are in
// docs/lunation-references.md. Quarter phases are deliberately not lunations.
const definitions = [
  { sourcePhase: "New Moon", phase: "new", elongation: 0 },
  { sourcePhase: "Full Moon", phase: "full", elongation: 180 }
] as const;
const tables = sources.responses.map(source => {
  const bytes = readFileSync(new URL(source.file, directory));
  const response = JSON.parse(bytes.toString("utf8")) as PhaseResponse;
  const references = response.phasedata.flatMap(row => {
    const definition = definitions.find(value => value.sourcePhase === row.phase);
    if (!definition) return [];
    // No engine date parser, ephemeris calculation, or fitted clock offset.
    // Z carries the unshifted published UT minute label for this coarse test.
    const published = `${row.year}-${String(row.month).padStart(2, "0")}-${String(row.day).padStart(2, "0")}T${row.time}:00Z`;
    return [{ ...definition, row, published, milliseconds: Date.parse(published) }];
  });
  return { source, bytes, response, references };
});
const place = { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 };
const DAY = 86_400_000;

describe("independent USNO lunation references", () => {
  it("pins the source selection and agreement threshold fixed before comparison", () => {
    expect(sources.responses.map(row => row.year)).toEqual([1950, 2000, 2024]);
    expect(sources.responses.map(row => row.primaryPhaseCount)).toEqual([49, 49, 50]);
    expect(sources.responses.map(row => row.lunationCount)).toEqual([25, 25, 25]);
    expect(tables.reduce((count, table) => count + table.references.length, 0)).toBe(75);
    expect(sources.comparison.maximumAbsoluteDifferenceSeconds).toBe(120);
    expect(sources.comparison.fixedBeforeEngineComparison).toBe(true);
  });

  for (const { source, bytes, response, references } of tables) {
    it(`${source.year}: verifies raw response identity, phase selection, and calendar derivation`, () => {
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(source.sha256);
      expect(source.url).toBe(`https://aa.usno.navy.mil/api/moon/phases/year?year=${source.year}`);
      expect(response).toMatchObject({ apiversion: "4.0.1", year: source.year, numphases: source.primaryPhaseCount });
      expect(response).not.toHaveProperty("error");
      expect(response.phasedata).toHaveLength(source.primaryPhaseCount);
      expect(references).toHaveLength(source.lunationCount);
      const labels = ["New Moon", "First Quarter", "Full Moon", "Last Quarter"];
      const times = response.phasedata.map(row => {
        expect(labels).toContain(row.phase);
        expect(row.year).toBe(source.year);
        expect(row.time).toMatch(/^\d{2}:\d{2}$/u);
        const published = `${row.year}-${String(row.month).padStart(2, "0")}-${String(row.day).padStart(2, "0")}T${row.time}:00.000Z`;
        const time = Date.parse(published);
        expect(Number.isFinite(time)).toBe(true);
        expect(new Date(time).toISOString()).toBe(published);
        return time;
      });
      expect(times).toEqual([...times].sort((a, b) => a - b));
      expect(new Set(times).size).toBe(times.length);
      expect(new Set(references.map(row => row.phase))).toEqual(new Set(["new", "full"]));
      for (const reference of references) {
        expect(new Date(reference.milliseconds).toISOString()).toBe(reference.published.replace("Z", ".000Z"));
      }
    });

    it(`${source.year}: checks every annual lunation time and its synthetic-place chart`, () => {
      const result = searchLunations({ year: source.year, place, houseSystem: "regiomontanus" });
      expect(result.status).toBe("complete");
      expect(result.lunations).toHaveLength(references.length);
      expect(result.lunations.map(row => row.phase)).toEqual(references.map(row => row.phase));
      const measurements = result.lunations.map((event, index) => {
        const reference = references[index]!;
        const signedSeconds = (Date.parse(event.at) - reference.milliseconds) / 1000;
        expect(event.kind).toBe("lunation");
        expect(event.targetElongation).toBe(reference.elongation);
        expect(event.retrograde).toBe(false);
        expect(Math.abs(signedSeconds), `${reference.published} ${reference.sourcePhase}`)
          .toBeLessThanOrEqual(sources.comparison.maximumAbsoluteDifferenceSeconds);

        // Integration only: cast at the found instant, never the rounded
        // reference label. This does not independently verify chart factors.
        const engine = natalChart({ utc: event.at, latitude: place.latitude, longitude: place.longitude,
          houseSystem: "regiomontanus", timeKnown: true });
        expect(event.chart.at).toBe(event.at);
        expect(event.chart.place).toEqual(place);
        expect(event.chart.angles).toEqual(engine.angles);
        expect(event.chart.houses).toEqual({ requested: "regiomontanus", actual: engine.houses!.system,
          cusps: engine.houses!.cusps });
        expect(event.chart.bodies).toEqual(engine.bodies);
        expect(event.chart.flags).toEqual(engine.flags);
        expect(event.chart.deltaT).toEqual(engine.deltaT);
        expect(event.chart.timeScale).toEqual(engine.timeScale);
        expect(event.chart.timeScale.basis).toBe(source.year < 1972 ? "delta-t" : "iers");
        expect(event.chart.timeScale.ut1MinusUtc?.source ?? null).toBe(source.year < 1972 ? null : "observed");
        expect(event.chart.provenance.sourceInstant).toBe(event.at);
        expect(event.chart.provenance.source).toBe("relative-checkout");
        expect(event.angularity).toEqual(analyzeAngularity(event.chart));
        expect(event.angleRulers).toEqual(analyzeAngleRulers(event.chart));
        expect(event.angularity.label).toBe("traditional conventions, not predictions");
        expect(event.angleRulers.label).toBe("traditional conventions, not predictions");
        return { year: source.year, phase: reference.phase, published: reference.published, signedSeconds };
      });
      // Evidence observations only; never used as future timing expectations.
      console.log("USNO lunation timing comparison:", JSON.stringify(measurements));
    });

    it(`${source.year}: finds only the matching lunation in each source-centered range`, () => {
      for (const reference of references) {
        const result = searchLunations({ place,
          from: reference.milliseconds - DAY, to: reference.milliseconds + DAY });
        expect(result.status).toBe("complete");
        expect(result.lunations).toHaveLength(1);
        const event = result.lunations[0]!;
        expect(event.phase).toBe(reference.phase);
        expect(event.targetElongation).toBe(reference.elongation);
        expect(Math.abs(Date.parse(event.at) - reference.milliseconds) / 1000)
          .toBeLessThanOrEqual(sources.comparison.maximumAbsoluteDifferenceSeconds);
      }
    });
  }
});
