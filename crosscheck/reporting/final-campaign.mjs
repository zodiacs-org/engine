// Final presentation consumes aggregate checkpoints and resource evidence only.
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderReport } from '../lib/report.mjs';
import { MAX_FILE_BYTES } from '../lib/disk-budget.mjs';
import { readRuntimeJson } from '../tools/campaign.mjs';
import { checkpointSnapshot, renderResources } from '../tools/progress.mjs';

const project = fileURLToPath(new URL('../', import.meta.url));
const repository = resolve(project, '..');
const fields = (value, expected) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).sort().join(',') === [...expected].sort().join(',');
const angularChannel = /^(JPL|Swiss)\.(DE440|DE441)\.([A-Z][a-z]+)\.(lon|lat)$/;
const bodyOrder = ['Sun', 'Moon', 'Mercury', 'Venus'];
const bodyList = values => {
  const ordered = [...values].sort((a, b) => bodyOrder.indexOf(a) - bodyOrder.indexOf(b) || a.localeCompare(b));
  return ordered.length > 1 ? ordered.slice(0, -1).join(', ') + ' and ' + ordered.at(-1) : ordered[0];
};
function seconds(nanoseconds) {
  if (!Number.isSafeInteger(nanoseconds) || nanoseconds < 0) throw Error('Invalid final elapsed duration.');
  const whole = BigInt(nanoseconds) / 1_000_000_000n;
  const fraction = String(BigInt(nanoseconds) % 1_000_000_000n).padStart(9, '0').replace(/0+$/, '');
  return String(whole) + (fraction ? '.' + fraction : '');
}
function boundedStop(resources) {
  if (resources.complete) return 'The requested chart count is complete.';
  const invocation = resources.invocations.at(-1);
  const [, , , action, budgetText] = invocation.driverCommand;
  if (budgetText === undefined || Number(budgetText) < 1 || !invocation.processed)
    throw Error('Partial final evidence requires a completed explicit case budget.');
  const selected = invocation.after.map((_, shard) => shard).filter(shard => action === 'all' || Number(action) === shard);
  if (selected.some(shard => invocation.after[shard] - (invocation.before[shard] ?? 0) !== Number(budgetText)))
    throw Error('Final invocation did not complete its explicit case budget.');
  return `The final invocation completed its explicit budget of ${budgetText} additional charts per selected shard ` +
    `(${action === 'all' ? 'all shards' : 'shard ' + action}). The requested target remains incomplete.`;
}

// Also permits artifact-only checks against retained aggregate report receipts.
export function finalHeadline(report, resources) {
  if (!report?.referenceGroups || !report.channels || !report.swissInstrument || !resources ||
      resources.campaignSha256 !== report.campaign?.sha256 || resources.completed !== report.completed ||
      resources.requested !== report.campaign?.config?.total || resources.complete !== report.complete ||
      JSON.stringify(resources.checkpointPrefixes) !== JSON.stringify(report.coverage?.map(row => row.completed)))
    throw Error('Final summary report and resource identities differ.');
  const measured = Object.entries(report.channels).flatMap(([name, row]) => {
    const parsed = angularChannel.exec(name);
    if (!parsed || !row.statistics.n) return [];
    if (row.unit !== 'arcseconds' || row.status !== 'measured' || !Number.isFinite(row.statistics.maxAbs) || row.statistics.maxAbs < 0)
      throw Error('Invalid final angular measurement.');
    return [{ kind: parsed[1], group: parsed[2], body: parsed[3], axis: parsed[4], maximum: row.statistics.maxAbs }];
  });
  const bodies = [...new Set(measured.filter(row => row.kind === 'JPL').map(row => row.body))];
  if (!Number.isSafeInteger(report.completed) || report.completed < 1 || !bodies.length ||
      bodies.some(body => !bodyOrder.includes(body))) throw Error('Final evidence requires measured exact phase2 bodies.');
  const maxima = kind => Object.fromEntries(['lon', 'lat'].map(axis => {
    const values = measured.filter(row => row.kind === kind && row.axis === axis).map(row => row.maximum);
    return [axis, values.length ? Math.max(...values) : null];
  }));
  const jpl = maxima('JPL'), swiss = maxima('Swiss');
  if (jpl.lon === null || jpl.lat === null) throw Error('Both JPL angular coordinates are required.');
  const unavailable = report.campaign.config.conventions.unavailableBodies;
  if (!unavailable || typeof unavailable !== 'object' || Array.isArray(unavailable) ||
      Object.entries(unavailable).some(([body, reason]) => !/^[A-Z][a-z]+$/.test(body) ||
        typeof reason !== 'string' || !reason || Object.entries(report.channels).some(([name, row]) =>
          name.split('.')[2] === body && row.statistics.n)))
    throw Error('Invalid final unavailable-center evidence.');
  if (measured.some(row => !bodies.includes(row.body))) throw Error('Final instrument comparisons use different bodies.');
  if (!['available', 'unavailable'].includes(report.swissInstrument.status) ||
      (report.swissInstrument.status === 'available' ? swiss.lon === null || swiss.lat === null : swiss.lon !== null || swiss.lat !== null))
    throw Error('Final Swiss availability differs from angular measurements.');
  const start = new Date(report.span.startMsInclusive).toISOString();
  const end = new Date(report.span.endMsExclusive).toISOString();
  const lines = [
    `Measured ${report.completed} synthetic charts drawn from the configured TT interval [${start}, ${end}), for ${bodyList(bodies)} only. ` +
      'This sampling interval is not continuous coverage or the observed extrema.',
    `The largest measured absolute engine-versus-JPL differences were ${jpl.lon} arcseconds in longitude and ${jpl.lat} arcseconds in latitude.`,
    report.swissInstrument.status === 'available' ?
      `The largest measured absolute engine-versus-Swiss instrument differences were ${swiss.lon} arcseconds in longitude and ${swiss.lat} arcseconds in latitude.` :
      'The optional Swiss instrument was unavailable; no engine-versus-Swiss or Swiss-versus-JPL differences were measured.',
    'These are sample maxima with the conventions recorded below, not bounds for untested charts. Swiss-minus-JPL results and JPL convention differences remain separate.',
    `Retained charts: ${report.completed} of the requested ${report.campaign.config.total}. ` + boundedStop(resources),
    `Measured campaign driver time across the recorded invocations: ${seconds(resources.totals.elapsedNanoseconds)} seconds. ` +
      'This includes startup and the external adapter when enabled; it excludes resource scans and report rendering. No execution-time extrapolation is used.'
  ];
  for (const [name, group] of Object.entries(report.referenceGroups)) {
    if (group.status === 'empty') lines.push(`${name} has no selected interval or measurements.`);
    else if (group.status === 'unavailable') lines.push(`${name} is unavailable and has no numerical measurements.`);
  }
  if (Object.keys(unavailable).length) lines.push(`Exact centers unavailable in this campaign: ${Object.keys(unavailable).sort().join(', ')}. ` +
    'Their rows contain no numerical measurements.');
  return lines.join('\n\n') + '\n';
}

