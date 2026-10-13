import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHorizons, selectRows, HORIZONS_LIMITS } from '../lib/horizons.mjs';
import { ttToTdb } from '../lib/reduction.mjs';

const reference = new URL('../../docs/evidence/calc-api/horizons/geo-NONE-10.txt',import.meta.url);
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
