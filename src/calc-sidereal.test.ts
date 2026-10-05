import { readFileSync } from "node:fs";

import { AstroTime } from "astronomy-engine";
import { describe, expect, it } from "vitest";

import { AYANAMSA_BASIS, AYANAMSA_BOUNDS, NEAR_SUN_DEGREES, addBounds, ayanamsaBound } from "./calc-ayanamsa.js";
import { CALC_AYANAMSAS, CALC_FRAMES, calc, chart, events, houses } from "./calc.js";
import type {
  CalcAyanamsa,
  CalcBody,
  CalcPosition,
  CalcRefusal,
  CalcRequest,
  CalcUserAyanamsa,
  CalcZodiac,
  HousesResult
} from "./calc.js";
import { HOUSE_SYSTEMS } from "./houses.js";
import { natalChart } from "./index.js";
import { timeBasis } from "./time-scale.js";
import type { HouseSystem } from "./types.js";
import { AYANAMSAS, ayanamsa, siderealChart, siderealLongitude, userAyanamsa } from "./vedic.js";
import type { AyanamsaDefinition } from "./vedic.js";
import { ayanamsaAt } from "./vedic/ayanamsa.js";

const DEG = Math.PI / 180;
const J2000_MS = Date.UTC(2000, 0, 1, 12);
/** Synthetic instants across the span, with the leap second of 2016 and the span's last minutes. */
const INSTANTS = [
  "1800-01-01T00:00:00Z",
  "1851-03-14T04:37:00Z",
  "1969-07-20T20:17:00Z",
  "2000-01-01T12:00:00Z",
  "2016-12-31T23:59:30Z",
  "2024-04-08T18:21:30.250Z",
  "2199-12-31T23:57:00Z"
];
const PLACE = { latitude: 48.25, longitude: 2.5 };

/** The bodies positions() gives, and the points calc adds. */
const BODIES: CalcBody[] = [
  "Sun", "Moon", "Mercury", "Venus", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune", "Pluto",
  "North Node", "South Node", "Mean Node", "Mean South Node", "Black Moon Lilith"
];

/** Callers' ayanamsas in calc's JSON, each with the userAyanamsa it stands for. */
const USERS: { readonly calc: CalcUserAyanamsa; readonly vedic: AyanamsaDefinition }[] = [
  {
    calc: { name: "user-engine", epoch: { jd: 2_433_282.5, scale: "TT" }, value: 23.15 },
    vedic: userAyanamsa({ name: "user-engine", epoch: { julianDateTT: 2_433_282.5 }, value: 23.15 })
  },
  {
    calc: { name: "user-newcomb", epoch: { jd: 2_415_020, scale: "TT" }, value: 22.46, model: "newcomb" },
    vedic: userAyanamsa({ name: "user-newcomb", epoch: { julianDateTT: 2_415_020 }, value: 22.46, model: "newcomb" })
  },
  {
    calc: { epoch: "1956-03-21T00:00:00Z", value: 23.25, model: "iau1976" },
    vedic: userAyanamsa({ epoch: "1956-03-21T00:00:00Z", value: 23.25, model: "iau1976" })
  },
  {
    calc: { name: "user-linear", epoch: { jd: 2_451_545, scale: "TT" }, value: 23.9, rate: 50.29 },
    vedic: userAyanamsa({ name: "user-linear", epoch: { julianDateTT: 2_451_545 }, value: 23.9, rate: 50.29 })
  }
];

/** Every zodiac tested, with the definition it should subtract. */
const ZODIACS: { readonly zodiac: CalcZodiac; readonly definition: AyanamsaDefinition }[] = [
  ...CALC_AYANAMSAS.map((name) => ({ zodiac: { sidereal: name }, definition: AYANAMSAS[name] })),
  ...USERS.map((user) => ({ zodiac: { sidereal: user.calc }, definition: user.vedic }))
];

function ok<T extends { status: string }>(result: T | CalcRefusal): Exclude<T, CalcRefusal> {
  if (result.status !== "ok") throw new Error(`refused: ${JSON.stringify(result)}`);
  return result as Exclude<T, CalcRefusal>;
}

function refused(result: { status: string }): CalcRefusal {
  if (result.status !== "refused") throw new Error(`expected a refusal: ${JSON.stringify(result).slice(0, 200)}`);
  return result as CalcRefusal;
}

