import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHorizons, selectRows, HORIZONS_LIMITS } from '../lib/horizons.mjs';
import { ttToTdb } from '../lib/reduction.mjs';
import { renderJplMarkdown } from '../lib/jpl-report.mjs';

const reference = new URL('../../docs/evidence/calc-api/horizons/geo-NONE-10.txt',import.meta.url);
// Artifact consistency, not an independent physical accuracy check.
test('historical JPL markdown preserves aggregate measurements and their recorded identity', async () => {
  const bytes = await readFile(new URL('../reports/jpl-reduction.json', import.meta.url), 'utf8');
  const report = JSON.parse(bytes);
  const before = JSON.stringify(report);
  const rendered = renderJplMarkdown(report);
  assert.equal(rendered, await readFile(new URL('../reports/jpl-reduction.md', import.meta.url), 'utf8'));
  assert.equal(JSON.stringify(report), before);
  assert.ok(rendered.includes('`' + report.command + '` on ' + report.software.node));
  assert.ok(rendered.includes(report.kernel.sha256));
  const rows = rendered.split('\n').filter(line => /^\| (CN|NONE)/.test(line));
  assert.equal(rows.length, Object.keys(report.groups).length);
  for (const line of rows) {
    const [key, n, angle, range, failed] = line.split('|').slice(1, -1).map(cell => cell.trim());
    const group = report.groups[key];
    assert.equal(Number(n), group.angleArcseconds.n);
    assert.equal(Number(angle), group.angleArcseconds.maxAbs);
    assert.equal(Number(range), group.rangeKm.maxAbs);
    assert.equal(failed, `${group.angleArcseconds.failed} / ${group.rangeKm.failed}`);
  }
  assert.match(rendered, /Swiss transport is implemented, but no live Swiss comparison was run/);
});
test('Public Horizons parser requires frame, time, center, exact target and corrections', async () => {
  const text = await readFile(reference,'utf8');
  const rows = parseHorizons(text,10,'NONE');
  assert.ok(rows.length > 0);
  for (const [from,to] of [['ICRF','B1950'],['JDTT','JDTDB'],['Earth (399)','Earth (3)'],['AU-D','KM-S'],['$$EOE',''],['GEOMETRIC','LT CORRECTED'],['{source: DE441}','{source: DE999}']]) assert.throws(() => parseHorizons(text.replaceAll(from,to),10,'NONE'));
  assert.throws(() => parseHorizons(text,199,'NONE'));
  assert.throws(() => parseHorizons(text,10,'LT'));
  const rawRow = text.split('$$SOE')[1].trim().split('\n')[0];
  assert.throws(() => parseHorizons(text.replace(rawRow,rawRow.replace(/E[+-]\d+/, 'E+999')),10,'NONE'));
  assert.throws(() => parseHorizons(text.replace(rawRow,rawRow+'\n'+rawRow),10,'NONE'));
  assert.deepEqual(HORIZONS_LIMITS,{angleArcseconds:0.1,rangeKm:100});
});

test('Bounded row selection independently enumerated including start margin and empty coverage', () => {
  const rows = [0,1,2,3,4,5,6].map(i => ({jdTt:2451545+i}));
  const selected = selectRows(rows,0,5*86400,ttToTdb);
  // The small periodic time offset puts integer day 1 just below the start margin.
  const covered = rows.filter(r => {
    const t = ttToTdb((r.jdTt-2451545)*86400).tdbSeconds;
    return t >= 86400 && t <= 5*86400;
  });
  assert.deepEqual(selected.rows,[covered[0],covered[Math.floor(covered.length/2)],covered.at(-1)]);
  assert.equal(selected.outsideCoverage,rows.length-covered.length);
  assert.equal(selected.eligible,covered.length);
  assert.deepEqual(selectRows(rows,1e9,1e9+86400,ttToTdb).rows,[]);
  const one = selectRows([rows[3]],0,5*86400,ttToTdb);
  assert.equal(one.rows.length,1);
});
