// Availability planning only. No engine or reference positions are retained.
import { ttToTdb } from './reduction.mjs';

export const REFERENCE_SOURCE = 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/aa_summaries.txt';
export const REFERENCE_READ_DATE = '2026-10-19';
const j2000Ms = Date.UTC(2000, 0, 1, 12);
const epoch = label => (Date.parse(label) - j2000Ms) / 1000;
// These calendar labels render TDB, not UTC. No leap-second conversion is used.
const catalogEntry = (start, end) => Object.freeze({ source: REFERENCE_SOURCE,
  readDate: REFERENCE_READ_DATE, timeScale: 'TDB', bounds: 'inclusive',
  start, end, startTdbSeconds: epoch(start), endTdbSeconds: epoch(end) });
export const REFERENCE_CATALOG = Object.freeze({
  'de440.bsp': catalogEntry('1549-12-31T00:00:00Z', '2650-01-25T00:00:00Z'),
  'de440s.bsp': catalogEntry('1849-12-26T00:00:00Z', '2150-01-22T00:00:00Z'),
  'de441_part-1.bsp': catalogEntry('-013200-05-06T00:00:00Z', '1969-07-30T00:00:00Z'),
  'de441_part-2.bsp': catalogEntry('1969-06-28T00:00:00Z', '+017191-03-15T00:00:00Z'),
});
export const SAMPLE_SPAN = Object.freeze({ startMs: Date.UTC(1800, 0, 1),
  endMs: Date.UTC(2200, 0, 1), timeScale: 'TT', bounds: 'half-open' });
export const LIGHT_TIME_PADDING_SECONDS = 86400;
export const EXACT_TARGETS = Object.freeze({ Sun: 10, Moon: 301, Mercury: 199,
  Venus: 299, Mars: 499, Jupiter: 599, Saturn: 699, Uranus: 799,
  Neptune: 899, Pluto: 999 });
const requiredTargets = [10, 301, 199, 299, 399];

// Later descriptors take priority, including an unsupported selected descriptor.
// Every descriptor boundary is checked separately because SPK bounds are closed.
export function requireCenterChain(segments, target, start, end) {
  if (!Array.isArray(segments) || !Number.isSafeInteger(target) ||
      ![start, end].every(Number.isFinite) || start > end) throw Error('Invalid center-chain request');
  for (const s of segments) {
    if (!s || ![s.target, s.center, s.frame, s.type].every(Number.isSafeInteger) ||
        ![s.startTdbSeconds, s.endTdbSeconds].every(Number.isFinite) ||
        s.startTdbSeconds > s.endTdbSeconds) throw Error('Invalid center-chain descriptor');
  }
  const boundaries = [...new Set([start, end, ...segments.flatMap(s =>
    [s.startTdbSeconds, s.endTdbSeconds].filter(t => t > start && t < end))])].sort((a, b) => a - b);
  const probes = [...boundaries];
  for (let i = 1; i < boundaries.length; i++) {
    const middle = boundaries[i - 1] + (boundaries[i] - boundaries[i - 1]) / 2;
    if (middle > boundaries[i - 1] && middle < boundaries[i]) probes.push(middle);
  }
  for (const t of probes) {
    let current = target;
    const visited = new Set();
    while (current !== 0) {
      if (visited.has(current) || visited.size >= 64) throw Error('Cyclic or excessive center chain');
      visited.add(current);
      const selected = segments.findLast(s => s.target === current &&
        t >= s.startTdbSeconds && t <= s.endTdbSeconds);
      if (!selected) throw Error(`No covered segment for exact NAIF target ${current}`);
      if (selected.frame !== 1 || ![2, 3].includes(selected.type)) throw Error('Unsupported selected SPK type or frame');
      current = selected.center;
    }
  }
}

function kernelMap(kernels) {
  if (!Array.isArray(kernels)) throw Error('Verified opened kernels required');
  const byName = new Map();
  for (const kernel of kernels) {
    const receipt = kernel?.receipt;
    if (!receipt || !Object.hasOwn(REFERENCE_CATALOG, receipt.name) ||
        !/^[a-f0-9]{64}$/.test(receipt.sha256) ||
        !Array.isArray(receipt.coverage?.segments) || byName.has(receipt.name)) throw Error('Distinct verified kernel identities required');
    byName.set(receipt.name, kernel);
  }
  return byName;
}
function requireKernelSpan(kernel, targets, start, end) {
  const catalog = REFERENCE_CATALOG[kernel.receipt.name];
  if (start < catalog.startTdbSeconds || end > catalog.endTdbSeconds) throw Error('Requested span outside public kernel coverage');
  for (const target of targets) requireCenterChain(kernel.receipt.coverage.segments, target, start, end);
}

