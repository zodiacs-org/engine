/**
 * Never a silent fallback, in the techniques entry and the internal entry:
 * each result of the ten functions the rc.10 breaker found unlabelled
 * (docs/evidence/1.1.0-rc.10-20261114/breaker/BREAKER.md, B1), and of
 * `bodyLongitude` and `longitudeSpeed` on `./internal`, names the ephemeris
 * its positions came from and says why that is astronomy-engine where the
 * shipped DE440 pack was the default. A function that returns a bare value
 * (a Date, a number, a list of signs) cannot carry the label, so its
 * `…Detailed` form returns `{ value, ephemeris, flags }`, and `value` is the
 * plain function's result.
 *
 * Each function in three states, on a new copy of the modules put on the
 * shipped pack with `useDe440()`: the pack whole (named `jpl-de440`, no flag), the pack damaged (one character of its
 * text changed: `"de440-unavailable"`, named astronomy-engine), and an
 * instant outside its coverage, 1750 and 2230, with the pack whole
 * (`"outside-de440-span"`, named astronomy-engine). And the caller's own
 * choice of astronomy-engine, named and not flagged. These pin behaviour;
 * they are not accuracy evidence. Births are synthetic.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

const ASTRONOMY_ENGINE = { name: "astronomy-engine", version: "2.1.19" };
const DAY = 86_400_000;

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
  return { root, techniques: await import("./techniques.js"), internal: await import("./internal.js") };
}

afterEach(() => {
  vi.doUnmock("./de440/pack-data.js");
  vi.resetModules();
});

const oneCharacterChanged: PackText = (real) => {
  const at = Math.floor(real.length / 2);
  return real.slice(0, at) + (real[at] === "A" ? "B" : "A") + real.slice(at + 1);
};

interface Label {
  readonly ephemeris: { readonly name: string; readonly version: string } | null;
  readonly flags: readonly string[];
}
type Engine = Awaited<ReturnType<typeof engineWith>>;

/**
 * The twelve functions at `iso`, each as the labels its result carries: the
 * result itself, and for a list each element (and a window's last aspect).
 * Each `…Detailed` value is checked against the plain function's.
 */
function labelled({ techniques: t, internal }: Engine, iso: string): Record<string, Label[]> {
  const at = Date.parse(iso);
  const later = (days: number) => new Date(at + days * DAY).toISOString();
  const birth = { utc: iso, latitude: 51.5, longitude: -0.12 };
  const other = { utc: later(400), latitude: 48.85, longitude: 2.35 };
  const same = <D extends { readonly value: unknown }>(detailed: D, plain: D["value"]): D => {
    expect(detailed.value).toEqual(plain);
    return detailed;
  };
  const windows = t.voidOfCourseWindows(iso, later(6));
  const status = t.voidOfCourseAt(iso);
  return {
    solarReturnInstant: [same(t.solarReturnInstantDetailed(25, iso), t.solarReturnInstant(25, iso))],
    mostRecentSolarReturnInstant: [same(t.mostRecentSolarReturnInstantDetailed(25, iso), t.mostRecentSolarReturnInstant(25, iso))],
    lunarReturnInstant: [same(t.lunarReturnInstantDetailed(100, iso), t.lunarReturnInstant(100, iso))],
    moonIngresses: [...t.moonIngresses(iso, later(6))],
    moonAspects: [...t.moonAspects(iso, later(2))],
    voidOfCourseAt: [status, ...[status.current, status.next].filter((window) => window !== null)],
    voidOfCourseWindows: [...windows, ...windows.flatMap((window) => (window.lastAspect ? [window.lastAspect] : []))],
    moonSignsBetween: [same(t.moonSignsBetweenDetailed(iso, later(3)), t.moonSignsBetween(iso, later(3)))],
    compositeChart: [t.compositeChart(birth, other)],
    chartAspectPatterns: [t.chartAspectPatterns(birth)],
    bodyLongitude: [same(internal.bodyLongitudeDetailed("Mars", new Date(at)), internal.bodyLongitude("Mars", new Date(at)))],
    longitudeSpeed: [same(internal.longitudeSpeedDetailed("Mars", new Date(at)), internal.longitudeSpeed("Mars", new Date(at)))]
  };
}

const TWELVE = [
  "solarReturnInstant",
  "mostRecentSolarReturnInstant",
  "lunarReturnInstant",
  "moonIngresses",
  "moonAspects",
  "voidOfCourseAt",
  "voidOfCourseWindows",
  "moonSignsBetween",
  "compositeChart",
  "chartAspectPatterns",
  "bodyLongitude",
  "longitudeSpeed"
] as const;

/** The internal entry's flags are the fallbacks only; the techniques entry's also say "outside-reference-span". */
const INTERNAL = new Set(["bodyLongitude", "longitudeSpeed"]);

function expectEach(found: Record<string, Label[]>, check: (name: string, label: Label) => void) {
  expect(Object.keys(found)).toEqual([...TWELVE]);
  for (const name of TWELVE) {
    const labels = found[name]!;
    expect(labels.length, name).toBeGreaterThan(0);
    for (const label of labels) check(name, label);
  }
}