/** The true ayanamsa siderealLongitude subtracts at an instant on UTC. */
const trueAt = (definition: AyanamsaDefinition, iso: string) => ayanamsa(definition, iso);

describe("the sidereal zodiac in calc()", () => {
  it.each(INSTANTS)("gives siderealLongitude()'s longitude to the bit, for every body and ayanamsa, at %s", (iso) => {
    for (const { zodiac, definition } of ZODIACS) {
      const value = trueAt(definition, iso);
      for (const body of BODIES) {
        const tropical = ok(calc({ body, time: iso }));
        const sidereal = ok(calc({ body, time: iso, zodiac }));
        expect(sidereal.lon, `${body} ${definition.name}`).toBe(siderealLongitude(tropical.lon, value).lon);
        expect(sidereal.lat).toBe(tropical.lat);
        expect(sidereal.dist).toBe(tropical.dist);
        expect(sidereal.ayanamsa).toMatchObject({ name: definition.name, value: value.true });
      }
    }
  });

  it.each(INSTANTS)("gives siderealChart()'s bodies to the bit at %s", (iso) => {
    const natal = natalChart({ utc: iso, ...PLACE, houseSystem: "placidus" });
    for (const { zodiac, definition } of ZODIACS) {
      for (const row of siderealChart(natal, definition).bodies) {
        expect(ok(calc({ body: row.body, time: iso, zodiac })).lon, `${row.body} ${definition.name}`).toBe(row.lon);
      }
    }
  });

  it("counts the same longitude in the mean ecliptic of date, less the mean ayanamsa", () => {
    for (const iso of INSTANTS) {
      for (const { zodiac, definition } of ZODIACS) {
        for (const body of ["Sun", "Moon", "Mars", "Mean Node", "Black Moon Lilith"] as const) {
          const onTrue = ok(calc({ body, time: iso, zodiac }));
          const onMean = ok(calc({ body, time: iso, zodiac, frame: "ecliptic-mean-of-date" }));
          const gap = ((onMean.lon - onTrue.lon + 540) % 360) - 180;
          expect(Math.abs(gap) * 3600, `${body} ${definition.name} ${iso}`).toBeLessThan(1e-6);
          expect(Math.abs(onMean.lat - onTrue.lat) * 3600).toBeLessThan(1e-6);
          expect(onMean.ayanamsa!.value).toBe(trueAt(definition, iso).mean);
        }
      }
    }
  });

  it("gives every center the same ayanamsa, and the longitude in radians with radians", () => {
    const iso = INSTANTS[3]!;
    const zodiac = { sidereal: "lahiri" } as const;
    const value = trueAt(AYANAMSAS.lahiri, iso);
    for (const center of ["geocentric", "heliocentric", "barycentric", { topocentric: PLACE }] as const) {
      const tropical = ok(calc({ body: "Mars", time: iso, center }));
      const sidereal = ok(calc({ body: "Mars", time: iso, center, zodiac }));
      expect(sidereal.lon).toBe(siderealLongitude(tropical.lon, value).lon);
    }
    const degrees = ok(calc({ body: "Moon", time: iso, zodiac }));
    const radians = ok(calc({ body: "Moon", time: iso, zodiac, flags: { units: "radians" } }));
    expect(radians.lon).toBe(degrees.lon * DEG);
    expect(radians.ayanamsa!.value).toBe(degrees.ayanamsa!.value * DEG);
    expect(radians.speeds!.lon).toBe(degrees.speeds!.lon * DEG);
  });

  it("turns the cartesian position and velocity with the longitude", () => {
    for (const iso of INSTANTS.slice(1, -1)) {
      for (const { zodiac } of ZODIACS) {
        for (const frame of ["ecliptic-true-of-date", "ecliptic-mean-of-date"] as const) {
          const flags = { cartesian: true } as const;
          const tropical = ok(calc({ body: "Venus", time: iso, frame, flags }));
          const sidereal = ok(calc({ body: "Venus", time: iso, frame, flags, zodiac }));
          const { x, y, z, vx, vy, vz } = sidereal.cartesian!;
          const lon = ((Math.atan2(y, x) / DEG) % 360 + 360) % 360;
          expect(Math.abs(((lon - sidereal.lon + 540) % 360) - 180) * 3600).toBeLessThan(1e-6);
          expect(z).toBe(tropical.cartesian!.z);
          expect(Math.hypot(x, y)).toBeCloseTo(Math.hypot(tropical.cartesian!.x, tropical.cartesian!.y), 14);
          // The velocity is the turned vector's rate: its longitude rate is the sidereal speed.
          const rate = ((x * vy! - y * vx!) / (x * x + y * y)) / DEG;
          expect(Math.abs(rate - sidereal.speeds!.lon) * 3600).toBeLessThan(1e-3);
          expect(vz).toBe(tropical.cartesian!.vz);
        }
      }
    }
  });

  it("gives the sidereal longitude's speed: the tropical speed less the ayanamsa's rate", () => {
    const h = 0.001;
    for (const iso of INSTANTS.slice(1, -1)) {
      for (const { zodiac, definition } of ZODIACS) {
        const ms = Date.parse(iso);
        const before = trueAt(definition, new Date(ms - h * 86_400_000).toISOString()).true;
        const after = trueAt(definition, new Date(ms + h * 86_400_000).toISOString()).true;
        for (const body of ["Sun", "Moon", "Saturn", "North Node", "Mean Node"] as const) {
          const step = body === "North Node" ? 0.25 : h;
          const tropical = ok(calc({ body, time: iso }));
          const sidereal = ok(calc({ body, time: iso, zodiac }));
          if (step === h && iso !== "2016-12-31T23:59:30Z") {
            const rate = (after - before) / (2 * h);
            expect(Math.abs(sidereal.speeds!.lon - (tropical.speeds!.lon - rate)) * 3600, `${body} ${definition.name}`).toBeLessThan(1e-6);
          }
          expect(sidereal.speeds!.lat).toBe(tropical.speeds!.lat);
          expect(sidereal.bounds.speed!.stepDays).toBe(step);
        }
      }
    }
  });

  it("adds the ayanamsa's bounds to the position's and the speed's, and leaves the distance's", () => {
    for (const iso of INSTANTS) {
      for (const { zodiac, definition } of ZODIACS) {
        for (const body of ["Sun", "Moon", "Pluto", "Mean Node"] as const) {
          const tropical = ok(calc({ body, time: iso }));
          const sidereal = ok(calc({ body, time: iso, zodiac }));
          const at = AstroTime.FromTerrestrialTime(sidereal.receipt.instants[0]!.jdTt - 2_451_545);
          const added = ayanamsaBound(definition, ayanamsaAt(definition, at).elongation);
          expect(sidereal.ayanamsa!.bound).toEqual({ value: added.position, unit: "arcsec", label: "measured", basis: AYANAMSA_BASIS });
          expect(sidereal.bounds.position.value).toBe(addBounds(tropical.bounds.position.value!, added.position));
          expect(sidereal.bounds.position.label).toBe(tropical.bounds.position.label);
          expect(sidereal.bounds.position.basis).toContain(AYANAMSA_BASIS);
          expect(sidereal.bounds.speed!.value).toBe(addBounds(tropical.bounds.speed!.value!, added.rate));
          expect(sidereal.bounds.distance).toEqual(tropical.bounds.distance);
        }
      }
    }
    // An unmeasured speed stays unmeasured.
    const node = ok(calc({ body: "North Node", time: INSTANTS[3]!, zodiac: { sidereal: "lahiri" } }));
    expect(node.bounds.speed!.value).toBeNull();
  });

  it("take a star definition's larger bound when its star is within a degree of the Sun", () => {
    // δ Cnc, True Pushya's star, passed 0.08° from the Sun on 2000-07-31 (TT about 15:01 UTC).
    const zodiac = { sidereal: "true-pushya" } as const;
    const near = ok(calc({ body: "Moon", time: "2000-07-31T15:00:00Z", zodiac }));
    const far = ok(calc({ body: "Moon", time: "2001-01-31T15:00:00Z", zodiac }));
    expect(near.ayanamsa!.bound.value).toBe(0.022);
    expect(far.ayanamsa!.bound.value).toBe(0.0011);
    expect(near.bounds.speed!.value).toBe(addBounds(1.1, 0.4));
    expect(far.bounds.speed!.value).toBe(addBounds(1.1, 0.00039));
    expect(ok(calc({ body: "Moon", time: "2000-07-31T15:00:00Z", zodiac: { sidereal: "lahiri" } })).ayanamsa!.bound.value).toBe(4.4e-7);
    const houses_ = ok(houses({ time: "2000-07-31T15:00:00Z", place: PLACE, zodiac })) as HousesResult;
    expect(houses_.ayanamsa!.bound.value).toBe(0.022);
    expect(houses_.bounds.angles.value).toBe(addBounds(0.02, 0.022));
  });

  it("names the zodiac and the ayanamsa in the receipt, and repeats itself from it", () => {
    for (const { zodiac, definition } of ZODIACS) {
      const result = ok(calc({ body: "Jupiter", time: INSTANTS[2]!, zodiac }));
      const ids = result.receipt.conventions;
      expect(ids[0]).toBe("zodiac:sidereal");
      expect(ids[1]).toBe(definition.source === "caller-defined" ? `ayanamsa:user-${definition.kind}` : `ayanamsa:${definition.name}`);
      expect(ids).not.toContain("zodiac:tropical");
      expect(JSON.parse(JSON.stringify(calc(result.receipt.request)))).toEqual(JSON.parse(JSON.stringify(result)));
    }
    const tropical = ok(calc({ body: "Jupiter", time: INSTANTS[2]! }));
    expect(tropical.ayanamsa).toBeNull();
    expect(tropical.receipt.request.zodiac).toBe("tropical");
    expect(tropical.receipt.conventions[0]).toBe("zodiac:tropical");
  });
});

