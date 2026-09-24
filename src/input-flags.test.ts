import { afterEach, describe, expect, it, vi } from "vitest";

import { natalChart, saturnReturn, synastry, transits } from "./index.js";
import { resolveBirth } from "./geo.js";
import {
  createNatalEnvelope,
  natalReplayInput,
  parseNatalEnvelope,
  serializeNatalEnvelope
} from "./receipt.js";
import * as ephemeris from "./ephemeris.js";
import * as returns from "./returns.js";
import type { BirthInput, Chart, ChartFlag } from "./types.js";
import type { LocalBirthInput } from "./geo.js";

const instant = "2001-12-21T09:00:00Z";
const base: BirthInput = {
  utc: instant,
  latitude: 40,
  longitude: -74,
  houseSystem: "whole",
  timeKnown: true
};
const secret = "SYNTHETIC-PRIVATE-NOTE";

function rejectsPrivately(action: () => unknown): void {
  let failure: unknown;
  try {
    action();
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(RangeError);
  expect((failure as Error).message).not.toContain(secret);
}

afterEach(() => vi.restoreAllMocks());

describe("public birth flag boundary", () => {
  it.each([
    ["private string", [secret]],
    ["bare string", "lmt"],
    ["Set", new Set(["lmt"])],
    ["array-like object", { 0: "lmt", length: 1 }],
    ["null", null],
    ["boolean", false],
    ["number", 1],
    ["null member", [null]],
    ["numeric member", [1]],
    ["object member", [{}]],
    ["nested array", [["lmt"]]],
    ["unknown string", ["unknown"]],
    ["empty string", [""]],
    ["case mismatch", ["LMT"]],
    ["whitespace", ["lmt\n"]],
    ["sparse array", new Array(1)],
    ["opposing time assertions", ["dst-gap", "dst-fold"]]
  ])("rejects %s with a fixed error before chart computation", (_label, flags) => {
    const calculate = vi.spyOn(ephemeris, "computeChart");
    rejectsPrivately(() => natalChart({ ...base, flags } as BirthInput));
    expect(calculate).not.toHaveBeenCalled();
  });

  it("does not coerce flag members or invoke array member getters/iterators", () => {
    const hook = vi.fn(() => {
      throw new Error(secret);
    });
    const coercible = { toString: hook, valueOf: hook };
    rejectsPrivately(() => natalChart({ ...base, flags: [coercible] } as unknown as BirthInput));
    const accessor: ChartFlag[] = [];
    Object.defineProperty(accessor, "0", { get: hook });
    rejectsPrivately(() => natalChart({ ...base, flags: accessor }));
    const data: ChartFlag[] = ["lmt"];
    Object.defineProperty(data, Symbol.iterator, { value: hook });
    expect(natalChart({ ...base, flags: data }).flags).toEqual(["lmt"]);
    expect(hook).not.toHaveBeenCalled();
  });

  it.each([
    ["known time marked unknown", { flags: ["no-time"] }],
    ["default known time marked unknown", { timeKnown: undefined, flags: ["no-time"] }],
    ["whole-sign request marked fallback", { flags: ["polar-fallback"] }],
    [
      "low-latitude Placidus without fallback",
      { houseSystem: "placidus", flags: ["polar-fallback"] }
    ],
    [
      "unknown time marked fallback",
      { timeKnown: false, houseSystem: "placidus", flags: ["polar-fallback"] }
    ],
    [
      "no location marked fallback",
      {
        latitude: undefined,
        longitude: undefined,
        houseSystem: "placidus",
        flags: ["polar-fallback"]
      }
    ]
  ])("rejects derived-flag contradiction: %s", (_label, changes) => {
    rejectsPrivately(() => natalChart({ ...base, ...changes } as BirthInput));
  });

  it.each([
    {
      name: "unknown-time echo",
      changes: { timeKnown: false, flags: ["no-time"] },
      expected: ["no-time"]
    },
    {
      name: "polar fallback echo",
      changes: { latitude: 78, houseSystem: "placidus", flags: ["polar-fallback"] },
      expected: ["polar-fallback"]
    },
    {
      name: "duplicate compatible claims",
      changes: { timeKnown: false, flags: ["no-time", "lmt", "lmt", "no-time"] },
      expected: ["lmt", "no-time"]
    },
    {
      name: "time assertions in supplied order",
      changes: { flags: ["lmt", "dst-fold"] },
      expected: ["lmt", "dst-fold"]
    },
    {
      name: "historical gap assertions",
      changes: { flags: ["dst-gap", "lmt"] },
      expected: ["dst-gap", "lmt"]
    }
  ])(
    "canonicalizes $name without changing numerical results and round-trips a receipt",
    ({ changes, expected }) => {
      const supplied = { ...base, ...changes } as BirthInput;
      const before = structuredClone(supplied);
      const chart = natalChart(supplied);
      const timeFlags = expected.filter(
        (flag) => flag !== "no-time" && flag !== "polar-fallback"
      ) as ChartFlag[];
      const control = natalChart({ ...supplied, flags: timeFlags });
      expect(chart.input.flags).toEqual(timeFlags);
      expect(chart.flags).toEqual(expected);
      expect(chart.bodies).toEqual(control.bodies);
      expect(chart.houses).toEqual(control.houses);
      expect(chart.angles).toEqual(control.angles);
      expect(chart.aspects).toEqual(control.aspects);
      expect(supplied).toEqual(before);
      const envelope = createNatalEnvelope(chart);
      expect(envelope.receipt.inputFlags).toEqual(timeFlags);
      expect(envelope.receipt.resultFlags).toEqual(expected);
      const parsed = parseNatalEnvelope(serializeNatalEnvelope(envelope));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) throw new Error("Valid fixture failed receipt parsing");
      expect(natalChart(natalReplayInput(parsed.envelope))).toEqual(chart);
    }
  );

  it("keeps optional absence, frozen arrays and later caller mutation safe", () => {
    expect(Object.hasOwn(natalChart(base).input, "flags")).toBe(false);
    const flags = ["lmt"] as ChartFlag[];
    const chart = natalChart({ ...base, flags });
    flags.push("no-time");
    expect(chart.input.flags).toEqual(["lmt"]);
    expect(chart.flags).toEqual(["lmt"]);
    expect(natalChart({ ...base, flags: Object.freeze(["lmt"] as const) }).flags).toEqual(["lmt"]);
  });

  it("accepts 64 repeated known claims but rejects longer arrays before reading members", () => {
    expect(natalChart({ ...base, flags: new Array<ChartFlag>(64).fill("lmt") }).flags).toEqual([
      "lmt"
    ]);
    const flags = new Array<ChartFlag>(65).fill("lmt");
    const getter = vi.fn(() => {
      throw new Error(secret);
    });
    Object.defineProperty(flags, "0", { get: getter });
    rejectsPrivately(() => natalChart({ ...base, flags }));
    expect(getter).not.toHaveBeenCalled();
  });

  it("uses one validated scalar/flag/instant snapshot for a fresh calculation", () => {
    const source = { ...base };
    const first = {
      latitude: 40,
      longitude: -74,
      houseSystem: "placidus",
      timeKnown: true,
      flags: ["lmt"],
      utc: instant
    };
    const getters: ReturnType<typeof vi.fn>[] = [];
    for (const [key, value] of Object.entries(first)) {
      const getter = vi.fn().mockReturnValueOnce(value).mockReturnValue(secret);
      getters.push(getter);
      Object.defineProperty(source, key, { get: getter });
    }
    const actual = natalChart(source);
    expect(actual.input).toMatchObject({ ...first, utc: new Date(instant) });
    expect(actual.flags).toEqual(["lmt"]);
    for (const getter of getters) expect(getter).toHaveBeenCalledTimes(1);
  });

  const wrappers = [
    ["transits", (input: BirthInput) => transits(input, instant)],
    ["first synastry input", (input: BirthInput) => synastry(input, base)],
    ["second synastry input", (input: BirthInput) => synastry(base, input)],
    ["Saturn returns", (input: BirthInput) => saturnReturn(input)]
  ] as const;
  it.each(wrappers)("rejects unknown and contradictory birth flags in %s", (_label, calculate) => {
    for (const flags of [[secret], ["no-time"], ["polar-fallback"]]) {
      rejectsPrivately(() => calculate({ ...base, flags } as BirthInput));
    }
  });
});

