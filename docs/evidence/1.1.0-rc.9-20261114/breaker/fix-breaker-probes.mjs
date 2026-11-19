#!/usr/bin/env node
/*
 * Fix-round breaker: what the installed package does where the shipped pack
 * cannot be the source. Run in a consumer directory (see fix-breaker-probes.sh).
 *   node fix-breaker-probes.mjs <label>
 * Dates are synthetic instants, not birth data.
 */
import { performance } from 'node:perf_hooks';
const label = process.argv[2] ?? 'as-installed';
const t0 = performance.now();
const root = await import('@zodiacs/engine');
const t1 = performance.now();
const say = (k, v) => console.log(`[${label}] ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
say('import of the root, ms', (t1 - t0).toFixed(1));

const chartAt = (iso) => root.natalChart({ utc: new Date(iso), timeScale: 'tt', timeKnown: false });
const t2 = performance.now();
let first;
try { first = chartAt('2000-01-01T12:00:00Z'); } catch (e) { say('first natalChart THREW', `${e.name}: ${e.message}`); }
const t3 = performance.now();
chartAt('2000-01-02T12:00:00Z');
const t4 = performance.now();
say('first natalChart (opens the pack), ms', (t3 - t2).toFixed(1));
say('second natalChart, ms', (t4 - t3).toFixed(1));
say('defaultEphemeris()', root.defaultEphemeris());
if (first) {
  say('chart.ephemeris at 2000-01-01', first.ephemeris ?? 'absent');
  say('chart.flags at 2000-01-01', first.flags);
  say('Sun, Moon, Pluto longitude at 2000-01-01', ['Sun', 'Moon', 'Pluto'].map((b) => first.bodies.find((x) => x.body === b).lon));
}

// The ends of the pack: which ephemeris a chart names day by day.
const ends = ['1700-06-01', '1789-12-30', '1789-12-31', '1790-01-01', '1790-01-02', '1790-01-03', '1790-01-04', '2000-01-01',
  '2209-12-28', '2209-12-29', '2209-12-30', '2209-12-31', '2210-01-01', '2210-01-02', '2300-06-01'];
for (const day of ends) {
  for (const hour of ['00:00:00', '12:00:00']) {
    try {
      const c = chartAt(`${day}T${hour}Z`);
      const speeds = c.bodies.map((b) => b.speed).every(Number.isFinite);
      say(`${day}T${hour} TT`, `chart.ephemeris ${c.ephemeris?.name ?? 'absent'}; flags ${JSON.stringify(c.flags)}; all speeds finite ${speeds}`);
    } catch (e) { say(`${day}T${hour} TT`, `THREW ${e.name}: ${e.message}`); }
  }
}

// A search that crosses the end of the pack, and one wholly inside.
for (const [from, to] of [['2209-12-01T00:00:00Z', '2210-02-01T00:00:00Z'], ['1789-12-01T00:00:00Z', '1790-02-01T00:00:00Z']]) {
  try {
    const hits = root.findLongitudeCrossings('Sun', 280, new Date(from), new Date(to));
    say(`findLongitudeCrossings Sun 280 ${from} to ${to}`, hits.map((h) => (h.date ?? h.utc ?? h.at ?? h)));
  } catch (e) { say(`findLongitudeCrossings ${from}`, `THREW ${e.name}: ${e.message}`); }
}

// Is the difference between the two sources continuous at the switch? Sun and Pluto longitude either side of the lower end.
const d = root.defaultEphemeris().de440;
if (d.opened) {
  const edgeMs = Date.UTC(2000, 0, 1, 12) + d.fromTtDays * 86400000;
  const lon = (ms, body) => root.natalChart({ utc: new Date(ms), timeScale: 'tt', timeKnown: false });
  const before = lon(edgeMs - 1000), after = lon(edgeMs + 1000);
  say('lower switch instant (TT)', new Date(edgeMs).toISOString());
  for (const body of ['Sun', 'Moon', 'Pluto', 'North Node']) {
    const a = before.bodies.find((x) => x.body === body), b = after.bodies.find((x) => x.body === body);
    say(`${body} one second before (${before.ephemeris?.name ?? 'astronomy-engine'}) and after (${after.ephemeris?.name ?? 'astronomy-engine'}) the switch: step in arcsec`, (((b.lon - a.lon + 540) % 360) - 180) * 3600);
  }
}

// setDefaultEphemeris rejects anything else.
try { root.setDefaultEphemeris('swiss'); say('setDefaultEphemeris("swiss")', 'accepted'); } catch (e) { say('setDefaultEphemeris("swiss")', `threw ${e.name}`); }
