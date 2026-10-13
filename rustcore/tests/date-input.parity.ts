import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, expectTypeOf, it } from "vitest";
import { dateFrom as reference } from "../../src/date-input.js";
import type { DateInput } from "../../src/types.js";
import { dateFrom, initRustCore } from "../ts/index.js";
import { expectSameError, expectSameNumber, outcome, randomUint32 } from "./parity-helpers.js";

beforeAll(() => {
  initRustCore(readFileSync(new URL("../pkg/zodiacs_rustcore_bg.wasm", import.meta.url)));
});

function expectDateParity(input: unknown, label = "Synthetic instant"): void {
  const expected = outcome(() => reference(input as DateInput, label));
  const actual = outcome(() => dateFrom(input as DateInput, label));
  const context = typeof input === "object" ? "Object or Date input" : String(input);
  expect(actual.ok, context).toBe(expected.ok);
  if (actual.ok && expected.ok) {
    expect(actual.value, context).toBeInstanceOf(Date);
    expectSameNumber(actual.value.getTime(), expected.value.getTime(), context);
    expect(actual.value.toISOString(), context).toBe(expected.value.toISOString());
    if (input instanceof Date) expect(actual.value === input, context).toBe(false);
  } else if (!actual.ok && !expected.ok) {
    expectSameError(actual.error, expected.error, context);
  }
}