describe("the techniques and internal entries on the shipped DE440 pack", () => {
  it("name jpl-de440 on each result and element of the twelve functions, and flag none", async () => {
    const engine = await engineWith(null);
    const version = engine.root.defaultEphemeris().de440.version;
    expectEach(labelled(engine, "2024-03-01T00:00:00Z"), (name, label) => {
      expect(label.ephemeris, name).toEqual({ name: "jpl-de440", version });
      expect(label.flags, name).toEqual([]);
    });
  });
});

describe("the techniques and internal entries with the pack damaged", () => {
  it("flag de440-unavailable and name astronomy-engine on each result and element of the twelve functions", async () => {
    const engine = await engineWith(oneCharacterChanged);
    expect(engine.root.defaultEphemeris().de440.opened).toBe(false);
    expectEach(labelled(engine, "2024-03-01T00:00:00Z"), (name, label) => {
      expect(label.ephemeris, name).toEqual(ASTRONOMY_ENGINE);
      expect(label.flags, name).toEqual(["de440-unavailable"]);
    });
  });
});

describe.each(["1750-06-01T12:00:00Z", "2230-06-01T12:00:00Z"])("the techniques and internal entries at %s, outside the pack", (iso) => {
  it("flag outside-de440-span and name astronomy-engine on each result and element of the twelve functions", async () => {
    const engine = await engineWith(null);
    expect(engine.root.defaultEphemeris().de440.opened).toBe(true);
    expectEach(labelled(engine, iso), (name, label) => {
      expect(label.ephemeris, name).toEqual(ASTRONOMY_ENGINE);
      expect(label.flags, name).toEqual(INTERNAL.has(name) ? ["outside-de440-span"] : ["outside-reference-span", "outside-de440-span"]);
    });
  });
});

describe('the techniques and internal entries after setDefaultEphemeris("astronomy-engine"), the caller\'s own choice', () => {
  it("name astronomy-engine and flag no fallback, inside the pack's years and outside them", async () => {
    const engine = await engineWith(null);
    engine.root.setDefaultEphemeris("astronomy-engine");
    expectEach(labelled(engine, "2024-03-01T00:00:00Z"), (name, label) => {
      expect(label.ephemeris, name).toEqual(ASTRONOMY_ENGINE);
      expect(label.flags, name).toEqual([]);
    });
    expectEach(labelled(engine, "2230-06-01T12:00:00Z"), (name, label) => {
      expect(label.ephemeris, name).toEqual(ASTRONOMY_ENGINE);
      expect(label.flags, name).toEqual(INTERNAL.has(name) ? [] : ["outside-reference-span"]);
    });
  });
});

describe("a list that runs past the pack's last day", () => {
  it("labels each element by the positions it was found from: the pack's before the end, astronomy-engine's after", async () => {
    const engine = await engineWith(null);
    const { de440 } = engine.root.defaultEphemeris();
    // The default's last TT day as a UTC instant, near enough: ΔT there is minutes, the ingresses days apart.
    const lastMs = Date.UTC(2000, 0, 1, 12) + de440.toTtDays! * DAY;
    const ingresses = engine.techniques.moonIngresses(new Date(lastMs - 10 * DAY), new Date(lastMs + 10 * DAY));
    const before = ingresses.filter((row) => row.at.getTime() < lastMs - DAY);
    const after = ingresses.filter((row) => row.at.getTime() > lastMs + DAY);
    expect(before.length).toBeGreaterThan(0);
    expect(after.length).toBeGreaterThan(0);
    for (const row of before) expect(row).toMatchObject({ ephemeris: { name: "jpl-de440" }, flags: ["outside-reference-span"] });
    for (const row of after) expect(row).toMatchObject({ ephemeris: ASTRONOMY_ENGINE, flags: ["outside-reference-span", "outside-de440-span"] });
  });
});

describe("a result built from supplied charts", () => {
  it("takes each chart's label, and names no ephemeris where the two charts do not name one and the same", async () => {
    const engine = await engineWith(null);
    const pack = engine.root.natalChart({ utc: "1990-04-15T08:30:00Z", latitude: 51.5, longitude: -0.12 });
    // A chart from a release before 1.1.0-rc.10 names no ephemeris.
    const { ephemeris: _named, ...older } = pack;
    expect(engine.techniques.chartAspectPatterns(pack)).toMatchObject({ ephemeris: pack.ephemeris, flags: [] });
    expect(engine.techniques.chartAspectPatterns(older).ephemeris).toBeNull();
    expect(engine.techniques.compositeChart(pack, older).ephemeris).toBeNull();
    const fallen = { ...pack, ephemeris: ASTRONOMY_ENGINE, flags: ["de440-unavailable" as const] };
    expect(engine.techniques.compositeChart(pack, fallen)).toMatchObject({ ephemeris: null, flags: ["de440-unavailable"] });
    expect(engine.techniques.compositeChart(fallen, fallen)).toMatchObject({ ephemeris: ASTRONOMY_ENGINE, flags: ["de440-unavailable"] });
  });
});
