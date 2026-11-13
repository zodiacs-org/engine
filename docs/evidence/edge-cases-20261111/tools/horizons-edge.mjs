#!/usr/bin/env node
/*
 * ZOD-97, tests P1, P2, P3, T4 and T5: the engine's geocentric apparent
 * ecliptic longitudes of date against JPL Horizons, after 2050, at the edge of
 * the span, and at the UTC instants the civil-time and polar cases settle on;
 * the refusals outside the span; and what the engine gives at polar latitudes.
 *
 *   npm run build
 *   node docs/evidence/edge-cases-20261111/tools/horizons-edge.mjs fetch    # asks Horizons, keeps every response
 *   node docs/evidence/edge-cases-20261111/tools/horizons-edge.mjs compare  # offline, from the kept responses
 *
 * fetch writes each response verbatim to ../horizons/<name>.txt and what was
 * asked (every parameter, the URL, the time, the SHA-256, the ephemeris the
 * response names) to ../horizons/queries.json. compare reads only those files
 * and the built dist/ and writes ../results/horizons-edge.json; it refuses a
 * kept response whose digest has changed.
 *
 * The arbiter for P1 is Horizons's observer table, geocentric (500@399),
 * quantity 31: the apparent ecliptic longitude and latitude of date, airless.
 * Horizons has no parameter that selects DE440; each response names the
 * ephemeris it used and that is recorded. Mars to Pluto are asked for as
 * system barycentres (4 to 9), as every committed comparison takes them.
 * Horizons's apparent place includes the Sun's light deflection and is on its
 * IAU 1976/1980 equinox of date; the engine's has no deflection and is on IAU
 * 2006/2000B. Both differences are inside what is measured here, not removed.
 *
 * Limits (ZOD-97 P1 and P2): 30 arcseconds for every body, 10 for the Sun.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const here = resolve(new URL("..", import.meta.url).pathname);
const root = resolve(here, "../../..");
const store = resolve(here, "horizons");
const API = "https://ssd.jpl.nasa.gov/api/horizons.api";

const NAIF = { Sun: "10", Moon: "301", Mercury: "199", Venus: "299", Mars: "4", Jupiter: "5", Saturn: "6", Uranus: "7", Neptune: "8", Pluto: "9" };
const BODIES = Object.keys(NAIF);
const LIMIT = (body) => (body === "Sun" ? 10 : 30);

// T5, inside the span: TT Julian dates, given to calc() as TT so that ΔT moves nothing.
const TT_INSTANTS = [
  ["Y-a", 2469807.5, "2050-01-01 00:00 TT"],
  ["Y-k", 2479103.5, "2075-06-15 00:00 TT"],
  ["Y-b", 2488069.5, "2100-01-01 00:00 TT"],
  ["Y-c", 2506331.5, "2150-01-01 00:00 TT"],
  ["Y-d", 2524593.0, "2199-12-31 12:00 TT, the ZOD-65 sweep's last instant"],
  ["Y-e", 2524593.49, "2199-12-31 23:45:36 TT, just inside the end"]
];
// "Once a UTC instant is settled": the instants the civil-time cases resolve to, and the polar cases' known UTC.
// Given to the root's natalChart() as UTC, and to Horizons as UT.
const UT_INSTANTS = [
  ["T1-a", "2021-11-07T05:30:00Z", "America/New_York 2021-11-07 01:30, the first pass", null],
  ["T2-a", "2021-03-14T07:30:00Z", "America/New_York 2021-03-14 02:30, moved forward", null],
  ["T3-a", "2011-12-30T22:00:00Z", "Pacific/Apia 2011-12-30 12:00, moved forward a day", null],
  ["T4-78N", "2021-06-21T12:00:00Z", "78.22 N, 15.63 E", { latitude: 78.22, longitude: 15.63 }],
  ["T4-90N", "2021-12-21T12:00:00Z", "90 N", { latitude: 90, longitude: 0 }],
  ["T4-90S", "2021-12-21T12:00:00Z", "90 S", { latitude: -90, longitude: 0 }]
];
// T5, outside the span: calc() must refuse.
const REFUSED = [
  ["Y-f", { jd: 2524593.5, scale: "tt" }, "2200-01-01 00:00 TT, the end, excluded"],
  ["Y-g", { jd: 2524594.0, scale: "tt" }, "2200-01-01 12:00 TT"],
  ["Y-h", { jd: 2378496.5, scale: "tt" }, "1800-01-01 00:00 TT (its UT1 is before the start)"],
  ["Y-j", "2199-12-31T23:59:00Z", "UTC inside the span, TT past its end"],
  ["Y-l", "2200-01-01T00:00:00Z", "the end by UTC"],
  ["Y-m", "1799-12-31T23:59:00Z", "a minute before the start by UTC"]
];
// T4: the Sun's elevation through a day at polar sites (Horizons quantity 4), against @zodiacs/engine/sky.
const SUN_DAYS = [
  ["T4-f/78N-june", { latitude: 78.22, longitude: 15.63 }, "2021-06-21", "never-sets"],
  ["T4-f/78N-december", { latitude: 78.22, longitude: 15.63 }, "2021-12-21", "never-rises"],
  ["T4-f/90N-june", { latitude: 90, longitude: 0 }, "2021-06-21", "never-sets"],
  ["T4-f/90S-june", { latitude: -90, longitude: 0 }, "2021-06-21", "never-rises"]
];
const HOUSE_SYSTEMS = ["whole", "placidus", "porphyry", "equal", "equal-mc", "vehlow", "koch", "regiomontanus", "campanus", "topocentric", "alcabitius", "morinus", "meridian"];
const POLAR_LATITUDES = [66.0, 67.0, 78.22, 89.99, 90, -66.0, -67.0, -78.22, -89.99, -90];

const jdOf = (iso) => Date.parse(iso) / 86_400_000 + 2440587.5;

function queries() {
  const observer = { format: "text", OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'", APPARENT: "'AIRLESS'", ANG_FORMAT: "'DEG'", EXTRA_PREC: "'YES'", CSV_FORMAT: "'YES'", CAL_FORMAT: "'JD'" };
  const all = [];
  for (const body of BODIES) {
    all.push({
      name: `ecl-TT-${NAIF[body]}`, kind: "longitude", body, scale: "TT", instants: TT_INSTANTS.map(([id, jd]) => [id, jd]),
      params: { ...observer, COMMAND: `'${NAIF[body]}'`, CENTER: "'500@399'", QUANTITIES: "'31'", TLIST: `'${TT_INSTANTS.map(([, jd]) => jd).join(" ")}'`, TLIST_TYPE: "'JD'", TIME_TYPE: "'TT'" }
    });
    const ut = [...new Map(UT_INSTANTS.map(([, iso]) => [iso, jdOf(iso)])).entries()];
    all.push({
      name: `ecl-UT-${NAIF[body]}`, kind: "longitude", body, scale: "UT", instants: ut,
      params: { ...observer, COMMAND: `'${NAIF[body]}'`, CENTER: "'500@399'", QUANTITIES: "'31'", TLIST: `'${ut.map(([, jd]) => jd.toFixed(9)).join(" ")}'`, TLIST_TYPE: "'JD'", TIME_TYPE: "'UT'" }
    });
  }
  for (const [id, site, date] of SUN_DAYS) {
    const next = new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    all.push({
      name: `sun-elevation-${id.split("/")[1]}`, kind: "elevation", body: "Sun", scale: "UT", id, instants: [],
      params: { ...observer, CAL_FORMAT: "'CAL'", COMMAND: "'10'", CENTER: "'coord@399'", COORD_TYPE: "'GEODETIC'", SITE_COORD: `'${site.longitude},${site.latitude},0.0'`, QUANTITIES: "'4'", START_TIME: `'${date} 00:00'`, STOP_TIME: `'${next} 00:00'`, STEP_SIZE: "'30 m'", TIME_TYPE: "'UT'" }
    });
  }
  return all;
}

const sha256 = (text) => createHash("sha256").update(text).digest("hex");

async function fetchAll() {
  mkdirSync(store, { recursive: true });
  const record = [];
  for (const query of queries()) {
    const url = `${API}?${new URLSearchParams(query.params)}`;
    // curl, not fetch: it honours the proxy settings of the machines this runs on.
    let text = "";
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      try {
        text = execFileSync("curl", ["-sS", "--fail", "--max-time", "120", url], { encoding: "utf8", maxBuffer: 1 << 26 });
      } catch (error) {
        text = String(error?.stderr ?? error);
      }
      if (text.includes("$$SOE")) break;
      if (attempt === 4) throw new Error(`${query.name}: Horizons gave no table: ${text.slice(0, 300)}`);
      await new Promise((done) => setTimeout(done, 5000 * attempt));
    }
    writeFileSync(resolve(store, `${query.name}.txt`), text);
    record.push({
      file: `horizons/${query.name}.txt`, body: query.body, target: query.params.COMMAND.replaceAll("'", ""), center: query.params.CENTER.replaceAll("'", ""),
      site: query.params.SITE_COORD?.replaceAll("'", "") ?? null, quantities: query.params.QUANTITIES.replaceAll("'", ""), timeScale: query.scale,
      instants: query.kind === "longitude" ? query.instants.map(([, jd]) => jd) : `${query.params.START_TIME} to ${query.params.STOP_TIME} step ${query.params.STEP_SIZE}`.replaceAll("'", ""),
      ephemeris: [...new Set([...text.matchAll(/\{source: ([^}]+)\}/gu)].map((match) => match[1]))],
      params: query.params, url, askedAt: new Date().toISOString(), sha256: sha256(text), bytes: Buffer.byteLength(text)
    });
    console.log(`kept ${query.name}.txt (${record.at(-1).ephemeris.join(", ")})`);
    await new Promise((done) => setTimeout(done, 1200));
  }
  writeFileSync(resolve(store, "queries.json"), `${JSON.stringify({ api: API, queries: record }, null, 1)}\n`);
}

/** The rows of a kept response, as arrays of trimmed cells. */
function rows(name) {
  const text = readFileSync(resolve(store, `${name}.txt`), "utf8");
  return text.split("$$SOE")[1].split("$$EOE")[0].trim().split("\n").map((line) => line.split(",").map((cell) => cell.trim()));
}