describe("resolved instant validation through WASM", () => {
  it("retains the TypeScript function signature", () => {
    expectTypeOf(dateFrom).toEqualTypeOf<typeof reference>();
  });

  it("matches monthly boundaries and leap-day validation in 1800 through 2200", () => {
    for (let year = 1800; year <= 2200; year++) {
      for (let month = 1; month <= 12; month++) {
        const prefix = `${year}-${String(month).padStart(2, "0")}`;
        for (const day of [1, 28, 29, 30, 31]) {
          const date = `${prefix}-${String(day).padStart(2, "0")}`;
          expectDateParity(date);
          expectDateParity(`${date}T23:59:59.999Z`);
        }
      }
    }
  });

  it("matches seeded millisecond instants and their Date/ISO representations", () => {
    const next = randomUint32(0x64617465);
    const start = Date.parse("1800-01-01T00:00:00.000Z");
    const end = Date.parse("2200-12-31T23:59:59.999Z");
    for (let index = 0; index < 2048; index++) {
      const milliseconds = start + Math.floor((next() / 0x1_0000_0000) * (end - start));
      expectDateParity(milliseconds);
      expectDateParity(new Date(milliseconds));
      expectDateParity(new Date(milliseconds).toISOString());
    }
  });

  it("matches TimeClip, range edges, expanded years and full representable-range samples", () => {
    const limit = 8_640_000_000_000_000;
    for (const milliseconds of [
      0, -0, Number.MIN_VALUE, -Number.MIN_VALUE, 0.999, -0.999, 1.999, -1.999,
      limit - 1, limit, limit + 1, -limit + 1, -limit, -limit - 1,
      Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER, Number.MAX_VALUE, -Number.MAX_VALUE
    ]) {
      expectDateParity(milliseconds);
      expectDateParity(new Date(milliseconds));
    }
    const next = randomUint32(0x636c6970);
    for (let index = 0; index < 2048; index++) {
      const milliseconds = Math.floor((next() / 0x1_0000_0000 - 0.5) * limit * 2);
      expectDateParity(milliseconds);
      expectDateParity(new Date(milliseconds).toISOString());
    }
    for (const input of [
      "-271821-04-20T00:00:00.000Z", "-271821-04-19T23:59:59.999Z",
      "+275760-09-13T00:00:00.000Z", "+275760-09-13T00:00:00.001Z",
      "-271821-04-20T00:01:00+00:01", "-271821-04-19T23:59:00-00:01",
      "+275760-09-13T00:01:00+00:01", "+275760-09-12T23:59:00-00:01",
      "+275760-09-13T23:59+23:59", "-271821-04-19T23:59-00:01",
      "-271821-04-20T00:00:00+00:01", "+275760-09-13T00:00:00-00:01",
      "-271821-04-20", "+275760-09-13", "+999999-01-01", "-999999-12-31"
    ]) expectDateParity(input);
  });

  it("preserves years zero through ninety-nine and explicit offset forms", () => {
    for (let year = 0; year <= 99; year++) {
      const yearText = String(year).padStart(4, "0");
      for (const day of ["01-01", "02-28", "02-29", "03-01", "12-31"]) {
        expectDateParity(`${yearText}-${day}`);
        expectDateParity(`${yearText}-${day}T12:34:56.789Z`);
      }
    }
    for (const date of ["0000-01-01", "0099-12-31", "1800-01-01", "2000-02-29", "2200-12-31", "-000001-03-01", "+000000-01-01", "+010000-12-31"]) {
      for (const clock of ["00:00", "12:34:56", "23:59:59.1", "23:59:59.01", "23:59:59.001"])
        for (const offset of ["Z", "+00:00", "-00:00", "+05:45", "-03:30", "+23:59", "-23:59"])
          expectDateParity(`${date}T${clock}${offset}`);
    }
  });

  it("matches rejection messages for invalid syntax, fields and JavaScript types", () => {
    const inputs: unknown[] = [
      "", "2000", "2000-01", "2000-1-01", "2000-01-1", "2000-00-01", "2000-13-01",
      "2000-01-00", "2000-01-32", "2000-04-31", "1900-02-29", "2100-02-29",
      "2000-01-01T00:00", "2000-01-01T00:00:00", "2000-01-01 00:00:00Z",
      "2000-01-01t00:00:00Z", "2000-01-01T00:00:00z", "2000-01-01T24:00Z",
      "2000-01-01T12:60Z", "2000-01-01T12:00:60Z", "2000-01-01T12:00.1Z",
      "2000-01-01T12:00:00.Z", "2000-01-01T12:00:00.0000Z", "2000-01-01T12:00:00,123Z",
      "2000-01-01T12:00+24:00", "2000-01-01T12:00+00:60", "2000-01-01T12:00+0000",
      "2000-01-01T12:00+00", "2000-01-01Z", "+2000-01-01", "10000-01-01",
      "-000000-01-01", "-000000-01-01T00:00:00Z", "2000/01/01", "January 1, 2000",
      "2000-W01-1", "2000-001", " 2000-01-01", "2000-01-01 ", "2000-01-01\n",
      "2000-01-01T00:00:00Z\n", "2000-01-01\r\n", "2000-01-01\0", "２０００-01-01", "2000-٠١-01",
      "2000-01-01T00:00:00Z[UTC]", NaN, Infinity, -Infinity, new Date(NaN),
      undefined, null, true, false, 0n, Symbol("synthetic"), [], [0], {}, new Number(0), new String("2000-01-01"),
      { toString() { throw new Error("String coercion must not run"); } },
      { valueOf() { throw new Error("Number coercion must not run"); } }
    ];
    for (const input of inputs) expectDateParity(input, "Synthetic parser input");
    // The error label is interpolated verbatim, including an empty label.
    for (const label of ["", "UTC", "Synthetic\nlabel", "Synthetic \ud800 label", "Synthetic \udfff label"])
      expectDateParity("invalid", label);
  });

  it("clones Dates from their internal timestamp without invoking overrides", () => {
    class SyntheticDate extends Date {
      override getTime(): number { throw new Error("Overridden getTime must not run"); }
      override valueOf(): number { throw new Error("Overridden valueOf must not run"); }
      override toISOString(): string { throw new Error("Overridden toISOString must not run"); }
    }
    const input = new SyntheticDate("2000-02-29T12:34:56.789Z");
    expectDateParity(input);
    const result = dateFrom(input, "Synthetic instant");
    result.setUTCFullYear(2050);
    expect(Date.prototype.getTime.call(input)).toBe(Date.parse("2000-02-29T12:34:56.789Z"));
    expectDateParity(Object.create(Date.prototype));
  });
});
