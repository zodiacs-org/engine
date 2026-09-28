#!/usr/bin/env node
/*
 * The atlas checks, run in CI:
 *
 *   node atlas/tools/check.mjs
 *
 * 1. Every data file validates against atlas/schema/atlas.schema.json.
 * 2. Every rule cites at least one citation, and every citation has a URL,
 *    a retrieval date, a locator, an excerpt of at most 40 words and a
 *    record of how the excerpt was checked; every id a rule, place,
 *    jurisdiction or explanation names exists, and nothing is defined and
 *    left unused. A jurisdiction that can be read by longitude lists each
 *    département once, as covered or refused.
 * 3. Every place's timeline, for each clock it keeps, starts at the start of
 *    the coverage window, ends at its end, and has no gap or overlap: each
 *    rule ends at the instant the next one starts. (A railway timeline may
 *    use civil rules for the years the railways kept civil time.)
 * 4. Round trips at every place: for a sample of instants inside each rule
 *    and on both sides of every boundary, UTC -> local -> UTC and
 *    local -> UTC -> local come back unchanged; readings skipped by a change
 *    are reported nonexistent and readings repeated by one ambiguous.
 * 5. The tzdb comparison is current and every difference is explained
 *    (atlas/tools/compare-tzdb.mjs), once atlas/tzdb/tzdb-2025c.json exists.
 *
 * Exits 1 and lists every problem when any check fails.
 */
import { existsSync } from 'node:fs';
import { DATA_DIR, SCHEMA_PATH, buildTimeline, formatUtc, formatWall, loadAtlas, parseLocal, readJson, resolveWall, wallAt } from './lib.mjs';
import { checkSchemaKeywords, validate } from './schema.mjs';

/** The longest excerpt, in words (runs of text between spaces, "[...]" included). */
export const MAX_EXCERPT_WORDS = 40;