describe("precomputed Chart flag compatibility", () => {
  it("retains canonical Chart identity when wrappers reuse it", () => {
    const chart = natalChart(base);
    const calculate = vi.spyOn(ephemeris, "computeChart");
    expect(transits(chart, instant).natal).toBe(chart);
    expect(synastry(chart, chart).a).toBe(chart);
    expect(calculate).not.toHaveBeenCalled();
  });

  it("normalizes a correct legacy derived echo without mutating/recomputing numerical data", () => {
    const chart = natalChart({ ...base, timeKnown: false });
    chart.input.flags = ["lmt", "no-time"];
    chart.flags = ["lmt", "no-time", "no-time"];
    const before = structuredClone(chart);
    const calculate = vi.spyOn(ephemeris, "computeChart");
    const normalized = transits(chart, instant).natal;
    expect(normalized).not.toBe(chart);
    expect(normalized.input.flags).toEqual(["lmt"]);
    expect(normalized.flags).toEqual(["lmt", "no-time"]);
    expect(normalized.bodies).toBe(chart.bodies);
    expect(normalized.aspects).toBe(chart.aspects);
    expect(normalized.engineVersion).toBe(chart.engineVersion);
    expect(chart).toEqual(before);
    expect(calculate).not.toHaveBeenCalled();
    expect(createNatalEnvelope(normalized).receipt.resultFlags).toEqual(["lmt", "no-time"]);
  });

  it.each([
    [
      "unknown input flag",
      (chart: Chart) => {
        chart.input.flags = [secret as ChartFlag];
      }
    ],
    [
      "unknown result flag",
      (chart: Chart) => {
        chart.flags.push(secret as ChartFlag);
      }
    ],
    [
      "forged no-time input",
      (chart: Chart) => {
        chart.input.flags = ["no-time"];
      }
    ],
    [
      "forged polar input",
      (chart: Chart) => {
        chart.input.flags = ["polar-fallback"];
      }
    ],
    [
      "forged no-time result",
      (chart: Chart) => {
        chart.flags.push("no-time");
      }
    ],
    [
      "forged polar result",
      (chart: Chart) => {
        chart.flags.push("polar-fallback");
      }
    ],
    [
      "unrecorded time assertion",
      (chart: Chart) => {
        chart.flags.push("lmt");
      }
    ]
  ])("rejects %s for every Chart wrapper", (_label, alter) => {
    const chart = natalChart(base);
    alter(chart);
    rejectsPrivately(() => transits(chart, instant));
    rejectsPrivately(() => synastry(chart, chart));
    rejectsPrivately(() => saturnReturn(chart));
  });

  it.each([
    ["missing no-time", () => natalChart({ ...base, timeKnown: false })],
    ["missing polar fallback", () => natalChart({ ...base, latitude: 78, houseSystem: "placidus" })]
  ])("rejects %s from supplied result flags", (_label, fixture) => {
    const chart = fixture();
    chart.flags = [];
    rejectsPrivately(() => transits(chart, instant));
    rejectsPrivately(() => synastry(chart, chart));
    rejectsPrivately(() => saturnReturn(chart));
  });

  it.each([undefined, null, false, []])("rejects invalid supplied angle presence: %j", (angles) => {
    const chart = natalChart(base);
    Object.assign(chart, { angles });
    rejectsPrivately(() => transits(chart, instant));
  });
});

