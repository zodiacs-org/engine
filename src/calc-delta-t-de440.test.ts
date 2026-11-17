// PR 102's rule on the shipped DE440 pack, the package's default source: a
// result on a ΔT the model extrapolates past the IERS table is flagged
// "delta-t-extrapolated", and calc() widens its position bound by the body's
// rate times the TT band. src/calc-delta-t.test.ts holds the rule on
// astronomy-engine, where the suite runs (src/test-setup.ts); this file loads
// new modules, which start on the pack. The pack's own place with ΔT moved
// by its sigma either way must stay inside the widened bound. These pin
// behaviour, not accuracy. Synthetic instants only.
import { afterEach, describe, expect, it, vi } from "vitest";

const FLAG = "delta-t-extrapolated";
const FAR = "2199-06-15T12:00:00Z";
const NOW = "2024-06-15T12:00:00Z";
const AS = 180 * 3600 / Math.PI;

async function onPack() {
  vi.resetModules();
  const root = await import("./index.js");
  expect(root.defaultEphemeris()).toMatchObject({ name: "de440", de440: { opened: true } });
  return { root, calc: await import("./calc.js"), bounds: await import("./calc-bounds-de440.js") };
}

afterEach(() => vi.resetModules());

const unit = (lon: number, lat: number): [number, number, number] => {
  const [l, b] = [(lon * Math.PI) / 180, (lat * Math.PI) / 180];
  return [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)];
};
const angle = (a: [number, number, number], b: [number, number, number]): number => {
  const cross = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return Math.atan2(Math.hypot(cross[0]!, cross[1]!, cross[2]!), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * AS;
};

describe("a ΔT extrapolated, on the shipped DE440 pack", () => {
  it("flags calc() on UTC and UT1 input, and widens the pack's bound by the rate times the TT band on UT1 input", async () => {
    const { calc, bounds } = await onPack();
    for (const body of ["Moon", "Sun", "Mars"] as const) {
      // On UTC input after the IERS table TT is UTC + 69.184 s exactly (the continuous-UTC rule): the TT band is
      // 0, and the pack's measured bound stands.
      const onUtc = calc.calc({ body, time: FAR });
      if (onUtc.status !== "ok") throw new Error(onUtc.reason);
      expect(onUtc.receipt.engine.ephemeris.name).toBe("jpl-de440");
      expect(onUtc.flags).toEqual([FLAG]);
      expect(onUtc.band!.time.tt).toBe(0);
      expect(onUtc.bounds.position.value).toBe(bounds.DE440_MEASURED[body]);
      expect(onUtc.bounds.position.label).toBe("measured");
      // On UT1 input, the same UT1, TT carries ΔT's band.
      const jd = onUtc.receipt.instants[0]!.jdUt1;
      const result = calc.calc({ body, time: { jd, scale: "ut1" } });
      if (result.status !== "ok") throw new Error(result.reason);
      expect(result.receipt.engine.ephemeris.name).toBe("jpl-de440");
      expect(result.flags).toEqual([FLAG]);
      const [used] = result.receipt.instants;
      expect(used!.deltaT.segment).toBe("extrapolated");
      const cos = Math.cos((result.lat * Math.PI) / 180);
      const extra = (Math.hypot(result.speeds!.lon * cos, result.speeds!.lat) / 24) * result.band!.time.tt;
      const base = bounds.DE440_MEASURED[body]!;
      expect(result.bounds.position.label).toBe("estimated");
      expect(Math.abs(result.bounds.position.value! - base - extra)).toBeLessThan(0.01 * extra + 1e-9);
      expect(result.bounds.position.basis).toContain("ΔT extrapolated");
      expect(result.receipt.conventions).toContain("bounds:plus-delta-t-band");
      // The pack's own place with ΔT moved by its sigma either way stays inside the widened bound.
      const sigma = used!.deltaT.sigma!;
      for (const shift of [-sigma, sigma]) {
        const moved = calc.calc({ body, time: { jd, scale: "ut1", deltaT: used!.deltaT.seconds + shift } });
        if (moved.status !== "ok") throw new Error(moved.reason);
        expect(moved.receipt.engine.ephemeris.name).toBe("jpl-de440");
        expect(angle(unit(moved.lon, moved.lat), unit(result.lon, result.lat))).toBeLessThanOrEqual(result.bounds.position.value!);
      }
    }
  });

  it("leaves a present-day instant, TT input and a pinned ΔT alone, on the pack's measured bound", async () => {
    const { calc, bounds } = await onPack();
    const far = calc.calc({ body: "Moon", time: FAR });
    if (far.status !== "ok") throw new Error(far.reason);
    for (const time of [NOW, { jd: far.receipt.instants[0]!.jdTt, scale: "tt" as const }, { iso: FAR, deltaT: 125 }]) {
      const result = calc.calc({ body: "Moon", time });
      if (result.status !== "ok") throw new Error(result.reason);
      expect(result.receipt.engine.ephemeris.name).toBe("jpl-de440");
      expect(result.flags).toEqual([]);
      expect(result.bounds.position).toMatchObject({ value: bounds.DE440_MEASURED.Moon, label: "measured" });
      expect(result.receipt.conventions).not.toContain("bounds:plus-delta-t-band");
    }
  });

  it("flags natalChart() there, named jpl-de440, and not a present-day chart", async () => {
    const { root } = await onPack();
    const far = root.natalChart({ utc: FAR, timeKnown: false });
    expect(far.ephemeris!.name).toBe("jpl-de440");
    expect(far.flags).toContain(FLAG);
    expect(far.flags).not.toContain("outside-de440-span");
    expect(root.natalChart({ utc: NOW, timeKnown: false }).flags).not.toContain(FLAG);
  });
});
