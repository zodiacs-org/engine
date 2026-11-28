import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ENDPOINT = "https://ssd.jpl.nasa.gov/api/horizons.api";
const MAX_BYTES = 1_900_000;
const MAX_EPOCHS = 64;
// Horizons prints nine decimal places of JD. This allowance also covers
// binary64 conversion of the printed and requested epochs, not physical error.
const EPOCH_TOLERANCE_DAYS = 2e-9;
const FIXED = Object.freeze({
  format: "text", OBJ_DATA: "NO", MAKE_EPHEM: "YES", EPHEM_TYPE: "VECTORS",
  VEC_TABLE: "3", VEC_CORR: "NONE", OUT_UNITS: "KM-S", REF_SYSTEM: "ICRF",
  REF_PLANE: "FRAME", CSV_FORMAT: "YES", TIME_TYPE: "TT", TLIST_TYPE: "JD",
  TIME_DIGITS: "FRACSEC"
});
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fail = (message) => { throw new Error(`Horizons: ${message}`); };

function bodyId(value) {
  if ((typeof value !== "number" && typeof value !== "string") ||
      !/^(?:0|[1-9]\d{0,8})$/u.test(String(value))) fail("invalid numeric body ID");
  return String(value);
}

function originId(value) {
  return bodyId(typeof value === "string" && value.startsWith("500@") ? value.slice(4) : value);
}

function epochs(values) {
  if (!Array.isArray(values) || values.length < 1 || values.length > MAX_EPOCHS) {
    fail(`request must contain 1 to ${MAX_EPOCHS} epochs`);
  }
  const result = Array.from(values);
  for (let index = 0; index < result.length; index++) {
    const jd = result[index];
    if (typeof jd !== "number" || !Number.isFinite(jd) || Math.abs(jd) >= 1e9) {
      fail("epochs must be finite Julian dates with magnitude below 1e9");
    }
    if (index && jd - result[index - 1] <= 2 * EPOCH_TOLERANCE_DAYS) {
      fail("epochs must increase strictly and remain distinct at response precision");
    }
  }
  return result;
}

/** Build unquoted scalar parameters; TLIST contains individually quoted JDs. */
export function horizonsParameters(targetId, centerId, jdList) {
  return {
    ...FIXED,
    COMMAND: bodyId(targetId),
    CENTER: `500@${originId(centerId)}`,
    TLIST: epochs(jdList).map((jd) => `'${jd.toFixed(12)}'`).join(" ")
  };
}

function requestFromParameters(params) {
  if (!params || typeof params !== "object" || Array.isArray(params)) fail("invalid parameters");
  const keys = [...Object.keys(FIXED), "COMMAND", "CENTER", "TLIST"];
  if (Object.keys(params).length !== keys.length || keys.some((key) => !Object.hasOwn(params, key))) {
    fail("unexpected or missing parameter");
  }
  if (Object.entries(FIXED).some(([key, value]) => params[key] !== value) ||
      typeof params.TLIST !== "string" || !/^'-?\d+\.\d+'(?: '-?\d+\.\d+')*$/u.test(params.TLIST)) {
    fail("unsupported query conventions or TLIST");
  }
  const jdList = params.TLIST.split(" ").map((value) => Number(value.slice(1, -1)));
  const expected = horizonsParameters(params.COMMAND, params.CENTER, jdList);
  if (keys.some((key) => expected[key] !== params[key])) fail("parameters are not canonical");
  return { targetId: params.COMMAND, centerId: params.CENTER, jdList };
}

/** Canonical official URL, also used as the immutable cache identity. */
export function horizonsUrl(params) {
  requestFromParameters(params);
  const query = new URLSearchParams();
  for (const key of Object.keys(params).sort()) {
    query.set(key, key === "format" || key === "TLIST" ? params[key] : `'${params[key]}'`);
  }
  return `${ENDPOINT}?${query}`;
}

function singleField(header, label) {
  const lines = header.split("\n").filter((line) => line.trimStart().startsWith(`${label}`));
  const matches = lines.map((line) => line.match(new RegExp(`^\\s*${label}\\s*:\\s*(.*?)\\s*$`, "u")));
  if (matches.length !== 1 || !matches[0]) fail(`missing or duplicate ${label}`);
  return matches[0][1];
}