describe("a caller's ayanamsa", () => {
  it("records every default, and reads its epoch as an instant is read", () => {
    const iso = INSTANTS[3]!;
    const plain = ok(calc({ body: "Sun", time: iso, zodiac: { sidereal: { epoch: { jd: 2_451_545, scale: "TT" }, value: 23.85 } } }));
    expect(plain.receipt.request.zodiac).toEqual({
      sidereal: { name: "user", epoch: { jd: 2_451_545, scale: "TT" }, value: 23.85, model: "engine" }
    });
    expect(plain.ayanamsa!.name).toBe("user");
    // UT1 and UTC epochs take their TT from the time basis, as userAyanamsa's ISO epoch does.
    for (const epoch of [{ jd: 2_435_553.5, scale: "UT1" }, { jd: 2_435_553.5, scale: "UTC" }, { iso: "1956-03-21T00:00:00Z" }] as const) {
      const scale = "scale" in epoch ? (epoch.scale === "UT1" ? "ut1" : "utc") : "utc";
      const ms = "jd" in epoch ? J2000_MS + (epoch.jd - 2_451_545) * 86_400_000 : Date.parse(epoch.iso);
      const tt = 2_451_545 + timeBasis(ms, scale).ttDays;
      const definition = userAyanamsa({ epoch: { julianDateTT: tt }, value: 23.25, model: "iau1976" });
      const result = ok(calc({ body: "Moon", time: iso, zodiac: { sidereal: { epoch, value: 23.25, model: "iau1976" } } }));
      expect(result.lon).toBe(siderealLongitude(ok(calc({ body: "Moon", time: iso })).lon, ayanamsa(definition, iso)).lon);
    }
  });

  it("stated as Lahiri's own epoch, value and model, is Lahiri to the bit", () => {
    const lahiri = AYANAMSAS.lahiri as AyanamsaDefinition & { epochTT: number; value: number; model: "iau1976" };
    const user = { epoch: { jd: lahiri.epochTT, scale: "TT" }, value: lahiri.value, model: lahiri.model } as const;
    for (const iso of INSTANTS) {
      for (const body of BODIES) {
        expect(ok(calc({ body, time: iso, zodiac: { sidereal: user } })).lon).toBe(ok(calc({ body, time: iso, zodiac: { sidereal: "lahiri" } })).lon);
      }
    }
  });

  it.each([
    ["a built-in name", { name: "lahiri", epoch: { jd: 2_451_545, scale: "TT" }, value: 23 }],
    ["a name in capitals", { name: "Mine", epoch: { jd: 2_451_545, scale: "TT" }, value: 23 }],
    ["a name that is not a string", { name: 7, epoch: { jd: 2_451_545, scale: "TT" }, value: 23 }],
    ["both a rate and a model", { epoch: { jd: 2_451_545, scale: "TT" }, value: 23, rate: 50, model: "engine" }],
    ["a value out of range", { epoch: { jd: 2_451_545, scale: "TT" }, value: 361 }],
    ["a rate out of range", { epoch: { jd: 2_451_545, scale: "TT" }, value: 23, rate: 3601 }],
    ["an unknown model", { epoch: { jd: 2_451_545, scale: "TT" }, value: 23, model: "iau2000" }],
    ["no epoch", { value: 23 }],
    ["an unknown field", { epoch: { jd: 2_451_545, scale: "TT" }, value: 23, ayanamsa: "lahiri" }],
    ["a TT epoch beyond any date", { epoch: { jd: 1e300, scale: "TT" }, value: 23 }],
    ["a UTC epoch beyond any date", { epoch: { jd: 1e12, scale: "UTC" }, value: 23 }],
    ["an epoch without a scale", { epoch: { jd: 2_451_545 }, value: 23 }]
  ])("is malformed with %s, and throws RangeError", (_, sidereal) => {
    expect(() => calc({ body: "Sun", time: INSTANTS[3]!, zodiac: { sidereal } as never })).toThrow(RangeError);
  });

  it("is refused out of range when it holds its value at an epoch outside the span; a rate is not", () => {
    const old = { epoch: { jd: 2_000_000.5, scale: "TT" }, value: 18 } as const;
    const zodiac = { sidereal: old };
    const time = INSTANTS[3]!;
    for (const result of [
      calc({ body: "Sun", time, zodiac }),
      houses({ time, place: PLACE, zodiac }),
      events({ kind: "longitude-crossing", body: "Sun", longitude: 0, from: time, to: "2000-02-01", zodiac }),
      chart({ time, zodiac })
    ]) {
      expect(refused(result)).toMatchObject({ reason: "out-of-range" });
      expect(refused(result).detail).toContain("epoch");
    }
    ok(calc({ body: "Sun", time, zodiac: { sidereal: { ...old, rate: 50 } } }));
    ok(calc({ body: "Sun", time, zodiac: { sidereal: "raman" } })); // its epoch is in 397
  });
});

