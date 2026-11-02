#!/usr/bin/env node
/**
 * Runs the Astrologer test set against an MCP server over streamable HTTP,
 * with the checks and tolerances of tolerance.md. It calls the server's tools
 * only (resolve_civil_time, reading_facts, natal_chart, event_search), never
 * the engine, because the bot only sees the server.
 *
 *   node bots/astrologer/testset/run-mcp.mjs --endpoint http://127.0.0.1:8787/mcp/engine \
 *     --expect /path/outside/the/repo/charts.json [--sheets sheets.json] [--failures]
 *
 * --sheets takes the engine CLI's sheets for the same inputs and window
 * (facts/cli.ts --batch --window-start 2026-11-01 --days 90) and checks that
 * the server's reading_facts sheet is byte-identical to each.
 *
 * The expected values (charts.json) are Swiss Ephemeris output and stay
 * outside this repository (AGENTS.md). The default output is the summary only:
 * per check, how many passed and failed and the largest residual, which is
 * what may be committed. --failures adds one line per failed check with its
 * chart and residual, for local use; do not commit it.
 *
 * Exit 0 when every check passes, 1 when one fails, 2 on bad arguments.
 */
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const endpoint = opt('--endpoint');
const expectPath = opt('--expect');
const showFailures = args.includes('--failures');
const sheets = opt('--sheets') ? JSON.parse(readFileSync(opt('--sheets'), 'utf8')) : null;
if (!endpoint || !expectPath) {
  process.stderr.write('Usage: run-mcp.mjs --endpoint URL --expect charts.json [--sheets sheets.json] [--failures]\n');
  process.exit(2);
}
const set = JSON.parse(readFileSync(expectPath, 'utf8'));

// ------------------------------------------------------------------ MCP over HTTP

let rpcId = 0;
async function callTool(name, toolArgs) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: toolArgs } }),
  });
  const text = await response.text();
  const data = text.split('\n').find((line) => line.startsWith('data: '));
  const message = JSON.parse(data ? data.slice(6) : text);
  if (message.error) throw new Error(`${name}: ${message.error.message}`);
  if (message.result.isError) throw new Error(`${name}: ${message.result.content?.[0]?.text}`);
  return message.result.structuredContent;
}

// ------------------------------------------------------------------ arithmetic

const ARCSEC = 3600;
/** Smallest signed difference a - b of two longitudes, arcseconds. */
const lonDiff = (a, b) => (((a - b + 540) % 360) - 180) * ARCSEC;
const signOf = (lon) => ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'][Math.floor((((lon % 360) + 360) % 360) / 30)];
/** Arcseconds from a longitude to the nearest sign boundary. */
const edgeDistance = (lon) => { const d = ((lon % 30) + 30) % 30; return Math.min(d, 30 - d) * ARCSEC; };
const parseUtc = (iso) => Date.parse(/Z$/.test(iso) && iso.length === 17 ? iso.replace('Z', ':00Z') : iso);
const localDate = (utcMs, zone) => new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(utcMs));
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
const ASPECT_ANGLE = { conjunction: 0, square: 90, opposition: 180, trine: 120 };
const NATAL_NAME = { Sun: 'Sun', Moon: 'Moon', ASC: 'Ascendant', MC: 'Midheaven' };
const C1 = new Set(['Uranus', 'Neptune', 'Pluto']);
/** Mean sidereal rate of the meridian, arcseconds of longitude per second of time, an upper bound for the MC. */
const MC_RATE = 16.5;
const UT1_UTC = 0.9;

// ------------------------------------------------------------------ results

const checks = new Map();
const failures = [];
function record(check, chart, pass, residual = null, note = '') {
  const entry = checks.get(check) ?? { pass: 0, fail: 0, maxResidual: null, unit: '' };
  if (pass) entry.pass++; else { entry.fail++; failures.push(`${chart} ${check}${residual === null ? '' : ` residual ${residual.toFixed(2)}`}${note ? ` (${note})` : ''}`); }
  if (residual !== null && Number.isFinite(residual)) entry.maxResidual = Math.max(entry.maxResidual ?? 0, Math.abs(residual));
  checks.set(check, entry);
}

// ------------------------------------------------------------------ one chart

