#!/usr/bin/env node
/*
 * ZOD-97, P1 and T5 on UTC input after 2050 (the breaker's finding 1).
 *
 *   npm run build
 *   node docs/evidence/edge-cases-20261111/tools/utc-after-2050.mjs fetch
 *   node docs/evidence/edge-cases-20261111/tools/utc-after-2050.mjs compare
 *
 * tools/horizons-edge.mjs gives calc() its instants after 2050 as TT. This
 * tool gives the same engine five instants after 2050 as UTC, and asks
 * Horizons for the same instants as UT (observer table, geocentric 500@399,
 * quantities 30 and 31: TDB-UT, and the apparent ecliptic longitude and
 * latitude of date; airless). fetch keeps each response verbatim in
 * ../horizons/ and records what was asked in
 * ../horizons/queries-utc-after-2050.json; compare is offline and writes
 * ../results/utc-after-2050.json.
 *
 * It sets no verdict. Horizons is not a reference for UT after its Earth
 * orientation predictions end: the TDB-UT it prints for these dates is its
 * last prediction held constant, and the engine's TT-UT1 is its own model.
 * A difference here is the two clocks' difference times the body's motion,
 * on top of the difference tools/horizons-edge.mjs measures on TT. The tool
 * reports both clocks, the longitude difference, and what the engine's own
 * results say about the time (calc()'s 1-sigma time band and its receipt's ΔT
 * record, its position bound, and natalChart()'s flags and ΔT record).
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
const INSTANTS = ["2051-06-15T00:00:00Z", "2075-06-15T00:00:00Z", "2100-01-01T00:00:00Z", "2150-01-01T00:00:00Z", "2199-06-15T12:00:00Z"];
const jdOf = (iso) => Date.parse(iso) / 86_400_000 + 2440587.5;
const sha256 = (text) => createHash("sha256").update(text).digest("hex");
const wrap = (degrees) => ((((degrees + 180) % 360) + 360) % 360) - 180;
const paramsFor = (body) => ({
  format: "text", COMMAND: `'${NAIF[body]}'`, OBJ_DATA: "'NO'", MAKE_EPHEM: "'YES'", EPHEM_TYPE: "'OBSERVER'", CENTER: "'500@399'", QUANTITIES: "'30,31'",
  APPARENT: "'AIRLESS'", ANG_FORMAT: "'DEG'", EXTRA_PREC: "'YES'", CSV_FORMAT: "'YES'", CAL_FORMAT: "'JD'",
  TLIST: `'${INSTANTS.map((iso) => jdOf(iso).toFixed(9)).join(" ")}'`, TLIST_TYPE: "'JD'", TIME_TYPE: "'UT'"
});

async function fetchAll() {
  mkdirSync(store, { recursive: true });
  // Resumable: a body whose response is already kept and recorded is not asked again.
  const list = resolve(store, "queries-utc-after-2050.json");
  const record = existsSync(list) ? JSON.parse(readFileSync(list, "utf8")).queries : [];
  for (const body of BODIES) {
    if (record.some((entry) => entry.body === body)) continue;
    const params = paramsFor(body);
    const url = `${API}?${new URLSearchParams(params)}`;
    // Up to three attempts for a dropped connection; a refusal (HTTP 429) stops the run at once.
    let text = "";
    for (let attempt = 1; attempt <= 3 && !text.includes("$$SOE"); attempt += 1) {
      try {
        text = execFileSync("curl", ["-sS", "--fail", "--max-time", "120", url], { encoding: "utf8", maxBuffer: 1 << 26 });
      } catch (error) {
        text = String(error?.stderr ?? error);
        if (/ 429|rate/iu.test(text)) throw new Error(`Horizons refused: ${text.slice(0, 200)}`);
        await new Promise((done) => setTimeout(done, 10000));
      }
    }
    if (!text.includes("$$SOE")) throw new Error(`${body}: Horizons gave no table: ${text.slice(0, 300)}`);
    const name = `utc-after-2050-${NAIF[body]}.txt`;
    writeFileSync(resolve(store, name), text);
    record.push({
      file: `horizons/${name}`, body, target: NAIF[body], center: "500@399", quantities: "30,31", timeScale: "UT", instants: INSTANTS,
      ephemeris: [...new Set([...text.matchAll(/\{source: ([^}]+)\}/gu)].map((match) => match[1]))], params, url, askedAt: new Date().toISOString(), sha256: sha256(text), bytes: Buffer.byteLength(text)
    });
    console.log(`kept ${name} (${record.at(-1).ephemeris.join(", ")})`);
    writeFileSync(list, `${JSON.stringify({ api: API, queries: record }, null, 1)}\n`);
    await new Promise((done) => setTimeout(done, 2000));
  }
}

async function compare() {
  const kept = JSON.parse(readFileSync(resolve(store, "queries-utc-after-2050.json"), "utf8"));
  const distDir = process.env.ZODIACS_ENGINE_DIST ? resolve(process.env.ZODIACS_ENGINE_DIST) : resolve(root, "dist");
  const { calc } = await import(pathToFileURL(resolve(distDir, "calc.js")).href);
  const { natalChart, ENGINE_VERSION } = await import(pathToFileURL(resolve(distDir, "index.js")).href);
  const records = [];
  for (const query of kept.queries) {
    const text = readFileSync(resolve(here, query.file), "utf8");
    if (sha256(text) !== query.sha256) throw new Error(`${query.file} is not the response that was kept`);
    const table = text.split("$$SOE")[1].split("$$EOE")[0].trim().split("\n").map((line) => line.split(",").map((cell) => cell.trim()));
    for (const iso of INSTANTS) {
      const row = table.find((cells) => Math.abs(Number(cells[0]) - jdOf(iso)) < 2e-9);
      const record = { body: query.body, utc: iso, file: query.file };
      try {
        if (!row) throw new Error("no Horizons row");
        const result = calc({ body: query.body, time: iso });
        const chart = natalChart({ utc: new Date(iso) });
        const inChart = chart.bodies.find((entry) => entry.body === query.body);
        record.horizons = { jdUt: Number(row[0]), tdbMinusUtSeconds: Number(row[3]), lon: Number(row[4]), lat: Number(row[5]) };
        if (result.status !== "ok") record.engine = { status: result.status, reason: result.reason };
        else {
          const instant = result.receipt?.instants?.[0];
          record.engine = {
            lon: result.lon, lat: result.lat,
            ttMinusUt1Seconds: instant ? (instant.jdTt - instant.jdUt1) * 86400 : null,
            receiptDeltaT: instant?.deltaT ?? null, band: result.band ?? null, positionBound: result.bounds?.position ?? null,
            natalChartLon: inChart.lon, natalChartFlags: chart.flags, natalChartDeltaT: chart.deltaT ?? null
          };
          record.lonDifferenceArcsec = wrap(result.lon - record.horizons.lon) * 3600;
          record.natalChartLonDifferenceArcsec = wrap(inChart.lon - record.horizons.lon) * 3600;
          record.clockDifferenceSeconds = record.engine.ttMinusUt1Seconds === null ? null : record.engine.ttMinusUt1Seconds - record.horizons.tdbMinusUtSeconds;
          record.over30 = Math.abs(record.lonDifferenceArcsec) > 30;
        }
      } catch (error) {
        record.error = String(error?.message ?? error);
      }
      records.push(record);
    }
  }
  const over = records.filter((record) => record.over30).map(({ body, utc, lonDifferenceArcsec }) => ({ body, utc, lonDifferenceArcsec }));
  mkdirSync(resolve(here, "results"), { recursive: true });
  writeFileSync(resolve(here, "results/utc-after-2050.json"), `${JSON.stringify({
    what: "ZOD-97 P1 and T5 on UTC input after 2050: reported, not judged (Horizons is not a reference for future UT)", node: process.version, engineVersion: ENGINE_VERSION,
    horizons: kept.queries.map(({ file, sha256: digest, ephemeris, askedAt }) => ({ file, sha256: digest, ephemeris, askedAt })), comparisons: records.length, over30Arcsec: over, records
  }, null, 1)}\n`);
  for (const iso of INSTANTS) {
    const at = records.filter((record) => record.utc === iso);
    console.log(`${iso}  Horizons TDB-UT ${at[0].horizons?.tdbMinusUtSeconds}  engine TT-UT1 ${at[0].engine?.ttMinusUt1Seconds?.toFixed(2)}  flags ${JSON.stringify(at[0].engine?.natalChartFlags)}`);
    console.log("   " + at.map((record) => `${record.body} ${record.lonDifferenceArcsec?.toFixed(2) ?? record.error}`).join("  "));
  }
  console.log(JSON.stringify({ comparisons: records.length, over30Arcsec: over }));
}

const command = process.argv[2];
if (command === "fetch") await fetchAll();
else if (command === "compare") await compare();
else throw new Error("usage: utc-after-2050.mjs fetch | compare");
