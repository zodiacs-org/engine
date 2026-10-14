import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { natalChart } from "../../src/api.js";
import { analyzeAngularity, analyzeAngleRulers, searchIngresses } from "../src/index.js";

const directory = new URL("./fixtures/usno/", import.meta.url);
const sources = JSON.parse(readFileSync(new URL("ingress-sources.json", directory), "utf8")) as {
  comparison: { maximumAbsoluteDifferenceSeconds: number; fixedBeforeEngineComparison: boolean };
  responses: { year: number; file: string; url: string; sha256: string }[];
};
interface SeasonRow {
  year: number;
  month: number;
  day: number;
  time: string;
  phenom: string;
}
interface SeasonResponse {
  apiversion: string;
  year: number;
  tz: number;
  dst: boolean;
  data: SeasonRow[];
}

// Source definitions, independent of the engine and CARDINAL_INGRESSES.
// See docs/ingress-references.md for the seasonal-to-tropical mapping and
// why a published equinox is only a coarse reference for a longitude root.
const definitions = [
  { month: 3, phenom: "Equinox", sign: "Aries", longitude: 0 },
  { month: 6, phenom: "Solstice", sign: "Cancer", longitude: 90 },
  { month: 9, phenom: "Equinox", sign: "Libra", longitude: 180 },
  { month: 12, phenom: "Solstice", sign: "Capricorn", longitude: 270 }
] as const;
const tables = sources.responses.map(source => {
  const bytes = readFileSync(new URL(source.file, directory));
  const response = JSON.parse(bytes.toString("utf8")) as SeasonResponse;
  const references = definitions.map(definition => {
    const rows = response.data.filter(row => row.month === definition.month && row.phenom === definition.phenom);
    if (rows.length !== 1) throw new Error(`expected one source row for ${source.year} ${definition.sign}`);
    const row = rows[0]!;
    // Only calendar formatting, no engine date parser or timing calculation.
    const published = `${row.year}-${String(row.month).padStart(2, "0")}-${String(row.day).padStart(2, "0")}T${row.time}:00Z`;
    return { ...definition, row, published, milliseconds: Date.parse(published) };
  });
  return { source, bytes, response, references };
});
const place = { name: "Synthetic Meridian", latitude: 12.5, longitude: -31.25 };

describe("independent USNO ingress references", () => {
  it("pins the selected source years and the tolerance set before comparison", () => {
    expect(sources.responses.map(row => row.year)).toEqual([1950, 2000, 2024]);
    expect(sources.comparison.maximumAbsoluteDifferenceSeconds).toBe(120);
    expect(sources.comparison.fixedBeforeEngineComparison).toBe(true);
  });

  for (const { source, bytes, response, references } of tables) {
    it(`${source.year}: verifies raw response identity and unshifted minute times`, () => {
      expect(createHash("sha256").update(bytes).digest("hex")).toBe(source.sha256);
      expect(source.url).toBe(`https://aa.usno.navy.mil/api/seasons?year=${source.year}&tz=0&dst=false`);
      expect(response).toMatchObject({ apiversion: "4.0.1", year: source.year, tz: 0, dst: false });
      expect(response).not.toHaveProperty("error");
      expect(response.data).toHaveLength(6);
      expect(references).toHaveLength(4);
      for (const reference of references) {
        expect(reference.row.year).toBe(source.year);
        expect(reference.row.time).toMatch(/^\d{2}:\d{2}$/u);
        expect(Number.isFinite(reference.milliseconds)).toBe(true);
        expect(new Date(reference.milliseconds).toISOString()).toBe(reference.published.replace("Z", ".000Z"));
      }
    });

    it(`${source.year}: checks annual ingress timing and complete charts at a synthetic place`, () => {
      const result = searchIngresses({ year: source.year, place, houseSystem: "regiomontanus" });
      expect(result.status).toBe("complete");
      expect(result.ingresses.map(row => row.sign)).toEqual(references.map(row => row.sign));
      expect(result.ingresses).toHaveLength(references.length);
      const measurements = result.ingresses.map((event, index) => {
        const reference = references[index]!;
        const signedSeconds = (Date.parse(event.at) - reference.milliseconds) / 1000;
        expect(event.targetLongitude).toBe(reference.longitude);
        expect(event.retrograde).toBe(false);
        expect(Math.abs(signedSeconds), `${reference.published} ${reference.sign}`)
          .toBeLessThanOrEqual(sources.comparison.maximumAbsoluteDifferenceSeconds);

        // Integration only: the independently timed event must carry the
        // engine chart at the FOUND instant, not the rounded source instant.
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
        return { year: source.year, sign: reference.sign, published: reference.published, signedSeconds };
      });
      // Observed differences are evidence output, never future expectations.
      console.log("USNO ingress timing comparison:", JSON.stringify(measurements));
    });

    it(`${source.year}: finds only the expected ingress in source-centered date ranges`, () => {
      for (const reference of references) {
        const result = searchIngresses({ place,
          from: reference.milliseconds - 86_400_000,
          to: reference.milliseconds + 86_400_000 });
        expect(result.status).toBe("complete");
        expect(result.ingresses).toHaveLength(1);
        const event = result.ingresses[0]!;
        expect(event.sign).toBe(reference.sign);
        expect(event.targetLongitude).toBe(reference.longitude);
        expect(Math.abs(Date.parse(event.at) - reference.milliseconds) / 1000)
          .toBeLessThanOrEqual(sources.comparison.maximumAbsoluteDifferenceSeconds);
      }
    });
  }
});
