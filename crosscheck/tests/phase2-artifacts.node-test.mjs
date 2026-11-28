import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const project = new URL('../', import.meta.url);
const artifact = suffix => readFile(new URL('reports/phase2-measured-tt' + suffix, project), 'utf8');
const headers = ('channel,unit,compared,pass,fail,error,unsupported,fallback,tolerance,mean,mean_abs,rms,' +
  'population_std_dev,max_abs,returned_flags,median_rank,median_lower,median_upper,p99_rank,p99_lower,' +
  'p99_upper,p999_rank,p999_lower,p999_upper,quantile_method,comparison_kind,reference_group,body,coordinate,status').split(',');

// This reader checks the retained artifacts directly. It does not render a new
// report or reconstruct individual observations from aggregate statistics.
function csvRecords(bytes) {
  const records = [], record = [];
  let value = '', quoted = false, closed = false;
  for (let index = 0; index < bytes.length; index++) {
    const char = bytes[index];
    if (quoted) {
      if (char === '"' && bytes[index + 1] === '"') { value += '"'; index++; }
      else if (char === '"') { quoted = false; closed = true; }
      else value += char;
    } else if (char === '"') {
      assert(!value && !closed, 'CSV quote must start a cell');
      quoted = true;
    } else if (char === ',' || char === '\n') {
      record.push(value); value = ''; closed = false;
      if (char === '\n') { records.push(record.splice(0)); }
    } else {
      assert(!closed && char !== '\r', 'Unexpected CSV text after a closing quote');
      value += char;
    }
  }
  assert(!quoted && !value && !record.length, 'CSV must end with a complete record');
  return records;
}

function numericCell(actual, expected, label, absent = '') {
  if (expected === null || expected === undefined) assert.equal(actual, absent, label);
  else {
    assert(actual !== '' && Number.isFinite(Number(actual)), label + ' must be numeric');
    assert.equal(Number(actual), expected, label);
  }
}

function auditCsv(report, bytes) {
  const [header, ...records] = csvRecords(bytes);
  assert.deepEqual(header, headers, 'CSV columns');
  assert.equal(records.length, Object.keys(report.channels).length, 'CSV channel count');
  const seen = new Set();
  for (const cells of records) {
    assert.equal(cells.length, headers.length, 'CSV row width');
    const row = Object.fromEntries(headers.map((key, index) => [key, cells[index]]));
    const channel = report.channels[row.channel];
    assert(channel && !seen.has(row.channel), 'Unknown or duplicate CSV channel');
    seen.add(row.channel);
    const stats = channel.statistics;
    const numeric = { compared: stats.n, tolerance: channel.tolerance, mean: stats.mean,
      mean_abs: stats.meanAbs, rms: stats.rms, population_std_dev: stats.populationStdDev, max_abs: stats.maxAbs,
      ...channel.verdicts };
    for (const [key, value] of Object.entries(numeric)) numericCell(row[key], value, row.channel + ' ' + key);
    const text = { unit: channel.unit, comparison_kind: channel.comparisonKind ?? 'other',
      reference_group: channel.referenceGroup ?? '', body: channel.body ?? '', coordinate: channel.coordinate ?? '',
      status: channel.status ?? (stats.n ? 'measured' : 'unavailable') };
    for (const [key, value] of Object.entries(text)) assert.equal(row[key], value, row.channel + ' ' + key);
    assert.deepEqual(JSON.parse(row.returned_flags), channel.flags, row.channel + ' flags');
    for (const key of ['median', 'p99', 'p999']) for (const bound of ['rank', 'lower', 'upper'])
      numericCell(row[key + '_' + bound], stats.absoluteQuantiles?.[key]?.[bound], row.channel + ' ' + key + ' ' + bound);
    assert.deepEqual(row.quantile_method ? JSON.parse(row.quantile_method) : null,
      stats.absoluteQuantiles?.method ?? null, row.channel + ' quantile method');
  }
}

const sections = {
  'Engine minus JPL residuals:': ['moments', 'engine-minus-JPL'],
  'Separate JPL convention differences:': ['moments', 'JPL-convention-difference'],
  'Engine minus Swiss instrument residuals:': ['moments', 'engine-minus-Swiss'],
  'Swiss instrument minus JPL residuals:': ['moments', 'Swiss-minus-JPL'],
  'Other comparison channels:': ['moments', 'other'],
  'Engine minus JPL absolute-error percentiles:': ['quantiles', 'engine-minus-JPL'],
  'Separate convention-difference absolute percentiles:': ['quantiles', 'JPL-convention-difference'],
  'Engine minus Swiss instrument absolute-error percentiles:': ['quantiles', 'engine-minus-Swiss'],
  'Swiss instrument minus JPL absolute-error percentiles:': ['quantiles', 'Swiss-minus-JPL'],
  'Other comparison channel absolute percentiles:': ['quantiles', 'other']
};
const unescapeMarkdown = value => value.replaceAll('&#124;', '|').replaceAll('&#96;', '`')
  .replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