describe("refusals in the sidereal zodiac", () => {
  const time = INSTANTS[3]!;
  const zodiac = { sidereal: "fagan-bradley" } as const;

  it("refuse every frame outside the ecliptic of date", () => {
    for (const frame of CALC_FRAMES) {
      const result = calc({ body: "Mars", time, frame, zodiac });
      if (frame === "ecliptic-true-of-date" || frame === "ecliptic-mean-of-date") ok(result);
      else expect(refused(result), frame).toMatchObject({ reason: "unsupported-combination" });
    }
  });

  it("keep their order: deflection, then the combinations, then the span", () => {
    expect(refused(calc({ body: "Mars", time, frame: "equatorial-j2000", zodiac, flags: { deflection: true } })).reason).toBe("not-in-this-version");
    expect(refused(calc({ body: "Earth", time, frame: "equatorial-j2000", zodiac })).detail).toContain("Earth");
    expect(refused(calc({ body: "Mars", time: "2300-01-01", frame: "equatorial-j2000", zodiac })).reason).toBe("unsupported-combination");
    expect(refused(calc({ body: "Mars", time: "2300-01-01", zodiac })).reason).toBe("out-of-range");
  });

  it("throw RangeError for an unknown ayanamsa, as for any malformed field", () => {
    for (const sidereal of ["lahiri-1940", "", 7, null, undefined]) {
      expect(() => calc({ body: "Sun", time, zodiac: { sidereal } as never })).toThrow(RangeError);
    }
    expect(() => calc({ body: "Sun", time, zodiac: "sidereal" as never })).toThrow(RangeError);
  });
});