describe("Saturn flag validation calculation cost", () => {
  it("uses zero natal calculations for ordinary inputs or supplied Charts, one only for raw polar assertions", () => {
    const chart = natalChart({ ...base, latitude: 78, houseSystem: "placidus" });
    const natal = vi.spyOn(ephemeris, "computeChart");
    const scan = vi
      .spyOn(returns, "computeSaturnReturns")
      .mockReturnValue({ natalLon: 0, natalRetrograde: false, seasons: [] });
    saturnReturn(instant);
    saturnReturn(base);
    saturnReturn({ ...base, timeKnown: false, flags: ["no-time", "lmt"] });
    saturnReturn(chart);
    expect(natal).not.toHaveBeenCalled();
    expect(scan).toHaveBeenCalledTimes(4);
    saturnReturn({ ...base, latitude: 78, houseSystem: "placidus", flags: ["polar-fallback"] });
    expect(natal).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledTimes(5);
    rejectsPrivately(() =>
      saturnReturn({ ...base, houseSystem: "placidus", flags: ["polar-fallback"] })
    );
    expect(natal).toHaveBeenCalledTimes(2);
    expect(scan).toHaveBeenCalledTimes(5);
  });

  it("does not reread validated settings when a raw polar assertion requires calculation", () => {
    const source = { ...base };
    const getters: ReturnType<typeof vi.fn>[] = [];
    for (const [key, value] of Object.entries({
      latitude: 78,
      longitude: -74,
      houseSystem: "placidus",
      timeKnown: true,
      flags: ["polar-fallback"],
      utc: instant
    })) {
      const getter = vi.fn().mockReturnValueOnce(value).mockReturnValue(secret);
      getters.push(getter);
      Object.defineProperty(source, key, { get: getter });
    }
    const natal = vi.spyOn(ephemeris, "computeChart");
    const scan = vi
      .spyOn(returns, "computeSaturnReturns")
      .mockReturnValue({ natalLon: 0, natalRetrograde: false, seasons: [] });
    saturnReturn(source);
    expect(natal).toHaveBeenCalledTimes(1);
    expect(scan).toHaveBeenCalledWith(new Date(instant));
    for (const getter of getters) expect(getter).toHaveBeenCalledTimes(1);
  });
});

