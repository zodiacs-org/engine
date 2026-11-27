/**
 * Never a silent fallback, in the root's results derived from a chart: the
 * two the rc.11 breaker found unlabelled when given a birth
 * (docs/evidence/1.1.0-rc.11-20261115/breaker/BREAKER.md, B1),
 * `chartPoints` and `chartDeclinations`, name the ephemeris of the chart
 * they were derived from and carry its fallback flags; and `saturnReturn`
 * names astronomy-engine wherever its flags hold a fallback (S4 there).
 *
 * Each on a new copy of the modules, put on the shipped pack with
 * `useDe440()`: the pack whole (named `jpl-de440`, no flag), the pack damaged (one character of its text changed:
 * `"de440-unavailable"`, named astronomy-engine), an instant outside its
 * coverage, 1750 and 2230, with the pack whole (`"outside-de440-span"`,
 * named astronomy-engine), and the caller's own choice of astronomy-engine,
 * named and not flagged. Given a chart, each carries that chart's label.
 * These pin behaviour; they are not accuracy evidence. Births are synthetic.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const ASTRONOMY_ENGINE = { name: "astronomy-engine", version: "2.1.19" };

type PackText = (real: string) => string;

async function engineWith(text: PackText | null) {
  vi.resetModules();
  if (text) {
    vi.doMock("./de440/pack-data.js", async (original) => {
      const real = (await original()) as { DE440_PACK_BASE64: string };
      return { DE440_PACK_BASE64: text(real.DE440_PACK_BASE64) };
    });
  } else vi.doUnmock("./de440/pack-data.js");
  const root = await import("./index.js");
  // From 3.0.0 the shipped pack is the default once useDe440() has loaded it; where the pack cannot be
  // opened, useDe440() throws and leaves the default on it, so that every result says it fell back.
  expect(root.defaultEphemeris().name).toBe("astronomy-engine");
  try {
    (await import("./de440-pack.js")).useDe440();
  } catch (error) {
    if (!text) throw error;
  }
  expect(root.defaultEphemeris().name).toBe("de440");
  return root;
}

afterEach(() => {
  vi.doUnmock("./de440/pack-data.js");
  vi.resetModules();
});

const oneCharacterChanged: PackText = (real) => {
  const at = Math.floor(real.length / 2);
  return real.slice(0, at) + (real[at] === "A" ? "B" : "A") + real.slice(at + 1);
};

type Root = Awaited<ReturnType<typeof engineWith>>;
const birthAt = (utc: string) => ({ utc, latitude: 40.4, longitude: -3.7 });

/** chartPoints and chartDeclinations of a birth, and of the chart natalChart gives for it, which must agree. */
function both(root: Root, utc: string) {
  const birth = birthAt(utc);
  const chart = root.natalChart(birth);
  const points = root.chartPoints(birth);
  const declinations = root.chartDeclinations(birth);
  expect(root.chartPoints(chart)).toEqual(points);
  expect(root.chartDeclinations(chart)).toEqual(declinations);
  return { chart, points, declinations };
}

describe("chartPoints and chartDeclinations of a birth, on the shipped DE440 pack", () => {
  it("name jpl-de440 with the pack's digest and flag none", async () => {
    const root = await engineWith(null);
    const version = root.defaultEphemeris().de440.version;
    const { chart, points, declinations } = both(root, "1991-06-21T14:45:00Z");
    expect(chart.ephemeris).toEqual({ name: "jpl-de440", version });
    for (const result of [points, declinations]) {
      expect(result.ephemeris).toEqual({ name: "jpl-de440", version });
      expect(result.flags).toEqual([]);
    }
  });
});

describe("chartPoints and chartDeclinations of a birth, with the pack damaged", () => {
  it('name astronomy-engine and flag "de440-unavailable", as the chart does', async () => {
    const root = await engineWith(oneCharacterChanged);
    expect(root.defaultEphemeris().de440.opened).toBe(false);
    const { chart, points, declinations } = both(root, "1991-06-21T14:45:00Z");
    expect(chart.flags).toContain("de440-unavailable");
    for (const result of [points, declinations]) {
      expect(result.ephemeris).toEqual(ASTRONOMY_ENGINE);
      expect(result.flags).toEqual(["de440-unavailable"]);
    }
  });
});

describe.each(["1750-06-21T14:45:00Z", "2230-06-21T14:45:00Z"])("chartPoints and chartDeclinations of a birth at %s, outside the pack", (utc) => {
  it('name astronomy-engine and flag "outside-de440-span"', async () => {
    const root = await engineWith(null);
    expect(root.defaultEphemeris().de440.opened).toBe(true);
    const { points, declinations } = both(root, utc);
    for (const result of [points, declinations]) {
      expect(result.ephemeris).toEqual(ASTRONOMY_ENGINE);
      expect(result.flags).toEqual(["outside-de440-span"]);
    }
  });
});

describe('chartPoints and chartDeclinations after setDefaultEphemeris("astronomy-engine"), the caller\'s own choice', () => {
  it("name astronomy-engine and flag no fallback, inside the pack's years and outside them", async () => {
    const root = await engineWith(null);
    root.setDefaultEphemeris("astronomy-engine");
    for (const utc of ["1991-06-21T14:45:00Z", "2230-06-21T14:45:00Z"]) {
      const { points, declinations } = both(root, utc);
      for (const result of [points, declinations]) {
        expect(result.ephemeris).toEqual(ASTRONOMY_ENGINE);
        expect(result.flags).toEqual([]);
      }
    }
  });
});

describe("chartPoints and chartDeclinations of a supplied chart", () => {
  it("carry that chart's label, and name no ephemeris for a chart that names none", async () => {
    const root = await engineWith(null);
    const chart = root.natalChart(birthAt("1991-06-21T14:45:00Z"));
    const fallen = { ...chart, ephemeris: ASTRONOMY_ENGINE, flags: [...chart.flags, "de440-unavailable" as const] };
    for (const derive of [root.chartPoints, root.chartDeclinations]) {
      expect(derive(fallen)).toMatchObject({ ephemeris: ASTRONOMY_ENGINE, flags: ["de440-unavailable"] });
      // A chart from a release before 1.1.0-rc.10 names no ephemeris.
      const { ephemeris: _named, ...older } = chart;
      expect(derive(older)).toMatchObject({ ephemeris: null, flags: [] });
    }
  });
});

describe("saturnReturn, whose search runs to about age 92", () => {
  it("names jpl-de440 with no flag where the whole search is on the pack", async () => {
    const root = await engineWith(null);
    expect(root.saturnReturn(birthAt("1991-06-21T14:45:00Z"))).toMatchObject({ ephemeris: "jpl-de440", flags: [] });
  });

  it('names astronomy-engine, not jpl-de440, where a search that began on the pack ran past its end', async () => {
    const root = await engineWith(null);
    const result = root.saturnReturn(birthAt("2195-06-21T14:45:00Z"));
    expect(result.flags).toEqual(["outside-de440-span"]);
    expect(result.ephemeris).toBe("astronomy-engine");
  });

  it('names astronomy-engine with "de440-unavailable" where the pack is damaged', async () => {
    const root = await engineWith(oneCharacterChanged);
    expect(root.saturnReturn(birthAt("1991-06-21T14:45:00Z"))).toMatchObject({ ephemeris: "astronomy-engine", flags: ["de440-unavailable"] });
  });
});