describe("the sidereal zodiac in houses()", () => {
  const systems = HOUSE_SYSTEMS as readonly HouseSystem[];

  it("gives siderealChart()'s ascendant, midheaven and cusps to the bit, for every system", () => {
    for (const iso of INSTANTS) {
      for (const place of [PLACE, { latitude: 70.5, longitude: 25 }, { latitude: -33.9, longitude: 151.2 }]) {
        for (const system of systems) {
          const natal = natalChart({ utc: iso, ...place, houseSystem: system });
          for (const { zodiac, definition } of ZODIACS.filter((_, k) => k % 3 === 0)) {
            const expected = siderealChart(natal, definition);
            const result = ok(houses({ time: iso, place, system, zodiac })) as HousesResult;
            expect(result.angles.asc, `${system} ${definition.name}`).toBe(expected.ascendant!.lon);
            expect(result.angles.mc).toBe(expected.midheaven!.lon);
            expect(result.system).toBe(expected.houseSystem);
            expect(result.cusps).toEqual(expected.cusps!.map((cusp) => cusp.lon));
          }
        }
      }
    }
  });

  it("turns the descendant, IC, Vertex and East Point with them, and leaves the ARMC and obliquity", () => {
    for (const iso of INSTANTS) {
      for (const { zodiac, definition } of ZODIACS) {
        const tropical = ok(houses({ time: iso, place: PLACE, system: "koch" })) as HousesResult;
        const sidereal = ok(houses({ time: iso, place: PLACE, system: "koch", zodiac })) as HousesResult;
        const value = trueAt(definition, iso);
        const turn = (lon: number) => siderealLongitude(lon, value).lon;
        expect(sidereal.angles).toEqual({ asc: turn(tropical.angles.asc), mc: turn(tropical.angles.mc), dsc: turn(tropical.angles.dsc), ic: turn(tropical.angles.ic) });
        expect(sidereal.vertex).toBe(turn(tropical.vertex));
        expect(sidereal.eastPoint).toBe(turn(tropical.eastPoint));
        expect(sidereal.cusps).toEqual(tropical.cusps.map(turn));
        expect(sidereal.armc).toBe(tropical.armc);
        expect(sidereal.obliquity).toBe(tropical.obliquity);
        expect(sidereal.ayanamsa).toMatchObject({ name: definition.name, value: value.true });
        const added = ayanamsaBound(definition, ayanamsaAt(definition, AstroTime.FromTerrestrialTime(sidereal.receipt.instants[0]!.jdTt - 2_451_545)).elongation).position;
        expect(sidereal.bounds.angles.value).toBe(addBounds(0.02, added));
        expect(sidereal.bounds.cusps.value).toBe(addBounds(0.08, added));
        expect(sidereal.receipt.conventions[0]).toBe("zodiac:sidereal");
        expect(sidereal.receipt.conventions[1]).toMatch(/^ayanamsa:/);
        expect(JSON.parse(JSON.stringify(houses(sidereal.receipt.request)))).toEqual(JSON.parse(JSON.stringify(sidereal)));
      }
    }
    expect((ok(houses({ time: INSTANTS[3]!, place: PLACE })) as HousesResult).ayanamsa).toBeNull();
  });
});

