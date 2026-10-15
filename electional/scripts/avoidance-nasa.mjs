// Independent published-row acquisition and clock arithmetic, never engine code.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, sep } from 'node:path';

export const selection = JSON.parse(await readFile(new URL('../references/avoidance-cases.json', import.meta.url), 'utf8'));
export const attribution = "Eclipse Predictions by Fred Espenak and Jean Meeus (NASA's GSFC)";
export const urls = {
  solar: 'https://eclipse.gsfc.nasa.gov/SEcat5/SE2001-2100.html',
  lunar: 'https://eclipse.gsfc.nasa.gov/LEcat5/LE2001-2100.html',
  solarKey: 'https://eclipse.gsfc.nasa.gov/SEcat5/SEcatkey.html',
  lunarKey: 'https://eclipse.gsfc.nasa.gov/LEcat5/LEcatkey.html',
  time: 'https://eclipse.gsfc.nasa.gov/LEcat5/time.html',
};
export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function parseRow(row) {
  assert.equal(typeof row, 'string');
  assert.equal(row, row.trim().replace(/\s+/gu, ' '), 'Expected normalized selected row.');
  const fields = row.split(' ');
  assert(/^\d{5}$/u.test(fields[0]) && /^\d{4}$/u.test(fields[1]) && /^\d{2}$/u.test(fields[3]));
  const month = months.indexOf(fields[2]);
  const match = /^(\d{2}):(\d{2}):(\d{2})$/u.exec(fields[4]);
  assert(month >= 0 && match);
  const [hour, minute, second] = match.slice(1).map(Number), year = Number(fields[1]), day = Number(fields[3]);
  assert(year >= 100 && hour < 24 && minute < 60 && second < 60 && day > 0);
  const atMs = Date.UTC(year, month, day, hour, minute, second), date = new Date(atMs);
  assert.equal(date.getUTCFullYear(), year); assert.equal(date.getUTCMonth(), month); assert.equal(date.getUTCDate(), day);
  assert(/^\d+$/u.test(fields[5]) && /^-?\d+$/u.test(fields[6]) && /^\d+$/u.test(fields[7]));
  assert(/^[ATHPN](?:[+\-nbmse])?$/u.test(fields[8]));
  return { catalogNumber: fields[0], date: date.toISOString().slice(0,10), tdLabel: date.toISOString().slice(0,19),
    atMs, catalogType: fields[8], catalogDeltaTSeconds: Number(fields[5]), lunation: Number(fields[6]), saros: Number(fields[7]) };
}
export function selectedRow(html, catalogNumber) {
  assert.equal(typeof html, 'string'); assert(/^\d{5}$/u.test(catalogNumber));
  const text = html.replace(/<[^>]*>/gu, '').replace(/&nbsp;|&#160;/gu, ' ');
  const rows = text.split(/\r?\n/u).map(line => line.trim().replace(/\s+/gu, ' '))
    .filter(line => line.startsWith(`${catalogNumber} `));
  assert.equal(rows.length, 1, 'Missing or duplicate catalog row.');
  parseRow(rows[0]); return rows[0];
}
export function reduce(rows) {
  assert(Array.isArray(rows)); assert.equal(rows.length, selection.cases.length);
  return rows.map((item, i) => {
    const test = selection.cases[i];
    assert.equal(item.kind, test.kind); assert.equal(item.url, urls[test.kind]);
    assert.equal(item.sha256, digest(item.row));
    const parsed = parseRow(item.row);
    assert.equal(parsed.catalogNumber, test.catalogNumber); assert.equal(parsed.date, test.date);
    assert.equal(parsed.catalogType, test.catalogType);
    return { kind: test.kind, ...parsed };
  });
}
export async function verify(file = new URL('../references/avoidance-nasa.json', import.meta.url), sourceDir) {
  const record = JSON.parse(await readFile(file, 'utf8'));
  assert.equal(record.schema, 'electional-nasa-avoidance/v1'); assert.equal(record.clock, 'tt');
  assert.equal(record.attribution, attribution); assert.deepEqual(record.selection, selection);
  assert(Number.isFinite(Date.parse(record.retrievedAt)));
  assert.deepEqual(Object.keys(record.pages), Object.keys(urls));
  for (const [key, url] of Object.entries(urls)) {
    const page = record.pages[key]; assert.equal(page.url, url); assert(/^[a-f0-9]{64}$/u.test(page.sha256));
    if (sourceDir) {
      const bytes = await readFile(new URL(`${key}.html`, sourceDir)); assert.equal(digest(bytes), page.sha256);
      if (key === 'solar' || key === 'lunar') for (const row of record.rows.filter(row => row.kind === key)) {
        assert.equal(selectedRow(bytes.toString('latin1'), parseRow(row.row).catalogNumber), row.row);
      }
    }
  }
  assert.deepEqual(record.events, reduce(record.rows)); return record;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === '--verify') {
    await verify(process.argv[3], process.argv[4] ? pathToFileURL(resolve(process.argv[4]) + sep) : undefined);
    console.log('Independent NASA selected rows, clocks, digests and reductions verified.');
  } else if (process.argv[2] === '--acquire' && process.argv.length === 3) {
    const directory = new URL('../generated/avoidance-nasa/', import.meta.url);
    await mkdir(directory, { recursive: true });
    const pages = {}, texts = {};
    for (const [key, url] of Object.entries(urls)) {
      const response = await fetch(url, { signal: AbortSignal.timeout(45000) }); assert(response.ok);
      const chunks = []; let size = 0;
      for await (const chunk of response.body) { size += chunk.length; assert(size < 1000000); chunks.push(chunk); }
      const bytes = Buffer.concat(chunks); texts[key] = bytes.toString('latin1');
      pages[key] = { url, sha256: digest(bytes) }; await writeFile(new URL(`${key}.html`, directory), bytes);
      console.log(`Read NASA ${key}.`);
    }
    for (const key of ['solarKey', 'lunarKey']) {
      assert(texts[key].includes('Permission is freely granted to reproduce this data'));
      assert(texts[key].includes(attribution));
    }
    assert(texts.time.includes('Terrestrial Time (TT)'));
    const rows = selection.cases.map(test => {
      const row = selectedRow(texts[test.kind], test.catalogNumber);
      return { kind: test.kind, url: urls[test.kind], row, sha256: digest(row) };
    });
    const record = { schema: 'electional-nasa-avoidance/v1', clock: 'tt', attribution,
      retrievedAt: new Date().toISOString(), selection, pages, rows, events: reduce(rows) };
    await writeFile(new URL('../generated/avoidance-nasa.json', import.meta.url), JSON.stringify(record, null, 2) + '\n');
    console.log('Wrote generated/avoidance-nasa.json for review; published references untouched.');
  } else throw new Error('Use --verify [fixture] [absolute-source-dir] or --acquire.');
}
