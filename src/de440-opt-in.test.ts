/**
 * The default source from 3.0.0: astronomy-engine, with no pack loaded, and
 * the shipped DE440 pack after one call, `useDe440()` from
 * `@zodiacs/engine/de440/pack` (`src/de440-pack.ts`).
 *
 * Each case runs on a new copy of the modules, as an application loads them:
 * the root (`src/index.ts`), its 2.x name (`src/core.ts`), the calc and window
 * entries, which share the root's ephemeris, and the pack's entry. Never a
 * silent fallback: `setDefaultEphemeris("de440")` with no pack loaded names
 * astronomy-engine and flags every result `"de440-unavailable"`, and
 * `defaultEphemeris()` says what to call.
 *
 * These pin behaviour (which source a call uses, and how it is labelled); they
 * are not accuracy evidence. `src/de440-default.test.ts` holds the pack's
 * results to JPL Horizons. Births are synthetic.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const ASTRONOMY_ENGINE = { name: "astronomy-engine", version: "2.1.19" };
const PACK_SHA256 = "51428874d9a47213abc0ff42cbcec65f338624eaa2d8831f0e6ddc3654bf1fa7";
const DE440 = { name: "jpl-de440", version: PACK_SHA256 };
const NOT_LOADED =
  "the shipped DE440 pack is not loaded: call useDe440() from @zodiacs/engine/de440/pack, or supply a pack through @zodiacs/engine/de440 and withEphemeris";
const BIRTH = { utc: "1990-04-15T08:30:00Z", latitude: 51.5, longitude: -0.12 } as const;
const AT = "1990-04-15T08:30:00Z";

/** The entries on a new copy of every module; the pack's text replaced by `text(real)` when given. */
async function fresh(text?: (real: string) => string) {
  vi.resetModules();
  if (text) {
    vi.doMock("./de440/pack-data.js", async (original) => {
      const real = (await original()) as { DE440_PACK_BASE64: string };
      return { DE440_PACK_BASE64: text(real.DE440_PACK_BASE64) };
    });
  } else vi.doUnmock("./de440/pack-data.js");
  return {
    root: await import("./index.js"),
    core: await import("./core.js"),
    calc: await import("./calc.js"),
    window: await import("./window.js"),
    pack: await import("./de440-pack.js")
  };
}

afterEach(() => {
  vi.doUnmock("./de440/pack-data.js");
  vi.resetModules();
});

/** The ephemeris a calc() result names, and its flags. */
function calcLabel(result: { status: string; receipt?: { engine: { ephemeris: unknown } }; flags?: readonly string[] }) {
  if (result.status !== "ok") throw new Error(`refused: ${JSON.stringify(result)}`);
  return { ephemeris: result.receipt!.engine.ephemeris, flags: result.flags };
}

describe("before useDe440()", () => {
  it("the root computes on astronomy-engine, names it, flags no fallback, and reports that no pack is loaded", async () => {
    const { root, calc } = await fresh();
    expect(root.defaultEphemeris()).toEqual({
      name: "astronomy-engine",
      de440: { opened: false, version: null, fromTtDays: null, toTtDays: null, error: NOT_LOADED }
    });
    const chart = root.natalChart(BIRTH);
    expect(chart.ephemeris).toEqual(ASTRONOMY_ENGINE);
    expect(chart.flags).toEqual([]);
    for (const row of chart.bodies) {
      expect(row.ephemeris).toBe("astronomy-engine");
      expect("fallback" in row).toBe(false);
    }
    expect(calcLabel(calc.calc({ body: "Mars", time: AT }))).toEqual({ ephemeris: ASTRONOMY_ENGINE, flags: [] });
  });

  it('setDefaultEphemeris("de440") computes on astronomy-engine and flags every result "de440-unavailable", never silently', async () => {
    const { root, calc } = await fresh();
    root.setDefaultEphemeris("de440");
    expect(root.defaultEphemeris()).toEqual({ name: "de440", de440: { opened: false, version: null, fromTtDays: null, toTtDays: null, error: NOT_LOADED } });
    const chart = root.natalChart(BIRTH);
    expect(chart.ephemeris).toEqual(ASTRONOMY_ENGINE);
    expect(chart.flags).toEqual(["de440-unavailable"]);
    for (const row of chart.bodies) expect(row).toMatchObject({ ephemeris: "astronomy-engine", fallback: "de440-unavailable" });
    expect(calcLabel(calc.calc({ body: "Mars", time: AT }))).toEqual({ ephemeris: ASTRONOMY_ENGINE, flags: ["de440-unavailable"] });
    const found = calc.events({ kind: "longitude-crossing", body: "Sun", longitude: 30, from: "1990-01-01T00:00:00Z", to: "1991-01-01T00:00:00Z" });
    expect(calcLabel(found)).toEqual({ ephemeris: ASTRONOMY_ENGINE, flags: ["de440-unavailable"] });
    // The numbers are the default astronomy-engine's.
    root.setDefaultEphemeris("astronomy-engine");
    expect(chart.bodies.map(({ fallback: _why, ...row }) => row)).toEqual(root.natalChart(BIRTH).bodies);
  });

  it("opening the shipped pack without useDe440() does not change the default", async () => {
    const { root, pack } = await fresh();
    expect(pack.shippedDe440Source().ephemeris).toEqual(DE440);
    expect(root.defaultEphemeris().name).toBe("astronomy-engine");
    expect(root.defaultEphemeris().de440.opened).toBe(false);
    expect(root.natalChart(BIRTH).ephemeris).toEqual(ASTRONOMY_ENGINE);
  });
});