describe("the sidereal zodiac in events()", () => {
  /** Every sign change of the sidereal longitude less `target`, found by a dense scan of calc(). */
  function scan(body: CalcBody, target: number, zodiac: CalcZodiac, from: string, to: string, stepHours: number): number[] {
    const found: number[] = [];
    const t0 = Date.parse(from);
    const t1 = Date.parse(to);
    const gap = (ms: number) =>
      ((ok(calc({ body, time: new Date(ms).toISOString(), zodiac, flags: { speeds: false } })).lon - target + 540) % 360) - 180;
    let ms = t0;
    let previous = gap(ms);
    while (ms < t1) {
      const next = Math.min(t1, ms + stepHours * 3_600_000);
      const current = gap(next);
      // A crossing, not the wrap 180° away.
      if (previous !== 0 && Math.sign(current) !== Math.sign(previous) && Math.abs(current - previous) < 90) {
        let [a, b, ga] = [ms, next, previous];
        while (b - a > 1) {
          const mid = Math.floor((a + b) / 2);
          const gm = gap(mid);
          if (Math.sign(gm) === Math.sign(ga)) [a, ga] = [mid, gm];
          else b = mid;
        }
        found.push(b);
      }
      ms = next;
      previous = current;
    }
    return found;
  }

  it.each([
    ["Sun", 0, "lahiri", "2026-01-01T00:00:00Z", "2027-01-01T00:00:00Z", 24],
    ["Moon", 106, "true-pushya", "2026-01-01T00:00:00Z", "2026-04-01T00:00:00Z", 2],
    // Through Mercury's retrograde loop of November 2025, three times.
    ["Mercury", 215, "fagan-bradley", "2025-01-01T00:00:00Z", "2026-07-01T00:00:00Z", 12],
    ["Mars", 15, "galactic-center", "1900-01-01T00:00:00Z", "1903-01-01T00:00:00Z", 24]
  ] as const)("finds every crossing of %s at sidereal %i° (%s) that a dense scan finds", (body, longitude, name, from, to, stepHours) => {
    const zodiac = { sidereal: name as CalcAyanamsa };
    const result = ok(events({ kind: "longitude-crossing", body, longitude, from, to, zodiac, stepDays: 1 }));
    const expected = scan(body, longitude, zodiac, from, to, stepHours);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events.map((event) => Date.parse(event.at))).toHaveLength(expected.length);
    // The search's bracket, and half a millisecond for the instant's rounding.
    const slackMs = result.bounds.timing.value! * 1000 + 0.5;
    result.events.forEach((event, k) => {
      expect(Math.abs(Date.parse(event.at) - expected[k]!), `${body} ${event.at}`).toBeLessThanOrEqual(slackMs + 1);
      const there = ok(calc({ body, time: event.at, zodiac }));
      const residual = Math.abs(((there.lon - longitude + 540) % 360) - 180) * 3600;
      expect(residual).toBeLessThanOrEqual(Math.abs(there.speeds!.lon) * 3600 * (slackMs / 86_400_000) + 1e-9);
    });
    expect(result.receipt.request.zodiac).toEqual(zodiac);
    expect(result.receipt.conventions.slice(0, 2)).toEqual(["zodiac:sidereal", `ayanamsa:${name}`]);
    expect(result.bounds.timing.basis).toContain("ayanamsa");
  });

  it("finds a retrograde planet's crossings in both directions", () => {
    const zodiac = { sidereal: "krishnamurti" } as const;
    const result = ok(events({ kind: "longitude-crossing", body: "Mercury", longitude: 215, from: "2025-10-01T00:00:00Z", to: "2026-01-01T00:00:00Z", zodiac }));
    expect(result.events.map((event) => event.retrograde)).toEqual([false, true, false]);
  });
});

