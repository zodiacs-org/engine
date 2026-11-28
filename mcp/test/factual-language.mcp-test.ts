import { describe, expect, it } from "vitest";
import { moonPhaseTool } from "../src/tools/events.js";
import { descriptionIssues, wordingIssues } from "./factual-language.js";

// These fragments are rejection probes, never server examples or seed data.
const rejectedFragments = [
  "prediction", "PREDICTIONS", "predictive", "predicted", "predicting",
  "forecast", "Forecasts", "forecaster", "fore\u200bcast", "ｆｏｒｅｃａｓｔ",
  "prophecy", "prophesies", "fortune-telling", "fortune_telling", "destiny",
  "soulmate", "you will", "you can expect", "your career might", "brings luck",
  "price", "prices", "PriceTarget", "buy_signal", "sell signal", "investment advice", "profits"
];

describe("factual wording regression scanner", () => {
  it.each(rejectedFragments)("detects the rejected fragment %s", (fragment) => {
    expect(wordingIssues({ nested: [{ note: fragment }] })).not.toEqual([]);
    expect(wordingIssues({ [fragment]: 1 })).not.toEqual([]);
  });

  it("inspects discovery titles and deeply nested schema descriptions", () => {
    for (const tool of [
      { description: "forecast" },
      { annotations: { title: "destiny" } },
      { inputSchema: { properties: { birth: { description: "prediction" } } } },
      { outputSchema: { anyOf: [{ properties: { data: { description: "buy signal" } } }] } }
    ]) expect(descriptionIssues(tool)).not.toEqual([]);
    expect(descriptionIssues({ description: "Native chart receipt and aspect counts.",
      outputSchema: { properties: { segment: { enum: ["observed", "predicted"] } } } })).toEqual([]);
  });

  it("accepts computed geometry, reference coverage and bounded-search language", () => {
    expect(wordingIssues({
      receipt: "Tropical longitude, degrees; UTC time basis; outside-reference-span.",
      chart: "Solar return, retrograde, signs, applying aspects, Moon phase and illumination.",
      counts: "Native easeful and charged aspect counts; not a compatibility score.",
      search: "Refused: sample-budget. No partial events. Completeness is not proven.",
      at: "2100-01-01T00:00:00Z"
    })).toEqual([]);
  });

  it("does not let a limitation excuse a later rejected fragment", () => {
    expect(wordingIssues("No prediction. You will")).toContain("/: personal outcome claim");
  });

  it("preserves exact native time-source labels in actual structured and JSON text output", () => {
    const result = moonPhaseTool({ at: "2026-10-20T00:00:00Z" });
    expect(result.structuredContent.data.sky.deltaT.segment).toBe("predicted");
    expect(result.structuredContent.data.sky.timeScale.ut1MinusUtc?.source).toBe("predicted");
    expect(wordingIssues(result)).toEqual([]);
    const receipt = result.structuredContent.receipts[0]!.envelope;
    expect(receipt.result).toMatchObject({ deltaT: { segment: "predicted" },
      timeScale: { ut1MinusUtc: { source: "predicted" } } });
  });

  it("only exempts the exact time-source values at native chart and receipt paths", () => {
    const time = { deltaT: { segment: "predicted" }, timeScale: { ut1MinusUtc: { source: "predicted" } } };
    expect(wordingIssues({ data: { chart: time, sky: time, transit: { natal: time },
      synastry: { a: time, b: time }, return: { chart: time } },
      receipts: [{ envelope: { result: time } }] })).toEqual([]);
    for (const output of [
      { note: "predicted" },
      { deltaT: time.deltaT },
      { data: { commentary: time } },
      { receipts: [{ envelope: { note: "predicted", result: {} } }] },
      { data: { sky: { deltaT: { segment: "prediction" } } } },
      { data: { sky: { deltaT: { segment: "predicted outcome" } } } },
      { data: { sky: { deltaT: { note: "predicted" } } } },
      { "data/sky/deltaT": { segment: "predicted" } }
    ]) expect(wordingIssues(output)).not.toEqual([]);
  });

  it("scans structured output, its JSON text copy, extra prose and errors independently", () => {
    const clean = moonPhaseTool({ at: "2026-01-03T00:00:00Z" });
    const altered = { ...clean.structuredContent, note: "forecast" };
    for (const result of [
      { ...clean, structuredContent: altered },
      { ...clean, content: [{ type: "text", text: JSON.stringify(altered) }] },
      { ...clean, content: [...clean.content, { type: "text", text: "you will" }] },
      { content: [{ type: "text", text: JSON.stringify({ note: "fortune-telling" }) }] },
      { content: [{ type: "text", text: "prediction" }], isError: true }
    ]) expect(wordingIssues(result)).not.toEqual([]);
  });
});