describe("civil birth settings meet the public core boundary", () => {
  const local: LocalBirthInput = {
    date: "2024-02-29",
    time: "12:00",
    timeZone: "UTC",
    latitude: 40,
    longitude: -74
  };
  it.each([
    ["string timeKnown", { timeKnown: "false" }],
    ["number timeKnown", { timeKnown: 0 }],
    ["null timeKnown", { timeKnown: null }],
    ["unknown house system", { houseSystem: secret }],
    ["null house system", { houseSystem: null }],
    ["null coordinates", { latitude: null, longitude: null }],
    ["string latitude", { latitude: "40" }],
    ["out-of-range latitude", { latitude: 91 }],
    ["out-of-range longitude", { longitude: 181 }],
    ["nonfinite latitude", { latitude: Infinity }]
  ])("rejects %s before running the civil resolver", (_label, changes) => {
    const original = Intl.DateTimeFormat;
    const intl = vi
      .spyOn(Intl, "DateTimeFormat")
      .mockImplementation((locales, options) => new original(locales, options));
    rejectsPrivately(() => resolveBirth({ ...local, ...changes } as LocalBirthInput));
    expect(intl).not.toHaveBeenCalled();
  });

  it("rejects explicit null time instead of substituting noon", () => {
    rejectsPrivately(() => resolveBirth({ ...local, time: null } as unknown as LocalBirthInput));
    rejectsPrivately(() =>
      resolveBirth({ ...local, time: null, timeKnown: false } as unknown as LocalBirthInput)
    );
  });

  it("uses one validated civil settings/time snapshot", () => {
    const source = { ...local };
    const getters: ReturnType<typeof vi.fn>[] = [];
    for (const [key, value] of Object.entries({
      latitude: 40,
      longitude: -74,
      houseSystem: "whole",
      timeKnown: false,
      time: "08:30"
    })) {
      const getter = vi.fn().mockReturnValueOnce(value).mockReturnValue(secret);
      getters.push(getter);
      Object.defineProperty(source, key, { get: getter });
    }
    const actual = resolveBirth(source);
    expect(actual).toMatchObject({
      latitude: 40,
      longitude: -74,
      houseSystem: "whole",
      timeKnown: false,
      utc: new Date("2024-02-29T08:30:00Z")
    });
    for (const getter of getters) expect(getter).toHaveBeenCalledTimes(1);
  });

  it("preserves unknown-time supplied reference and absent-time local noon semantics", () => {
    const supplied = resolveBirth({ ...local, time: "08:30", timeKnown: false });
    expect(supplied.utc).toEqual(new Date("2024-02-29T08:30:00Z"));
    expect(natalChart(supplied).flags).toEqual(["no-time"]);
    const noon = resolveBirth({ date: "0000-02-29", timeZone: "UTC" });
    expect(noon.utc).toEqual(new Date("0000-02-29T12:00:00Z"));
    expect(noon.timeKnown).toBe(false);
    expect(natalChart(noon).flags).toEqual(["no-time"]);
  });
});