export function selectReference(kernels, tdbSeconds) {
  if (!Number.isFinite(tdbSeconds)) throw Error('Finite TDB epoch required');
  const byName = kernelMap(kernels);
  const start = tdbSeconds - LIGHT_TIME_PADDING_SECONDS;
  const full = REFERENCE_CATALOG['de440.bsp'];
  // The full DE440 interval, with reception padding, defines this policy.
  // A missing or broken preferred kernel does not authorize a model change.
  if (start >= full.startTdbSeconds && tdbSeconds <= full.endTdbSeconds) {
    const kernel = byName.get('de440.bsp');
    if (!kernel) throw Error('Full DE440 required inside its supported interval');
    requireKernelSpan(kernel, requiredTargets, start, tdbSeconds);
    return { group: 'DE440', kernel, paddingSeconds: LIGHT_TIME_PADDING_SECONDS };
  }
  // The later DE441 part wins their overlap, independently of input order.
  for (const name of ['de441_part-2.bsp', 'de441_part-1.bsp']) {
    const kernel = byName.get(name), span = REFERENCE_CATALOG[name];
    if (!kernel || start < span.startTdbSeconds || tdbSeconds > span.endTdbSeconds) continue;
    requireKernelSpan(kernel, requiredTargets, start, tdbSeconds);
    return { group: 'DE441', kernel, paddingSeconds: LIGHT_TIME_PADDING_SECONDS };
  }
  throw Error('No covered reference for the padded TDB epoch');
}

export function createReferencePlan(kernels) {
  const byName = kernelMap(kernels);
  // Sampling excludes endMs. Checking that endpoint as well is conservative.
  const startTdbSeconds = ttToTdb((SAMPLE_SPAN.startMs - j2000Ms) / 1000).tdbSeconds;
  const endTdbSeconds = ttToTdb((SAMPLE_SPAN.endMs - j2000Ms) / 1000).tdbSeconds;
  const paddedStart = startTdbSeconds - LIGHT_TIME_PADDING_SECONDS;
  const kernel = byName.get('de440.bsp');
  const bodies = Object.fromEntries(Object.entries(EXACT_TARGETS).map(([body, target]) => {
    let reason = 'Full DE440 has not been acquired and verified.';
    if (kernel) {
      try {
        requireKernelSpan(kernel, [target, 399], paddedStart, endTdbSeconds);
        return [body, { target, center: 399, status: 'available' }];
      } catch (error) {
        reason = `Exact-center comparison unavailable with the selected kernel: ${error.message}. No system-barycenter substitution.`;
      }
    }
    return [body, { target, center: 399, status: 'unavailable', reason }];
  }));
  let ready = false, reason = 'Full DE440 has not been acquired and verified.';
  if (kernel) {
    try {
      requireKernelSpan(kernel, requiredTargets, paddedStart, endTdbSeconds);
      ready = true;
      reason = 'Verified exact Sun, Moon, Mercury, Venus and Earth center chains cover the padded TT sampling interval.';
    } catch (error) { reason = `Reference coverage unavailable: ${error.message}.`; }
  }
  return { schema: 1, purpose: 'Reference availability plan; no chart comparisons evaluated',
    catalog: { source: REFERENCE_SOURCE, readDate: REFERENCE_READ_DATE },
    sampling: { ...SAMPLE_SPAN, start: new Date(SAMPLE_SPAN.startMs).toISOString(),
      endExclusive: new Date(SAMPLE_SPAN.endMs).toISOString(), startTdbSeconds, endTdbSeconds },
    paddingSeconds: LIGHT_TIME_PADDING_SECONDS,
    selection: 'Full DE440 inside its padded supported interval; DE441 outside, part 2 before part 1',
    references: [...byName.values()].map(value => ({ name: value.receipt.name, sha256: value.receipt.sha256 }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    groups: { DE440: { status: ready ? 'available' : 'unavailable', kernel: 'de440.bsp',
      intervals: [{ startMs: SAMPLE_SPAN.startMs, endMs: SAMPLE_SPAN.endMs }], reason },
    DE441: { status: 'empty', intervals: [], reason: 'The requested TT sampling span lies within full DE440 coverage; no DE441 sampling interval is requested.' } },
    bodies, unavailableComparisons: [
      'Swiss Ephemeris is not installed; no installation or live comparison is part of this plan.',
      'Houses, lunar nodes, angles, speeds and topocentric positions are outside this reference plan.',
      'Available system barycenters do not establish unavailable exact-center errors.'
    ] };
}