function parseBody(header, label, id) {
  const value = singleField(header, label);
  const match = value.match(/^(.+?)\s+\((\d+)\)\s+\{source:\s*([^{}]+)\}$/u);
  if (!match || match[2] !== id) fail(`${label} does not match requested ID or has no solution`);
  return { id, name: match[1].trim(), solution: match[3].trim() };
}

function numeric(value) {
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[Ee][+-]?\d+)?$/u.test(value)) fail("invalid numeric field");
  const number = Number(value);
  if (!Number.isFinite(number)) fail("non-finite numeric field");
  return number;
}

/** Parse only the requested geometric TT vector table, without relabelling it. */
export function parseHorizons(text, { targetId, centerId, jdList }) {
  const requested = epochs(jdList);
  const target = bodyId(targetId);
  const center = originId(centerId);
  if (typeof text !== "string" || Buffer.byteLength(text) > MAX_BYTES || text.includes("\0")) {
    fail("invalid or oversized response");
  }
  const normalized = text.replaceAll("\r\n", "\n");
  const start = normalized.indexOf("\n$$SOE\n");
  const stop = normalized.indexOf("\n$$EOE\n");
  if (start < 0 || stop < start || normalized.split("$$SOE").length !== 2 ||
      normalized.split("$$EOE").length !== 2 || /^\s*(?:ERROR\b|API ERROR\b)/imu.test(normalized)) {
    fail("API error or missing/duplicate ephemeris delimiters");
  }
  const raw = normalized.slice(0, start + 1);
  const apiVersion = singleField(raw, "API VERSION");
  if (singleField(raw, "API SOURCE") !== "NASA/JPL Horizons API" ||
      apiVersion !== "1.2") fail("unrecognized API header or unsupported API version");
  if (singleField(raw, "Center-site name") !== "BODY CENTER" ||
      singleField(raw, "Output units") !== "KM-S" ||
      singleField(raw, "Output type") !== "GEOMETRIC cartesian states" ||
      singleField(raw, "Reference frame") !== "ICRF" ||
      singleField(raw, "Output format") !== "3 (position, velocity, LT, range, range-rate)" ||
      singleField(raw, "Step-size") !== "DISCRETE TIME-LIST" ||
      !/\sTT$/u.test(singleField(raw, "Start time")) ||
      !/\sTT$/u.test(singleField(raw, "Stop  time"))) fail("unexpected vector conventions");
  const labels = raw.split("\n").filter((line) => /^\s*JD\w*\s*,/u.test(line));
  if (labels.length !== 1 || labels[0].split(",").map((value) => value.trim()).join(",") !==
      "JDTT,Calendar Date (TT ),X,Y,Z,VX,VY,VZ,LT,RG,RR,") fail("unexpected vector columns or time scale");
  const header = {
    raw: text.slice(0, text.indexOf("$$SOE")),
    apiVersion,
    target: parseBody(raw, "Target body name", target),
    center: parseBody(raw, "Center body name", center),
    units: "KM-S", frame: "ICRF", timeScale: "TT", correction: "NONE"
  };
  const lines = normalized.slice(start + "\n$$SOE\n".length, stop).split("\n");
  if (lines.length !== requested.length) fail("missing or extra epochs");
  const rows = lines.map((line, index) => {
    const fields = line.split(",").map((value) => value.trim());
    if (fields.length !== 12 || fields[11] !== "" ||
        !/^(?:A\.D\.|B\.C\.) \d{4,}-[A-Z][a-z]{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d+$/u.test(fields[1])) {
      fail("malformed CSV vector row");
    }
    const [jdTt, x, y, z, vx, vy, vz, lightTime, distanceKm, radialSpeedKmPerSecond] =
      fields.slice(0, 11).filter((_, column) => column !== 1).map(numeric);
    if (Math.abs(jdTt - requested[index]) > EPOCH_TOLERANCE_DAYS ||
        (index > 0 && jdTt <= numeric(lines[index - 1].split(",")[0].trim()))) {
      fail("misaligned or duplicate epochs");
    }
    const norm = Math.hypot(x, y, z);
    const speed = Math.hypot(vx, vy, vz);
    const radial = (x / norm) * vx + (y / norm) * vy + (z / norm) * vz;
    // Consistency of the decimal vector columns, not an ephemeris tolerance.
    if (!(distanceKm > 0 && lightTime > 0 && norm > 0) || !Number.isFinite(norm) ||
        !Number.isFinite(speed) || !Number.isFinite(radial) ||
        Math.abs(norm - distanceKm) > Math.max(1e-8, 5e-14 * norm) ||
        Math.abs(radial - radialSpeedKmPerSecond) > Math.max(1e-12, 5e-14 * speed) ||
        Math.abs(lightTime * 299_792.458 - distanceKm) > Math.max(1e-8, 5e-14 * norm)) {
      fail("inconsistent range, range rate or light time");
    }
    return { jdTt, positionKm: [x, y, z], velocityKmPerSecond: [vx, vy, vz], distanceKm, radialSpeedKmPerSecond };
  });
  return { header, rows };
}

async function readBounded(path) {
  const info = await lstat(path);
  if (!info.isFile() || info.size > MAX_BYTES) fail("invalid cache file size/type");
  const data = await readFile(path);
  if (data.length > MAX_BYTES) fail("oversized cache file");
  return data;
}

async function readCache(rawPath, metadataPath, url, params) {
  const existing = await Promise.allSettled([readBounded(rawPath), readBounded(metadataPath)]);
  if (existing.every((entry) => entry.status === "rejected" && entry.reason.code === "ENOENT")) return null;
  if (existing.some((entry) => entry.status === "rejected")) fail("incomplete or unreadable cache; refusing replacement");
  const [raw, metadata] = existing.map((entry) => entry.value);
  const source = JSON.parse(metadata.toString("utf8"));
  if (!source || typeof source !== "object" || Object.keys(source).sort().join(",") !==
      "params,responseSha256,retrievedAt,url" || source.url !== url || horizonsUrl(source.params) !== url ||
      source.responseSha256 !== sha256(raw) || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(source.retrievedAt) ||
      !Number.isFinite(Date.parse(source.retrievedAt))) fail("cache metadata or digest mismatch");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  parseHorizons(text, requestFromParameters(params));
  return { text, source };
}

let pending = Promise.resolve();

/**
 * Explicit, serialized network access. Existing query identities are never refreshed.
 * @param {Record<string, string>} params
 * @param {{cacheDirectory?: string, offline?: boolean}} [options]
 */
export function fetchHorizons(params, { cacheDirectory, offline = false } = {}) {
  // Copy and validate before queueing so caller mutations cannot change the request.
  const snapshot = { ...params };
  const url = horizonsUrl(snapshot);
  if (typeof cacheDirectory !== "string" || !cacheDirectory || typeof offline !== "boolean") {
    fail("cacheDirectory and a boolean offline flag are required");
  }
  const task = pending.then(async () => {
    const key = sha256(url);
    const rawPath = join(cacheDirectory, `${key}.txt`);
    const metadataPath = join(cacheDirectory, `${key}.json`);
    const cached = await readCache(rawPath, metadataPath, url, snapshot);
    if (cached) return cached;
    if (offline) fail(`offline cache miss for ${key}`);
    // curl honors the host's proxy and CA configuration; no credentials are added.
    const { stdout } = await run("curl", ["--disable", "--fail", "--silent", "--show-error",
      "--user-agent", "zodiacs-apsides-reference/1.0 (+https://github.com/zodiacs-org/engine/tree/main/apsides)",
      "--max-time", "45", "--max-filesize", String(MAX_BYTES), "--url", url],
    { encoding: "buffer", timeout: 50_000, maxBuffer: MAX_BYTES });
    if (stdout.length > MAX_BYTES) fail("oversized network response");
    const text = new TextDecoder("utf-8", { fatal: true }).decode(stdout);
    parseHorizons(text, requestFromParameters(snapshot));
    const source = { url, params: snapshot, retrievedAt: new Date().toISOString(), responseSha256: sha256(stdout) };
    await mkdir(cacheDirectory, { recursive: true });
    // Exclusive creation fails closed on concurrent writers or incomplete caches.
    await writeFile(rawPath, stdout, { flag: "wx" });
    await writeFile(metadataPath, `${JSON.stringify(source, null, 2)}\n`, { flag: "wx" });
    return { text, source };
  });
  pending = task.catch(() => {});
  return task;
}