async function runChart(chart) {
  const { id, input, expect: e } = chart;
  const windowStart = set.transitWindow.fromUtc.slice(0, 10);
  const facts = (await callTool('reading_facts', { ...input, time: input.timeKnown ? input.time : null, windowStart, days: set.transitWindow.days, format: 'facts' })).facts;

  record('status', id, facts.status === e.status, null, `${facts.status} vs ${e.status}`);
  if (sheets) {
    const sheet = (await callTool('reading_facts', { ...input, time: input.timeKnown ? input.time : null, windowStart, days: set.transitWindow.days })).sheet;
    record('sheet identical to the engine CLI', id, sheet === sheets[id]);
  }
  /** The exact first instant, from resolve_civil_time; reading_facts prints its instants to the minute. */
  let exactUtc = null;
  if (input.timeKnown) {
    const civil = await callTool('resolve_civil_time', { date: input.date, time: input.time, timeZone: input.zone, longitude: input.lon });
    record('civil-time status', id, civil.data.status === e.status, null, `${civil.data.status} vs ${e.status}`);
    exactUtc = civil.data.resolution.utc;
    // resolve_civil_time gives the earlier instant of a fold and the shifted instant of a gap, to the second.
    // The other chart of a fold or gap is reading_facts' second chart, printed to the minute.
    const expected = e.utc.map(parseUtc);
    const first = e.status === 'gap' ? Date.parse(facts.versions[0].utc) : Date.parse(exactUtc);
    const instants = [first, ...facts.versions.slice(1).map((v) => Date.parse(v.utc))];
    const residuals = instants.map((t, i) => Math.abs(t - expected[i]) / 1000);
    record('utc instants (1 s)', id, instants.length === expected.length && residuals.every((r) => r <= 1),
      instants.length === expected.length ? Math.max(...residuals) : null, `${instants.length} vs ${expected.length} instants`);
  }
  if (!e.bodies) {
    if (e.status === 'time-unknown') await unknownTime(id, input, e, facts);
    return;
  }
  const version = facts.versions[0];
  const placements = Object.fromEntries(version.placements.map((p) => [p.point, p]));
  for (const [body, lon] of Object.entries(e.bodies)) {
    const got = placements[body];
    const residual = lonDiff(got.lon, lon);
    const tolerance = body === 'North Node' ? 60 : 30;
    record(body === 'North Node' ? 'true node (60")' : 'positions Sun to Pluto (30")', id, Math.abs(residual) <= tolerance, residual, body);
    const near = edgeDistance(lon) <= tolerance;
    record('signs', id, got.sign === signOf(lon) || near, null, body);
    const retro = (e.retrograde ?? []).includes(body);
    if (got.retrograde !== retro) record('retrograde flags', id, await stationWithinADay(body, version.utc), null, body);
    else record('retrograde flags', id, true);
  }
  // Angles: the generator passed UTC to Swiss as UT1, so the tolerance carries 0.9 s of the point's rate.
  const ascTol = 30 + UT1_UTC * e.ascRate;
  const ascResidual = lonDiff(version.ascendant.lon, e.asc);
  record('ascendant (30" + 0.9 s x rate)', id, Math.abs(ascResidual) <= ascTol, ascResidual);
  record('signs', id, version.ascendant.sign === e.ascSign || edgeDistance(e.asc) <= ascTol, null, 'Ascendant');
  const mcResidual = lonDiff(version.midheaven.lon, e.mc);
  record('midheaven (30" + 0.9 s x rate)', id, Math.abs(mcResidual) <= 30 + UT1_UTC * MC_RATE, mcResidual);
  if (e.later) {
    const later = facts.versions[1];
    const r = lonDiff(later.ascendant.lon, e.later.asc);
    record('fold: later ascendant', id, Math.abs(r) <= ascTol, r);
    record('fold: later ascendant sign', id, later.ascendant.sign === e.later.ascSign || edgeDistance(e.later.asc) <= ascTol);
  }
  if (e.placidus === 'undefined') {
    record('placidus undefined at a polar birthplace', id, version.placidusUndefined === true);
  } else if (Array.isArray(e.placidus)) {
    const natal = await callTool('natal_chart', { birth: { utc: exactUtc, latitude: input.lat, longitude: input.lon, houseSystem: 'placidus' } });
    const cusps = natal.data.chart.houses?.cusps ?? [];
    const fallback = natal.data.chart.flags.includes('polar-fallback');
    // Intermediate cusps move at most as fast as the faster of the Ascendant and the meridian.
    const tol = 30 + UT1_UTC * Math.max(e.ascRate, MC_RATE);
    const worst = Math.max(...e.placidus.map((lon, i) => Math.abs(lonDiff(cusps[i], lon))));
    record('placidus cusps (30" + 0.9 s x rate)', id, !fallback && cusps.length === 12 && worst <= tol, worst);
  }
  if (e.transits) await transitChecks(id, input, e.transits, version, placements);
}