describe("the sidereal zodiac in chart()", () => {
  it("adds siderealChart()'s longitudes beside natalChart()'s chart", () => {
    for (const iso of INSTANTS) {
      for (const { zodiac, definition } of ZODIACS) {
        for (const settings of [{ place: PLACE, houseSystem: "placidus" }, { place: PLACE }, {}, { place: { latitude: 78.2, longitude: 15.6 }, houseSystem: "koch" }] as const) {
          const result = ok(chart({ time: iso, zodiac, ...settings }));
          const natal = natalChart({ utc: iso, ...("place" in settings ? settings.place : {}), ...("houseSystem" in settings ? { houseSystem: settings.houseSystem } : {}) });
          const expected = siderealChart(natal, definition);
          expect(result.chart).toEqual(ok(chart({ time: iso, ...settings })).chart);
          expect(result.sidereal).toEqual({
            ayanamsa: { name: definition.name, mean: expected.ayanamsaValue.mean, nutation: expected.ayanamsaValue.nutation, true: expected.ayanamsaValue.true },
            bodies: expected.bodies.map(({ body, lon }) => ({ body, lon })),
            ascendant: expected.ascendant && expected.ascendant.lon,
            midheaven: expected.midheaven && expected.midheaven.lon,
            houseSystem: expected.houseSystem,
            cusps: expected.cusps && expected.cusps.map((cusp) => cusp.lon)
          });
          expect(result.receipt.request.zodiac).toEqual(ok(calc({ body: "Sun", time: iso, zodiac })).receipt.request.zodiac);
          expect(JSON.parse(JSON.stringify(chart(result.receipt.request)))).toEqual(JSON.parse(JSON.stringify(result)));
        }
      }
    }
    expect(ok(chart({ time: INSTANTS[3]! })).sidereal).toBeNull();
  });
});

