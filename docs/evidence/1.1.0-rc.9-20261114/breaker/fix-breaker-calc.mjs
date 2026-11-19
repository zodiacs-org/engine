#!/usr/bin/env node
/*
 * Fix-round breaker: on the installed package, a default calc() beside the
 * root's positions() at the same instants (synthetic), in arcseconds, and
 * what each names as its ephemeris.
 */
import { positions, natalChart, setDefaultEphemeris } from '@zodiacs/engine';
import { calc } from '@zodiacs/engine/calc';
const arcsec = (a, b) => ((((a - b) % 360) + 540) % 360 - 180) * 3600;
for (const iso of ['1851-03-14T04:37:00Z', '2000-01-01T12:00:00Z', '2024-04-08T18:21:30Z', '2199-12-31T23:57:00Z', '1700-06-01T12:00:00Z']) {
  const rows = positions(iso);
  const chart = natalChart({ utc: iso, timeKnown: false });
  let worst = { body: '', d: 0 }, receiptEphemeris = new Set();
  for (const row of rows) {
    const r = calc({ body: row.body, time: iso });
    if (r.status !== 'ok') { console.log(`${iso} ${row.body}: calc status ${r.status}`); continue; }
    const d = Math.abs(arcsec(r.lon, row.lon));
    if (d > worst.d) worst = { body: row.body, d };
    receiptEphemeris.add(JSON.stringify(r.receipt?.engine?.ephemeris ?? r.receipt?.ephemeris ?? null));
  }
  console.log(`${iso}: natalChart names ${chart.ephemeris?.name ?? 'astronomy-engine (no ephemeris property)'}; largest |calc() - positions()| in longitude ${worst.d.toFixed(4)}" (${worst.body}); calc receipts name ${[...receiptEphemeris].join(' ')}`);
}
setDefaultEphemeris('astronomy-engine');
const iso = '2000-01-01T12:00:00Z';
console.log(`after setDefaultEphemeris("astronomy-engine"), ${iso}: calc() equals positions() to the bit for every body: ${positions(iso).every((row) => { const r = calc({ body: row.body, time: iso }); return Object.is(r.lon, row.lon) && Object.is(r.lat, row.lat); })}`);
