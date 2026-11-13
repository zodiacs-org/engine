#!/usr/bin/env node
/*
 * Fix-round breaker: one chart inside the pack's years and one outside, and
 * what the chart, the receipt and defaultEphemeris() say about the source.
 *   node fix-breaker-fallback.mjs <label> [no-atob]
 */
const [label, how] = process.argv.slice(2);
if (how === 'no-atob') delete globalThis.atob;
const root = await import('@zodiacs/engine');
const { createNatalEnvelope } = await import('@zodiacs/engine/receipt');
const say = (k, v) => console.log(`[${label}] ${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
for (const iso of ['2000-01-01T12:00:00Z', '1700-06-01T12:00:00Z']) {
  try {
    const chart = root.natalChart({ utc: new Date(iso), timeScale: 'tt', timeKnown: false });
    const pluto = chart.bodies.find((b) => b.body === 'Pluto').lon;
    let receipt;
    try { const e = createNatalEnvelope(chart); receipt = JSON.stringify(e.receipt?.engine ?? e.engine ?? Object.keys(e)); } catch (e) { receipt = `THREW ${e.name}: ${e.message}`; }
    say(iso, `chart.ephemeris ${chart.ephemeris?.name ?? 'absent'}; flags ${JSON.stringify(chart.flags)}; Pluto ${pluto}; receipt engine ${receipt}`);
  } catch (e) { say(iso, `natalChart THREW ${e.name}: ${e.message}`); }
}
say('defaultEphemeris()', root.defaultEphemeris());
try { const p = await import('@zodiacs/engine/de440/pack'); p.shippedDe440Source(); say('shippedDe440Source()', 'opened'); } catch (e) { say('shippedDe440Source()', `threw ${e.name}: ${e.message}`.slice(0, 300)); }
