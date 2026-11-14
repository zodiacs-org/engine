/**
 * Never a silent fallback. The package's default source is the shipped DE440
 * pack; where a result that would have come from it comes from
 * astronomy-engine instead, the result itself says so: it names
 * astronomy-engine as its ephemeris and carries a flag that gives the reason.
 *
 * Three cases, each on a new copy of the modules:
 * - missing: the package holds no pack bytes (an empty string where the
 *   base64 text was);
 * - damaged: the pack's text with one character changed, so that its SHA-256
 *   is not the sealed pack's; and text that is not base64 at all;
 * - out of coverage: the pack is whole, and the instant is outside it.
 * And the control: `setDefaultEphemeris("astronomy-engine")`, the caller's
 * own choice, names astronomy-engine and flags nothing.
 *
 * These pin behaviour (what is labelled, and how); they are not accuracy
 * evidence. Births are synthetic.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const ASTRONOMY_ENGINE = { name: "astronomy-engine", version: "2.1.19" };
const BIRTH = { utc: "1990-04-15T08:30:00Z", latitude: 51.5, longitude: -0.12 } as const;
const PLACE = { latitude: 51.5, longitude: -0.12 } as const;

type PackText = (real: string) => string;

/** The engine's entries on a new copy of every module, with the pack's base64 text replaced by `text(real)`. */
async function engineWith(text: PackText | null) {
  vi.resetModules();
  if (text) {
    vi.doMock("./de440/pack-data.js", async (original) => {
      const real = (await original()) as { DE440_PACK_BASE64: string };
      return { DE440_PACK_BASE64: text(real.DE440_PACK_BASE64) };
    });
  } else vi.doUnmock("./de440/pack-data.js");
  const root = await import("./index.js");
  // The suite's setup chose astronomy-engine for the modules it loaded; these new ones start on the package's default.
  expect(root.defaultEphemeris().name).toBe("de440");
  return {
    root,
    calc: await import("./calc.js"),
    window: await import("./window.js"),
    receipt: await import("./receipt.js"),
    timing: await import("./timing.js"),
    techniques: await import("./techniques.js")
  };
}

afterEach(() => {
  vi.doUnmock("./de440/pack-data.js");
  vi.resetModules();
});

/** One character of the text changed for another base64 character: the decoded bytes differ in one place. */
const oneCharacterChanged: PackText = (real) => {
  const at = Math.floor(real.length / 2);
  return real.slice(0, at) + (real[at] === "A" ? "B" : "A") + real.slice(at + 1);
};

const UNAVAILABLE = [
  ["missing: no pack bytes in the package", (() => "") as PackText, /SHA-256/],
  ["damaged: one character of the pack changed, so its SHA-256 is wrong", oneCharacterChanged, /SHA-256/],
  ["damaged: the pack cut short", ((real) => real.slice(0, 4 * Math.floor(real.length / 8))) as PackText, /SHA-256/],
  ["undecodable: text that is not base64", (() => "this is not base64 !!") as PackText, /./]
] as const;