export function renderFinalCampaign(bundle, ledger) {
  if (!fields(bundle, ['campaign', 'metadata', 'states'])) throw Error('Invalid final aggregate bundle fields.');
  const base = renderReport(bundle, { allowPartial: true });
  const snapshot = checkpointSnapshot(ledger?.spec, bundle.states, { requireAll: true, campaign: bundle.campaign });
  const resource = renderResources(ledger, ledger.spec, snapshot);
  const report = JSON.parse(base.json), resources = JSON.parse(resource.json);
  const headline = finalHeadline(report, resources);
  const separator = base.markdown.indexOf('\n\n');
  if (separator < 0) throw Error('Final report title is missing.');
  const outputs = { json: base.json, csv: base.csv,
    markdown: base.markdown.slice(0, separator + 2) + headline + '\n' + base.markdown.slice(separator + 2),
    resourcesJson: resource.json, resourcesMarkdown: resource.markdown };
  if (Object.values(outputs).some(bytes => Buffer.byteLength(bytes) >= MAX_FILE_BYTES)) throw Error('Final report exceeds file limit.');
  if (/[\u2013\u2014]/.test(outputs.markdown)) throw Error('Final report contains a forbidden dash.');
  return outputs;
}

export async function main(args) {
  const [input, ledgerInput, name, ...flags] = args;
  if (!input || !ledgerInput || !name || flags.length > 1 || (flags.length && flags[0] !== '--check') ||
      !/^[a-z][a-z0-9-]{0,79}$/.test(name) || !/^[a-z][a-z0-9-]{0,79}$/.test(name + '-resources') ||
      isAbsolute(input) || isAbsolute(ledgerInput))
    throw Error('Usage: final-campaign.mjs RUNTIME_BUNDLE RUNTIME_LEDGER NAME [--check]');
  const workingDirectory = relative(repository, process.cwd()) || '.';
  if (!['.', 'crosscheck'].includes(workingDirectory)) throw Error('Run final export from the repository root or crosscheck.');
  const bundle = await readRuntimeJson(input), ledger = await readRuntimeJson(ledgerInput);
  const command = ['node', (workingDirectory === '.' ? 'crosscheck/' : '') + 'reporting/final-campaign.mjs', input, ledgerInput, name];
  if (JSON.stringify(bundle.metadata?.command) !== JSON.stringify(command)) throw Error('Final bundle command differs from export arguments.');
  const outputs = renderFinalCampaign(bundle, ledger);
  const directory = resolve(project, 'reports');
  for (const path of [project, directory]) {
    const info = await lstat(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw Error('Regular final report directory required.');
  }
  const files = [['json', '.json'], ['markdown', '.md'], ['csv', '.csv'],
    ['resourcesJson', '-resources.json'], ['resourcesMarkdown', '-resources.md']]
    .map(([field, suffix]) => ({ path: resolve(directory, name + suffix), bytes: outputs[field] }));
  for (const { path } of files) {
    try {
      const info = await lstat(path);
      if (info.isSymbolicLink() || !info.isFile() || info.size >= MAX_FILE_BYTES) throw Error('Regular final report file below the size limit required.');
      if (!flags.length) throw Error('Final report already exists.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  for (const { path, bytes } of files) {
    if (flags.length) {
      if (await readFile(path, 'utf8') !== bytes) throw Error('Final aggregate report differs.');
    } else await writeFile(path, bytes, { flag: 'wx' });
  }
  console.log('Final aggregate report ' + (flags.length ? 'verified.' : 'written.'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main(process.argv.slice(2));
