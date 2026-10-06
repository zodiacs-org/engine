/*
 * Builds src/tzdb/: the zone history this package ships for local times
 * before 1970, from the pinned tzdb release with its backzone records.
 *
 * The approach is the Zodiacs site's (scripts/build-tz-lmt.mjs and
 * scripts/build-tz-history.mjs there), extended with each transition's kind:
 *
 * - zic compiles the data, so tzdb's rule semantics are never reimplemented.
 *   The pinned history is the main data files plus backzone, without
 *   `backward` (whose links would collide with backzone's zones); a name
 *   resolves to backzone's zone of that name first, then the main data's, then
 *   a link, backzone's before the main data's. The default build (the main
 *   files with `backward`, which is what browsers and Node carry) is compiled
 *   too, as the reference for 1970 on.
 * - Browsers' Intl answers from 1970 on. A name whose pinned history differs
 *   from the default build at any instant from 1970 on is "host-legal": its
 *   shard carries the default build's history instead, so the hand-over at
 *   1970 cannot jump, and only its local mean time era comes from backzone.
 * - Each zone's local mean time era is its first line (FORMAT "LMT"), extended
 *   through following LMT lines whose offset differs by whole days (a move
 *   across the date line). A following line with the same offset is a legal
 *   mean time (Lisbon, Paris, Dublin) and ends the era.
 * - Each transition's cause comes from the record: "x" (date line) when the
 *   offset moves by 12 hours or more; "l" (legal change) when the zone line's
 *   standard offset changes, or only the abbreviation does; "d" (daylight
 *   saving) when only the daylight-saving part changes. Standard offsets come
 *   from the zone lines, whose UNTIL instants are placed with the compiled
 *   offsets, exactly as zic reads them.
 *
 * Output (all generated; do not edit):
 * - src/tzdb/tzdb-2025c-NN.ts, NN = 00..15: the names whose 32-bit FNV-1a hash
 *   of the lower-cased name falls in bucket NN, each as
 *   { n: name, s: source zone, h?: 1 (host-legal), f: zone-clock LMT era end
 *   (Unix s) or null, e?: [[until, offset s], ...] birthplace era lines,
 *   y: [[offset s | null ("-00"), isdst, abbreviation], ...],
 *   t: transition instants before 1970 (Unix s, base-36, first absolute then
 *   differences, comma-separated), k: per transition its type (one base-36
 *   digit) and cause (d, l or x) }.
 * - src/tzdb/tzdb-2025c.ts: the release's identity, the 16 lazy loaders, and
 *   the default build's transitions from 1970 on whose cause is not daylight
 *   saving, keyed by the FNV-1a hash of the lower-cased name.
 *
 *   node scripts/build-tz-shards.mjs          rebuild src/tzdb/
 *   node scripts/build-tz-shards.mjs --check  exit 1 if src/tzdb/ differs
 *
 * The release is read from TZDATA_TARBALL when set, otherwise downloaded once
 * into .cache/ (gitignored); either way its SHA-256 must match. Needs zic
 * (libc-bin on Debian and Ubuntu, or tzcode).
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

export const TZDB_VERSION = "2025c";
export const TZDB_URL = `https://data.iana.org/time-zones/releases/tzdata${TZDB_VERSION}.tar.gz`;
export const TZDB_SHA256 = "4aa79e4effee53fc4029ffe5f6ebe97937282ebcdf386d5d2da91ce84142f957";
export const MAIN_FILES = ["africa", "antarctica", "asia", "australasia", "europe", "northamerica", "southamerica", "etcetera", "backward"];
export const BACKZONE = "backzone";
export const BUCKETS = 16;
/** Offsets from 1970-01-01T00:00:00Z on are the host's. */
export const HISTORY_END = 0;
/** An offset change this large moves the calendar date: a move across the date line. */
export const DATE_LINE_SECONDS = 12 * 3600;

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/** zic accepts any unambiguous prefix of a name, case-insensitively. */
function byPrefix(word, names, what) {
  const lower = word.toLowerCase();
  const hits = names.filter((name) => name.startsWith(lower));
  if (hits.length !== 1) throw new Error(`tz-shards: unrecognised ${what} "${word}"`);
  return names.indexOf(hits[0]);
}