/** Runs checks 1-4 on a loaded atlas; returns { problems, stats }. */
export function checkAtlas(atlas, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const problems = [...atlas.problems];
  const problem = (text) => problems.push(text);
  const stats = { roundTrips: 0, boundaries: 0 };

  // 1. Schema.
  const schema = readJson(SCHEMA_PATH);
  checkSchemaKeywords(schema);
  for (const p of validate(atlas.manifest, schema)) problem(`atlas.json: ${p}`);
  for (const [file, data] of atlas.files) for (const p of validate(data, schema)) problem(`${file}: ${p}`);
  if (problems.length) return { problems, stats };
  const { manifest } = atlas;

  // 2. Citations and references.
  const words = (text) => text.trim().split(/\s+/u).length;
  for (const citation of atlas.citations.values()) {
    if (words(citation.excerpt) > MAX_EXCERPT_WORDS) problem(`citation ${citation.id}: excerpt has ${words(citation.excerpt)} words (at most ${MAX_EXCERPT_WORDS})`);
    if (citation.retrieved > today) problem(`citation ${citation.id}: retrieved in the future (${citation.retrieved})`);
    try {
      parseLocal(`${citation.date}T00:00:00`);
      parseLocal(`${citation.retrieved}T00:00:00`);
      for (const check of citation.checks) parseLocal(`${check.date}T00:00:00`);
    } catch (error) {
      problem(`citation ${citation.id}: ${error.message}`);
    }
    for (const check of citation.checks) {
      if (check.date > today) problem(`citation ${citation.id}: checked in the future (${check.date})`);
      if (check.date < citation.retrieved) problem(`citation ${citation.id}: checked (${check.date}) before it was retrieved (${citation.retrieved})`);
      if (check.result === 'partial' && !check.note) problem(`citation ${citation.id}: a partial ${check.method} check needs a note saying what was not confirmed`);
    }
  }
  const citedBy = new Map();
  const cite = (id, by) => {
    if (!atlas.citations.has(id)) problem(`${by}: cites unknown citation ${id}`);
    citedBy.set(id, (citedBy.get(id) ?? 0) + 1);
  };
  for (const rule of atlas.rules.values()) {
    for (const id of rule.citations) cite(id, `rule ${rule.id}`);
    for (const boundary of [rule.start, rule.end]) {
      for (const id of boundary.citations ?? []) cite(id, `rule ${rule.id} boundary`);
      if (boundary.kind === 'coverage' && boundary.window) problem(`rule ${rule.id}: a coverage edge has no window`);
      if (boundary.window) {
        const local = parseLocal(boundary.local);
        if (!(parseLocal(boundary.window.earliest) <= local && local <= parseLocal(boundary.window.latest))) {
          problem(`rule ${rule.id}: boundary ${boundary.local} lies outside its window`);
        }
      }
    }
    for (const change of rule.changes ?? []) {
      if (change.version > rule.version) problem(`rule ${rule.id}: a change names version ${change.version} > ${rule.version}`);
    }
    if ((rule.changes ?? []).length !== rule.version - 1) problem(`rule ${rule.id}: version ${rule.version} needs ${rule.version - 1} change entries`);
  }
  const usedRules = new Set();
  for (const jurisdiction of atlas.jurisdictions.values()) {
    for (const [clock, ids] of Object.entries(jurisdiction.timeline)) {
      for (const id of ids) {
        const rule = atlas.rules.get(id);
        if (!rule) {
          problem(`jurisdiction ${jurisdiction.id}: unknown rule ${id}`);
          continue;
        }
        // A railway timeline may run on civil rules where the railways kept
        // civil time; a civil timeline never runs on a railway rule.
        if (rule.clock === 'railway' && clock !== 'railway') problem(`jurisdiction ${jurisdiction.id}: railway rule ${id} in the ${clock} timeline`);
        usedRules.add(id);
      }
      if (new Set(ids).size !== ids.length) problem(`jurisdiction ${jurisdiction.id}: a rule appears twice in the ${clock} timeline`);
    }
  }
  for (const id of atlas.rules.keys()) if (!usedRules.has(id)) problem(`rule ${id} is in no timeline`);
  const placed = new Set();
  for (const place of atlas.places.values()) {
    const jurisdiction = atlas.jurisdictions.get(place.jurisdiction);
    if (!jurisdiction) {
      problem(`place ${place.id}: unknown jurisdiction ${place.jurisdiction}`);
      continue;
    }
    if (jurisdiction.country !== place.country) problem(`place ${place.id}: country ${place.country}, jurisdiction ${jurisdiction.id} is ${jurisdiction.country}`);
    placed.add(jurisdiction.id);
  }
  for (const id of atlas.jurisdictions.keys()) if (!placed.has(id)) problem(`jurisdiction ${id} has no place`);
  for (const jurisdiction of atlas.jurisdictions.values()) {
    const rule = jurisdiction.readByLongitude;
    if (!rule) continue;
    const seen = new Map();
    const note = (department, where) => {
      if (seen.has(department)) problem(`jurisdiction ${jurisdiction.id}: département ${department} is listed in ${seen.get(department)} and in ${where}`);
      seen.set(department, where);
    };
    for (const area of rule.areas) {
      if (!(area.minLongitude < area.maxLongitude)) problem(`jurisdiction ${jurisdiction.id}: area ${area.name} has no longitude range`);
      for (const department of area.departments) note(department, `area ${area.name}`);
    }
    for (const [index, entry] of rule.excluded.entries()) for (const department of entry.departments) note(department, `exclusion ${index + 1}`);
    for (const place of atlas.places.values()) {
      if (place.jurisdiction === jurisdiction.id && !rule.areas.some((area) => place.longitude >= area.minLongitude && place.longitude <= area.maxLongitude)) {
        problem(`place ${place.id}: longitude ${place.longitude} is outside every area of ${jurisdiction.id}`);
      }
    }
  }
  const explanationsFile = [...atlas.files.values()].find((data) => data.kind === 'atlas-tzdb-explanations');
  for (const explanation of explanationsFile?.explanations ?? []) {
    for (const id of explanation.citations) cite(id, `tzdb explanation ${explanation.id}`);
    for (const id of explanation.match.places ?? []) if (!atlas.places.has(id)) problem(`tzdb explanation ${explanation.id}: unknown place ${id}`);
    for (const id of explanation.match.rules ?? []) if (!atlas.rules.has(id)) problem(`tzdb explanation ${explanation.id}: unknown rule ${id}`);
  }
  for (const id of atlas.citations.keys()) if (!citedBy.has(id)) problem(`citation ${id} is cited by nothing`);
  for (const lead of atlas.leads.values()) if (!lead.note) problem(`lead ${lead.id}: no note`);
  if (problems.length) return { problems, stats };

  // 3. Coverage and contiguity; 4. round trips.
  const coverageStart = parseLocal(manifest.coverage.start);
  const coverageEnd = parseLocal(manifest.coverage.end);
  const expect = (condition, text) => {
    if (!condition) problem(text);
    return condition;
  };

  const roundTripInstant = (where, timeline, utcMs) => {
    const found = wallAt(timeline, utcMs);
    if (!expect(found, `${where}: ${formatUtc(utcMs)} has no reading`)) return;
    const result = resolveWall(timeline, found.wallMs);
    stats.roundTrips += 1;
    const back = result.instants.map((instant) => instant.utcMs);
    if (result.status !== 'ok' && result.status !== 'ambiguous') {
      problem(`${where}: ${formatUtc(utcMs)} reads ${formatWall(found.wallMs)}, which resolves as ${result.status}`);
      return;
    }
    expect(back.includes(utcMs), `${where}: ${formatUtc(utcMs)} reads ${formatWall(found.wallMs)}, which resolves to ${back.map(formatUtc).join(', ')}`);
    for (const instant of back) {
      const again = wallAt(timeline, instant);
      expect(again && again.wallMs === found.wallMs, `${where}: ${formatWall(found.wallMs)} -> ${formatUtc(instant)} reads back as ${again ? formatWall(again.wallMs) : 'nothing'}`);
    }
  };

  const checkTimeline = (where, timeline) => {
    const before = problems.length;
    const first = timeline[0];
    const last = timeline[timeline.length - 1];
    expect(first.rule.start.kind === 'coverage' && first.rule.start.local === manifest.coverage.start,
      `${where}: the first rule (${first.rule.id}) must start at the coverage start ${manifest.coverage.start}`);
    expect(last.rule.end.kind === 'coverage' && last.rule.end.local === manifest.coverage.end,
      `${where}: the last rule (${last.rule.id}) must end at the coverage end ${manifest.coverage.end}`);
    expect(first.startMs + first.offsetMs === coverageStart, `${where}: the window starts at the reading ${formatWall(first.startMs + first.offsetMs)}`);
    expect(last.endMs + last.offsetMs === coverageEnd, `${where}: the window ends at the reading ${formatWall(last.endMs + last.offsetMs)}`);
    for (const [index, segment] of timeline.entries()) {
      expect(segment.startMs < segment.endMs, `${where}: ${segment.rule.id} starts ${formatUtc(segment.startMs)}, not before its end ${formatUtc(segment.endMs)}`);
      if (index > 0) expect(segment.rule.start.kind === 'event', `${where}: ${segment.rule.id} starts at a coverage edge inside the window`);
      if (index + 1 < timeline.length) {
        expect(segment.rule.end.kind === 'event', `${where}: ${segment.rule.id} ends at a coverage edge inside the window`);
        const next = timeline[index + 1];
        const delta = next.startMs - segment.endMs;
        expect(delta === 0,
          `${where}: ${delta > 0 ? 'gap' : 'overlap'} of ${Math.abs(delta) / 1000} s between ${segment.rule.id} (ends ${formatUtc(segment.endMs)}) and ${next.rule.id} (starts ${formatUtc(next.startMs)})`);
      }
    }
    if (problems.length > before) return;

    for (const segment of timeline) {
      const span = segment.endMs - segment.startMs;
      const samples = new Set([segment.startMs, segment.startMs + Math.floor(span / 2), segment.endMs - 1]);
      if (span > 2000) {
        samples.add(segment.startMs + 1000);
        samples.add(segment.endMs - 1000);
      }
      for (const instant of samples) roundTripInstant(`${where} ${segment.rule.id}`, timeline, instant);
    }
    for (let index = 0; index + 1 < timeline.length; index += 1) {
      const previous = timeline[index];
      const next = timeline[index + 1];
      const at = next.startMs;
      const label = `${where} ${previous.rule.id}|${next.rule.id}`;
      stats.boundaries += 1;
      for (const instant of [at - 1000, at - 1, at, at + 1, at + 1000]) roundTripInstant(label, timeline, instant);
      const change = next.offsetMs - previous.offsetMs;
      if (change > 0) {
        const skipped = at + previous.offsetMs + Math.floor(change / 2);
        const result = resolveWall(timeline, skipped);
        expect(result.status === 'nonexistent', `${label}: ${formatWall(skipped)} was skipped but resolves as ${result.status}`);
        expect(result.instants[0]?.utcMs === skipped - previous.offsetMs, `${label}: a skipped reading is not taken on the earlier clock`);
      } else if (change < 0) {
        const repeated = at + next.offsetMs + Math.floor(-change / 2);
        const result = resolveWall(timeline, repeated);
        expect(result.status === 'ambiguous' && result.instants.length === 2,
          `${label}: ${formatWall(repeated)} occurred twice but resolves as ${result.status} (${result.instants.length})`);
      }
    }
    expect(resolveWall(timeline, coverageStart - 1).status === 'out-of-coverage', `${where}: a reading before the window is not out-of-coverage`);
    expect(resolveWall(timeline, coverageEnd).status === 'out-of-coverage', `${where}: the reading at the window's end is not out-of-coverage`);
  };

  for (const place of atlas.places.values()) {
    const jurisdiction = atlas.jurisdictions.get(place.jurisdiction);
    for (const clock of Object.keys(jurisdiction.timeline)) {
      let timeline;
      try {
        timeline = buildTimeline(atlas, place, clock);
      } catch (error) {
        problem(`${place.id} ${clock}: ${error.message}`);
        continue;
      }
      checkTimeline(`${place.id} ${clock}`, timeline);
    }
  }
  return { problems, stats };
}

