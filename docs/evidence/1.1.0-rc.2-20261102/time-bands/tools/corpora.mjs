// The corpora, sites and input forms of the time bands' checks, as section 5
// of ../PREREGISTRATION.md fixes them: T0 (smoke only, never judged), T1
// (calc-api's 32 TT instants), T2 (64 UT1 instants), T3 (the seams, a
// millisecond either side) and E (the event windows); the sites S1 to S7; and
// the forms F1 to F5, each derived from the anchor's own record. No random
// numbers are drawn. Run directly, it prints each corpus's size and the
// SHA-256 of its JSON text, and writes them to [out.json].
//
//   node corpora.mjs [out.json]
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** The synthetic sites: geodetic latitude and east longitude, degrees, and height, m. */
export const SITES = Object.freeze({
  S1: { latitude: 45, longitude: 10, height: 0 },
  S2: { latitude: -35, longitude: -60, height: 1500 },
  S3: { latitude: 60, longitude: 25, height: 0 },
  S4: { latitude: 0.5, longitude: 100, height: 0 },
  S5: { latitude: 66, longitude: -20, height: 0 },
  // The greatest height calc accepts (src/calc.ts), for topocentric positions only.
  S6: { latitude: 10, longitude: 30, height: 100_000 },
  // Inside the polar circle, where Placidus and Koch fall back.
  S7: { latitude: -70, longitude: 140, height: 0 }
});

const round6 = (x) => Math.round(x * 1e6) / 1e6;
const frac = (x) => x - Math.floor(x);

/** T0: one instant, for trying the tools; never judged. */
export const t0 = () => [{ id: "T0", anchor: "F3", time: { iso: "1999-06-15T06:00:00.000Z" } }];

/** T0's event window, the Sun's crossing of 84° in June 1999, for trying the event tools; never judged. */
export const e0 = () => [{ id: "E0", body: "Sun", longitude: 84, from: "1999-06-01T00:00:00.000Z", to: "1999-07-01T00:00:00.000Z" }];

/** T1: calc-api's TT Julian dates, k = 0 to 31, as its tools compute them (docs/evidence/calc-api/tools/engine_values.mjs). */
export function t1() {
  const phi = (Math.sqrt(5) - 1) / 2;
  return Array.from({ length: 32 }, (_, k) => ({ id: `T1-${k}`, anchor: "F1", time: { jd: round6(2378496.5 + 146097 * ((0.5 + k * phi) % 1)), scale: "tt" } }));
}

/** T2: 64 UT1 Julian dates, k = 0 to 63, with the reciprocal of the plastic number. */
export function t2() {
  return Array.from({ length: 64 }, (_, k) => ({
    id: `T2-${k}`,
    anchor: "F2",
    time: { jd: round6(2378497.5 + 146094 * frac(0.3 + k * 0.7548776662466927)), scale: "ut1" }
  }));
}

/** T3's seams, each on UTC at the instant and 1 ms either side. */
export const SEAMS = Object.freeze([
  "1940-12-31T18:00:00.000Z",
  "1956-01-01T12:00:00.000Z",
  "1972-01-01T00:00:00.000Z",
  "2017-01-01T00:00:00.000Z",
  "2026-09-24T00:00:00.000Z",
  "2027-06-28T00:00:00.000Z",
  "2027-10-02T00:00:00.000Z"
]);

export function t3() {
  return SEAMS.flatMap((iso) => [-1, 0, 1].map((offset) => ({
    id: `T3-${iso.slice(0, 10)}${offset < 0 ? "-1ms" : offset > 0 ? "+1ms" : ""}`,
    anchor: "F3",
    time: { iso: new Date(Date.parse(iso) + offset).toISOString() }
  })));
}

/** E: the event windows, each (from, to] on UTC; every event found is judged. */
export function e() {
  const windows = [];
  for (const year of [1801, 1900, 1950, 2000, 2050, 2150]) {
    windows.push({ id: `E-Sun-0-${year}`, body: "Sun", longitude: 0, from: `${year}-03-01T00:00:00.000Z`, to: `${year}-04-01T00:00:00.000Z` });
  }
  for (const [from, to] of [["1971-12-01", "1972-02-01"], ["2027-09-01", "2027-11-01"]]) {
    for (const longitude of [0, 90]) {
      windows.push({ id: `E-Moon-${longitude}-${from.slice(0, 7)}`, body: "Moon", longitude, from: `${from}T00:00:00.000Z`, to: `${to}T00:00:00.000Z` });
    }
  }
  windows.push({ id: "E-Sun-0-2050-lahiri", body: "Sun", longitude: 0, from: "2050-04-01T00:00:00.000Z", to: "2050-05-01T00:00:00.000Z", zodiac: { sidereal: "lahiri" } });
  return windows;
}

/**
 * The five input forms at an anchor, from its own record (a calc receipt's
 * instant): F1 TT input, F2 UT1 input, F3 UTC input to the millisecond, F4 UT1
 * input with ΔT pinned at the record's, F5 UTC input with the same pin. The
 * anchor's own form is the corpus time as given.
 */
export function forms(entry, instant) {
  const derived = {
    F1: { jd: instant.jdTt, scale: "tt" },
    F2: { jd: instant.jdUt1, scale: "ut1" },
    F3: { iso: instant.utc },
    F4: { jd: instant.jdUt1, scale: "ut1", deltaT: instant.deltaT.seconds },
    F5: { iso: instant.utc, deltaT: instant.deltaT.seconds }
  };
  return { ...derived, [entry.anchor]: entry.time };
}

export const CORPORA = Object.freeze({ T0: t0, E0: e0, T1: t1, T2: t2, T3: t3, E: e });

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const out = {};
  for (const [name, make] of Object.entries(CORPORA)) {
    const text = JSON.stringify(make());
    out[name] = { size: make().length, sha256: createHash("sha256").update(text).digest("hex") };
  }
  out.sites = { size: Object.keys(SITES).length, sha256: createHash("sha256").update(JSON.stringify(SITES)).digest("hex") };
  const text = `${JSON.stringify(out, null, 1)}\n`;
  if (process.argv[2]) writeFileSync(process.argv[2], text);
  process.stdout.write(text);
}