describe("useDe440()", () => {
  it("makes the shipped pack the default of the root and of the entries that share its ephemeris, and returns it", async () => {
    const { root, core, calc, window, pack } = await fresh();
    const source = pack.useDe440();
    expect(source).toBe(pack.shippedDe440Source());
    expect(source.ephemeris).toEqual(DE440);
    const status = root.defaultEphemeris();
    expect(status.name).toBe("de440");
    expect(status.de440).toMatchObject({ opened: true, version: PACK_SHA256, error: null });
    expect(status.de440.fromTtDays).toBe(source.pack.startEtSecTdb / 86_400 + 1);
    expect(core.defaultEphemeris()).toEqual(status);
    const chart = root.natalChart(BIRTH);
    expect(chart.ephemeris).toEqual(DE440);
    expect(chart.flags).toEqual([]);
    expect(core.natalChart(BIRTH)).toEqual(chart);
    expect(chart).toEqual(root.withEphemeris(source, () => root.natalChart(BIRTH)));
    expect(calcLabel(calc.calc({ body: "Mars", time: AT }))).toEqual({ ephemeris: DE440, flags: [] });
    const birthWindow = window.birthWindow({ start: new Date("1990-04-15T08:00:00Z"), end: new Date("1990-04-15T08:10:00Z"), latitude: 51.5, longitude: -0.12 });
    expect(birthWindow.ephemeris).toEqual(DE440);
    expect(birthWindow.flags).not.toContain("de440-unavailable");
  });

  it("gives the same source at every call and changes nothing the second time", async () => {
    const { root, pack } = await fresh();
    const first = pack.useDe440();
    const status = root.defaultEphemeris();
    const chart = root.natalChart(BIRTH);
    expect(pack.useDe440()).toBe(first);
    expect(root.defaultEphemeris()).toEqual(status);
    expect(root.natalChart(BIRTH)).toEqual(chart);
  });

  it('is left by setDefaultEphemeris("astronomy-engine") and returned to by setDefaultEphemeris("de440"), without useDe440() again', async () => {
    const { root, calc, pack } = await fresh();
    pack.useDe440();
    const onPack = root.natalChart(BIRTH);
    root.setDefaultEphemeris("astronomy-engine");
    const chosen = root.natalChart(BIRTH);
    expect(chosen.ephemeris).toEqual(ASTRONOMY_ENGINE);
    expect(chosen.flags).toEqual([]);
    expect(calcLabel(calc.calc({ body: "Mars", time: AT }))).toEqual({ ephemeris: ASTRONOMY_ENGINE, flags: [] });
    expect(root.defaultEphemeris()).toMatchObject({ name: "astronomy-engine", de440: { opened: true, version: PACK_SHA256 } });
    root.setDefaultEphemeris("de440");
    expect(root.natalChart(BIRTH)).toEqual(onPack);
  });

  it("falls back outside the pack's years, flagged, as the default pack always has", async () => {
    const { root, pack } = await fresh();
    pack.useDe440();
    const outside = root.natalChart({ utc: "1700-01-01T12:00:00Z", timeKnown: false });
    expect(outside.ephemeris).toEqual(ASTRONOMY_ENGINE);
    expect(outside.flags.at(-1)).toBe("outside-de440-span");
    expect(outside.bodies.every((row) => row.fallback === "outside-de440-span")).toBe(true);
  });

  it("throws where the pack cannot be opened, and leaves the default on it, every result flagged with the reason", async () => {
    const { root, calc, pack } = await fresh(() => "");
    expect(() => pack.useDe440()).toThrow(/SHA-256/);
    expect(() => pack.useDe440()).toThrow(/SHA-256/);
    const status = root.defaultEphemeris();
    expect(status).toMatchObject({ name: "de440", de440: { opened: false, version: null, fromTtDays: null, toTtDays: null } });
    expect(status.de440.error).toMatch(/SHA-256/);
    const chart = root.natalChart(BIRTH);
    expect(chart.ephemeris).toEqual(ASTRONOMY_ENGINE);
    expect(chart.flags).toEqual(["de440-unavailable"]);
    expect(calcLabel(calc.calc({ body: "Mars", time: AT }))).toEqual({ ephemeris: ASTRONOMY_ENGINE, flags: ["de440-unavailable"] });
  });
});