/** "[-]h[:mm[:ss[.frac]]]" to seconds, fractions rounded half to even as zic does. */
export function parseClock(text) {
  const match = /^(-)?(\d+)(?::(\d{1,2}))?(?::(\d{1,2}(?:\.\d+)?))?$/.exec(text);
  if (!match) throw new Error(`tz-shards: unrecognised time "${text}"`);
  const raw = Number(match[4] ?? 0);
  const whole = Math.floor(raw);
  const fraction = raw - whole;
  const rounded = fraction > 0.5 || (fraction === 0.5 && whole % 2 === 1) ? whole + 1 : whole;
  const seconds = Number(match[2]) * 3600 + Number(match[3] ?? 0) * 60 + rounded;
  return match[1] ? -seconds : seconds;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

/** DAY field: "18", "lastSun", "Sun>=8", "Sun<=25" to a day of the month. */
function parseDay(text, year, month) {
  if (/^\d+$/.test(text)) return Number(text);
  const weekdayOf = (day) => new Date(Date.UTC(year, month, day)).getUTCDay();
  if (/^last/i.test(text)) {
    const weekday = byPrefix(text.slice(4), WEEKDAYS, "weekday");
    for (let day = daysInMonth(year, month); day > 0; day -= 1) if (weekdayOf(day) === weekday) return day;
  }
  const rule = /^([a-z]+)([<>]=)(\d+)$/i.exec(text);
  if (rule) {
    const weekday = byPrefix(rule[1], WEEKDAYS, "weekday");
    const step = rule[2] === ">=" ? 1 : -1;
    for (let day = Number(rule[3]); day >= 1 && day <= daysInMonth(year, month); day += step) {
      if (weekdayOf(day) === weekday) return day;
    }
  }
  throw new Error(`tz-shards: unrecognised day "${text}"`);
}

/** UNTIL fields to their local seconds (as if UTC) and the clock they are read on: w(all), s(tandard) or u(niversal). */
export function untilParts(fields) {
  const year = Number(fields[0]);
  if (!Number.isInteger(year)) throw new Error(`tz-shards: unrecognised year "${fields[0]}"`);
  const month = fields[1] ? byPrefix(fields[1], MONTHS, "month") : 0;
  const day = fields[2] ? parseDay(fields[2], year, month) : 1;
  let clock = fields[3] ?? "0";
  let kind = "w";
  const suffix = /[wsugz]$/i.exec(clock);
  if (suffix) {
    kind = /[ugz]/i.test(suffix[0]) ? "u" : suffix[0].toLowerCase();
    clock = clock.slice(0, -1);
  }
  return { local: Date.UTC(year, month, day) / 1000 + parseClock(clock), kind };
}

/**
 * Zone and Link records from one tzdb data file. As in zic, a line continues
 * the open zone whenever the zone's previous line had an UNTIL field.
 */
export function parseTzdb(text) {
  const zones = new Map();
  const links = new Map();
  let open = null;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const fields = line.split(/\s+/);
    if (open) {
      open.push(fields);
    } else if (/^z(?:o(?:ne?)?)?$/i.test(fields[0])) {
      open = [fields.slice(2)];
      zones.set(fields[1], open);
    } else if (/^l(?:i(?:nk?)?)?$/i.test(fields[0])) {
      links.set(fields[2], fields[1]);
    }
    // [STDOFF, RULES, FORMAT] with no UNTIL is the zone's last line.
    if (open && open.at(-1).length <= 3) open = null;
  }
  return { zones, links };
}