describe.each(UNAVAILABLE)("the shipped DE440 pack %s", (_, text, why) => {
  it("is reported by defaultEphemeris, with the reason", async () => {
    const { root } = await engineWith(text);
    const status = root.defaultEphemeris();
    expect(status.name).toBe("de440");
    expect(status.de440).toMatchObject({ opened: false, version: null, fromTtDays: null, toTtDays: null });
    expect(status.de440.error).toMatch(why);
  });

  it("flags natalChart(), names astronomy-engine on it and on each body, and never calls the result DE440", async () => {
    const { root, receipt } = await engineWith(text);
    const chart = root.natalChart(BIRTH);
    expect(chart.flags).toEqual(["de440-unavailable"]);
    expect(chart.ephemeris).toEqual(ASTRONOMY_ENGINE);
    expect(chart.bodies).toHaveLength(12);
    for (const row of chart.bodies) expect(row).toMatchObject({ ephemeris: "astronomy-engine", fallback: "de440-unavailable" });
    expect(JSON.stringify(chart)).not.toContain("jpl-de440");
    // A natal receipt carries the flag and names astronomy-engine, and reads back.
    const envelope = receipt.createNatalEnvelope(chart);
    expect(envelope.receipt.resultFlags).toEqual(["de440-unavailable"]);
    expect(envelope.receipt.engine.ephemeris).toEqual(ASTRONOMY_ENGINE);
    expect(envelope.receipt.conventionIds).toContain("flag:de440-unavailable");
    expect(envelope.requiredFeatures).not.toContain("ephemeris-jpl-de440");
    expect(receipt.parseNatalEnvelope(receipt.serializeNatalEnvelope(envelope)).ok).toBe(true);
    // The numbers are the ones the caller's own choice of astronomy-engine gives.
    root.setDefaultEphemeris("astronomy-engine");
    const chosen = root.natalChart(BIRTH);
    expect(chosen.flags).toEqual([]);
    expect(chart.bodies.map(({ fallback: _why, ...row }) => row)).toEqual(chosen.bodies);
  });

  it("flags the root's other results: positions, transits, synastry, moonPhase, saturnReturn, progressedBodies and a crossing search", async () => {
    const { root } = await engineWith(text);
    for (const rows of [root.positions(BIRTH.utc), root.transits(BIRTH, "2024-03-01T00:00:00Z").positions, root.progressedBodies(BIRTH.utc, "2024-03-01T00:00:00Z")]) {
      expect(rows).toHaveLength(12);
      for (const row of rows) expect(row).toMatchObject({ ephemeris: "astronomy-engine", fallback: "de440-unavailable" });
    }
    const pair = root.synastry(BIRTH, { ...BIRTH, utc: "1988-11-02T17:05:00Z" });
    expect([pair.a.flags, pair.b.flags]).toEqual([["de440-unavailable"], ["de440-unavailable"]]);
    expect(root.moonPhase(BIRTH.utc)).toMatchObject({ ephemeris: "astronomy-engine", fallback: "de440-unavailable" });
    expect(root.saturnReturn(BIRTH.utc)).toMatchObject({ ephemeris: "astronomy-engine", flags: ["de440-unavailable"] });
    const search = root.searchLongitudeCrossings("Sun", 30, "1990-01-01T00:00:00Z", "1991-01-01T00:00:00Z");
    expect(search).toMatchObject({ status: "complete", flags: ["de440-unavailable"] });
    // A chart that says it fell back is accepted back, with its flag.
    expect(root.transits(root.natalChart(BIRTH), "2024-03-01T00:00:00Z").natal.flags).toEqual(["de440-unavailable"]);
  });

  it("flags calc(), chart() and events(), whose receipts name astronomy-engine", async () => {
    const { calc } = await engineWith(text);
    for (const body of ["Sun", "Moon", "Pluto", "North Node", "South Node"] as const) {
      const position = calc.calc({ body, time: BIRTH.utc });
      if (position.status !== "ok") throw new Error(position.reason);
      expect(position.flags, body).toEqual(["de440-unavailable"]);
      expect(position.receipt.engine.ephemeris).toEqual(ASTRONOMY_ENGINE);
      expect(position.receipt.conventions).toContain("ephemeris:astronomy-engine@2.1.19");
      // astronomy-engine's own measured bound, not the pack's.
      expect(position.bounds.position.basis).not.toContain("DE440 pack");
    }
    const whole = calc.chart({ time: BIRTH.utc, place: PLACE });
    if (whole.status !== "ok") throw new Error(whole.reason);
    expect(whole.chart.flags).toEqual(["de440-unavailable"]);
    expect(whole.chart.ephemeris).toEqual(ASTRONOMY_ENGINE);
    expect(whole.receipt.engine.ephemeris).toEqual(ASTRONOMY_ENGINE);
    const found = calc.events({ kind: "longitude-crossing", body: "Sun", longitude: 30, from: "1990-01-01T00:00:00Z", to: "1991-01-01T00:00:00Z" });
    if (found.status !== "ok") throw new Error(found.reason);
    expect(found.flags).toEqual(["de440-unavailable"]);
    expect(found.receipt.engine.ephemeris).toEqual(ASTRONOMY_ENGINE);
    // What the pack never gives is astronomy-engine's by design, and is not flagged as a fallback.
    const helio = calc.calc({ body: "Mars", time: BIRTH.utc, center: "heliocentric" });
    if (helio.status !== "ok") throw new Error(helio.reason);
    expect(helio.flags).toEqual([]);
    expect(helio.receipt.engine.ephemeris).toEqual(ASTRONOMY_ENGINE);
  });

  it("flags birthWindow(), which names astronomy-engine", async () => {
    const { window } = await engineWith(text);
    const found = window.birthWindow({ start: "1990-04-15T08:00:00Z", end: "1990-04-15T09:00:00Z", ...PLACE });
    expect(found.flags).toContain("de440-unavailable");
    expect(found.ephemeris).toEqual(ASTRONOMY_ENGINE);
  });

  it("flags the timing and techniques entries' results", async () => {
    const { timing, techniques } = await engineWith(text);
    expect(timing.profectionAt(BIRTH, "2024-03-01T00:00:00Z").flags).toContain("de440-unavailable");
    expect(techniques.solarReturn(BIRTH, "2024-03-01T00:00:00Z").flags).toContain("de440-unavailable");
  });
});

