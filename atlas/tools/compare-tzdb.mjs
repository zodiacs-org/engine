#!/usr/bin/env node
/*
 * Compares every covered place's civil time with tzdb 2025c + backzone over
 * the whole coverage window, and writes
 *
 *   atlas/tzdb/differences.json   every period where the two differ
 *   atlas/TZDB-DIFFERENCES.md     the same, with its explanation and citations,
 *                                 and the periods where they agree
 *
 *   node atlas/tools/compare-tzdb.mjs           write both files
 *   node atlas/tools/compare-tzdb.mjs --check   fail if either is stale
 *
 * It reads the committed extract (atlas/tzdb/tzdb-2025c.json, from
 * tzdb-extract.mjs), so it runs offline. Each place is compared with its
 * `tzdbZone` (the zone tzdb assigns to where it is) and any `compareZones`.
 * A difference is a period in which the offsets differ by a second or more.
 * Each must match exactly one entry of atlas/data/tzdb-explanations.json:
 * the entry lists the places, zones and atlas rules it covers and the atlas
 * and tzdb offsets it expects, so a change on either side that alters a
 * difference leaves it unexplained until the entry is reviewed. Each entry
 * must explain at least one difference, and every value it lists must occur
 * in a difference it explains. Offsets that differ by less than a second
 * (tzdb rounds mean times to whole seconds) are listed separately as
 * rounding, not as differences.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ATLAS_DIR, buildTimeline, formatOffset, formatUtc, formatWall, loadAtlas, readJson, wallAt } from './lib.mjs';
import { EXTRACT_PATH } from './tzdb-extract.mjs';

export const DIFFERENCES_PATH = join(ATLAS_DIR, 'tzdb', 'differences.json');
export const REPORT_PATH = join(ATLAS_DIR, 'TZDB-DIFFERENCES.md');

function tzdbTimeline(zone) {
  const steps = [{ fromMs: Number.NEGATIVE_INFINITY, offsetMs: zone.initial.offset * 1000, abbr: zone.initial.abbr, isDst: zone.initial.isDst }];
  for (const transition of zone.transitions) {
    steps.push({ fromMs: transition.at * 1000, offsetMs: transition.offset * 1000, abbr: transition.abbr, isDst: transition.isDst });
  }
  return steps;
}

function tzdbAt(steps, utcMs) {
  let current = steps[0];
  for (const step of steps) {
    if (step.fromMs <= utcMs) current = step;
    else break;
  }
  return current;
}

/** Periods of one place against one zone: each with the atlas rule, both offsets and their difference. */
export function comparePlace(atlas, place, zoneName, extract) {
  const zone = extract.zones[zoneName];
  if (!zone) throw new Error(`${place.id}: zone ${zoneName} is not in the tzdb extract; rerun tzdb-extract.mjs`);
  const timeline = buildTimeline(atlas, place, 'civil');
  const steps = tzdbTimeline(zone);
  const start = timeline[0].startMs;
  const end = timeline[timeline.length - 1].endMs;
  const cuts = new Set([start, end]);
  for (const segment of timeline) cuts.add(segment.startMs);
  for (const step of steps) if (step.fromMs > start && step.fromMs < end) cuts.add(step.fromMs);
  const points = [...cuts].sort((a, b) => a - b);
  const periods = [];
  for (let index = 0; index + 1 < points.length; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const { segment } = wallAt(timeline, from);
    const tz = tzdbAt(steps, from);
    const deltaMs = segment.offsetMs - tz.offsetMs;
    const last = periods[periods.length - 1];
    if (last && last.rule === segment.rule.id && last.tzdbOffsetMs === tz.offsetMs && last.tzdbAbbr === tz.abbr && last.deltaMs === deltaMs) {
      last.toMs = to;
    } else {
      periods.push({ fromMs: from, toMs: to, rule: segment.rule.id, atlasOffsetMs: segment.offsetMs, tzdbOffsetMs: tz.offsetMs, tzdbAbbr: tz.abbr, deltaMs });
    }
  }
  return periods;
}

/** Offsets are compared to the millisecond. */
const sameOffset = (a, b) => Math.abs(a - b) < 0.0005;

function explains(match, difference) {
  return match.places.includes(difference.place)
    && match.zones.includes(difference.zone)
    && match.rules.includes(difference.atlasRule)
    && match.atlasOffsets.some((value) => sameOffset(value, difference.atlasOffsetSeconds))
    && match.tzdbOffsets.some((value) => sameOffset(value, difference.tzdbOffsetSeconds));
}

/**
 * Gives each difference its explanation (the one entry that matches it) and
 * returns the problems: differences matched by no entry or by several,
 * entries that match nothing, and values an entry lists that none of its
 * differences has.
 */