/**
 * A zone's local mean time era as [until, offset] per line, in Unix seconds
 * and seconds east, or null when it has none. More than one line means the
 * era crossed the date line. An LMT line carries no daylight saving, so its
 * UNTIL is read on its own offset whatever its suffix.
 */
export function lmtEraLines(lines) {
  const [first] = lines;
  if (!first || first[2] !== "LMT") return null;
  const firstOffset = parseClock(first[0]);
  let last = 0;
  for (let index = 1; index < lines.length; index += 1) {
    const [stdoff, , format] = lines[index];
    const difference = parseClock(stdoff) - firstOffset;
    if (format !== "LMT" || difference === 0 || difference % 86400 !== 0) break;
    last = index;
  }
  return lines.slice(0, last + 1).map((line) => {
    if (line[1] !== "-") throw new Error(`tz-shards: local mean time line with rules "${line[1]}"`);
    if (line.length < 4) throw new Error("tz-shards: a zone that never leaves local mean time");
    const offset = parseClock(line[0]);
    const { local, kind } = untilParts(line.slice(3));
    return [kind === "u" ? local : local - offset, offset];
  });
}

/**
 * Every name in the release, sorted, and the zone each one means: backzone's
 * zone of that name first, then the main data's, then a link, backzone's
 * before the main data's.
 */
export function zoneNames(main, backzone) {
  const zoneOf = (name, seen = new Set()) => {
    if (seen.has(name)) throw new Error(`tz-shards: link cycle at ${name}`);
    seen.add(name);
    if (backzone.zones.has(name) || main.zones.has(name)) return name;
    const target = backzone.links.get(name) ?? main.links.get(name);
    return target === undefined ? null : zoneOf(target, seen);
  };
  const names = [...new Set([...main.zones.keys(), ...main.links.keys(), ...backzone.zones.keys(), ...backzone.links.keys()])].sort();
  return { names, zoneOf };
}

/** The zone a name means in the default build: the main data's zones and links only. */
function mainZoneOf(main, name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`tz-shards: link cycle at ${name}`);
  seen.add(name);
  if (main.zones.has(name)) return name;
  const target = main.links.get(name);
  return target === undefined ? null : mainZoneOf(main, target, seen);
}

