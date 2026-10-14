import { describe, expect, it, vi } from "vitest";
import * as engine from "../src/engine.js";
import { cast, evaluateConsiderations } from "../src/index.js";
import { questionInput } from "./fixtures.js";

describe("void consideration integration (delegation, not sky accuracy)", () => {
  it("scans a real synthetic cast with traditional bodies and preserves the chart", () => {
    const result = cast(questionInput);
    const before = structuredClone(result);
    const scan = vi.spyOn(engine, "voidOfCourseAt");
    try {
      const item = evaluateConsiderations(result).observations.at(-1)!;
      const response = scan.mock.results[0]!.value as ReturnType<typeof engine.voidOfCourseAt>;
      expect(scan.mock.calls).toEqual([[new Date(result.input.instant), { bodies: "traditional" }]]);
      expect(item.status).toBe(response.isVoid ? "triggered" : "not-triggered");
      expect(item.scan!.current?.from ?? null).toBe(response.current?.from.toISOString() ?? null);
      expect(item.scan!.current?.to ?? null).toBe(response.current?.to.toISOString() ?? null);
      expect(item.scan!.next?.from ?? null).toBe(response.next?.from.toISOString() ?? null);
      expect(item.scan!.at).toBe(result.input.instant);
      expect(JSON.parse(JSON.stringify(item))).toEqual(item);
      expect(result).toEqual(before);
    } finally { scan.mockRestore(); }
  });

  it("propagates a real ephemeris-span error when the scanner needs samples before the supported span", () => {
    const result = cast({ ...questionInput, instant: "0001-05-02T00:00:00Z" });
    expect(() => evaluateConsiderations(result)).toThrow(/ephemeris span/);
  });
});
