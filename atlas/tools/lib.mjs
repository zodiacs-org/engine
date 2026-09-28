/*
 * The atlas as data: loading the JSON files, building a place's timeline of
 * clock readings, and reading a wall-clock time on it.
 *
 * Times are integers in milliseconds. A "wall" value is a local clock reading
 * encoded as if it were UTC (Date.UTC of its fields), so that for an instant
 * t on a clock with offset o, wall = t + o.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ATLAS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = join(ATLAS_DIR, 'data');
export const SCHEMA_PATH = join(ATLAS_DIR, 'schema', 'atlas.schema.json');

export const CLOCKS = ['civil', 'railway'];
export const FLAGS = ['documented', 'inferred', 'uncertain'];

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Loads the manifest and every file it lists. Duplicate ids are reported in
 * `problems` rather than thrown, so the checker can list them all.
 */
export function loadAtlas(dir = DATA_DIR) {
  const manifest = readJson(join(dir, 'atlas.json'));
  const atlas = {
    dir,
    manifest,
    files: new Map(),
    citations: new Map(),
    leads: new Map(),
    places: new Map(),
    jurisdictions: new Map(),
    rules: new Map(),
    ruleFile: new Map(),
    problems: [],
  };
  const add = (map, item, file, what) => {
    if (map.has(item.id)) atlas.problems.push(`${file}: duplicate ${what} id ${item.id}`);
    map.set(item.id, item);
  };
  for (const file of manifest.files) {
    const data = readJson(join(dir, file));
    atlas.files.set(file, data);
    if (data.kind === 'atlas-citations') for (const item of data.citations) add(atlas.citations, item, file, 'citation');
    if (data.kind === 'atlas-leads') for (const item of data.leads) add(atlas.leads, item, file, 'lead');
    if (data.kind === 'atlas-places') for (const item of data.places) add(atlas.places, item, file, 'place');
    if (data.kind === 'atlas-rules') {
      for (const item of data.jurisdictions) add(atlas.jurisdictions, item, file, 'jurisdiction');
      for (const item of data.rules) {
        add(atlas.rules, item, file, 'rule');
        atlas.ruleFile.set(item.id, file);
      }
    }
  }
  return atlas;
}

const LOCAL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;

/** A local reading "YYYY-MM-DDTHH:MM:SS(.sss)" as a wall value in milliseconds. */
export function parseLocal(text) {
  const match = LOCAL.exec(text);
  if (!match) throw new RangeError(`not a local time: ${text}`);
  const [, y, mo, d, h, mi, s, ms = '0'] = match;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), Number(ms.padEnd(3, '0')));
  const check = new Date(wall);
  if (check.getUTCFullYear() !== Number(y) || check.getUTCMonth() !== Number(mo) - 1 || check.getUTCDate() !== Number(d)) {
    throw new RangeError(`no such date: ${text}`);
  }
  return wall;
}

/** A wall value (or UTC instant) as "YYYY-MM-DDTHH:MM:SS(.sss)". */
export function formatWall(ms) {
  const iso = new Date(ms).toISOString();
  const trimmed = iso.endsWith('.000Z') ? iso.slice(0, 19) : iso.slice(0, 23);
  return trimmed;
}

export function formatUtc(ms) {
  return `${formatWall(ms)}Z`;
}