const wrap = (degrees) => ((((degrees + 180) % 360) + 360) % 360) - 180;

async function compare() {
  if (!existsSync(resolve(store, "queries.json"))) throw new Error("no kept responses: run fetch first");
  const kept = JSON.parse(readFileSync(resolve(store, "queries.json"), "utf8"));
  for (const query of kept.queries) {
    if (sha256(readFileSync(resolve(here, query.file), "utf8")) !== query.sha256) throw new Error(`${query.file} is not the response that was kept`);
  }
  const distDir = process.env.ZODIACS_ENGINE_DIST ? resolve(process.env.ZODIACS_ENGINE_DIST) : resolve(root, "dist");
  const load = (name) => import(pathToFileURL(resolve(distDir, name)).href);
  const { calc, houses } = await load("calc.js");
  const { natalChart, positions, ENGINE_VERSION } = await load("index.js");
  const sky = await load("sky.js");
  const records = [];
  const tables = Object.fromEntries(queries().filter((query) => query.kind === "longitude").map((query) => [query.name, rows(query.name)]));
  const horizons = (scale, body, jd) => {
    const row = tables[`ecl-${scale}-${NAIF[body]}`].find((cells) => Math.abs(Number(cells[0]) - jd) < 2e-9);
    if (!row) throw new Error(`no Horizons row for ${body} at ${jd} ${scale}`);
    return { jd: Number(row[0]), lon: Number(row[3]), lat: Number(row[4]) };
  };
  const judge = (record, body, engineLon, engineLat, reference) => {
    record.horizons = reference;
    record.engine = { lon: engineLon, lat: engineLat };
    record.lonDifferenceArcsec = wrap(engineLon - reference.lon) * 3600;
    record.latDifferenceArcsec = (engineLat - reference.lat) * 3600;
    record.limitArcsec = LIMIT(body);
    record.verdict = Math.abs(record.lonDifferenceArcsec) <= record.limitArcsec ? "pass" : "fail";
  };

  // P1, T5 inside the span: calc() on TT.
  for (const [id, jd, label] of TT_INSTANTS) {
    for (const body of BODIES) {
      const record = { test: "P1/T5", id, body, instant: label, jdTt: jd, file: `horizons/ecl-TT-${NAIF[body]}.txt` };
      try {
        const result = calc({ body, time: { jd, scale: "tt" } });
        if (result.status !== "ok") Object.assign(record, { verdict: "fail", engine: { status: result.status, reason: result.reason } });
        else judge(record, body, result.lon, result.lat, horizons("TT", body, jd));
      } catch (error) {
        Object.assign(record, { verdict: "error", error: String(error?.message ?? error) });
      }
      records.push(record);
    }
  }

  // P1 at settled UTC instants, through the root's natalChart(); T4's longitudes at polar places.
  for (const [id, iso, label, place] of UT_INSTANTS) {
    let chart = null;
    let failure = null;
    try {
      chart = natalChart({ utc: new Date(iso), timeKnown: true, ...(place ? { ...place, houseSystem: "placidus" } : {}) });
    } catch (error) {
      failure = String(error?.message ?? error);
    }
    for (const body of BODIES) {
      const record = { test: id.startsWith("T4") ? "P1/T4" : "P1", id, body, instant: `${iso} (${label})`, file: `horizons/ecl-UT-${NAIF[body]}.txt` };
      try {
        if (!chart) throw new Error(failure);
        const position = chart.bodies.find((entry) => entry.body === body);
        judge(record, body, position.lon, position.lat, horizons("UT", body, jdOf(iso)));
        record.chartFlags = chart.flags;
      } catch (error) {
        Object.assign(record, { verdict: "error", error: String(error?.message ?? error) });
      }
      records.push(record);
    }
  }

  // T5 outside the span: calc() refuses; the root computes with a flag (natalChart) or with none (positions).
  for (const [id, time, label] of REFUSED) {
    for (const body of ["Sun", "Moon"]) {
      const record = { test: "T5", id, body, instant: label };
      try {
        const result = calc({ body, time });
        record.engine = { status: result.status, reason: result.reason ?? null };
        record.verdict = result.status === "refused" && result.reason === "out-of-range" ? "pass" : "fail";
      } catch (error) {
        Object.assign(record, { verdict: "error", error: String(error?.message ?? error) });
      }
      records.push(record);
    }
  }
  for (const iso of ["2200-01-01T00:00:00Z", "2250-01-01T00:00:00Z", "1799-12-31T23:59:00Z"]) {
    const record = { test: "T5", id: "Y-i", instant: `${iso} through the root entry` };
    try {
      const chart = natalChart({ utc: new Date(iso) });
      const list = positions(new Date(iso));
      record.engine = { natalChartFlags: chart.flags, positionsReturns: `${list.length} positions`, positionsCarriesAFlag: "flags" in list || list.some((entry) => "flags" in entry || "flag" in entry) };
      // Not refused. Flagged by natalChart(); positions() has nowhere to carry a flag.
      record.verdict = chart.flags.includes("outside-reference-span") ? (record.engine.positionsCarriesAFlag ? "flagged" : "flagged-by-natalChart-only") : "fail";
    } catch (error) {
      Object.assign(record, { verdict: "refused", engine: { threw: String(error?.message ?? error) } });
    }
    records.push(record);
  }

  // T4: every house system at polar latitudes. Recorded; judged on two rules only:
  // Placidus and Koch fall back to whole sign with the flag from 90 degrees less the obliquity, and not below it;
  // no system returns cusps that are not twelve finite numbers. "degenerate" marks cusps that coincide.
  const at = "2021-06-21T12:00:00Z";
  for (const latitude of POLAR_LATITUDES) {
    for (const houseSystem of HOUSE_SYSTEMS) {
      const record = { test: "T4", id: "T4-houses", houseSystem, latitude, instant: at };
      try {
        const result = houses({ time: at, place: { latitude, longitude: 15.63 }, houseSystem });
        const chart = natalChart({ utc: new Date(at), timeKnown: true, latitude, longitude: 15.63, houseSystem });
        const cusps = result.cusps ?? [];
        const distinct = new Set(cusps.map((cusp) => cusp.toFixed(6))).size;
        const undefinedHere = ["placidus", "koch"].includes(houseSystem) && Math.abs(latitude) > 66.6;
        record.engine = { status: result.status, system: result.system ?? null, flags: result.flags ?? null, chartFlags: chart.flags, asc: result.angles?.asc, mc: result.angles?.mc, cusps, distinctCusps: distinct };
        record.degenerate = distinct < 12;
        const fellBack = result.system === "whole" && houseSystem !== "whole";
        const flagged = chart.flags.includes("polar-fallback");
        const sound = result.status === "ok" && cusps.length === 12 && cusps.every(Number.isFinite);
        record.verdict = !sound || fellBack !== undefinedHere || flagged !== undefinedHere ? "fail" : record.degenerate ? "degenerate-unflagged" : "pass";
      } catch (error) {
        Object.assign(record, { verdict: "refused", engine: { threw: String(error?.message ?? error) } });
      }
      records.push(record);
    }
  }

  // T4: polar day and night. Horizons's elevation of the Sun every 30 minutes of the UTC day, against the sky entry's flag.
  for (const [id, site, date, expected] of SUN_DAYS) {
    const record = { test: "T4", id, site, date, file: `horizons/sun-elevation-${id.split("/")[1]}.txt` };
    try {
      const elevations = rows(`sun-elevation-${id.split("/")[1]}`).map((cells) => Number(cells[4]));
      if (!elevations.length || elevations.some(Number.isNaN)) throw new Error("no elevations read");
      record.horizons = { samples: elevations.length, minElevationDeg: Math.min(...elevations), maxElevationDeg: Math.max(...elevations) };
      const arbiter = record.horizons.minElevationDeg > 0 ? "never-sets" : record.horizons.maxElevationDeg < -1 ? "never-rises" : "crosses";
      const result = sky.skyEventsOn("Sun", site, date);
      record.engine = { flags: result.flags, events: (result.events ?? []).map((event) => event.kind ?? event.type ?? event) };
      record.expected = expected;
      record.verdict = arbiter === expected && result.flags.includes(expected) ? "pass" : "fail";
      record.arbiterSays = arbiter;
    } catch (error) {
      Object.assign(record, { verdict: "error", error: String(error?.message ?? error) });
    }
    records.push(record);
  }

  const counts = {};
  for (const record of records) {
    counts[record.test] ??= {};
    counts[record.test][record.verdict] = (counts[record.test][record.verdict] ?? 0) + 1;
  }
  const longitudes = records.filter((record) => typeof record.lonDifferenceArcsec === "number");
  const largest = {};
  for (const record of longitudes) {
    const size = Math.abs(record.lonDifferenceArcsec);
    if (!largest[record.body] || size > largest[record.body].arcsec) largest[record.body] = { arcsec: size, id: record.id, instant: record.instant };
  }
  mkdirSync(resolve(here, "results"), { recursive: true });
  writeFileSync(
    resolve(here, "results/horizons-edge.json"),
    `${JSON.stringify({
      what: "ZOD-97 P1, P2, T4, T5: docs/evidence/edge-cases-20261111/", node: process.version, engineVersion: ENGINE_VERSION,
      horizons: kept.queries.map(({ file, sha256: digest, ephemeris, askedAt }) => ({ file, sha256: digest, ephemeris, askedAt })),
      limitsArcsec: { everyBody: 30, sun: 10 }, counts, largestLongitudeDifferenceArcsec: largest, records
    }, null, 1)}\n`
  );
  for (const record of records) {
    const what = record.body ?? record.houseSystem ?? "";
    const value = typeof record.lonDifferenceArcsec === "number" ? `${record.lonDifferenceArcsec.toFixed(3)}"` : JSON.stringify(record.engine ?? record.error ?? "").slice(0, 150);
    if (record.id !== "T4-houses" || record.verdict !== "pass") console.log(`${record.verdict.padEnd(26)} ${record.id.padEnd(18)} ${String(record.latitude ?? "").padEnd(6)} ${what.padEnd(13)} ${value}`);
  }
  console.log(JSON.stringify(counts));
  console.log(JSON.stringify(largest));
  if (records.some((record) => record.verdict === "fail" || record.verdict === "error")) process.exit(1);
}

const command = process.argv[2];
if (command === "fetch") await fetchAll();
else if (command === "compare") await compare();
else throw new Error("usage: horizons-edge.mjs fetch | compare");