async function stationWithinADay(body, utc) {
  const t = Date.parse(utc);
  const speeds = [];
  for (const offset of [-1, 1]) {
    const chart = await callTool('natal_chart', { birth: { utc: new Date(t + offset * 86_400_000).toISOString() } });
    speeds.push(chart.data.chart.bodies.find((b) => b.body === body).speed);
  }
  return Math.sign(speeds[0]) !== Math.sign(speeds[1]);
}

async function unknownTime(id, input, e, facts) {
  const version = facts.versions[0];
  record('unknown time: houses and angles null', id, version.ascendant === null && version.midheaven === null && version.chartRuler === null);
  const ends = [parseUtc(e.dayStartUtc), parseUtc(e.dayEndUtc)];
  for (const [i, t] of ends.entries()) {
    const chart = await callTool('natal_chart', { birth: { utc: new Date(t).toISOString(), timeKnown: false } });
    const moon = chart.data.chart.bodies.find((b) => b.body === 'Moon').lon;
    const r = lonDiff(moon, e.moonRange[i]);
    record('unknown time: Moon range ends (30")', id, Math.abs(r) <= 30, r);
  }
  record('unknown time: moonSignDepends', id, (version.moonSigns.length > 1) === e.moonSignDepends);
}

async function transitChecks(id, input, expected, version, placements) {
  const natalLon = (name) => (name === 'ASC' ? version.ascendant.lon : name === 'MC' ? version.midheaven.lon : placements[name].lon);
  const from = parseUtc(set.transitWindow.fromUtc);
  const to = from + set.transitWindow.days * 86_400_000;
  const matched = new Set();
  // reading_facts' window is local dates in the birth zone; the generator's starts at 00:00 UTC.
  const first = set.transitWindow.fromUtc.slice(0, 10);
  const last = addDays(first, set.transitWindow.days - 1);
  for (const t of expected) {
    const exact = parseUtc(t.exactUtc);
    const day = localDate(exact, input.zone);
    if (day < first || day > last) { record('expected transit outside the local window (not checked)', id, true); continue; }
    const line = version.transits.find((x) => x.body === t.body && x.aspect === t.aspect && x.natal === NATAL_NAME[t.natal]
      && (x.exact.some((d) => Math.abs(Date.parse(d) - Date.parse(day)) <= 86_400_000) || (x.range && x.range.from <= day && day <= x.range.to)));
    if (!line) { record('transit listed', id, false, null, `${t.body} ${t.aspect} ${t.natal}`); continue; }
    record('transit listed', id, true);
    matched.add(line);
    if (Math.abs(t.speed) < 0.01) {
      record('transit near a station: range only', id, line.range !== null && line.range.from <= day && day <= line.range.to, null, `${t.body} ${t.aspect} ${t.natal}`);
      continue;
    }
    if (C1.has(t.body)) {
      const inRange = line.range !== null && line.range.from <= day && day <= line.range.to;
      const plusMinusOne = line.exact.some((d) => Math.abs(Date.parse(d) - Date.parse(day)) <= 86_400_000);
      record('transit Uranus to Pluto: range and +/-1 day (c1)', id, inRange && plusMinusOne, null, `${t.body} ${t.aspect} ${t.natal}`);
      continue;
    }
    // Sun to Saturn: the exact instant from the server's crossing search, within 2 hours, and the calendar day in the zone.
    const angle = ASPECT_ANGLE[t.aspect];
    const targets = angle === 0 || angle === 180 ? [natalLon(t.natal) + angle] : [natalLon(t.natal) + angle, natalLon(t.natal) - angle];
    let best = Infinity;
    for (const target of targets) {
      const search = await callTool('event_search', {
        body: t.body, longitude: ((target % 360) + 360) % 360,
        from: new Date(exact - 3 * 86_400_000).toISOString(), to: new Date(exact + 3 * 86_400_000).toISOString(),
      });
      for (const c of search.data.search.crossings) best = Math.min(best, Math.abs(Date.parse(c.at) - exact));
    }
    const minutes = best / 60_000;
    record('transit exact time Sun to Saturn (2 h)', id, minutes <= 120, minutes);
    // The day shown must be the zone's day of the server's own instant; within 2 hours of midnight either day passes.
    const days = [localDate(exact - 2 * 3_600_000, input.zone), localDate(exact + 2 * 3_600_000, input.zone)];
    record('transit day in the zone', id, line.exact.some((d) => days.includes(d)), null, `${t.body} ${t.aspect} ${t.natal}`);
  }
  // Nothing extra: a listed transit with these aspects and points and an exact day inside both windows must be expected.
  let extras = 0;
  for (const line of version.transits) {
    if (matched.has(line) || !set.transitWindow.aspects.includes(line.aspect)) continue;
    const natal = Object.keys(NATAL_NAME).find((k) => NATAL_NAME[k] === line.natal);
    if (!natal || !set.transitWindow.natalPoints.includes(natal)) continue;
    const inside = line.exact.some((d) => addDays(first, 1) <= d && d <= addDays(localDate(to, input.zone), -1) && d <= last);
    if (!inside) continue;
    extras++;
    failures.push(`${id} extra transit ${line.body} ${line.aspect} ${line.natal} ${line.exact.join(',')}`);
  }
  record('no transit beyond the expected list', id, extras === 0, null, `${extras} extra`);
}