const markdownHeaders = {
  groups: ['Reference group', 'Configured status', 'TT intervals in epoch milliseconds', 'Engine/JPL residuals',
    'Convention residuals', 'Engine/Swiss residuals', 'Swiss/JPL residuals', 'Reason'],
  moments: ['Channel', 'Unit', 'Compared', 'Pass', 'Fail', 'Error', 'Unsupported', 'Fallback', 'Tolerance',
    'Mean', 'Mean absolute', 'RMS', 'Population std dev', 'Maximum absolute'],
  quantiles: ['Channel', 'Unit', 'Maximum absolute', 'p99.9 absolute interval', 'p99 absolute interval', 'Median absolute interval']
};

function auditMarkdown(report, bytes) {
  const seen = { moments: new Set(), quantiles: new Set() }, groups = new Set();
  let section, channelHeader = false, groupHeader = false;
  for (const line of bytes.split('\n')) {
    if (Object.hasOwn(sections, line)) { section = sections[line]; channelHeader = false; }
    if (!line.startsWith('| ')) continue;
    assert(line.endsWith(' |'), 'Markdown table row terminator');
    const cells = line.slice(2, -2).split(' | ').map(unescapeMarkdown);
    const name = cells[0];
    if (name === 'Reference group') {
      assert.deepEqual(cells, markdownHeaders.groups, 'Markdown reference group column headings');
      groupHeader = true;
      continue;
    }
    if (name === 'Channel') {
      assert(section, 'Markdown channel table has a section');
      assert.deepEqual(cells, markdownHeaders[section[0]], 'Markdown measurement column headings');
      channelHeader = true;
      continue;
    }
    if (/^DE44[01]$/.test(name)) {
      assert(groupHeader, 'Markdown reference group column headings are present');
      const group = report.referenceGroups[name];
      assert(group && !groups.has(name), 'Unknown or duplicate markdown reference group');
      groups.add(name);
      assert.deepEqual(cells.slice(0, 3), [name, group.status, group.intervals.length ?
        group.intervals.map(row => '[' + row.startMs + ', ' + row.endMs + ')').join('; ') : 'none']);
      const counts = ['numericalResiduals', 'conventionResiduals', 'engineSwissResiduals', 'swissJplResiduals'];
      assert.equal(cells.length, 8, 'Markdown reference group width');
      counts.forEach((key, index) => numericCell(cells[index + 3], group[key], name + ' ' + key));
      assert.equal(cells[7], group.reason);
      continue;
    }
    if (!/^(JPL|Convention|Swiss|SwissJPL)\./.test(name)) continue;
    const channel = report.channels[name];
    assert(channel && section && channelHeader, 'Unknown markdown channel or missing section/column headings');
    const [kind, comparison] = section;
    assert.equal(comparison, channel.comparisonKind ?? 'other', name + ' comparison table');
    assert(!seen[kind].has(name), 'Duplicate markdown channel row');
    seen[kind].add(name);
    assert.equal(cells[1], channel.unit, name + ' unit');
    const stats = channel.statistics;
    if (kind === 'moments') {
      assert.equal(cells.length, 14, 'Markdown numerical row width');
      const values = [stats.n, ...['pass', 'fail', 'error', 'unsupported', 'fallback'].map(key => channel.verdicts[key]),
        channel.tolerance, stats.mean, stats.meanAbs, stats.rms, stats.populationStdDev, stats.maxAbs];
      values.forEach((value, index) => numericCell(cells[index + 2], value, name + ' moment ' + index, 'unavailable'));
    } else {
      assert.equal(cells.length, 6, 'Markdown quantile row width');
      numericCell(cells[2], stats.maxAbs, name + ' quantile maximum', 'unavailable');
      ['p999', 'p99', 'median'].forEach((key, index) => {
        const interval = stats.absoluteQuantiles?.[key], cell = cells[index + 3];
        if (!interval) assert.equal(cell, 'unavailable', name + ' ' + key);
        else {
          const match = /^\[([^,]+), ([^\]]+)\]$/.exec(cell);
          assert(match, name + ' quantile interval syntax');
          numericCell(match[1], interval.lower, name + ' ' + key + ' lower');
          numericCell(match[2], interval.upper, name + ' ' + key + ' upper');
        }
      });
    }
  }
  assert.deepEqual([...groups].sort(), Object.keys(report.referenceGroups).sort(), 'Markdown reference groups');
  for (const [kind, names] of Object.entries(seen))
    assert.deepEqual([...names].sort(), Object.keys(report.channels).sort(), 'Markdown ' + kind + ' channel coverage');
}

