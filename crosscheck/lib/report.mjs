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
const groupedChannel = name => /^(JPL|Convention|Swiss|SwissJPL)\.(DE440|DE441)\.([A-Z][a-z]+)\.(lon|lat|distance)$/.exec(name);
const swissChannel = name => /^(Swiss|SwissJPL)\.(DE440|DE441)\.[A-Z][a-z]+\.(lon|lat)$/.test(name);
const comparisonKinds = { JPL: 'engine-minus-JPL', Convention: 'JPL-convention-difference',
  Swiss: 'engine-minus-Swiss', SwissJPL: 'Swiss-minus-JPL' };
function referenceGroups(config, channels) {
  const groups = config.conventions?.referenceGroups;
  if (!groups && !Object.keys(channels).some(groupedChannel)) return null;
  if (!keys(groups, ['DE440', 'DE441'])) throw Error('Invalid report reference groups.');
  return Object.fromEntries(Object.entries(groups).map(([name, group]) => {
    if (!keys(group, ['status', 'reason', 'intervals']) ||
        !['available', 'empty', 'unavailable'].includes(group.status) || !text(group.reason) ||
        !Array.isArray(group.intervals) || group.intervals.length > 256 ||
        (group.status === 'empty' ? group.intervals.length !== 0 : !group.intervals.length) ||
        group.intervals.some((interval, index) => !keys(interval, ['startMs', 'endMs']) ||
          ![interval.startMs, interval.endMs].every(Number.isSafeInteger) ||
          interval.startMs < config.startMs || interval.endMs > config.endMs || interval.startMs >= interval.endMs ||
          (index > 0 && group.intervals[index - 1].endMs > interval.startMs))) throw Error('Invalid report reference group coverage.');
    const selected = Object.entries(channels).filter(([channel]) => groupedChannel(channel)?.[2] === name);
    if (!selected.length || (group.status !== 'available' && selected.some(([, c]) => c.statistics.n)))
      throw Error('Empty or unavailable reference group contains measurements.');
    const numericalResiduals = selected.filter(([channel]) => groupedChannel(channel)[1] === 'JPL')
      .reduce((total, [, c]) => total + c.statistics.n, 0);
    const conventionResiduals = selected.filter(([channel]) => groupedChannel(channel)[1] === 'Convention')
      .reduce((total, [, c]) => total + c.statistics.n, 0);
    const swissResiduals = Object.keys(channels).some(swissChannel) ? {
      engineSwissResiduals: selected.filter(([channel]) => groupedChannel(channel)[1] === 'Swiss')
        .reduce((total, [, c]) => total + c.statistics.n, 0),
      swissJplResiduals: selected.filter(([channel]) => groupedChannel(channel)[1] === 'SwissJPL')
        .reduce((total, [, c]) => total + c.statistics.n, 0)
    } : {};
    return [name, { ...group, numericalResiduals, conventionResiduals, ...swissResiduals }];
  }));
}
function swissSummary(campaign, channels) {
  const verdicts = { pass: 0, fail: 0, error: 0, unsupported: 0, fallback: 0 }, returnedFlags = {};
  for (const [name, channel] of Object.entries(channels)) {
    if (!/^Swiss\.(DE440|DE441)\.[A-Z][a-z]+\.lon$/.test(name)) continue;
    for (const [key, count] of Object.entries(channel.verdicts)) verdicts[key] += count;
    for (const [flag, count] of Object.entries(channel.flags)) returnedFlags[flag] = (returnedFlags[flag] ?? 0) + count;
  }
  const countFlags = select => Object.entries(returnedFlags).reduce((sum, [flag, count]) => sum + (select(Number(flag) & 7) ? count : 0), 0);
  const identity = campaign.identities.references.Swiss;
  if (!identity || typeof identity !== 'object' || Array.isArray(identity)) throw Error('Missing Swiss instrument identity.');
  const status = identity.status === 'unavailable' ? 'unavailable' : 'available';
  const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
  if (status === 'unavailable' ? !keys(identity, ['status']) :
    !keys(identity, ['adapterSha256', 'bindingSha256', 'engineVersion', 'binding', 'ephemerisFiles']) ||
    !digest(identity.adapterSha256) || !digest(identity.bindingSha256) ||
    typeof identity.engineVersion !== 'string' || !/^[0-9.]+$/.test(identity.engineVersion) ||
    typeof identity.binding !== 'string' || !/^pyswisseph [0-9.]+$/.test(identity.binding) ||
    !identity.ephemerisFiles || typeof identity.ephemerisFiles !== 'object' || Array.isArray(identity.ephemerisFiles) ||
    Object.keys(identity.ephemerisFiles).length > 10000 ||
    Object.entries(identity.ephemerisFiles).some(([name, hash]) => !/^[A-Za-z0-9_.-]+\.se1$/.test(name) || !digest(hash)))
    throw Error('Invalid Swiss instrument identity.');
  if (status === 'unavailable' && Object.entries(channels).some(([name, channel]) => swissChannel(name) &&
      (channel.statistics.n || Object.keys(channel.flags).length ||
       Object.entries(channel.verdicts).some(([verdict, count]) => verdict !== 'unsupported' && count))))
    throw Error('Unavailable Swiss instrument contains returned responses or measurements.');
  return { status, identity,
    countBasis: 'Engine-minus-Swiss longitude channels only; inactive-group and unsupported-center outcomes included; not instrument request counts',
    longitudeChannelOutcomes: Object.values(verdicts).reduce((sum, count) => sum + count, 0), verdicts, returnedFlags,
    swiephResponses: countFlags(backend => backend === 2),
    moshierFallbackResponses: countFlags(backend => backend === 4),
    otherBackendFallbackResponses: countFlags(backend => backend !== 2 && backend !== 4) };
}

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
  const groups = referenceGroups(campaign.config, channels);
  const hasSwiss = Object.keys(channels).some(swissChannel);
  const swissInstrument = hasSwiss ? swissSummary(campaign, channels) : null;
  if (groups) for (const [name, channel] of Object.entries(channels)) {
    const parsed = groupedChannel(name);
    if (parsed) Object.assign(channel, { comparisonKind: comparisonKinds[parsed[1]],
      referenceGroup: parsed[2], body: parsed[3], coordinate: parsed[4],
      status: groups[parsed[2]].status === 'empty' ? 'empty' : channel.statistics.n ? 'measured' : 'unavailable' });
  }
  const hasQuantiles = Boolean(campaign.config.quantiles?.length);
  const report = sorted({ schema: hasSwiss ? 'crosscheck-report/4' : groups ? 'crosscheck-report/3' : hasQuantiles ? 'crosscheck-report/2' : 'crosscheck-report/1', metadata, campaign: verified,
    complete: merged.completed === campaign.config.total, completed: merged.completed, coverage, channels,
    ...(groups ? { referenceGroups: groups } : {}),
    ...(hasSwiss ? { swissInstrument } : {}),
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
    'Tolerances are campaign acceptance criteria. Sample maxima are not proven accuracy bounds.', ''];
  if (hasSwiss) lines.push('Swiss instrument: ' + swissInstrument.status + '. ' +
    (swissInstrument.status === 'unavailable' ? 'No engine-versus-Swiss or Swiss-versus-JPL residuals were recorded.' :
      'External optional test instrument; JPL remains the positional accuracy reference.'),
    'Swiss returned-flag responses: SWIEPH ' + swissInstrument.swiephResponses + '; Moshier fallback ' +
      swissInstrument.moshierFallbackResponses + '; other backend fallback ' + swissInstrument.otherBackendFallbackResponses + '.',
    'Flag-response counts use engine-minus-Swiss longitude channels only, so latitude channels and Swiss-minus-JPL comparisons do not duplicate them. ' +
      'Longitude verdict totals include inactive-group and unsupported-center outcomes and are not instrument request counts. Per-channel flags and fallback/error/unsupported verdicts remain in the tables and receipt.', '');
  if (groups) lines.push('Reference groups:', '',
    hasSwiss ? '| Reference group | Configured status | TT intervals in epoch milliseconds | Engine/JPL residuals | Convention residuals | Engine/Swiss residuals | Swiss/JPL residuals | Reason |' :
      '| Reference group | Configured status | TT intervals in epoch milliseconds | Engine/JPL residuals | Convention residuals | Reason |',
    hasSwiss ? '| --- | --- | --- | ---: | ---: | ---: | ---: | --- |' : '| --- | --- | --- | ---: | ---: | --- |',
    ...Object.entries(groups).map(([name, group]) => '| ' + [name, group.status,
      group.intervals.length ? group.intervals.map(i => `[${i.startMs}, ${i.endMs})`).join('; ') : 'none',
      group.numericalResiduals, group.conventionResiduals,
      ...(hasSwiss ? [group.engineSwissResiduals, group.swissJplResiduals] : []), group.reason].map(md).join(' | ') + ' |'), '',
    'Residual counts sum coordinate comparisons, not charts. Empty groups have no requested interval or measured coverage. Unavailable exact centers have no numerical errors or maxima.', '',
    'Engine minus JPL residuals:', '');
  const tableHeader = [
    '| Channel | Unit | Compared | Pass | Fail | Error | Unsupported | Fallback | Tolerance | Mean | Mean absolute | RMS | Population std dev | Maximum absolute |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |'];
  lines.push(...tableHeader);
  const header = ['channel','unit','compared','pass','fail','error','unsupported','fallback','tolerance','mean','mean_abs','rms','population_std_dev','max_abs','returned_flags'];
  if (hasQuantiles) header.push('median_rank','median_lower','median_upper','p99_rank','p99_lower','p99_upper',
    'p999_rank','p999_lower','p999_upper','quantile_method');
  if (groups) header.push('comparison_kind','reference_group','body','coordinate','status');
  const csv = [header.join(',')];
  const conventionRows = [], engineSwissRows = [], swissJplRows = [], otherRows = [];
  for (const [name, c] of Object.entries(channels)) {
    const s = c.statistics, v = c.verdicts;
    const row = [name,c.unit,s.n,v.pass,v.fail,v.error,v.unsupported,v.fallback,c.tolerance,s.mean,s.meanAbs,s.rms,s.populationStdDev,s.maxAbs];
    const renderedRow = '| ' + row.map(x => x === null ? 'unavailable' : md(x)).join(' | ') + ' |';
    if (groups && c.comparisonKind === 'JPL-convention-difference') conventionRows.push(renderedRow);
    else if (hasSwiss && c.comparisonKind === 'engine-minus-Swiss') engineSwissRows.push(renderedRow);
    else if (hasSwiss && c.comparisonKind === 'Swiss-minus-JPL') swissJplRows.push(renderedRow);
    else if (hasSwiss && c.comparisonKind !== 'engine-minus-JPL') otherRows.push(renderedRow);
    else lines.push(renderedRow);
    const quantileCells = hasQuantiles ? [
      ...['median', 'p99', 'p999'].flatMap(key => {
        const q = s.absoluteQuantiles?.[key];
        return [q?.rank ?? null, q?.lower ?? null, q?.upper ?? null];
      }), s.absoluteQuantiles ? JSON.stringify(sorted(s.absoluteQuantiles.method)) : null
    ] : [];
    const groupingCells = groups ? [c.comparisonKind ?? 'other', c.referenceGroup ?? null, c.body ?? null,
      c.coordinate ?? null, c.status ?? (s.n ? 'measured' : 'unavailable')] : [];
    csv.push([...row, JSON.stringify(sorted(c.flags)), ...quantileCells, ...groupingCells].map(csvCell).join(','));
  }
  if (conventionRows.length) lines.push('', 'Separate JPL convention differences:', '',
    'These residuals compare the relativistic aberration direction with the Newtonian CN+S direction for the same reference states and frame. They are not engine errors, a complete model correction or an independent truth comparison. They are never subtracted from aggregate engine errors.', '',
    ...tableHeader, ...conventionRows);
  if (hasSwiss) {
    lines.push('', 'Engine minus Swiss instrument residuals:', '',
      'These are comparisons with a second instrument, separate from engine accuracy versus JPL. Only SWIEPH returned flags contribute numerical residuals.', '',
      ...tableHeader, ...engineSwissRows, '', 'Swiss instrument minus JPL residuals:', '',
      'These compare the same Swiss positions with the selected JPL reference and frame. Model and convention differences can contribute; no Swiss difference is subtracted from engine errors.', '',
      ...tableHeader, ...swissJplRows);
    if (otherRows.length) lines.push('', 'Other comparison channels:', '', ...tableHeader, ...otherRows);
  }
  if (hasQuantiles) {
    lines.push('', groups ? 'Engine minus JPL absolute-error percentiles:' : 'Absolute-error percentiles:', '',
      'Median, p99 and p99.9 select exact nearest ranks ceil(n*p) among absolute residuals. The histogram locates each rank exactly; only its value is approximated.',
      'Each inclusive [lower, upper] interval encloses that order statistic in the channel unit. No midpoint or interpolated value is claimed. Maximum absolute residuals above are exact sample maxima.',
      'The fixed histogram has an exact zero bucket, an underflow bucket below 2^-40, 16 equal subdivisions per power-of-two interval from 2^-40 to 2^40, and an overflow bucket starting at 2^40.',
      'Regular bucket width is at most lower/16. Underflow and overflow have no relative-width guarantee; overflow is bounded by the exact observed maximum. Histogram storage is bounded independently of chart count.',
      'Channels without a histogram, including historical statistics, have unavailable percentiles. Empty groups have unavailable percentiles and maxima.', '',
      ...(hasSwiss ? ['| Channel | Unit | Maximum absolute | p99.9 absolute interval | p99 absolute interval | Median absolute interval |',
        '| --- | --- | ---: | --- | --- | --- |'] : ['| Channel | Unit | Median absolute interval | p99 absolute interval | p99.9 absolute interval |',
        '| --- | --- | --- | --- | --- |']));
    const conventionQuantiles = [], engineSwissQuantiles = [], swissJplQuantiles = [], otherQuantiles = [];
    for (const [name, c] of Object.entries(channels)) {
      const q = c.statistics.absoluteQuantiles;
      const interval = key => q?.[key] ? `[${q[key].lower}, ${q[key].upper}]` : 'unavailable';
      const row = '| ' + [name, c.unit, ...(hasSwiss ? [c.statistics.maxAbs ?? 'unavailable', ...['p999', 'p99', 'median'].map(interval)] :
        ['median', 'p99', 'p999'].map(interval))].map(md).join(' | ') + ' |';
      if (groups && c.comparisonKind === 'JPL-convention-difference') conventionQuantiles.push(row);
      else if (hasSwiss && c.comparisonKind === 'engine-minus-Swiss') engineSwissQuantiles.push(row);
      else if (hasSwiss && c.comparisonKind === 'Swiss-minus-JPL') swissJplQuantiles.push(row);
      else if (hasSwiss && c.comparisonKind !== 'engine-minus-JPL') otherQuantiles.push(row);
      else lines.push(row);
    }
    if (conventionQuantiles.length) lines.push('', 'Separate convention-difference absolute percentiles:', '',
      ...(hasSwiss ? ['| Channel | Unit | Maximum absolute | p99.9 absolute interval | p99 absolute interval | Median absolute interval |',
        '| --- | --- | ---: | --- | --- | --- |'] : ['| Channel | Unit | Median absolute interval | p99 absolute interval | p99.9 absolute interval |',
        '| --- | --- | --- | --- | --- |']), ...conventionQuantiles);
    if (hasSwiss) {
      const swissHeader = ['| Channel | Unit | Maximum absolute | p99.9 absolute interval | p99 absolute interval | Median absolute interval |',
        '| --- | --- | ---: | --- | --- | --- |'];
      lines.push('', 'Engine minus Swiss instrument absolute-error percentiles:', '', ...swissHeader, ...engineSwissQuantiles,
        '', 'Swiss instrument minus JPL absolute-error percentiles:', '', ...swissHeader, ...swissJplQuantiles);
      if (otherQuantiles.length) lines.push('', 'Other comparison channel absolute percentiles:', '', ...swissHeader, ...otherQuantiles);
    }
  }
  lines.push('', 'Exclusions:', '', ...metadata.exclusions.map(e => '- ' + md(e)), '',
    'Reference identities: `' + md(JSON.stringify(sorted(campaign.identities.references))) + '`.',
    'Conventions: `' + md(JSON.stringify(sorted(campaign.config.conventions))) + '`.', '');
  const outputs = { json, markdown: lines.join('\n'), csv: csv.join('\n') + '\n' };
  if (Object.values(outputs).some(bytes => Buffer.byteLength(bytes) >= MAX_FILE_BYTES)) throw Error('Report exceeds file limit.');
  return outputs;
}
