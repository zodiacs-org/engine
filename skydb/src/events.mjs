import { createConfig, BODIES } from './config.mjs';
import { loadEngine } from './engine.mjs';
import { planPositionTiles, TIME_BOUNDARIES } from './generate.mjs';

export const MAJOR_ASPECTS = Object.freeze([0, 60, 90, 120, 180]);
export const EVENT_SCAN_MAX_MS = 3_600_000;
export const signedAngle = angle => ((angle + 180) % 360 + 360) % 360 - 180;

/** Refine a sign-changing continuous scalar to adjacent integer milliseconds. */
export function refineRoot(evaluate, leftMs, rightMs) {
  if (!Number.isSafeInteger(leftMs) || !Number.isSafeInteger(rightMs) || leftMs > rightMs) {
    throw new RangeError('Invalid root bracket');
  }
  const read = at => {
    const value = evaluate(at);
    if (!Number.isFinite(value)) throw new RangeError('Nonfinite root value');
    return value;
  };
  let left = read(leftMs), right = read(rightMs);
  if (left === 0) return { atMs: leftMs, bracket: [leftMs, leftMs], residual: left };
  if (right === 0) return { atMs: rightMs, bracket: [rightMs, rightMs], residual: right };
  if (Math.sign(left) === Math.sign(right)) throw new RangeError('Root is not bracketed');
  while (rightMs - leftMs > 1) {
    const middleMs = leftMs + Math.floor((rightMs - leftMs) / 2);
    const middle = read(middleMs);
    if (middle === 0) return { atMs: middleMs, bracket: [middleMs, middleMs], residual: middle };
    if (Math.sign(middle) === Math.sign(left)) { leftMs = middleMs; left = middle; }
    else { rightMs = middleMs; right = middle; }
  }
  return { atMs: Math.abs(left) <= Math.abs(right) ? leftMs : rightMs,
    bracket: [leftMs, rightMs], residual: Math.abs(left) <= Math.abs(right) ? left : right };
}

function definitions(bodies) {
  const defs = [];
  for (const body of bodies) {
    defs.push({ kind: 'station', bodies: [body], unit: 'degrees/day', value: rows => rows.get(body).speed });
    for (let target = 0; target < 360; target += 30) {
      defs.push({ kind: 'ingress', bodies: [body], target, unit: 'degrees',
        value: rows => signedAngle(rows.get(body).lon - target) });
    }
  }
  // Canonical order makes event identity independent of configured body order.
  const ordered = BODIES.filter(body => bodies.includes(body));
  for (let a = 0; a < ordered.length; a++) for (let b = a + 1; b < ordered.length; b++) {
    const pair = [ordered[a], ordered[b]];
    for (const angle of MAJOR_ASPECTS) for (const target of angle === 0 || angle === 180 ? [angle] : [angle, -angle]) {
      const value = rows => signedAngle(rows.get(pair[1]).lon - rows.get(pair[0]).lon - target);
      defs.push({ kind: 'aspect', bodies: pair, angle, target, unit: 'degrees', value });
      if (pair[0] === 'Sun' && pair[1] === 'Moon' && (angle === 0 || angle === 180)) {
        defs.push({ kind: 'lunation', bodies: pair, phase: angle === 0 ? 'new' : 'full', target, unit: 'degrees', value });
      }
    }
  }
  return defs;
}

/** Scan one smooth descriptor. The injected sampler also supports synthetic tests. */
export function scanEvents(descriptor, input, sample) {
  const config = createConfig(input);
  if (config.stepMs > EVENT_SCAN_MAX_MS) throw new RangeError('Event scan step must not exceed one hour');
  const { startMs, endMs, lastSampleMs } = descriptor;
  if (![startMs, endMs, lastSampleMs].every(Number.isSafeInteger) || startMs < config.startMs ||
      endMs > config.endMs || startMs >= endMs || lastSampleMs < startMs || lastSampleMs > endMs ||
      TIME_BOUNDARIES.some(at => at > startMs && at <= lastSampleMs)) {
    throw new RangeError('Invalid event descriptor');
  }
  const defs = definitions(config.bodies);
  const read = at => {
    const rows = new Map(sample(at).map(row => [row.body, row]));
    for (const body of config.bodies) {
      const row = rows.get(body);
      if (!row || ![row.lon, row.speed].every(Number.isFinite) || row.lon < 0 || row.lon >= 360) {
        throw new RangeError('Invalid event sample');
      }
    }
    return rows;
  };
  const events = [], seen = new Set();
  let leftMs = startMs, leftRows = read(leftMs);
  const process = (rightMs, rightRows) => {
    for (const def of defs) {
      const left = def.value(leftRows), right = def.value(rightRows);
      if (left === 0 && right === 0) continue; // A sampled plateau is not an isolated event.
      // Reject the signed-angle branch cut, which is not a root.
      if (def.kind !== 'station' && Math.abs(right - left) >= 180) continue;
      if (left !== 0 && right !== 0 && Math.sign(left) === Math.sign(right)) continue;
      const root = refineRoot(at => def.value(read(at)), leftMs, rightMs);
      if (root.atMs < startMs || root.atMs >= endMs) continue;
      const { value, ...fields } = def;
      const key = JSON.stringify([fields, root.atMs]);
      if (seen.has(key)) continue;
      seen.add(key);
      events.push({ ...fields, ...root, direction: right > left ? 'increasing' : right < left ? 'decreasing' : 'touch' });
    }
  };
  if (lastSampleMs === startMs) process(startMs, leftRows);
  while (leftMs < lastSampleMs) {
    const rightMs = Math.min(leftMs + config.stepMs, lastSampleMs), rightRows = read(rightMs);
    process(rightMs, rightRows);
    leftMs = rightMs; leftRows = rightRows;
  }
  return events.sort((a, b) => a.atMs - b.atMs || JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

export async function* generateEventTiles(input = {}) {
  const config = createConfig(input);
  if (config.stepMs > EVENT_SCAN_MAX_MS) throw new RangeError('Event scan step must not exceed one hour');
  const engine = await loadEngine();
  for (const descriptor of planPositionTiles(config)) {
    yield { ...descriptor, events: scanEvents(descriptor, config, at => engine.sample(at, { bodies: config.bodies })) };
  }
}