/** Offset in seconds as ±H:MM:SS(.sss). */
export function formatOffset(ms) {
  const sign = ms < 0 ? '-' : '+';
  let rest = Math.abs(ms);
  const h = Math.floor(rest / 3_600_000);
  rest -= h * 3_600_000;
  const m = Math.floor(rest / 60_000);
  rest -= m * 60_000;
  const s = Math.floor(rest / 1000);
  const frac = rest - s * 1000;
  const base = `${sign}${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return frac ? `${base}.${String(frac).padStart(3, '0')}` : base;
}

/** A rule's offset at a place, in milliseconds east of UTC. */
export function offsetMs(offset, place) {
  if (offset.type === 'fixed') return Math.round(offset.seconds * 1000);
  if (offset.type === 'local-mean-time') {
    if (typeof place?.longitude !== 'number' || !Number.isFinite(place.longitude)) {
      throw new RangeError('local mean time needs the place\'s longitude');
    }
    // 360 degrees in 24 hours: 240 s of time per degree east.
    return Math.round(place.longitude * 240_000);
  }
  throw new RangeError(`unknown offset type ${offset.type}`);
}

function boundaryUtc(boundary, beforeOffset, afterOffset, where) {
  const wall = parseLocal(boundary.local);
  if (boundary.reckoning === 'utc') return wall;
  const offset = boundary.reckoning === 'before' ? beforeOffset : afterOffset;
  if (offset === null || offset === undefined) {
    throw new RangeError(`${where}: reckoning "${boundary.reckoning}" has no clock on that side`);
  }
  return wall - offset;
}

const PRECISION_MS = {
  second: 0,
  minute: 0,
  hour: 3_600_000,
  day: 86_400_000,
  days: 3 * 86_400_000,
  weeks: 14 * 86_400_000,
};

/**
 * A place's timeline for one clock: one segment per rule, in order, with
 * the rule's offset at that place and its start and end as UTC instants.
 * `place` needs `jurisdiction` and, for local mean time, `longitude`.
 * Returns null when the jurisdiction keeps no such clock.
 */
export function buildTimeline(atlas, place, clock = 'civil') {
  const jurisdiction = atlas.jurisdictions.get(place.jurisdiction);
  if (!jurisdiction) throw new RangeError(`unknown jurisdiction ${place.jurisdiction}`);
  const ids = jurisdiction.timeline[clock];
  if (!ids) return null;
  const segments = ids.map((id) => {
    const rule = atlas.rules.get(id);
    if (!rule) throw new RangeError(`${jurisdiction.id}: unknown rule ${id}`);
    return { rule, offsetMs: offsetMs(rule.offset, place) };
  });
  segments.forEach((segment, index) => {
    const before = index > 0 ? segments[index - 1].offsetMs : null;
    const after = index + 1 < segments.length ? segments[index + 1].offsetMs : null;
    segment.startMs = boundaryUtc(segment.rule.start, before, segment.offsetMs, `${segment.rule.id} start`);
    segment.endMs = boundaryUtc(segment.rule.end, segment.offsetMs, after, `${segment.rule.id} end`);
    segment.index = index;
  });
  // Instants around changes that the sources do not fix exactly. A change
  // is described twice, as the end of one rule and the start of the next;
  // each description that is imprecise (a window, or a precision coarser
  // than the minute) marks a span of instants, and the span applies on both
  // sides. `offsets` are the clocks on either side, so that a wall reading
  // can be tested against the span as read on either clock.
  for (const segment of segments) segment.uncertainSpans = [];
  for (let index = 0; index + 1 < segments.length; index += 1) {
    const left = segments[index];
    const right = segments[index + 1];
    // A change that leaves the reading as it was (a new legal basis for the
    // same offset) cannot make a reading uncertain, however vague its date.
    if (left.offsetMs === right.offsetMs) continue;
    const offsets = [left.offsetMs, right.offsetMs];
    for (const boundary of [left.rule.end, right.rule.start]) {
      if (boundary.kind !== 'event') continue;
      let span = null;
      if (boundary.window) {
        span = {
          from: boundaryUtc({ ...boundary, local: boundary.window.earliest }, left.offsetMs, right.offsetMs, 'window'),
          to: boundaryUtc({ ...boundary, local: boundary.window.latest }, left.offsetMs, right.offsetMs, 'window'),
          boundary,
          offsets,
        };
      } else if (PRECISION_MS[boundary.precision] > 0) {
        const width = PRECISION_MS[boundary.precision];
        span = { from: right.startMs - width, to: right.startMs + width, boundary, offsets };
      }
      if (span) {
        left.uncertainSpans.push(span);
        right.uncertainSpans.push(span);
      }
    }
  }
  return segments;
}

/** The wall reading of a UTC instant on a timeline, or null outside it. */
export function wallAt(timeline, utcMs) {
  for (const segment of timeline) {
    if (utcMs >= segment.startMs && utcMs < segment.endMs) {
      return { wallMs: utcMs + segment.offsetMs, segment };
    }
  }
  return null;
}

function flagRank(flag) {
  return FLAGS.indexOf(flag);
}

/**
 * One instant of a reading, with its rule and uncertainty. `given` says what
 * the caller knows. From a UTC instant ('utc'), only an instant inside a
 * span is uncertain: outside it, the clock in force is known. From a wall
 * reading ('local'), the reading is uncertain when the span, read on either
 * clock, contains it: the change may have come before or after it, and the
 * reading may belong to the other clock.
 */
function reading(segment, utcMs, given = 'local') {
  const rule = segment.rule;
  const reasons = [`${rule.id}: ${rule.uncertainty.reason}`];
  let flag = rule.uncertainty.flag;
  const wallMs = utcMs + segment.offsetMs;
  for (const span of segment.uncertainSpans) {
    const near = given === 'utc'
      ? utcMs >= span.from && utcMs <= span.to
      : span.offsets.some((offset) => wallMs >= span.from + offset && wallMs <= span.to + offset);
    if (!near) continue;
    flag = 'uncertain';
    // The end of one rule and the start of the next often describe the same
    // change in the same words; say it once.
    const reason = `within the uncertain limits of the change at ${span.boundary.local} (${span.boundary.reckoning} clock)${span.boundary.note ? `: ${span.boundary.note}` : ''}`;
    if (!reasons.includes(reason)) reasons.push(reason);
  }
  return {
    utc: formatUtc(utcMs),
    utcMs,
    offset: formatOffset(segment.offsetMs),
    offsetSeconds: segment.offsetMs / 1000,
    rule: rule.id,
    ruleVersion: rule.version,
    isDst: rule.isDst,
    abbreviation: rule.abbreviation ?? null,
    uncertainty: { flag, reasons },
    citations: rule.citations,
  };
}

/**
 * Reads a wall-clock time on a timeline.
 *
 * status "ok": one instant; "ambiguous": the reading occurred more than once
 * (clocks were set back), every instant listed, earliest first;
 * "nonexistent": clocks skipped the reading (set forward), and `instants`
 * holds the one instant the reading denotes if the clock in force before the
 * change had run on, which is where the change's policy puts it; and
 * "out-of-coverage" outside the atlas window.
 */
export function resolveWall(timeline, wallMs) {
  const first = timeline[0];
  const last = timeline[timeline.length - 1];
  const coverageStart = first.startMs + first.offsetMs;
  const coverageEnd = last.endMs + last.offsetMs;
  const found = [];
  for (const segment of timeline) {
    const utcMs = wallMs - segment.offsetMs;
    if (utcMs >= segment.startMs && utcMs < segment.endMs) found.push({ segment, utcMs });
  }
  found.sort((a, b) => a.utcMs - b.utcMs);
  if (found.length === 1) return { status: 'ok', instants: [reading(found[0].segment, found[0].utcMs)] };
  if (found.length > 1) {
    return { status: 'ambiguous', instants: found.map(({ segment, utcMs }) => reading(segment, utcMs)) };
  }
  if (wallMs < coverageStart || wallMs >= coverageEnd) return { status: 'out-of-coverage', instants: [] };
  for (let index = 0; index + 1 < timeline.length; index += 1) {
    const before = timeline[index];
    const after = timeline[index + 1];
    const skippedFrom = before.endMs + before.offsetMs;
    const skippedTo = after.startMs + after.offsetMs;
    if (wallMs >= skippedFrom && wallMs < skippedTo) {
      const utcMs = wallMs - before.offsetMs;
      const result = reading(after, utcMs);
      result.uncertainty.reasons.unshift(
        `clocks went from ${formatWall(skippedFrom)} to ${formatWall(skippedTo)}; this reading never occurred and is taken on the clock in force before the change`,
      );
      return { status: 'nonexistent', instants: [result], skipped: { from: formatWall(skippedFrom), to: formatWall(skippedTo) } };
    }
  }
  throw new Error(`reading ${formatWall(wallMs)} fell between segments: the timeline is not contiguous`);
}

/**
 * An unlisted place read by longitude: { jurisdiction, longitude, department }.
 * Only a jurisdiction with `readByLongitude` can be read this way, and only
 * for a département it lists, at a longitude inside that area's limits.
 * Anything else is refused with the reason, so that a place the atlas does
 * not cover is never given a covered place's rules.
 */
export function adHocPlace(atlas, { jurisdiction, longitude, department }) {
  const found = atlas.jurisdictions.get(jurisdiction);
  if (!found) throw new RangeError(`unknown jurisdiction ${jurisdiction}`);
  const rule = found.readByLongitude;
  if (!rule) {
    const listed = [...atlas.places.values()].filter((place) => place.jurisdiction === jurisdiction).map((place) => place.id);
    throw new RangeError(`jurisdiction ${jurisdiction} covers only its listed places (${listed.join(', ')}); read them with --place`);
  }
  if (typeof longitude !== 'number' || !Number.isFinite(longitude)) throw new RangeError('give the place\'s longitude in degrees east');
  if (!department) {
    throw new RangeError(`give the place's département (--department): ${jurisdiction} covers some départements and not others`);
  }
  const excluded = (rule.excluded ?? []).find((entry) => entry.departments.includes(department));
  if (excluded) throw new RangeError(`département ${department} is not covered by ${jurisdiction}: ${excluded.reason}`);
  const area = rule.areas.find((entry) => entry.departments.includes(department));
  if (!area) throw new RangeError(`département ${department} is not covered by ${jurisdiction}`);
  if (!(longitude >= area.minLongitude && longitude <= area.maxLongitude)) {
    throw new RangeError(`longitude ${longitude} is outside ${area.name} (${area.minLongitude} to ${area.maxLongitude} degrees east), where ${jurisdiction} applies`);
  }
  return { jurisdiction, longitude, department };
}

