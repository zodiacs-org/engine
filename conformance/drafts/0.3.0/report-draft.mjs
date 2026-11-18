#!/usr/bin/env node
/*
 * Write, or check, RESULTS-DRAFT.md from the draft L4 vector file and the
 * draft results files beside it (written by run-draft.mjs).
 *
 *   node conformance/drafts/0.3.0/report-draft.mjs           # rewrites RESULTS-DRAFT.md
 *   node conformance/drafts/0.3.0/report-draft.mjs --check   # fails if it is not current
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DRAFT_DIR, readDraft } from './run-draft.mjs';

export const RUNS = Object.freeze([
  { file: 'zodiacs-engine.json', label: 'default source (the shipped DE440 pack)' },
  { file: 'zodiacs-engine-astronomy-engine.json', label: 'astronomy-engine, the fallback' },
]);
const OUT = resolve(DRAFT_DIR, 'RESULTS-DRAFT.md');
const KINDS = ['event.ingress', 'event.station', 'event.lunation'];

const iso = (seconds, scale) => {
  const text = new Date(Date.UTC(2000, 0, 1, 12) + Math.round(seconds * 1000)).toISOString();
  return `${text.slice(0, 19).replace('T', ' ')} ${scale}`;
};

export function render() {
  const draft = readDraft();
  const vectors = draft.file.vectors;
  const byId = new Map(vectors.map((vector) => [vector.id, vector]));
  const runs = RUNS.filter((run) => existsSync(resolve(DRAFT_DIR, run.file))).map((run) => ({
    ...run, doc: JSON.parse(readFileSync(resolve(DRAFT_DIR, run.file), 'utf8')),
  }));
  const lines = [];
  const push = (...rows) => lines.push(...rows);
  push(
    '# Draft level L4: results',
    '',
    'A draft, not a released suite level: the released harness does not run it,',
    'and releasing it is the owner\'s decision. Written by `report-draft.mjs` from',
    '`L4-events.json` and the results files beside it; do not edit by hand.',
    '',
    `Vectors: ${vectors.length} in \`L4-events.json\` (SHA-256 \`${draft.digest}\`), ${draft.file.dropped.length} dropped.`,
    '',
  );
  for (const run of runs) {
    const { adapter, summary } = run.doc;
    const stale = run.doc.vectors?.['drafts/0.3.0/L4-events.json'] !== draft.digest;
    push(
      `## ${adapter.engine} ${adapter.engineVersion}, ${run.label}`,
      '',
      `\`${run.file}\`${stale ? ' (written for another version of the vector file; regenerate it)' : ''}.`,
      '',
      '| set | kind | vectors | pass | fail | unsupported | error | largest residual (s) | largest residual / tolerance |',
      '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    );
    for (const set of ['TT', 'UTC']) {
      for (const kind of KINDS) {
        const ids = vectors.filter((vector) => vector.kind === kind && (set === 'UTC') === (vector.tags ?? []).includes('utc-input')).map((vector) => vector.id);
        if (!ids.length) continue;
        const results = run.doc.results.filter((result) => ids.includes(result.id));
        const count = (verdict) => results.filter((result) => result.verdict === verdict).length;
        const field = set === 'UTC' ? 'utc_s' : 'tt_s';
        const residuals = results.filter((result) => result.residual?.[field] !== undefined);
        const largest = residuals.length ? Math.max(...residuals.map((result) => Math.abs(result.residual[field]))) : null;
        const ratio = residuals.length ? Math.max(...residuals.map((result) => Math.abs(result.residual[field]) / byId.get(result.id).tolerance[field].abs)) : null;
        push(`| ${set} | ${kind} | ${ids.length} | ${count('pass')} | ${count('fail')} | ${count('unsupported')} | ${count('error')} | ${largest === null ? '' : largest.toFixed(3)} | ${ratio === null ? '' : ratio.toFixed(3)} |`);
      }
    }
    push('', `Total: ${summary.total.pass} pass, ${summary.total.fail} fail, ${summary.total.unsupported} unsupported, ${summary.total.error} error.`, '');
    const failing = run.doc.results.filter((result) => result.verdict === 'fail' || result.verdict === 'error');
    if (failing.length) {
      push('Failing vectors (residual is the engine minus the expected instant):', '', '| id | event | expected | residual (s) | tolerance (s) | engine flags |', '| --- | --- | --- | ---: | ---: | --- |');
      for (const result of failing) {
        const vector = byId.get(result.id);
        const field = 'utc_s' in vector.expected ? 'utc_s' : 'tt_s';
        const what = vector.kind === 'event.ingress' ? `${vector.input.body} at ${vector.input.longitude_deg} deg` : vector.kind;
        const residual = result.residual?.[field];
        push(`| ${result.id} | ${what} | ${iso(vector.expected[field], field === 'utc_s' ? 'UTC' : 'TT')} | ${residual === undefined ? result.detail ?? '' : residual.toFixed(3)} | ${vector.tolerance[field].abs} | ${(result.meta?.flags ?? []).join(', ')} |`);
      }
      push('');
    } else {
      push('No vector fails.', '');
    }
    const unsupported = [...new Set(run.doc.results.filter((result) => result.verdict === 'unsupported').map((result) => `${byId.get(result.id).kind}: ${result.detail}`))];
    if (unsupported.length) push('Unsupported, as the adapter reports it:', '', ...unsupported.map((text) => `- ${text}`), '');
  }
  push('## Dropped vectors', '');
  if (draft.file.dropped.length) push(...draft.file.dropped.map((entry) => `- ${entry.id}, ${entry.what}: ${entry.reason}.`), '');
  else push('None.', '');
  push('## The arbiter\'s own checks', '', Object.values(draft.file.arbiters).map((arbiter) => arbiter.uncertainty).join('\n\n'), '');
  return `${lines.join('\n')}`;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(DRAFT_DIR, 'report-draft.mjs')) {
  const text = render();
  if (process.argv.includes('--check')) {
    const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
    if (current !== text) {
      console.error('conformance draft: RESULTS-DRAFT.md is not current; run report-draft.mjs');
      process.exit(1);
    }
    console.log('conformance draft: RESULTS-DRAFT.md is current');
  } else {
    writeFileSync(OUT, text);
    console.log('conformance draft: wrote RESULTS-DRAFT.md');
  }
}