describe("the ayanamsa's bounds", () => {
  /** Written by docs/evidence/calc-sidereal-2026-10-05/tools/ayanamsa_rates.py from ERFA; see there. */
  interface Row {
    readonly kind: "epoch" | "user" | "linear" | "star";
    readonly name: string;
    readonly jd: number;
    readonly mean: number;
    readonly rate: number;
    readonly epoch?: number;
    readonly value?: number;
    readonly model?: "engine" | "newcomb" | "iau1976";
  }
  const { rows } = JSON.parse(readFileSync(new URL("./fixtures/ayanamsa-rates.json", import.meta.url), "utf8")) as { rows: Row[] };
  const users = new Map<string, AyanamsaDefinition>();
  const definitionOf = (row: Row): AyanamsaDefinition => {
    if (row.kind !== "user") return AYANAMSAS[row.name as CalcAyanamsa];
    if (!users.has(row.name)) users.set(row.name, userAyanamsa({ name: row.name, epoch: { julianDateTT: row.epoch! }, value: row.value!, model: row.model! }));
    return users.get(row.name)!;
  };
  const STEP = 0.001;
  const at = (jd: number) => AstroTime.FromTerrestrialTime(jd - 2_451_545);
  /** Each band's largest difference of the mean ayanamsa (arcseconds) and of its rate (arcseconds a day), by the engine's own angle from the Sun. */
  const largest = { epochOrLinear: [0, 0], star: [0, 0], starNearSun: [0, 0] } as Record<keyof typeof AYANAMSA_BOUNDS, [number, number]>;
  const counts = { epochOrLinear: 0, star: 0, starNearSun: 0 } as Record<keyof typeof AYANAMSA_BOUNDS, number>;
  for (const row of rows) {
    const definition = definitionOf(row);
    const now = ayanamsaAt(definition, at(row.jd));
    const rate = (ayanamsaAt(definition, at(row.jd + STEP)).mean - ayanamsaAt(definition, at(row.jd - STEP)).mean) / (2 * STEP);
    const band = definition.kind !== "star" ? "epochOrLinear" : now.elongation! >= NEAR_SUN_DEGREES ? "star" : "starNearSun";
    counts[band]++;
    largest[band] = [Math.max(largest[band][0], Math.abs(now.mean - row.mean) * 3600), Math.max(largest[band][1], Math.abs(rate - row.rate) * 3600)];
  }
  /** Rounded up to two significant figures, the rule of the calc entry's other measured bounds. */
  const up2 = (x: number) => {
    const unit = 10 ** (Math.floor(Math.log10(x)) - 1);
    return Number((Math.ceil(x / unit) * unit).toPrecision(2));
  };

  it("compare every built-in and caller's ayanamsa with ERFA, and a star's near the Sun", () => {
    expect(counts).toEqual({ epochOrLinear: 96, star: 741, starNearSun: 123 });
    expect(new Set(rows.map((row) => row.name))).toEqual(new Set([...CALC_AYANAMSAS, "user-engine-b1950", "user-newcomb-j1900", "user-iau1976-1956"]));
  });

  it.each(["epochOrLinear", "star", "starNearSun"] as const)("are %s's largest differences, rounded up to two significant figures", (band) => {
    expect(largest[band][0]).toBeLessThanOrEqual(AYANAMSA_BOUNDS[band].position);
    expect(largest[band][1]).toBeLessThanOrEqual(AYANAMSA_BOUNDS[band].rate);
    expect(up2(largest[band][0])).toBe(AYANAMSA_BOUNDS[band].position);
    expect(up2(largest[band][1])).toBe(AYANAMSA_BOUNDS[band].rate);
  });

  it("add in whole nanoarcseconds, rounded up", () => {
    expect(addBounds(3, 0.0011)).toBe(3.0011);
    expect(addBounds(0.0023, 4.4e-7)).toBe(0.00230044);
    expect(addBounds(0.18, 0.4)).toBe(0.58);
    expect(addBounds(0.0023, 1e-10)).toBe(0.002300001);
    expect(addBounds(8.3, 0.022)).toBe(8.322);
    expect(addBounds(0.00081, 6.4e-9)).toBe(0.000810007);
    expect(addBounds(25, 0.0011)).toBe(25.0011);
  });
});

describe("requests are as before in the tropical zodiac", () => {
  it("leave every tropical result as it was, with no ayanamsa", () => {
    for (const request of [
      { body: "Moon", time: INSTANTS[3]! },
      { body: "Moon", time: INSTANTS[3]!, zodiac: "tropical" }
    ] as CalcRequest[]) {
      const result = ok(calc(request)) as CalcPosition;
      expect(result.ayanamsa).toBeNull();
      expect(result.receipt.request.zodiac).toBe("tropical");
    }
  });
});