/** Resolves a place id, or an ad-hoc { jurisdiction, longitude, department }. */
export function placeFor(atlas, spec) {
  if (typeof spec === 'string') {
    const place = atlas.places.get(spec);
    if (!place) throw new RangeError(`unknown place ${spec}`);
    return place;
  }
  return adHocPlace(atlas, spec);
}

function noSuchClock(atlas, place, clock) {
  const kept = Object.keys(atlas.jurisdictions.get(place.jurisdiction).timeline).join(', ');
  return {
    status: 'no-such-clock',
    reason: `jurisdiction ${place.jurisdiction} keeps no ${clock} clock (it keeps: ${kept}); the atlas has a separate railway clock only where the sources describe railway time differing from civil time`,
    instants: [],
  };
}

export function resolve(atlas, spec, local, clock = 'civil') {
  const place = placeFor(atlas, spec);
  const head = { place: place.id ?? null, jurisdiction: place.jurisdiction, clock, local };
  const timeline = buildTimeline(atlas, place, clock);
  if (!timeline) return { ...head, ...noSuchClock(atlas, place, clock) };
  return { ...head, ...resolveWall(timeline, parseLocal(local)) };
}

const UTC = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)Z?$/;

/** A UTC time "YYYY-MM-DDTHH:MM[:SS[.sss]][Z]" in milliseconds; always UTC, whatever the host's zone. */
export function parseUtc(text) {
  const match = UTC.exec(text);
  if (!match) throw new RangeError(`not a UTC time (YYYY-MM-DDTHH:MM[:SS][Z], no other offset): ${text}`);
  const local = /T\d{2}:\d{2}$/.test(match[1]) ? `${match[1]}:00` : match[1];
  return parseLocal(local);
}

/**
 * What a place's clock read at a UTC instant. The instant is reported with
 * the same fields as a reading resolved from local time (offset, rule and
 * version, citations, uncertainty including the limits of imprecise
 * changes), plus the local reading and whether that reading occurred once
 * or twice on the clock.
 */
export function resolveUtc(atlas, spec, utc, clock = 'civil') {
  const place = placeFor(atlas, spec);
  const utcMs = parseUtc(utc);
  const head = { place: place.id ?? null, jurisdiction: place.jurisdiction, clock, utc: formatUtc(utcMs) };
  const timeline = buildTimeline(atlas, place, clock);
  if (!timeline) return { ...head, ...noSuchClock(atlas, place, clock) };
  const found = wallAt(timeline, utcMs);
  if (!found) return { ...head, status: 'out-of-coverage', instants: [] };
  const again = resolveWall(timeline, found.wallMs);
  return {
    ...head,
    status: 'ok',
    local: formatWall(found.wallMs),
    localReading: again.status === 'ambiguous' ? 'occurred more than once' : 'occurred once',
    instants: [reading(found.segment, utcMs, 'utc')],
  };
}