export function assignExplanations(differences, explanations) {
  const problems = [];
  const where = (difference) => `${difference.place} against ${difference.zone} from ${difference.from} to ${difference.to} (${difference.atlasRule}, atlas ${difference.atlasOffset}, tzdb ${difference.tzdbOffset})`;
  const explained = new Map(explanations.map((explanation) => [explanation.id, []]));
  for (const difference of differences) {
    const found = explanations.filter((explanation) => explains(explanation.match, difference));
    difference.explanation = found.length === 1 ? found[0].id : null;
    if (found.length === 1) explained.get(found[0].id).push(difference);
    else if (found.length === 0) problems.push(`tzdb: ${where(difference)} differs by ${difference.differenceSeconds} s with no explanation`);
    else problems.push(`tzdb: ${where(difference)} matches ${found.length} explanations (${found.map((explanation) => explanation.id).join(', ')}); it must match exactly one`);
  }
  for (const explanation of explanations) {
    const mine = explained.get(explanation.id);
    if (!mine.length) {
      problems.push(`tzdb: explanation ${explanation.id} matches no difference`);
      continue;
    }
    const unused = (values, has) => values.filter((value) => !mine.some((difference) => has(difference, value)));
    const { match } = explanation;
    for (const value of unused(match.places, (d, v) => d.place === v)) problems.push(`tzdb: explanation ${explanation.id} lists place ${value}, which none of its differences has`);
    for (const value of unused(match.zones, (d, v) => d.zone === v)) problems.push(`tzdb: explanation ${explanation.id} lists zone ${value}, which none of its differences has`);
    for (const value of unused(match.rules, (d, v) => d.atlasRule === v)) problems.push(`tzdb: explanation ${explanation.id} lists rule ${value}, which none of its differences has`);
    for (const value of unused(match.atlasOffsets, (d, v) => sameOffset(d.atlasOffsetSeconds, v))) problems.push(`tzdb: explanation ${explanation.id} lists atlas offset ${value} s, which none of its differences has`);
    for (const value of unused(match.tzdbOffsets, (d, v) => sameOffset(d.tzdbOffsetSeconds, v))) problems.push(`tzdb: explanation ${explanation.id} lists tzdb offset ${value} s, which none of its differences has`);
  }
  return problems;
}

export function compareAll(atlas) {
  const extract = readJson(EXTRACT_PATH);
  const explanationsFile = [...atlas.files.values()].find((data) => data.kind === 'atlas-tzdb-explanations');
  const explanations = explanationsFile?.explanations ?? [];
  const entries = [];
  const differences = [];
  for (const place of atlas.places.values()) {
    const zones = [place.tzdbZone, ...(place.compareZones ?? [])];
    for (const [zoneIndex, zone] of zones.entries()) {
      const periods = comparePlace(atlas, place, zone, extract);
      entries.push({ place: place.id, zone, primary: zoneIndex === 0, periods });
      for (const period of periods) {
        if (Math.abs(period.deltaMs) < 1000) continue;
        differences.push({
          place: place.id,
          zone,
          from: formatUtc(period.fromMs),
          to: formatUtc(period.toMs),
          atlasRule: period.rule,
          atlasOffset: formatOffset(period.atlasOffsetMs),
          atlasOffsetSeconds: period.atlasOffsetMs / 1000,
          tzdbOffset: formatOffset(period.tzdbOffsetMs),
          tzdbOffsetSeconds: period.tzdbOffsetMs / 1000,
          tzdbAbbreviation: period.tzdbAbbr,
          differenceSeconds: period.deltaMs / 1000,
          explanation: null,
        });
      }
    }
  }
  const problems = assignExplanations(differences, explanations);
  return { extract, explanations, entries, differences, problems };
}

function differencesText(comparison) {
  return `${JSON.stringify({
    kind: 'atlas-tzdb-differences',
    tzdb: comparison.extract.release,
    about: 'Every period in which an atlas place\'s civil time differs from tzdb by a second or more. Generated by atlas/tools/compare-tzdb.mjs; do not edit.',
    differences: comparison.differences,
  }, null, 1)}\n`;
}

const DAY = 86_400_000;

function days(ms) {
  const value = ms / DAY;
  return value >= 1 ? `${value.toFixed(value >= 100 ? 0 : 1)} d` : `${(ms / 3_600_000).toFixed(2)} h`;
}

