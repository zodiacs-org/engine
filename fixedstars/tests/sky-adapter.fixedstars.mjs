import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { compileSkyAdapter, loadSkyAdapter, readEngineContract, verifyEngineSources } from "../scripts/build-sky-adapter.mjs";
import { catalog } from "../src/catalog.ts";
import { natalChart, skyEvents } from "../src/engine.ts";
import { starPositions } from "../src/positions.ts";

const star = { ...catalog[0], id: "synthetic-axis", raDeg: 0, decDeg: 0, properMotion: null };
const from = "2000-03-20T00:00:00Z";
const to = "2000-03-21T00:00:00Z";
const observer = { latitude: 0, longitude: 0 };
const options = { limb: "centre", refraction: "none" };
let adapter;
beforeAll(async () => { adapter = await loadSkyAdapter(); });

describe("unchanged sky solver bundle proof", () => {
  it("substitutes exactly the solver's dependency edge and pins the consumed engine source graph", async () => {
    const result = await compileSkyAdapter();
    expect(result.substitutions).toBe(1);
    expect(result.sourcePaths).toEqual(Object.keys(readEngineContract().sources).sort());
    expect(result.sourcePaths).toContain("src/sky/riseset.ts");
    expect(result.sourcePaths).toContain("src/equator.ts");
    expect(result.sourcePaths).toContain("src/nutation.ts");
    expect(result.sourcePaths).toContain("src/ephemeris.ts");
    expect(result.code).toContain("function searchEvents(");
    expect(result.code).toContain("function firstMillisecond(");
  });

  it("executes the native rise, set and both transit searches for a synthetic catalog direction", () => {
    const found = adapter.starEvents(star, observer, from, to, options);
    expect(found.status).toBe("complete");
    expect(found.body).toBe("Pluto"); // Private slot, not yet M8's star record.
    expect(found.conventions).toEqual({ limb: "centre", refraction: "none", refractionArcmin: 0 });
    expect(found.flags).toEqual([]);
    expect(found.samples).toBeGreaterThan(0);
    expect(found.events.map(({ kind }) => kind).sort()).toEqual(["lower-transit", "rise", "set", "upper-transit"]);
    expect(found.events.map(({ at }) => at.getTime())).toEqual(found.events.map(({ at }) => at.getTime()).sort((a, b) => a - b));
    // Independent spherical identities at an equatorial observer, using
    // current coordinates as inputs. No saved solver output is a reference.
    for (const event of found.events) {
      const dec = starPositions({ utc: event.at }, [star]).positions[0].decDeg;
      if (event.kind === "upper-transit") expect(Math.abs(event.altitude - (90 - Math.abs(dec)))).toBeLessThan(1e-5);
      if (event.kind === "lower-transit") expect(Math.abs(event.altitude - (-90 + Math.abs(dec)))).toBeLessThan(1e-5);
      if (event.kind === "rise" || event.kind === "set") {
        // First whole millisecond after h=0 allows the earth's intervening turn.
        expect(Math.abs(event.altitude)).toBeLessThan(1e-5);
        const az = event.kind === "rise" ? 90 - dec : 270 + dec;
        expect(Math.abs(event.azimuth - az)).toBeLessThan(1e-5);
      }
    }
  });

  it("preserves ordinary body calls exactly before and after interleaved star searches", () => {
    for (const body of ["Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto"]) {
      const expected = skyEvents(body, { latitude: 12, longitude: 30 }, from, to, options);
      expect(adapter.bodyEvents(body, { latitude: 12, longitude: 30 }, from, to, options)).toEqual(expected);
      adapter.starEvents(star, observer, from, to, options);
      expect(adapter.bodyEvents(body, { latitude: 12, longitude: 30 }, from, to, options)).toEqual(expected);
    }
  });

  it("accepts a committed catalog record with its available proper motion", () => {
    const selected = catalog.find(({ properMotion }) => properMotion !== null);
    expect(selected).toBeDefined();
    const found = adapter.starEvents(selected, { latitude: 12, longitude: 30 }, from, to, options);
    expect(found.status).toBe("complete");
    expect(found.events.length).toBeGreaterThan(0);
    for (const event of found.events) {
      expect(Number.isFinite(event.altitude)).toBe(true);
      expect(Number.isFinite(event.azimuth)).toBe(true);
      expect(event.at.getTime()).toBeGreaterThanOrEqual(Date.parse(from));
      expect(event.at.getTime()).toBeLessThan(Date.parse(to));
    }
  });

  it("keeps star searches distinct and leaves direct native calls and charts unchanged", () => {
    const body = skyEvents("Pluto", observer, from, to, options);
    const birth = { utc: from, ...observer };
    const chart = natalChart(birth);
    const first = adapter.starEvents(star, observer, from, to, options);
    const second = adapter.starEvents({ ...star, raDeg: 90 }, observer, from, to, options);
    expect(second.events).not.toEqual(first.events);
    expect(adapter.starEvents(star, observer, from, to, options)).toEqual(first);
    expect(first.events).not.toEqual(body.events);
    expect(skyEvents("Pluto", observer, from, to, options)).toEqual(body);
    expect(natalChart(birth)).toEqual(chart);
  });

  it("clears the slot on native solver validation, clock errors and whole-result budget refusal", () => {
    const expected = adapter.bodyEvents("Pluto", observer, from, to, options);
    expect(() => adapter.starEvents(star, { latitude: 100, longitude: 0 }, from, to, options)).toThrow(RangeError);
    expect(() => adapter.starEvents(star, observer, from, to, { limb: "upper" })).toThrow(RangeError);
    expect(() => adapter.starEvents(star, observer, to, from, options)).toThrow(RangeError);
    expect(() => adapter.starEvents(star, observer, "5000-01-01", "5000-01-02", options)).toThrow(RangeError);
    const refused = adapter.starEvents(star, observer, from, to, { ...options, maxSamples: 1 });
    expect(refused.status).toBe("refused");
    expect(refused.reason).toBe("sample-budget");
    expect(refused.events).toEqual([]);
    expect(adapter.bodyEvents("Pluto", observer, from, to, options)).toEqual(expected);
    expect(adapter.starEvents(star, observer, from, to, options).status).toBe("complete");
  });

  it("loads independently scoped bundles without writing an engine build", async () => {
    const other = await loadSkyAdapter();
    expect(other.starEvents).not.toBe(adapter.starEvents);
    expect(other.starEvents({ ...star, raDeg: 90 }, observer, from, to, options)).toEqual(
      adapter.starEvents({ ...star, raDeg: 90 }, observer, from, to, options)
    );
  });
});

