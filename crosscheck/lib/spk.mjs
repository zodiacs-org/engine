// Independently authored from NAIF SPK Required Reading, types 2 and 3.
// Input epochs are TDB seconds past J2000; states use km and km/s.
export function chebyshev(coefficients, x) {
  if (!coefficients.length || !Number.isFinite(x) || Math.abs(x) > 1 || !coefficients.every(Number.isFinite)) throw Error('Invalid Chebyshev input');
  let value = coefficients[0], derivative = 0;
  let previous = 1, current = x, dPrevious = 0, dCurrent = 1;
  for (let i = 1; i < coefficients.length; i++) {
    value += coefficients[i] * current;
    derivative += coefficients[i] * dCurrent;
    const next = 2 * x * current - previous;
    const dNext = 2 * current + 2 * x * dCurrent - dPrevious;
    previous = current; current = next; dPrevious = dCurrent; dCurrent = dNext;
  }
  if (![value, derivative].every(Number.isFinite)) throw Error('Nonfinite polynomial state');
  return { value, derivative };
}

export async function segmentState(kernel, segment, tdbSeconds) {
  const { format } = kernel.receipt.coverage;
  if (!['LTL-IEEE', 'BIG-IEEE'].includes(format) || ![2, 3].includes(segment.type) || segment.frame !== 1) throw Error('Unsupported SPK type or frame');
  if (!Number.isFinite(tdbSeconds) || tdbSeconds < segment.startTdbSeconds || tdbSeconds > segment.endTdbSeconds) throw Error('Epoch outside segment');
  const words = async (start, count) => {
    const b = await kernel.read((start - 1) * 8, count * 8);
    if (b.length !== count * 8) throw Error('Truncated SPK read');
    return Array.from({ length: count }, (_, i) => format === 'LTL-IEEE' ? b.readDoubleLE(i * 8) : b.readDoubleBE(i * 8));
  };
  const [initial, interval, recordSize, count] = await words(segment.endWord - 3, 4);
  const components = segment.type === 2 ? 3 : 6;
  if (!Number.isFinite(initial) || !Number.isFinite(interval) || interval <= 0 || !Number.isSafeInteger(count) || count < 1 || !Number.isSafeInteger(recordSize) || recordSize <= 2 || recordSize * 8 > 1_048_576 || (recordSize - 2) % components || segment.endWord - segment.startWord + 1 !== recordSize * count + 4) throw Error('Invalid SPK directory');
  const end = initial + count * interval;
  if (!Number.isFinite(end) || tdbSeconds < initial || tdbSeconds > end) throw Error('Epoch outside records');
  const index = Math.min(count - 1, Math.floor((tdbSeconds - initial) / interval));
  const record = await words(segment.startWord + index * recordSize, recordSize);
  const [midpoint, radius] = record;
  if (!Number.isFinite(midpoint) || !Number.isFinite(radius) || radius <= 0) throw Error('Invalid record interval');
  const x = (tdbSeconds - midpoint) / radius;
  const n = (recordSize - 2) / components;
  const polynomials = Array.from({ length: components }, (_, i) => chebyshev(record.slice(2 + i * n, 2 + (i + 1) * n), x));
  const position = polynomials.slice(0, 3).map(p => p.value);
  const velocity = segment.type === 2 ? polynomials.map(p => p.derivative / radius) : polynomials.slice(3).map(p => p.value);
  if (!velocity.every(Number.isFinite)) throw Error('Nonfinite velocity');
  return { position, velocity };
}

// Later supplied kernels and later segments take priority. Unsupported
// selected segments fail instead of silently falling back to earlier data.
export function createSpkReader(kernels) {
  if (!Array.isArray(kernels) || !kernels.length) throw Error('Kernels required');
  async function barycentric(target, epoch, visited = new Set()) {
    if (target === 0) return { position: [0, 0, 0], velocity: [0, 0, 0] };
    if (visited.has(target) || visited.size >= 64) throw Error('Cyclic or excessive center chain');
    visited = new Set([...visited, target]);
    for (let k = kernels.length - 1; k >= 0; k--) {
      const kernel = kernels[k], segments = kernel.receipt.coverage.segments;
      for (let i = segments.length - 1; i >= 0; i--) {
        const s = segments[i];
        if (s.target !== target || epoch < s.startTdbSeconds || epoch > s.endTdbSeconds) continue;
        const local = await segmentState(kernel, s, epoch);
        const center = await barycentric(s.center, epoch, visited);
        return Object.fromEntries(['position', 'velocity'].map(key => [key, local[key].map((v, j) => v + center[key][j])]));
      }
    }
    throw Error('No covered segment for requested NAIF target');
  }
  return async ({ target, center = 0, tdbSeconds }) => {
    if (![target, center].every(Number.isSafeInteger) || !Number.isFinite(tdbSeconds)) throw Error('Explicit NAIF IDs and TDB epoch required');
    const a = await barycentric(target, tdbSeconds), b = await barycentric(center, tdbSeconds);
    return { frame: 'J2000', timeScale: 'TDB', positionUnit: 'km', velocityUnit: 'km/s', corrections: 'geometric', ...Object.fromEntries(['position', 'velocity'].map(key => [key, a[key].map((v, i) => v - b[key][i])])) };
  };
}
