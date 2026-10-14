import { describe, expect, it } from "vitest";
import { normalizeHoraryInput } from "../src/index.js";
import { questionInput } from "./fixtures.js";

describe("question input", () => {
  it.each([
    "2000-01-01T12:00:00Z",
    "2000-01-01T14:00:00+02:00",
    "2000-01-01T07:00:00-05:00",
    946728000000,
    new Date(946728000000)
  ])("normalizes equivalent resolved instants: %s", (instant) => {
    expect(normalizeHoraryInput({ ...questionInput, instant }).instant).toBe("2000-01-01T12:00:00.000Z");
  });

  it("uses engine date-only and millisecond semantics", () => {
    expect(normalizeHoraryInput({ ...questionInput, instant: "2000-01-01" }).instant)
      .toBe("2000-01-01T00:00:00.000Z");
    expect(normalizeHoraryInput({ ...questionInput, instant: "2000-01-01T12:00:00.125Z" }).instant)
      .toBe("2000-01-01T12:00:00.125Z");
  });

  it.each([
    "2000-01-01T12:00", "2000-02-30T12:00:00Z", "2000-01-01T24:00:00Z",
    "2000-01-01T12:00:60Z", "2000-01-01T12:00:00.0001Z", "01/01/2000",
    null, undefined, NaN, Infinity, new Date(NaN)
  ])("rejects invalid or unresolved instants: %s", (instant) => {
    expect(() => normalizeHoraryInput({ ...questionInput, instant })).toThrow(RangeError);
  });

  it("defaults the project house system and preserves the declarative question", () => {
    expect(normalizeHoraryInput(questionInput)).toEqual({
      instant: "2000-01-01T12:00:00.000Z",
      location: { latitude: 12, longitude: 34 },
      question: { id: "lost-object", quesitedHouse: 2, naturalSignificators: [] },
      houseSystem: "regiomontanus"
    });
  });

  it("snapshots caller Dates, coordinates and natural significators", () => {
    const instant = new Date(946728000000);
    const location: { latitude: number; longitude: number } = { ...questionInput.location };
    const naturalSignificators = ["Venus", "Moon", "Venus"] as const;
    const naturals = [...naturalSignificators];
    const question = { id: "relationship", quesitedHouse: 7, naturalSignificators: naturals };
    const normalized = normalizeHoraryInput({ instant, location, question, houseSystem: "whole" });
    instant.setUTCFullYear(2001);
    location.latitude = 13;
    question.id = "changed";
    naturals.pop();
    expect(normalized.instant).toBe("2000-01-01T12:00:00.000Z");
    expect(normalized.location.latitude).toBe(12);
    expect(normalized.question.id).toBe("relationship");
    expect(normalized.question.naturalSignificators).toEqual(["Venus", "Moon"]);
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized.location)).toBe(true);
    expect(Object.isFrozen(normalized.question)).toBe(true);
    expect(Object.isFrozen(normalized.question.naturalSignificators)).toBe(true);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])("accepts explicitly selected house %s", (quesitedHouse) => {
    const result = normalizeHoraryInput({ ...questionInput, question: { id: "custom", quesitedHouse } });
    expect(result.question.quesitedHouse).toBe(quesitedHouse);
  });

  it.each([0, 13, 2.5, "7", NaN, null, undefined])("rejects invalid quesited house %s", (quesitedHouse) => {
    expect(() => normalizeHoraryInput({ ...questionInput, question: { id: "custom", quesitedHouse } })).toThrow(RangeError);
  });

  it.each(["", " leading", "trailing ", "control\nlabel", "control\u007flabel", null])("rejects invalid question labels", (id) => {
    expect(() => normalizeHoraryInput({ ...questionInput, question: { id, quesitedHouse: 7 } })).toThrow(RangeError);
  });

  it.each([null, "Venus", ["Uranus"], ["venus"], [null], Array(1)])("rejects malformed natural significators", (naturalSignificators) => {
    expect(() => normalizeHoraryInput({
      ...questionInput, question: { ...questionInput.question, naturalSignificators }
    })).toThrow(RangeError);
  });

  it.each([
    { latitude: 90, longitude: 0 }, { latitude: -90, longitude: 0 },
    { latitude: 91, longitude: 0 }, { latitude: 0, longitude: 181 },
    { latitude: 0, longitude: -181 }, { latitude: NaN, longitude: 0 },
    { latitude: 0, longitude: Infinity }, { latitude: "12", longitude: 34 },
    { latitude: 12 }, { longitude: 34 }, null
  ])("rejects invalid/missing coordinates and geographic poles", (location) => {
    expect(() => normalizeHoraryInput({ ...questionInput, location })).toThrow(RangeError);
  });

  it.each([-180, 180])("accepts longitude boundary %s", (longitude) => {
    expect(normalizeHoraryInput({ ...questionInput, location: { latitude: 0, longitude } }).location.longitude)
      .toBe(longitude);
  });

  it.each([null, "unknown", "Regiomontanus", 7])("rejects unsupported house systems", (houseSystem) => {
    expect(() => normalizeHoraryInput({ ...questionInput, houseSystem })).toThrow(RangeError);
  });

  it.each([
    null, [], {}, { ...questionInput, typo: true }, { ...questionInput, timeKnown: false },
    { ...questionInput, timeScale: "tt" }, { ...questionInput, deltaT: 0 },
    { ...questionInput, location: { ...questionInput.location, city: "invented" } },
    { ...questionInput, question: { ...questionInput.question, house: 7 } }
  ])("rejects malformed objects and unsupported options", (input) => {
    expect(() => normalizeHoraryInput(input)).toThrow(RangeError);
  });
});
