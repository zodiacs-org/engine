import { beforeAll, describe, expect, it } from "vitest";

import { prepareStarSky } from "../node.mjs";
import { catalog, STAR_SKY_CONVENTIONS, starPositions } from "../src/index.js";
import type { CatalogStar, SkyEventKind, SkyOptions, StarSkyEvents, StarSkySearch } from "../src/index.js";
import { skyEvents } from "../src/engine.js";

// Invented equatorial observing window; no person's birth details.
const from = "2000-03-20T00:00:00Z";
const to = "2000-03-21T00:00:00Z";
const observer = { latitude: 0, longitude: 0 };
const geometric = { limb: "centre", refraction: "none" } as const;
const star: CatalogStar = { ...catalog[0]!, id: "synthetic-x-axis", raDeg: 0, decDeg: 0, properMotion: null };
let sky: StarSkySearch;
beforeAll(async () => { sky = await prepareStarSky(); });

function event(result: StarSkyEvents, kind: SkyEventKind) {
  const found = result.events.find((value) => value.kind === kind);
  expect(found).toBeDefined();
  return found!;
}

describe("prepared public star sky searches", () => {
  it("returns synchronous, chronologically ordered real-star results for all event kinds", () => {
    const found = sky.starEvents(star, observer, from, to, geometric);
    expect(found).not.toBeInstanceOf(Promise);
    expect(found.starId).toBe(star.id);
    expect(found).not.toHaveProperty("body");
    expect(found.status).toBe("complete");
    expect(found.events.map(({ kind }) => kind).sort()).toEqual(["lower-transit", "rise", "set", "upper-transit"]);
    expect(found.events.map(({ at }) => at.getTime())).toEqual(found.events.map(({ at }) => at.getTime()).sort((a, b) => a - b));
    expect(found.flags).toEqual([]);
    expect(found.samples).toBeGreaterThan(0);
    for (const value of found.events) {
      expect(value.at.getTime()).toBeGreaterThanOrEqual(Date.parse(from));
      expect(value.at.getTime()).toBeLessThan(Date.parse(to));
      const dec = starPositions({ utc: value.at }, [star]).positions[0]!.decDeg;
      // Independent spherical identities, derived in GEOMETRY.md. The
      // current declination is an input, not a physical accuracy reference.
      if (value.kind === "rise" || value.kind === "set") {
        expect(Math.abs(value.altitude)).toBeLessThan(1e-5);
        expect(Math.abs(value.azimuth - (value.kind === "rise" ? 90 - dec : 270 + dec))).toBeLessThan(1e-5);
      } else {
        const expected = value.kind === "upper-transit" ? 90 - Math.abs(dec) : -90 + Math.abs(dec);
        expect(Math.abs(value.altitude - expected)).toBeLessThan(1e-5);
      }
    }
  });

  it("records verified source identity, normalized requests and JSON-safe immutable results", () => {
    const found = sky.starEvents(star, observer, "2000-03-20T01:00:00+01:00", new Date(to));
    expect(found.observer).toEqual({ ...observer, height: 0 });
    expect(found.from.toISOString()).toBe("2000-03-20T00:00:00.000Z");
    expect(found.to.toISOString()).toBe("2000-03-21T00:00:00.000Z");
    expect(found.conventions).toEqual({ limb: "centre", refraction: "standard", refractionArcmin: 34 });
    const call = found.provenance;
    expect(call.schema).toBe("fixedstars-sky-call/1");
    expect(call.kind).toBe("fixedstars-call-record");
    expect(call.nativeReceipt).toBe(false);
    expect(call.engine.name).toBe("@zodiacs/engine");
    expect(call.engine.version).toBe(sky.compatibility.engineVersion);
    expect(call.engine.ephemeris).toEqual({ name: "astronomy-engine", version: sky.compatibility.ephemeris.version });
    expect(call.compatibility).toBe(sky.compatibility);
    expect(call.compatibility.sources["src/sky/riseset.ts"]).toMatch(/^[a-f0-9]{64}$/u);
    expect(call.compatibility.ephemeris.esmSha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(call.compatibility.bodySlot).toBe("Pluto"); // Disclosed adapter mechanism only.
    expect(call.request).toEqual({ subject: { kind: "star", star: {
      id: star.id, frame: star.frame, epochJulianYear: star.epochJulianYear,
      raDeg: 0, decDeg: 0, properMotion: null
    } }, observer: found.observer, from: found.from.toISOString(), to: found.to.toISOString(),
    options: { ...found.conventions, maxSamples: "unlimited" } });
    expect(call.response).toEqual({ status: "complete", reason: null, samples: found.samples, flags: found.flags,
      events: found.events.map((value) => ({ ...value, at: value.at.toISOString() })) });
    expect(call.stellarConventions).toEqual(STAR_SKY_CONVENTIONS);
    expect(JSON.parse(JSON.stringify(call))).toEqual(call);
    for (const value of [sky, sky.compatibility, sky.compatibility.sources, call, call.request,
      call.request.subject, call.response, call.response.events, call.response.events[0]]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    // Engine Dates retain their normal mutable API. The call record uses
    // strings and therefore remains a faithful snapshot after Date mutation.
    const encoded = JSON.stringify(call);
    found.from.setTime(0);
    found.events[0]!.at.setTime(0);
    expect(JSON.stringify(call)).toBe(encoded);
  });

  it("uses native point-centre and standard-refraction conventions without shifting transit times", () => {
    const plain = sky.starEvents(star, observer, from, to, geometric);
    const refracted = sky.starEvents(star, observer, from, to);
    for (const kind of ["rise", "set"] as const) {
      expect(Math.abs(event(refracted, kind).altitude + 34 / 60)).toBeLessThan(1e-5);
    }
    expect(event(refracted, "rise").at.getTime()).toBeLessThan(event(plain, "rise").at.getTime());
    expect(event(refracted, "set").at.getTime()).toBeGreaterThan(event(plain, "set").at.getTime());
    for (const kind of ["upper-transit", "lower-transit"] as const) {
      expect(event(refracted, kind)).toEqual(event(plain, kind));
    }
    const explicit = sky.starEvents(star, observer, from, to, { ...geometric, maxSamples: Infinity });
    expect(explicit.provenance.request.options.maxSamples).toBe("unlimited");
  });

  it.each([60, -60])("retains circumpolar flags and both transits at latitude %s", (latitude) => {
    for (const sign of [1, -1]) {
      const polar = { ...star, id: `synthetic-polar-${sign}`, decDeg: Math.sign(latitude) * sign * 70 };
      const found = sky.starEvents(polar, { latitude, longitude: 0 }, from, to, geometric);
      expect(found.status).toBe("complete");
      expect(found.flags).toEqual([sign === 1 ? "never-sets" : "never-rises"]);
      expect(found.events.map(({ kind }) => kind).sort()).toEqual(["lower-transit", "upper-transit"]);
      expect(found.provenance.response.flags).toEqual(found.flags);
      for (const value of found.events) {
        const dec = starPositions({ utc: value.at }, [polar]).positions[0]!.decDeg;
        const expected = value.kind === "upper-transit" ? 90 - Math.abs(latitude - dec) : Math.abs(latitude + dec) - 90;
        expect(Math.abs(value.altitude - expected)).toBeLessThan(1e-5);
      }
    }
  });

  it("preserves whole-result refusal even when the budget runs out after some searches finish", () => {
    const complete = sky.starEvents(star, observer, from, to, geometric);
    for (const maxSamples of [1, complete.samples - 1]) {
      const refused = sky.starEvents(star, observer, from, to, { ...geometric, maxSamples });
      expect(refused.status).toBe("refused");
      if (refused.status !== "refused") throw new Error("Expected whole-result refusal");
      expect(refused.reason).toBe("sample-budget");
      expect(refused.events).toEqual([]);
      expect(refused.flags).toEqual([]);
      // Preserve the engine's accounting: its coarse crossing search can
      // refuse before evaluating a sample when the remaining budget is small.
      expect(refused.samples).toBeLessThanOrEqual(maxSamples);
      expect(refused.provenance.request.options.maxSamples).toBe(maxSamples);
      expect(refused.provenance.response).toEqual({ status: "refused", reason: "sample-budget",
        samples: refused.samples, flags: [], events: [] });
    }
    const enough = sky.starEvents(star, observer, from, to, { ...geometric, maxSamples: complete.samples });
    expect(enough.status).toBe("complete");
    expect(enough.events).toEqual(complete.events);
  });

  it("keeps never-sets local to a short window even for a star that rises and sets that day", () => {
    const daily = sky.starEvents(star, observer, from, to, geometric);
    const transit = event(daily, "upper-transit").at.getTime();
    const short = sky.starEvents(star, observer, transit - 1000, transit + 1000, geometric);
    expect(short.status).toBe("complete");
    expect(short.flags).toEqual(["never-sets"]);
    expect(short.events.map(({ kind }) => kind)).toEqual(["upper-transit"]);
    expect(daily.events.some(({ kind }) => kind === "rise")).toBe(true);
    expect(daily.events.some(({ kind }) => kind === "set")).toBe(true);
  });

  it("retains reference-span flags on complete and refused searches without adding circumpolar flags on refusal", () => {
    for (const maxSamples of [Infinity, 1]) {
      const found = sky.starEvents(star, observer, "1750-03-20", "1750-03-21", { ...geometric, maxSamples });
      expect(found.flags).toEqual(["outside-reference-span"]);
      expect(found.provenance.response.flags).toEqual(found.flags);
      expect(found.status).toBe(maxSamples === 1 ? "refused" : "complete");
    }
  });

  it("keeps available motion and caller input separate from the recorded astrometry", () => {
    const input = { ...catalog.find((value) => value.properMotion !== null)!,
      properMotion: { ...catalog.find((value) => value.properMotion !== null)!.properMotion! } };
    const before = structuredClone(input);
    const place = { ...observer };
    const options = { ...geometric, maxSamples: 1 };
    const begin = new Date(from);
    const end = new Date(to);
    const found = sky.starEvents(input, place, begin, end, options);
    expect(input).toEqual(before);
    for (const value of [input, input.properMotion, place, options, begin, end]) expect(Object.isFrozen(value)).toBe(false);
    const subject = found.provenance.request.subject;
    expect(subject.kind).toBe("star");
    if (subject.kind !== "star") throw new Error("Expected a star subject");
    expect(subject.star.properMotion).toEqual(before.properMotion);
    const encoded = JSON.stringify(found.provenance);
    input.raDeg = 180;
    input.properMotion.decMasPerYear += 100;
    place.longitude = 90;
    begin.setTime(0);
    expect(JSON.stringify(found.provenance)).toBe(encoded);
  });
});

describe("prepared native body calls and validation", () => {
  it("retains the full native body result and labels its call record separately", () => {
    for (const body of ["Sun", "Moon", "Pluto"] as const) {
      for (const options of [undefined, { maxSamples: 1 }, geometric] as (SkyOptions | undefined)[]) {
        const found = sky.bodyEvents(body, observer, from, to, options);
        expect(found.sky).toEqual(skyEvents(body, observer, from, to, options));
        expect(found.provenance.request.subject).toEqual({ kind: "body", body });
        expect(found.provenance.request.options).toEqual({ ...found.sky.conventions,
          maxSamples: options?.maxSamples ?? "unlimited" });
        expect(found.provenance.response.status).toBe(found.sky.status);
        expect(found.provenance.response.samples).toBe(found.sky.samples);
        expect(found.provenance.stellarConventions).toBeNull();
        expect(found.provenance.nativeReceipt).toBe(false);
        sky.starEvents(star, observer, from, to, geometric);
        expect(sky.bodyEvents(body, observer, from, to, options)).toEqual(found);
      }
    }
  });

  it.each([
    { limb: "upper" }, { limb: "lower" }, { refraction: "unexpected" }, { maxSamples: 0 },
    { maxSamples: -1 }, { maxSamples: 0.5 }, { maxSamples: NaN }, { maxSamples: null },
    { deltaT: 64 }, { timeScale: "tt" }, { typo: true }, null
  ])("refuses invalid or unsupported options %j with native validation", (options) => {
    expect(() => sky.starEvents(star, observer, from, to, options as SkyOptions)).toThrow(RangeError);
    expect(sky.bodyEvents("Pluto", observer, from, to, geometric).sky).toEqual(skyEvents("Pluto", observer, from, to, geometric));
  });

  it("refuses accessor options, invalid astrometry, observer and clock inputs, then recovers", () => {
    const options = Object.defineProperty({}, "maxSamples", { get() { throw new Error("must not execute"); } });
    expect(() => sky.starEvents(star, observer, from, to, options)).toThrow(/only data properties/u);
    expect(() => sky.starEvents({ ...star, frame: "icrs" } as unknown as CatalogStar, observer, from, to)).toThrow(RangeError);
    expect(() => sky.starEvents(star, { ...observer, height: 100_001 }, from, to)).toThrow(RangeError);
    expect(() => sky.starEvents(star, observer, to, from)).toThrow(RangeError);
    expect(() => sky.starEvents(star, observer, from, from)).toThrow(RangeError);
    expect(() => sky.starEvents(star, observer, "2000-02-30", to)).toThrow(RangeError);
    expect(() => sky.starEvents(star, observer, "5000-01-01", "5000-01-02")).toThrow(RangeError);
    expect(() => sky.bodyEvents("North Node" as never, observer, from, to)).toThrow(RangeError);
    expect(sky.starEvents(star, observer, from, to, geometric).status).toBe("complete");
  });
});