test('retained final CSV and every markdown measurement table agree with the aggregate JSON receipt', async () => {
  const report = JSON.parse(await artifact('.json'));
  assert.deepEqual(Object.keys(report.channels).sort(), Object.keys(report.campaign.config.channels).sort(),
    'Every configured channel remains in the final receipt');
  assert.deepEqual(Object.keys(report.metadata.units).sort(), Object.keys(report.channels).sort(), 'Complete unit metadata');
  for (const [name, channel] of Object.entries(report.channels)) {
    assert.equal(channel.unit, report.metadata.units[name], name + ' configured unit');
    assert.equal(channel.tolerance, report.campaign.config.channels[name], name + ' configured tolerance');
  }
  auditCsv(report, await artifact('.csv'));
  auditMarkdown(report, await artifact('.md'));
});

test('cross-format audit rejects changed values, missing or duplicate rows and wrong comparison or group placement', async () => {
  const report = JSON.parse(await artifact('.json'));
  const csv = await artifact('.csv'), markdown = await artifact('.md');
  const csvLines = csv.trimEnd().split('\n');
  const csvRow = csvLines.find(line => line.startsWith('"JPL.DE440.Sun.lon",'));
  assert(csvRow);
  const changedCsvRow = csvRow.replace(',"' + report.channels['JPL.DE440.Sun.lon'].statistics.maxAbs + '",', ',"999",');
  assert.notEqual(changedCsvRow, csvRow);
  for (const corrupt of [csv.replace(csvRow, changedCsvRow), csv.replace(csvRow + '\n', ''), csv + csvRow + '\n',
    csv.replace(csvLines[1], csvRow),
    csv.replace(csvRow, csvRow.replace('"engine-minus-JPL"', '"engine-minus-Swiss"')),
    csv.replace(csvRow, csvRow.replace('"DE440"', '"DE441"'))])
    assert.throws(() => auditCsv(report, corrupt));
  const mdRow = markdown.split('\n').find(line => line.startsWith('| JPL.DE440.Sun.lon |') && line.slice(2, -2).split(' | ').length === 14);
  assert(mdRow);
  const changedMdRow = mdRow.replace(' | ' + report.channels['JPL.DE440.Sun.lon'].statistics.maxAbs + ' |', ' | 999 |');
  assert.notEqual(changedMdRow, mdRow);
  const quantileRow = markdown.split('\n').find(line => line.startsWith('| JPL.DE440.Sun.lon |') && line.slice(2, -2).split(' | ').length === 6);
  assert(quantileRow);
  const changedQuantileRow = quantileRow.replace(/\| \[[^,]+, /, '| [999, ');
  assert.notEqual(changedQuantileRow, quantileRow);
  for (const corrupt of [markdown.replace(mdRow, changedMdRow), markdown.replace(mdRow + '\n', ''),
    markdown.replace(mdRow, mdRow + '\n' + mdRow), markdown.replace(quantileRow + '\n', ''),
    markdown.replace(quantileRow, changedQuantileRow),
    markdown.replace('p99.9 absolute interval | p99 absolute interval', 'p99 absolute interval | p99.9 absolute interval'),
    markdown.replace(mdRow + '\n', '').replace('Engine minus Swiss instrument residuals:',
      'Engine minus Swiss instrument residuals:\n\n' + mdRow),
    markdown.replace('| DE440 | available |', '| DE441 | available |')])
    assert.throws(() => auditMarkdown(report, corrupt));
});

test('final reference and presentation identities bind to retained planning and catalog receipts', async () => {
  const report = JSON.parse(await artifact('.json'));
  const plan = JSON.parse(await readFile(new URL('reports/reference-plan.json', project), 'utf8'));
  const catalog = JSON.parse(await readFile(new URL('lib/erfa-catalog.json', project), 'utf8'));
  const references = report.campaign.identities.references;
  assert.deepEqual(references.JPL, Object.fromEntries(['name', 'sha256', 'source'].map(key => [key, plan.kernel[key]])));
  for (const key of ['sampling', 'paddingSeconds', 'selection', 'groups', 'bodies'])
    assert.deepEqual(references.ReferencePlan[key], plan.plan[key], 'Reference plan ' + key);
  assert.deepEqual(references.ReferencePlan.kernelCoverage, plan.kernel.coverage);
  assert.equal(references.ERFA.nutationSha256, catalog.files['nut00b.c']);
  const renderer = await readFile(new URL('reporting/final-campaign.mjs', project));
  const hash = createHash('sha256').update(renderer).digest('hex');
  assert.equal(report.metadata.exclusions.filter(value => value.includes('Aggregate rendering source:')).length, 1);
  assert(report.metadata.exclusions.some(value => value.includes('crosscheck/reporting/final-campaign.mjs; SHA-256 ' + hash + '.')));
});