// ------------------------------------------------------------------ run

const started = Date.now();
const capabilities = await callTool('get_capabilities', {});
let stationsChecked = false;
for (const chart of set.charts) {
  try {
    await runChart(chart);
    if (!stationsChecked) {
      const facts = (await callTool('reading_facts', { ...chart.input, time: chart.input.timeKnown ? chart.input.time : null, windowStart: set.transitWindow.fromUtc.slice(0, 10), days: set.transitWindow.days, format: 'facts' })).facts;
      for (const s of set.skyStations) {
        const got = facts.stations.find((x) => x.body === s.body && x.kind === s.kind);
        const hours = got ? Math.abs(parseUtc(got.utc) - parseUtc(s.utc)) / 3_600_000 : Infinity;
        record('stations in the window (1 day)', 'sky', hours <= 24, hours, `${s.body} ${s.kind}`);
      }
      stationsChecked = true;
    }
  } catch (error) {
    record('tool call succeeded', chart.id, false, null, error instanceof Error ? error.message.slice(0, 120) : 'error');
  }
}

const units = {
  'positions Sun to Pluto (30")': 'arcsec', 'true node (60")': 'arcsec', 'ascendant (30" + 0.9 s x rate)': 'arcsec', 'midheaven (30" + 0.9 s x rate)': 'arcsec',
  'fold: later ascendant': 'arcsec', 'placidus cusps (30" + 0.9 s x rate)': 'arcsec', 'unknown time: Moon range ends (30")': 'arcsec',
  'utc instants (1 s)': 'seconds', 'transit exact time Sun to Saturn (2 h)': 'minutes', 'stations in the window (1 day)': 'hours',
};
const summary = {
  endpoint: endpoint.replace(/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/, 'http://localhost'),
  charts: set.charts.length,
  arbiter: set.arbiter?.name ? `${set.arbiter.name} ${set.arbiter.version}; civil time ${set.arbiter.civilTime}` : null,
  server: { name: capabilities.name, version: capabilities.version, ...capabilities.versions },
  checks: Object.fromEntries([...checks].map(([name, c]) => [name, { pass: c.pass, fail: c.fail, ...(c.maxResidual === null ? {} : { maxResidual: Number(c.maxResidual.toFixed(2)), unit: units[name] ?? '' }) }])),
  totals: { pass: [...checks.values()].reduce((n, c) => n + c.pass, 0), fail: [...checks.values()].reduce((n, c) => n + c.fail, 0) },
  seconds: Math.round((Date.now() - started) / 1000),
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (showFailures && failures.length) process.stdout.write(`\nFailures (local only, do not commit):\n${failures.join('\n')}\n`);
process.exit(summary.totals.fail === 0 ? 0 : 1);
