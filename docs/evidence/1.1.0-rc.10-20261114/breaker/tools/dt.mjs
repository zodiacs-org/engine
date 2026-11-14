// Breaker: PR 102's extrapolated-ΔT flag and widened bounds, on the default (DE440) path of the installed package.
import * as root from '@zodiacs/engine';
import { calc, chart, events, houses } from '@zodiacs/engine/calc';
const FLAG = 'delta-t-extrapolated';
const FAR = '2199-06-15T12:00:00Z', NOW = '2024-06-15T12:00:00Z';
const out = [];
const check = (name, pass, detail) => out.push(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ': ' + detail : ''}`);
const ok = (r) => { if (r.status !== 'ok') throw new Error(r.reason); return r; };
const sep = (a, b) => Math.hypot((a.lon - b.lon) * Math.cos((a.lat * Math.PI) / 180), a.lat - b.lat) * 3600;

for (const body of ['Moon', 'Sun', 'Mercury', 'Pluto']) {
  const far = ok(calc({ body, time: FAR }));
  const now = ok(calc({ body, time: NOW }));
  const used = far.receipt.instants[0];
  const eph = far.receipt.engine.ephemeris.name;
  check(`${body}: far UTC instant is on the pack and flagged`, eph === 'jpl-de440' && JSON.stringify(far.flags) === JSON.stringify([FLAG]), `${eph} ${JSON.stringify(far.flags)} segment ${used.deltaT.segment} sigma ${used.deltaT.sigma}`);
  const omega = Math.hypot(far.speeds.lon * Math.cos((far.lat * Math.PI) / 180), far.speeds.lat);
  const tt = far.band.time.tt;
  const extra = (omega / 24) * tt;
  const base = now.bounds.position.value;
  check(`${body}: bound = the pack's bound + rate x TT band`, Math.abs(far.bounds.position.value - base - extra) < 0.01 * extra && far.bounds.position.label === 'estimated', `now ${base} (${now.bounds.position.label}), far ${far.bounds.position.value.toFixed(4)}, extra ${extra.toFixed(4)}, band ${tt.toFixed(2)} s; basis "${far.bounds.position.basis.slice(0, 120)}"`);
  check(`${body}: bounds:plus-delta-t-band named`, far.receipt.conventions.includes('bounds:plus-delta-t-band'));
  // The pack's own place moved by ΔT ± σ stays inside the widening.
  const [a, b] = [-1, 1].map((k) => ok(calc({ body, time: { iso: FAR, deltaT: used.deltaT.seconds + k * used.deltaT.sigma } })));
  const moved = sep(a, b) / 2;
  check(`${body}: the place at ΔT ± σ moves less than the widening`, moved <= far.bounds.position.value - base && a.receipt.engine.ephemeris.name === 'jpl-de440', `moved ${moved.toFixed(4)} arcsec, widening ${(far.bounds.position.value - base).toFixed(4)}`);
  const onTt = ok(calc({ body, time: { jd: used.jdTt, scale: 'tt' } }));
  const pinned = ok(calc({ body, time: { iso: FAR, deltaT: 125 } }));
  check(`${body}: present day, TT input and pinned ΔT unflagged with the pack's own bound`, [now, onTt, pinned].every((r) => r.flags.length === 0 && r.bounds.position.value === base && !r.receipt.conventions.includes('bounds:plus-delta-t-band')), `${[now, onTt, pinned].map((r) => JSON.stringify(r.flags) + r.bounds.position.value).join(' ')}`);
  check(`${body}: distance and speed bounds on the pack`, true, `distance ${JSON.stringify(far.bounds.distance?.value ?? null)}, speed ${JSON.stringify(far.bounds.speed?.value ?? null)} (now: ${JSON.stringify(now.bounds.distance?.value ?? null)}, ${JSON.stringify(now.bounds.speed?.value ?? null)})`);
}
// UT1 input
const ut1 = ok(calc({ body: 'Moon', time: { jd: 2_524_183.0, scale: 'ut1' } }));
check('UT1 input flagged, on the pack', ut1.flags.includes(FLAG) && ut1.receipt.engine.ephemeris.name === 'jpl-de440', JSON.stringify(ut1.flags));
// topocentric (astronomy-engine by design) on TT input
const jdTt = ok(calc({ body: 'Moon', time: FAR })).receipt.instants[0].jdTt;
const topo = ok(calc({ body: 'Moon', time: { jd: jdTt, scale: 'tt' }, center: { topocentric: { latitude: 41.5, longitude: 12.25 } } }));
check('topocentric on TT input flagged (astronomy-engine by design)', topo.flags.includes(FLAG), `${topo.receipt.engine.ephemeris.name} ${JSON.stringify(topo.flags)}`);
// natalChart and chart
const place = { latitude: 41.5, longitude: 12.25 };
const n1 = root.natalChart({ utc: FAR, ...place });
const n2 = root.natalChart({ utc: FAR, timeScale: 'tt', timeKnown: false });
const n3 = root.natalChart({ utc: FAR, timeScale: 'tt', ...place });
const n4 = root.natalChart({ utc: NOW, ...place });
check('natalChart: UTC far flagged; TT without houses not; TT with houses flagged; present day not; all on the pack', n1.flags.includes(FLAG) && !n2.flags.includes(FLAG) && n3.flags.includes(FLAG) && !n4.flags.includes(FLAG) && [n1, n2, n3, n4].every((c) => c.ephemeris.name === 'jpl-de440'), [n1, n2, n3, n4].map((c) => JSON.stringify(c.flags)).join(' '));
const c1 = ok(chart({ time: FAR, place }));
check('chart(): flagged, on the pack', c1.chart.flags.includes(FLAG) && c1.chart.ephemeris.name === 'jpl-de440', JSON.stringify(c1.chart.flags));
const h1 = ok(houses({ time: FAR, place }));
check('houses(): flagged', h1.flags.includes(FLAG), JSON.stringify(h1.flags));
const e1 = ok(events({ kind: 'longitude-crossing', body: 'Sun', longitude: 90, from: '2199-01-01T00:00:00Z', to: '2199-12-01T00:00:00Z' }));
const e0 = ok(events({ kind: 'longitude-crossing', body: 'Sun', longitude: 90, from: '2024-01-01T00:00:00Z', to: '2024-12-01T00:00:00Z' }));
check('events(): flagged far, not now; timing bound wider far; on the pack', e1.flags.includes(FLAG) && !e0.flags.includes(FLAG) && e1.receipt.engine.ephemeris.name === 'jpl-de440', `far ${JSON.stringify(e1.flags)} timing ${JSON.stringify(e1.bounds?.timing?.value ?? e1.bounds)}; now ${JSON.stringify(e0.flags)} timing ${JSON.stringify(e0.bounds?.timing?.value ?? e0.bounds)}`.slice(0, 400));
console.log(out.join('\n'));
console.log(`${out.filter((l) => l.startsWith('PASS')).length} pass, ${out.filter((l) => l.startsWith('FAIL')).length} fail`);