describe("an instant outside the shipped pack's coverage", () => {
  const BEFORE = { utc: "1700-06-01T12:00:00Z", latitude: 51.5, longitude: -0.12 } as const;
  const AFTER = { utc: "2300-06-01T12:00:00Z", latitude: 51.5, longitude: -0.12 } as const;

  it("is flagged on natalChart() and each body, and named astronomy-engine, while the pack itself is whole", async () => {
    const { root, receipt } = await engineWith(null);
    expect(root.defaultEphemeris().de440).toMatchObject({ opened: true, error: null });
    for (const birth of [BEFORE, AFTER]) {
      const chart = root.natalChart(birth);
      expect(chart.flags).toEqual(["outside-reference-span", "delta-t-extrapolated", "outside-de440-span"].filter((flag) => flag !== "delta-t-extrapolated" || birth === AFTER));
      expect(chart.ephemeris).toEqual(ASTRONOMY_ENGINE);
      for (const row of chart.bodies) expect(row).toMatchObject({ ephemeris: "astronomy-engine", fallback: "outside-de440-span" });
      const envelope = receipt.createNatalEnvelope(chart);
      expect(envelope.receipt.resultFlags).toContain("outside-de440-span");
      expect(envelope.receipt.engine.ephemeris).toEqual(ASTRONOMY_ENGINE);
      expect(receipt.parseNatalEnvelope(receipt.serializeNatalEnvelope(envelope)).ok).toBe(true);
    }
    // Inside the pack nothing is flagged and the chart names the pack.
    const inside = root.natalChart(BIRTH);
    expect(inside.flags).toEqual([]);
    expect(inside.ephemeris!.name).toBe("jpl-de440");
  });

  it("is flagged on positions, transits, moonPhase and a search that leaves the pack", async () => {
    const { root } = await engineWith(null);
    for (const row of root.positions(BEFORE.utc)) expect(row).toMatchObject({ ephemeris: "astronomy-engine", fallback: "outside-de440-span" });
    const moving = root.transits(BIRTH, AFTER.utc);
    expect(moving.natal.flags).toEqual([]);
    for (const row of moving.positions) expect(row.fallback).toBe("outside-de440-span");
    expect(root.moonPhase(AFTER.utc)).toMatchObject({ ephemeris: "astronomy-engine", fallback: "outside-de440-span" });
    // A search from inside the pack to outside it reports the part that was not the pack's.
    const across = root.searchLongitudeCrossings("Sun", 30, "2208-01-01T00:00:00Z", "2212-01-01T00:00:00Z");
    expect(across).toMatchObject({ status: "complete", flags: ["outside-de440-span"] });
    const within = root.searchLongitudeCrossings("Sun", 30, "2000-01-01T00:00:00Z", "2001-01-01T00:00:00Z");
    expect(within).toMatchObject({ status: "complete", flags: [] });
    // Born in 2150, the Saturn returns run to 2242, past the pack's last year.
    expect(root.saturnReturn("2150-01-01T00:00:00Z")).toMatchObject({ ephemeris: "jpl-de440", flags: ["outside-de440-span"] });
    expect(root.saturnReturn(BIRTH.utc)).toMatchObject({ ephemeris: "jpl-de440", flags: [] });
  });

  it("is refused before it is flagged where an entry computes only inside 1800 to 2200, which the pack covers", async () => {
    const { calc, window } = await engineWith(null);
    expect(calc.calc({ body: "Sun", time: BEFORE.utc })).toMatchObject({ status: "refused", reason: "out-of-range" });
    expect(() => window.birthWindow({ start: "1700-06-01T08:00:00Z", end: "1700-06-01T09:00:00Z", ...PLACE })).toThrow(RangeError);
    const inside = window.birthWindow({ start: "1990-04-15T08:00:00Z", end: "1990-04-15T09:00:00Z", ...PLACE });
    expect(inside.flags).not.toContain("de440-unavailable");
    expect(inside.ephemeris.name).toBe("jpl-de440");
  });
});

