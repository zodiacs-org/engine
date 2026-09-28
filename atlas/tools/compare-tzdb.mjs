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
 * A difference is a period in which the offsets differ by a second or more;
 * each must match exactly one entry of atlas/data/tzdb-explanations.json,
 * and each explanation must match at least one difference. Offsets that
 * differ by less than a second (tzdb rounds mean times to whole seconds)
 * are listed separately as rounding, not as differences.
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

function explanationFor(explanations, place, zone, rule) {
  return explanations.find(({ match }) => (!match.places || match.places.includes(place))
    && (!match.zones || match.zones.includes(zone))
    && (!match.rules || match.rules.includes(rule)));
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
        const explanation = explanationFor(explanations, place.id, zone, period.rule);
        differences.push({
          place: place.id,
          zone,
          from: formatUtc(period.fromMs),
          to: formatUtc(period.toMs),
          atlasRule: period.rule,
          atlasOffset: formatOffset(period.atlasOffsetMs),
          tzdbOffset: formatOffset(period.tzdbOffsetMs),
          tzdbAbbreviation: period.tzdbAbbr,
          differenceSeconds: period.deltaMs / 1000,
          explanation: explanation?.id ?? null,
        });
      }
    }
  }
  return { extract, explanations, entries, differences };
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
  lines.push(`${total} period(s) differ by a second or more; all are explained below.`);
  lines.push('');

  // Explanations.
  lines.push('## Differences and why');
  lines.push('');
  for (const explanation of comparison.explanations) {
    const covered = comparison.differences.filter((difference) => difference.explanation === explanation.id);
    lines.push(`### ${explanation.id}`);
    lines.push('');
    lines.push(`*Category:* ${explanation.category}. *Periods:* ${covered.length}.`);
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

/** Problems with the committed comparison: unexplained differences, unused explanations, stale files. */
export function checkComparison(atlas, comparison) {
  const problems = [];
  for (const difference of comparison.differences) {
    if (!difference.explanation) {
      problems.push(`tzdb: ${difference.place} against ${difference.zone} differs by ${difference.differenceSeconds} s from ${difference.from} to ${difference.to} (${difference.atlasRule}) with no explanation`);
    }
  }
  for (const explanation of comparison.explanations) {
    if (!comparison.differences.some((difference) => difference.explanation === explanation.id)) {
      problems.push(`tzdb: explanation ${explanation.id} matches no difference`);
    }
  }
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
    console.log(`compare-tzdb: ${comparison.differences.length} differences, all explained; files current`);
    return;
  }
  writeFileSync(DIFFERENCES_PATH, differencesText(comparison));
  writeFileSync(REPORT_PATH, reportText(atlas, comparison));
  const unexplained = comparison.differences.filter((difference) => !difference.explanation);
  console.log(`compare-tzdb: ${comparison.differences.length} differences (${unexplained.length} unexplained) -> atlas/tzdb/differences.json, atlas/TZDB-DIFFERENCES.md`);
  for (const difference of unexplained) {
    console.log(`  ${difference.place} ${difference.zone} ${difference.from} .. ${difference.to} ${difference.atlasRule} ${difference.differenceSeconds} s`);
  }
}

if (process.argv[1] && process.argv[1].endsWith('compare-tzdb.mjs')) {
  try {
    main();
  } catch (error) {
    console.error(`compare-tzdb: ${error.message}`);
    process.exit(1);
  }
}
