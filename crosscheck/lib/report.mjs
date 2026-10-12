// Reports consume validated aggregate checkpoints, never individual positions.
import { campaignIdentity, mergeShards } from './runner.mjs';
import { summarize } from './statistics.mjs';
import { MAX_FILE_BYTES } from '../tools/check.mjs';

const keys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...expected].sort().join(',');
const text = value => typeof value === 'string' && value.length > 0 && value.length <= 4096 &&
  !/[\x00-\x1f\x7f\u2014]/.test(value);
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, sorted(value[k])]));
  return value;
}
const csvCell = value => value === null ? '' : '"' + String(value).replaceAll('"', '""') + '"';
const md = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('|', '&#124;').replaceAll('`', '&#96;');

export function renderReport({ campaign, states, metadata }, { allowPartial = false } = {}) {
  const verified = campaignIdentity(campaign.config, campaign.identities);
  if (JSON.stringify(sorted(campaign)) !== JSON.stringify(sorted(verified))) throw Error('Invalid campaign receipt.');
  if (!keys(metadata, ['title', 'command', 'runtime', 'units', 'exclusions']) || !text(metadata.title) ||
      !Array.isArray(metadata.command) || !metadata.command.length || metadata.command.length > 256 ||
      !metadata.command.every(text) || !keys(metadata.runtime, ['node', 'platform', 'arch']) ||
      !Object.values(metadata.runtime).every(text) || !keys(metadata.units, Object.keys(campaign.config.channels)) ||
      !Object.values(metadata.units).every(v => text(v) && v.length <= 80) ||
      !Array.isArray(metadata.exclusions) || !metadata.exclusions.length || metadata.exclusions.length > 256 ||
      !metadata.exclusions.every(text)) throw Error('Invalid report metadata.');
  const merged = mergeShards(verified, states, { requireComplete: !allowPartial });
  const coverage = [...states].sort((a,b) => a.shard - b.shard).map(s => ({ shard: s.shard,
    completed: s.completed, firstIndex: s.completed ? s.shard : null,
    lastIndex: s.completed ? s.shard + (s.completed - 1) * campaign.config.shards : null,
    stride: campaign.config.shards }));
  const channels = Object.fromEntries(Object.keys(merged.channels).sort().map(name => {
    const channel = merged.channels[name];
    return [name, { unit: metadata.units[name], tolerance: campaign.config.channels[name],
      statistics: summarize(channel.stats), verdicts: channel.verdicts, flags: channel.flags }];
  }));
  const report = sorted({ schema: 'crosscheck-report/1', metadata, campaign: verified,
    complete: merged.completed === campaign.config.total, completed: merged.completed, coverage, channels,
    span: { startMsInclusive: campaign.config.startMs, endMsExclusive: campaign.config.endMs,
      meaning: 'Configured synthetic sampling interval, not continuous coverage or observed extrema' } });
  const json = JSON.stringify(report, null, 2) + '\n';
  const lines = ['# ' + md(metadata.title), '',
    'Status: ' + (report.complete ? 'complete' : 'partial') + '. Completed synthetic charts: ' + report.completed +
      '; requested: ' + campaign.config.total + '.', '',
    'Exact command argument vector: `' + md(JSON.stringify(metadata.command)) + '`.',
    'Runtime: `' + md(JSON.stringify(sorted(metadata.runtime))) + '`.',
    'Campaign SHA-256: `' + campaign.sha256 + '`.',
    'Engine build SHA-256: `' + campaign.identities.build + '`.',
    'Executable tooling SHA-256: `' + campaign.identities.tooling + '`.', '',
    'Sampling interval in epoch milliseconds: [' + campaign.config.startMs + ', ' + campaign.config.endMs +
      '). This is the configured distribution, not continuous coverage or observed extrema.',
    'The JSON receipt contains the seed, exact shard index coverage, reference identities and correction conventions.',
    'Residual statistics include pass and fail observations only. Error, unsupported and fallback verdicts are excluded from residual statistics.',
    'Tolerances are campaign acceptance criteria. Sample maxima are not proven accuracy bounds.', '',
    '| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
  const header = ['channel','unit','compared','pass','fail','error','unsupported','fallback','tolerance','mean','mean_abs','rms','population_std_dev','max_abs','returned_flags'];
  const csv = [header.join(',')];
  for (const [name, c] of Object.entries(channels)) {
    const s = c.statistics, v = c.verdicts;
    const row = [name,c.unit,s.n,v.pass,v.fail,v.error,v.unsupported,v.fallback,c.tolerance,s.mean,s.meanAbs,s.rms,s.populationStdDev,s.maxAbs];
    lines.push('| ' + row.map(x => x === null ? 'unavailable' : md(x)).join(' | ') + ' |');
    csv.push([...row, JSON.stringify(sorted(c.flags))].map(csvCell).join(','));
  }
  lines.push('', 'Exclusions:', '', ...metadata.exclusions.map(e => '- ' + md(e)), '',
    'Reference identities: `' + md(JSON.stringify(sorted(campaign.identities.references))) + '`.',
    'Conventions: `' + md(JSON.stringify(sorted(campaign.config.conventions))) + '`.', '');
  const outputs = { json, markdown: lines.join('\n'), csv: csv.join('\n') + '\n' };
  if (Object.values(outputs).some(bytes => Buffer.byteLength(bytes) >= MAX_FILE_BYTES)) throw Error('Report exceeds file limit.');
  return outputs;
}