/** Minimal ustar reader: the release tarball holds plain files only. */
export function untar(buffer) {
  const files = new Map();
  for (let offset = 0; offset + 512 <= buffer.length;) {
    const name = buffer.toString("latin1", offset, offset + 100).replace(/\0.*$/s, "");
    if (!name) break;
    const size = parseInt(buffer.toString("latin1", offset + 124, offset + 136).replace(/\0.*$/s, "").trim() || "0", 8);
    files.set(name.replace(/^\.\//, ""), buffer.subarray(offset + 512, offset + 512 + size).toString("utf8"));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}

/** The pinned release's files, checked against the pinned SHA-256, with the main data and backzone parsed. */
export async function loadRelease(root) {
  let archive = process.env.TZDATA_TARBALL;
  if (!archive) {
    const cache = resolve(root, ".cache");
    await mkdir(cache, { recursive: true });
    archive = resolve(cache, `tzdata${TZDB_VERSION}.tar.gz`);
    try {
      await access(archive);
    } catch {
      console.log(`downloading ${TZDB_URL} ...`);
      const response = await fetch(TZDB_URL);
      if (!response.ok) throw new Error(`tz-shards: download failed (${response.status})`);
      await writeFile(archive, Buffer.from(await response.arrayBuffer()));
    }
  }
  const bytes = await readFile(archive);
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== TZDB_SHA256) throw new Error(`tz-shards: ${archive} has sha256 ${digest}, expected ${TZDB_SHA256}`);
  const files = untar(gunzipSync(bytes));
  const version = files.get("version")?.trim();
  if (version !== TZDB_VERSION) throw new Error(`tz-shards: archive reports version ${version}`);
  const main = { zones: new Map(), links: new Map() };
  for (const file of MAIN_FILES) {
    const parsed = parseTzdb(files.get(file) ?? "");
    for (const [name, lines] of parsed.zones) main.zones.set(name, lines);
    for (const [name, target] of parsed.links) main.links.set(name, target);
  }
  const backzone = parseTzdb(files.get(BACKZONE) ?? "");
  return { files, main, backzone };
}

/** The 64-bit data block of a TZif file (RFC 8536): transitions, their types, and each type's offset, isdst and designation. */
export function readTzif(buffer) {
  if (buffer.toString("latin1", 0, 4) !== "TZif") throw new Error("tz-shards: not a TZif file");
  const counts = (at) => [0, 1, 2, 3, 4, 5].map((index) => buffer.readUInt32BE(at + 20 + index * 4));
  const [isutcnt, isstdcnt, leapcnt, timecnt, typecnt, charcnt] = counts(0);
  if (buffer[4] < 0x32) throw new Error("tz-shards: TZif version 1 has no 64-bit data");
  const header = 44 + timecnt * 5 + typecnt * 6 + charcnt + leapcnt * 8 + isstdcnt + isutcnt;
  if (buffer.toString("latin1", header, header + 4) !== "TZif") throw new Error("tz-shards: missing second TZif header");
  const [, , , times, types, chars] = counts(header);
  let at = header + 44;
  const t = [];
  for (let index = 0; index < times; index += 1, at += 8) t.push(Number(buffer.readBigInt64BE(at)));
  const typeOf = [...buffer.subarray(at, at + times)];
  at += times;
  const offsets = [];
  const isdst = [];
  const designationAt = [];
  for (let index = 0; index < types; index += 1, at += 6) {
    offsets.push(buffer.readInt32BE(at));
    isdst.push(buffer[at + 4]);
    designationAt.push(buffer[at + 5]);
  }
  const text = buffer.toString("latin1", at, at + chars);
  const designations = designationAt.map((start) => text.slice(start, text.indexOf("\0", start)));
  return { t, typeOf, offsets, isdst, designations };
}

function compile(files, sources) {
  const work = mkdtempSync(join(tmpdir(), "tz-shards-"));
  try {
    for (const file of sources) writeFileSync(join(work, file), files.get(file));
    const out = join(work, "zoneinfo");
    execFileSync("zic", ["-d", out, ...sources.map((file) => join(work, file))], { stdio: ["ignore", "ignore", "pipe"] });
    const compiled = new Map();
    const walk = (directory, prefix) => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(join(directory, entry.name), name);
        else compiled.set(name, readTzif(readFileSync(join(directory, entry.name))));
      }
    };
    walk(out, "");
    return compiled;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** The type in force at Unix second s: type 0 before the first transition (RFC 8536), then each transition's. */
function typeAt(tzif, s) {
  let lo = 0;
  let hi = tzif.t.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tzif.t[mid] <= s) lo = mid + 1;
    else hi = mid;
  }
  return lo === 0 ? 0 : tzif.typeOf[lo - 1];
}

/**
 * Each zone line's end, Unix seconds, placed as zic places it: universal
 * UNTILs as written, standard ones on the line's standard offset, wall ones
 * on the offset in force just before the change. A wall UNTIL ends the line
 * the first time the line's own clock reads it: the earliest instant s with
 * s = UNTIL - (offset in force just before s). Later solutions read the next
 * line's clock, as when the line ends during daylight saving and the clock
 * goes back (Kyiv's 1990 Jul 1 2:00 is 1990-06-30T22:00Z on MSD, +4, and
 * again at 23:00Z on the next line's EEST, +3).
 */
export function lineEnds(lines, tzif) {
  return lines.map((line) => {
    if (line.length < 4) return Infinity;
    const stdoff = parseClock(line[0]);
    const { local, kind } = untilParts(line.slice(3));
    if (kind === "u") return local;
    if (kind === "s") return local - stdoff;
    // Every offset in force within two days of the standard reading is a candidate.
    const offsets = new Set();
    for (let s = local - stdoff - 2 * 86400; ; ) {
      const index = typeAt(tzif, s);
      offsets.add(tzif.offsets[index]);
      const next = tzif.t.find((at) => at > s);
      if (next === undefined || next > local - stdoff + 2 * 86400) break;
      s = next;
    }
    const solutions = [...offsets]
      .map((offset) => local - offset)
      .filter((s) => tzif.offsets[typeAt(tzif, s - 1)] === local - s)
      .sort((a, b) => a - b);
    if (solutions.length) return solutions[0];
    // No instant reads it (the UNTIL fell in a gap of the line's own clock): the reading just before.
    let guess = local - stdoff;
    for (let round = 0; round < 4; round += 1) {
      const next = local - tzif.offsets[typeAt(tzif, guess - 1)];
      if (next === guess) break;
      guess = next;
    }
    return guess;
  });
}

/** The cause of each transition of a compiled zone, from its zone lines. */
export function causes(tzif, lines) {
  const ends = lineEnds(lines, tzif);
  const stdAt = (s) => {
    const index = ends.findIndex((end) => s < end);
    return parseClock(lines[index === -1 ? lines.length - 1 : index][0]);
  };
  return tzif.t.map((s, index) => {
    const before = index === 0 ? 0 : tzif.typeOf[index - 1];
    const after = tzif.typeOf[index];
    const delta = tzif.offsets[after] - tzif.offsets[before];
    if (Math.abs(delta) >= DATE_LINE_SECONDS) return "x";
    if (stdAt(s - 1) !== stdAt(s)) return "l";
    if (delta !== 0 || tzif.isdst[after] !== tzif.isdst[before]) return "d";
    return "l";
  });
}

/** The offsets a compiled zone shows from HISTORY_END on, as [instant, offset] from HISTORY_END itself (the site's rule). */
function historyFrom({ t, typeOf, offsets }) {
  let at = offsets[0];
  const changes = [];
  for (let index = 0; index < t.length; index += 1) {
    if (t[index] <= HISTORY_END) at = offsets[typeOf[index]];
    else changes.push([t[index], offsets[typeOf[index]]]);
  }
  return JSON.stringify([[HISTORY_END, at], ...changes].filter(([, offset], index, all) => index === 0 || offset !== all[index - 1][1]));
}

/** 32-bit FNV-1a of the lower-cased name: the shard and cause-table key. */
export function nameHash(name) {
  const key = name.toLowerCase();
  let hash = 0x811c9dc5;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

const b36 = (n) => n.toString(36);
/** LATER_CAUSES marks: legal change and date line in minutes, then the same in seconds. */
export const LATER_MARKS = ".!_~";
/** LATER_CAUSES keys: the name's hash modulo 36^5, five base-36 digits, unique across the release. */
export const LATER_KEY = 36 ** 5;

/** A shard entry: the types and transitions before HISTORY_END that change the offset, isdst or abbreviation. */
function history(tzif, lines) {
  const cause = causes(tzif, lines);
  const types = [];
  const typeIndex = new Map();
  const typeOfIndex = (type) => {
    const offset = tzif.designations[type] === "-00" ? null : tzif.offsets[type];
    const key = JSON.stringify([offset, tzif.isdst[type], tzif.designations[type]]);
    if (!typeIndex.has(key)) {
      typeIndex.set(key, types.length);
      types.push([offset, tzif.isdst[type], tzif.designations[type]]);
    }
    return typeIndex.get(key);
  };
  let current = typeOfIndex(0);
  const times = [];
  let kinds = "";
  for (let index = 0; index < tzif.t.length; index += 1) {
    if (tzif.t[index] >= HISTORY_END) break;
    const next = typeOfIndex(tzif.typeOf[index]);
    if (next === current) continue;
    if (next >= 36) throw new Error("tz-shards: more than 36 types in one zone");
    times.push(tzif.t[index]);
    kinds += b36(next) + cause[index];
    current = next;
  }
  // Type 0 of the compiled zone, the one before the first transition, is listed first.
  const t = times.map((s, index) => (index === 0 ? b36(s) : b36(s - times[index - 1]))).join(",");
  return { y: types, t, k: kinds };
}

export async function buildShards(root) {
  const { files, main, backzone } = await loadRelease(root);
  const pinned = compile(files, MAIN_FILES.filter((file) => file !== "backward").concat(BACKZONE));
  const host = compile(files, MAIN_FILES);
  const { names, zoneOf } = zoneNames(main, backzone);
  const buckets = Array.from({ length: BUCKETS }, () => ({}));
  const folded = new Set();
  const hashes = new Map();
  const stats = { names: 0, hostLegal: 0, transitions: 0, dst: 0, legal: 0, dateLine: 0, withEra: 0, notInDefaultBuild: [] };
  const later = [];
  const keys = new Map();
  for (const name of names) {
    const key = name.toLowerCase();
    if (folded.has(key)) throw new Error(`tz-shards: two names differ only in case: ${name}`);
    folded.add(key);
    const source = zoneOf(name);
    const lines = source && (backzone.zones.get(source) ?? main.zones.get(source));
    const tzif = source && pinned.get(source);
    if (!lines || !tzif) throw new Error(`tz-shards: ${name} (${source}) did not compile`);
    // Every name of the release, kept or not, has its own hash and cause key.
    const hash = nameHash(name);
    if (hashes.has(hash)) throw new Error(`tz-shards: ${name} and ${hashes.get(hash)} share a hash`);
    hashes.set(hash, name);
    if (keys.has(hash % LATER_KEY)) throw new Error(`tz-shards: ${name} and ${keys.get(hash % LATER_KEY)} share a cause key`);
    keys.set(hash % LATER_KEY, name);
    const hostTzif = host.get(name);
    if (!hostTzif) {
      // Intl cannot resolve a name the default build lacks, so no shard can help it.
      stats.notInDefaultBuild.push(name);
      continue;
    }
    const hostSource = mainZoneOf(main, name);
    const hostLines = main.zones.get(hostSource);
    const hostLegal = historyFrom(tzif) !== historyFrom(hostTzif);
    const era = lmtEraLines(lines);
    const zoneEra = lmtEraLines(hostLegal ? hostLines : lines);
    const entry = {
      n: name,
      s: hostLegal ? hostSource : source,
      ...(hostLegal ? { h: 1 } : {}),
      f: zoneEra ? zoneEra.at(-1)[0] : null,
      ...(era ? { e: era } : {}),
      ...history(hostLegal ? hostTzif : tzif, hostLegal ? hostLines : lines)
    };
    buckets[hash % BUCKETS][key] = entry;
    stats.names += 1;
    if (hostLegal) stats.hostLegal += 1;
    if (era) stats.withEra += 1;
    for (let index = 1; index < entry.k.length; index += 2) {
      stats.transitions += 1;
      stats[{ d: "dst", l: "legal", x: "dateLine" }[entry.k[index]]] += 1;
    }
    // From 1970 on the host answers; keep the default build's non-daylight-saving transitions.
    const cause = causes(hostTzif, hostLines);
    let kept = "";
    let previous = HISTORY_END;
    hostTzif.t.forEach((s, index) => {
      if (s < HISTORY_END || cause[index] === "d") return;
      const before = index === 0 ? 0 : hostTzif.typeOf[index - 1];
      if (hostTzif.offsets[hostTzif.typeOf[index]] === hostTzif.offsets[before]) return;
      const delta = s - previous;
      kept += b36(delta % 60 ? delta : delta / 60) + LATER_MARKS[(cause[index] === "x" ? 1 : 0) + (delta % 60 ? 2 : 0)];
      previous = s;
    });
    if (kept) later.push([hash, kept]);
  }
  later.sort((a, b) => a[0] - b[0]);
  const output = new Map();
  const header = (what) =>
    `// Generated by scripts/build-tz-shards.mjs from tzdata ${TZDB_VERSION} (sha256 ${TZDB_SHA256}) with backzone: ${what}. Do not edit.\n`;
  buckets.forEach((zones, bucket) => {
    const nn = String(bucket).padStart(2, "0");
    const json = JSON.stringify(Object.fromEntries(Object.entries(zones).sort(([a], [b]) => (a < b ? -1 : 1))));
    if (json.includes("'") || json.includes("\\")) throw new Error("tz-shards: unexpected quote or backslash");
    output.set(
      `tzdb-${TZDB_VERSION}-${nn}.ts`,
      `${header(`zone histories before 1970, bucket ${nn}`)}import type { ZoneShardBucket } from "../geo/zone-history.js";\n\nconst bucket: ZoneShardBucket = JSON.parse('${json}');\nexport default bucket;\n`
    );
  });
  const loaders = Array.from({ length: BUCKETS }, (_, bucket) => `  () => import("./tzdb-${TZDB_VERSION}-${String(bucket).padStart(2, "0")}.js")`).join(",\n");
  const laterText = later.map(([hash, kept]) => b36(hash % LATER_KEY).padStart(5, "0") + kept).join(";");
  output.set(
    `tzdb-${TZDB_VERSION}.ts`,
    `${header("the release's identity, its loaders and its causes from 1970")}import type { ZoneShardBucket } from "../geo/zone-history.js";

/**
 * The pinned tzdb release: its version, archive digest and the form its histories were compiled from. The
 * version and digest are typed as strings, because a release that updates the time-zone data changes them.
 */
export const TZDB: Readonly<{ version: string; sha256: string; form: "main+backzone" }> = Object.freeze({
  version: "${TZDB_VERSION}",
  sha256: "${TZDB_SHA256}",
  form: "main+backzone"
});

/** The ${BUCKETS} shard loaders, by FNV-1a hash of the lower-cased name modulo ${BUCKETS}. */
export const SHARD_LOADERS: readonly (() => Promise<{ default: ZoneShardBucket }>)[] = [
${loaders}
];

/**
 * The default build's transitions from 1970 on that change the offset and
 * are not daylight saving, one row per name joined by ";": the name's hash
 * modulo 36^5 in five base-36 digits (unique among the release's names), then
 * per transition the time since the previous one (from 1970) in base 36 and a
 * mark, "." (legal change) or "!" (date line) for minutes, "_" or "~" for
 * seconds.
 */
export const LATER_CAUSES = "${laterText}";
`
  );
  return { output, stats };
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const target = resolve(root, "src/tzdb");
  const { output, stats } = await buildShards(root);
  if (process.argv.includes("--check")) {
    const committed = existsSync(target) ? readdirSync(target).sort() : [];
    const differ =
      [...output.keys()].sort().join() !== committed.join() ||
      [...output].some(([file, text]) => readFileSync(join(target, file), "utf8") !== text);
    if (differ) {
      console.error(`tz-shards: src/tzdb/ differs from tzdb ${TZDB_VERSION}; run node scripts/build-tz-shards.mjs`);
      process.exit(1);
    }
    console.log(`tz-shards: src/tzdb/ matches tzdb ${TZDB_VERSION} (${stats.names} names)`);
    return;
  }
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  let bytes = 0;
  for (const [file, text] of output) {
    writeFileSync(join(target, file), text);
    bytes += Buffer.byteLength(text);
  }
  console.log(`tz-shards: ${stats.names} names (${stats.hostLegal} host-legal, ${stats.withEra} with a local mean time era), ` +
    `${stats.transitions} transitions before 1970 (${stats.dst} dst, ${stats.legal} legal, ${stats.dateLine} date line), ` +
    `${output.size} files, ${bytes} bytes -> src/tzdb/`);
  console.log(`tz-shards: not in the default build, left out: ${stats.notInDefaultBuild.join(", ") || "none"}`);
}

const direct = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (direct) await main();