describe("source compatibility refusal", () => {
  const nativeRead = (path, encoding) => readFileSync(path, encoding);
  const changedRead = (suffix, change) => (path, encoding) => {
    const original = nativeRead(path, encoding);
    return String(path).endsWith(suffix) ? change(original) : original;
  };

  it.each(["src/sky/riseset.ts", "src/equator.ts", "src/nutation.ts", "src/ephemeris.ts", "src/crossings.ts"])(
    "refuses changed %s bytes without editing the parent file", (path) => {
      expect(() => verifyEngineSources(readEngineContract(), changedRead(path, (original) => Buffer.concat([original, Buffer.from("\n")]))))
        .toThrow(/incompatible engine sky source/u);
    }
  );

  it("refuses a missing graph input before compilation and a changed graph contract afterwards", async () => {
    const changed = structuredClone(readEngineContract());
    delete changed.sources["src/sky/riseset.ts"];
    expect(() => verifyEngineSources(changed)).toThrow(/missing sky solver/u);
    const extra = structuredClone(readEngineContract());
    // Existing source with a correct digest, but outside the recorded graph.
    const { createHash } = await import("node:crypto");
    const source = readFileSync(new URL("../../src/window.ts", import.meta.url));
    extra.sources["src/window.ts"] = createHash("sha256").update(source).digest("hex");
    await expect(compileSkyAdapter(extra)).rejects.toThrow(/import graph/u);
    const omitted = structuredClone(readEngineContract());
    delete omitted.sources["src/equator.ts"];
    await expect(compileSkyAdapter(omitted)).rejects.toThrow(/incompatible engine sky source/u);
  });

  it("refuses changed ephemeris bytes and versions and a changed engine version", () => {
    expect(() => verifyEngineSources(readEngineContract(), changedRead("esm/astronomy.js", (bytes) => Buffer.concat([bytes, Buffer.from("\n")]))))
      .toThrow(/ephemeris source/u);
    expect(() => verifyEngineSources(readEngineContract(), changedRead("astronomy-engine/package.json", (json) => {
      const value = JSON.parse(json); value.version = "0.0.0"; return JSON.stringify(value);
    }))).toThrow(/ephemeris version/u);
    const enginePackage = fileURLToPath(new URL("../../package.json", import.meta.url));
    expect(() => verifyEngineSources(readEngineContract(), (path, encoding) => {
      const original = nativeRead(path, encoding);
      if (path !== enginePackage) return original;
      const value = JSON.parse(original); value.version = "0.0.0"; return JSON.stringify(value);
    })).toThrow(/engine version/u);
  });
});