export function summary(atlas, stats) {
  const byType = {};
  for (const citation of atlas.citations.values()) byType[citation.type] = (byType[citation.type] ?? 0) + 1;
  const byFlag = {};
  for (const rule of atlas.rules.values()) byFlag[rule.uncertainty.flag] = (byFlag[rule.uncertainty.flag] ?? 0) + 1;
  const byBasis = {};
  const byCheck = {};
  for (const citation of atlas.citations.values()) {
    byBasis[citation.excerptBasis] = (byBasis[citation.excerptBasis] ?? 0) + 1;
    for (const key of new Set(citation.checks.map((check) => `${check.method} ${check.result}`))) byCheck[key] = (byCheck[key] ?? 0) + 1;
  }
  return [
    `atlas ${atlas.manifest.version}: ${atlas.places.size} places, ${atlas.jurisdictions.size} jurisdictions, ${atlas.rules.size} rules, ${atlas.citations.size} citations`,
    `  rules by flag: ${Object.entries(byFlag).map(([key, value]) => `${key} ${value}`).join(', ') || 'none'}`,
    `  citations by type: ${Object.entries(byType).sort().map(([key, value]) => `${key} ${value}`).join(', ') || 'none'}`,
    `  excerpts taken from: ${Object.entries(byBasis).sort().map(([key, value]) => `${key} ${value}`).join(', ')}`,
    `  excerpts checked against (citations): ${Object.entries(byCheck).sort().map(([key, value]) => `${key} ${value}`).join(', ')}`,
    `  ${stats.boundaries} boundaries and ${stats.roundTrips} round trips checked`,
  ].join('\n');
}

async function main() {
  const atlas = loadAtlas(DATA_DIR);
  const { problems, stats } = checkAtlas(atlas);
  if (!problems.length) {
    const { EXTRACT_PATH } = await import('./tzdb-extract.mjs');
    if (existsSync(EXTRACT_PATH)) {
      const { compareAll, checkComparison } = await import('./compare-tzdb.mjs');
      problems.push(...checkComparison(atlas, compareAll(atlas)));
      stats.tzdb = true;
    }
  }
  if (problems.length) {
    console.error(`atlas: ${problems.length} problem(s)\n  ${problems.slice(0, 200).join('\n  ')}${problems.length > 200 ? '\n  ...' : ''}`);
    process.exit(1);
  }
  console.log(summary(atlas, stats));
  console.log(stats.tzdb ? '  tzdb comparison current, every difference explained' : '  tzdb comparison not present yet (atlas/tzdb/tzdb-2025c.json)');
  console.log('atlas: all checks passed');
}

if (process.argv[1] && process.argv[1].endsWith('check.mjs')) {
  main().catch((error) => {
    console.error(`atlas: ${error.stack ?? error.message}`);
    process.exit(1);
  });
}