function reportText(atlas, comparison) {
  const lines = [];
  const citation = (id) => atlas.citations.get(id);
  lines.push('# Differences from tzdb');
  lines.push('');
  lines.push(`Generated by \`node atlas/tools/compare-tzdb.mjs\` from the atlas and \`atlas/tzdb/tzdb-${comparison.extract.release}.json\`. Do not edit this file: explanations live in \`atlas/data/tzdb-explanations.json\`, and \`node atlas/tools/check.mjs\` fails when this file is stale or a difference has no explanation.`);
  lines.push('');
  lines.push('## What is compared');
  lines.push('');
  lines.push(`The base is tzdb ${comparison.extract.release} with backzone, built by the L3 conformance recipe (${comparison.extract.source.recipe}); the tarball's SHA-256 is \`${comparison.extract.source.tzdata.sha256}\` and the compiled tree ${comparison.extract.source.compiledTree.matchesL3Record ? 'matches' : 'does not match'} the digest recorded in \`conformance/sources/l3/tzdata.json\` (${comparison.extract.source.compiledTree.files} files, \`${comparison.extract.source.compiledTree.sha256}\`).`);
  lines.push('');
  lines.push(`Every covered place is compared, over the whole coverage window (${atlas.manifest.coverage.start} to ${atlas.manifest.coverage.end}, local time), with the zone tzdb uses for where it is (\`tzdbZone\` in \`atlas/data/places.json\`) and, for some places, with a second zone for information. For each period between consecutive changes in either source the two offsets are compared. A difference is a period in which they differ by one second or more. tzdb stores whole seconds only, so offsets that differ by less than a second are listed under rounding. Times in the tables are UTC.`);
  lines.push('');
  lines.push('tzdb is the comparison base, not a source: it decides nothing in the atlas. Every difference below is decided by the atlas\'s own citations.');
  lines.push('');

  // Summary.
  lines.push('## Summary');
  lines.push('');
  lines.push('| place | zone | periods compared | agree | differ | rounding only | days differing |');
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: |');
  for (const entry of comparison.entries) {
    const agree = entry.periods.filter((period) => period.deltaMs === 0);
    const differ = entry.periods.filter((period) => Math.abs(period.deltaMs) >= 1000);
    const rounding = entry.periods.filter((period) => period.deltaMs !== 0 && Math.abs(period.deltaMs) < 1000);
    const differing = differ.reduce((sum, period) => sum + (period.toMs - period.fromMs), 0);
    lines.push(`| ${atlas.places.get(entry.place).name} (\`${entry.place}\`) | ${entry.zone}${entry.primary ? '' : ' (for information)'} | ${entry.periods.length} | ${agree.length} | ${differ.length} | ${rounding.length} | ${(differing / DAY).toFixed(1)} |`);
  }
  lines.push('');
  const total = comparison.differences.length;
  lines.push(`${total} period(s) differ by a second or more; each is matched by exactly one explanation below.`);
  lines.push('');

  // Agreements: consecutive periods within a second of each other, merged.
  lines.push('## Where they agree');
  lines.push('');
  lines.push('Spans in which the atlas and tzdb give the same offset, or offsets less than a second apart (tzdb rounds mean times to whole seconds). Times are UTC.');
  lines.push('');
  lines.push('| place | zone | agree (UTC) |');
  lines.push('| --- | --- | --- |');
  for (const entry of comparison.entries) {
    const spans = [];
    for (const period of entry.periods) {
      if (Math.abs(period.deltaMs) >= 1000) continue;
      const last = spans[spans.length - 1];
      if (last && last.toMs === period.fromMs) last.toMs = period.toMs;
      else spans.push({ fromMs: period.fromMs, toMs: period.toMs });
    }
    const text = spans.length
      ? spans.map((span) => `${formatUtc(span.fromMs).slice(0, 16)} to ${formatUtc(span.toMs).slice(0, 16)}`).join('; ')
      : 'nowhere';
    lines.push(`| ${atlas.places.get(entry.place).name} (\`${entry.place}\`) | ${entry.zone}${entry.primary ? '' : ' (for information)'} | ${text} |`);
  }
  lines.push('');

  // Findings the atlas would report to tzdb.
  const reports = comparison.explanations.filter((explanation) => explanation.tzdbReport);
  if (reports.length) {
    lines.push('## To report to tzdb');
    lines.push('');
    lines.push('Differences that look like errors in tzdb rather than differences of scope. Nothing has been sent to the tz project.');
    lines.push('');
    for (const explanation of reports) {
      lines.push(`- \`${explanation.id}\`: ${explanation.tzdbReport}`);
    }
    lines.push('');
  }

  // Explanations.
  lines.push('## Differences and why');
  lines.push('');
  for (const explanation of comparison.explanations) {
    const covered = comparison.differences.filter((difference) => difference.explanation === explanation.id);
    lines.push(`### ${explanation.id}`);
    lines.push('');
    lines.push(`*Category:* ${explanation.category}. *Periods:* ${covered.length}. *Matches:* places ${explanation.match.places.map((id) => `\`${id}\``).join(', ')}; zones ${explanation.match.zones.join(', ')}; rules ${explanation.match.rules.map((id) => `\`${id}\``).join(', ')}; atlas offsets ${explanation.match.atlasOffsets.map((value) => formatOffset(Math.round(value * 1000))).join(', ')}; tzdb offsets ${explanation.match.tzdbOffsets.map((value) => formatOffset(value * 1000)).join(', ')}.`);
    lines.push('');
    lines.push(explanation.explanation);
    lines.push('');
    lines.push('Decided by:');
    lines.push('');
    for (const id of explanation.citations) {
      const item = citation(id);
      lines.push(`- \`${id}\`: ${item.title} (${item.date}), ${item.locator}. <${item.url}>`);
    }
    lines.push('');
    lines.push('| place | zone | from (UTC) | to (UTC) | atlas rule | atlas | tzdb | atlas − tzdb |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | ---: |');
    for (const difference of covered) {
      lines.push(`| \`${difference.place}\` | ${difference.zone} | ${difference.from} | ${difference.to} | \`${difference.atlasRule}\` | ${difference.atlasOffset} | ${difference.tzdbOffset} ${difference.tzdbAbbreviation} | ${difference.differenceSeconds} s |`);
    }
    lines.push('');
  }

  // Place by place.
  lines.push('## Place by place');
  lines.push('');
  lines.push('Every period, in order. "agrees" means the offsets are equal; "rounding" that they differ by less than a second.');
  lines.push('');
  for (const entry of comparison.entries) {
    const place = atlas.places.get(entry.place);
    lines.push(`### ${place.name} (\`${place.id}\`) against ${entry.zone}${entry.primary ? '' : ' (for information)'}`);
    lines.push('');
    lines.push('| from (UTC) | to (UTC) | length | atlas rule | atlas | tzdb | result |');
    lines.push('| --- | --- | ---: | --- | --- | --- | --- |');
    for (const period of entry.periods) {
      const result = period.deltaMs === 0 ? 'agrees' : Math.abs(period.deltaMs) < 1000 ? `rounding (${period.deltaMs} ms)` : `differs by ${period.deltaMs / 1000} s`;
      lines.push(`| ${formatUtc(period.fromMs)} | ${formatUtc(period.toMs)} | ${days(period.toMs - period.fromMs)} | \`${period.rule}\` | ${formatOffset(period.atlasOffsetMs)} | ${formatOffset(period.tzdbOffsetMs)} ${period.tzdbAbbr} | ${result} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

/** Problems with the committed comparison: differences without exactly one explanation, loose or unused explanations, stale files. */
export function checkComparison(atlas, comparison) {
  const problems = [...comparison.problems];
  const read = (path) => {
    try {
      return readFileSync(path, 'utf8');
    } catch {
      return '';
    }
  };
  if (read(DIFFERENCES_PATH) !== differencesText(comparison)) problems.push('tzdb: atlas/tzdb/differences.json is stale; run node atlas/tools/compare-tzdb.mjs');
  if (read(REPORT_PATH) !== reportText(atlas, comparison)) problems.push('tzdb: atlas/TZDB-DIFFERENCES.md is stale; run node atlas/tools/compare-tzdb.mjs');
  return problems;
}

function main() {
  const atlas = loadAtlas();
  const comparison = compareAll(atlas);
  if (process.argv.includes('--check')) {
    const problems = checkComparison(atlas, comparison);
    if (problems.length) {
      console.error(problems.join('\n'));
      process.exit(1);
    }
    console.log(`compare-tzdb: ${comparison.differences.length} differences, each matched by exactly one explanation; files current`);
    return;
  }
  writeFileSync(DIFFERENCES_PATH, differencesText(comparison));
  writeFileSync(REPORT_PATH, reportText(atlas, comparison));
  console.log(`compare-tzdb: ${comparison.differences.length} differences, ${comparison.problems.length} problem(s) -> atlas/tzdb/differences.json, atlas/TZDB-DIFFERENCES.md`);
  for (const problem of comparison.problems) console.log(`  ${problem}`);
  if (comparison.problems.length) process.exit(1);
}

if (process.argv[1] && process.argv[1].endsWith('compare-tzdb.mjs')) {
  try {
    main();
  } catch (error) {
    console.error(`compare-tzdb: ${error.message}`);
    process.exit(1);
  }
}