describe('setDefaultEphemeris("astronomy-engine"), the caller\'s own choice', () => {
  it("is named on every result and flagged on none", async () => {
    const { root, calc, window } = await engineWith(null);
    root.setDefaultEphemeris("astronomy-engine");
    const chart = root.natalChart(BIRTH);
    expect(chart.flags).toEqual([]);
    expect(chart.ephemeris).toEqual(ASTRONOMY_ENGINE);
    for (const row of root.positions(BIRTH.utc)) {
      expect(row.ephemeris).toBe("astronomy-engine");
      expect(row).not.toHaveProperty("fallback");
    }
    const phase = root.moonPhase(BIRTH.utc);
    expect(phase.ephemeris).toBe("astronomy-engine");
    expect(phase).not.toHaveProperty("fallback");
    const position = calc.calc({ body: "Moon", time: BIRTH.utc });
    if (position.status !== "ok") throw new Error(position.reason);
    expect(position.flags).toEqual([]);
    expect(position.receipt.engine.ephemeris).toEqual(ASTRONOMY_ENGINE);
    const found = window.birthWindow({ start: "1990-04-15T08:00:00Z", end: "1990-04-15T09:00:00Z", ...PLACE });
    expect(found.flags).toEqual([]);
    expect(found.ephemeris).toEqual(ASTRONOMY_ENGINE);
    // Even outside the pack's years, where the default would have fallen back.
    expect(root.natalChart({ utc: "2300-06-01T12:00:00Z", timeKnown: false }).flags).not.toContain("outside-de440-span");
  });
});

describe("a supplied chart's fallback flag", () => {
  it("is accepted only on a chart that names astronomy-engine", async () => {
    const { root } = await engineWith(null);
    const chart = root.natalChart(BIRTH);
    expect(() => root.transits({ ...chart, flags: ["de440-unavailable"] }, "2024-03-01T00:00:00Z")).toThrow(RangeError);
    const claimed = { ...chart, ephemeris: ASTRONOMY_ENGINE, flags: ["de440-unavailable" as const] };
    expect(root.transits(claimed, "2024-03-01T00:00:00Z").natal.flags).toEqual(["de440-unavailable"]);
    // A caller may echo a fallback flag in a birth only where the calculation derives it.
    expect(() => root.natalChart({ ...BIRTH, flags: ["de440-unavailable"] })).toThrow(RangeError);
    expect(root.natalChart({ utc: "2300-06-01T12:00:00Z", timeKnown: false, flags: ["outside-de440-span"] }).flags).toContain("outside-de440-span");
  });
});
