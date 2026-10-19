import test from 'node:test';
import assert from 'node:assert/strict';
import { REFERENCE_SOURCE, REFERENCE_READ_DATE, REFERENCE_CATALOG, SAMPLE_SPAN,
  LIGHT_TIME_PADDING_SECONDS, EXACT_TARGETS, requireCenterChain,
  selectReference, createReferencePlan } from '../lib/reference-plan.mjs';
import { ttToTdb } from '../lib/reduction.mjs';

// Invented descriptors test availability and selection, not astronomical accuracy.
const descriptor = (target, center, start = -100, end = 100, extra = {}) => ({
  target, center, frame: 1, type: 2, startTdbSeconds: start, endTdbSeconds: end, ...extra });
function inventedKernel(name, extra = {}) {
  const span = REFERENCE_CATALOG[name];
  return { receipt: { name, sha256: 'a'.repeat(64), coverage: { format: 'LTL-IEEE',
    segments: [descriptor(10, 0, span.startTdbSeconds, span.endTdbSeconds),
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(target => descriptor(target, 0, span.startTdbSeconds, span.endTdbSeconds)),
      descriptor(199, 1, span.startTdbSeconds, span.endTdbSeconds),
      descriptor(299, 2, span.startTdbSeconds, span.endTdbSeconds),
      descriptor(301, 3, span.startTdbSeconds, span.endTdbSeconds),
      descriptor(399, 3, span.startTdbSeconds, span.endTdbSeconds)] }, ...extra } };
}

test('Public NAIF catalog states exact inclusive TDB bounds, including expanded years', () => {
  assert.equal(REFERENCE_SOURCE, 'https://naif.jpl.nasa.gov/pub/naif/generic_kernels/spk/planets/aa_summaries.txt');
  assert.equal(REFERENCE_READ_DATE, '2026-10-19');
  const seconds = {
    'de440.bsp': [-14200747200, 20514081600],
    'de440s.bsp': [-4734072000, 4735368000],
    'de441_part-1.bsp': [-479654827200, -960120000],
    'de441_part-2.bsp': [-962884800, 479387937600],
  };
  for (const [name, expected] of Object.entries(seconds)) {
    const span = REFERENCE_CATALOG[name];
    assert.deepEqual([span.startTdbSeconds, span.endTdbSeconds], expected);
    assert.equal(span.timeScale, 'TDB');
    assert.equal(span.bounds, 'inclusive');
    assert.equal(span.source, REFERENCE_SOURCE);
    assert.equal(span.readDate, REFERENCE_READ_DATE);
  }
  assert(REFERENCE_CATALOG['de441_part-2.bsp'].startTdbSeconds <
    REFERENCE_CATALOG['de441_part-1.bsp'].endTdbSeconds);
  // Published DE440 technical comments also give these Julian dates.
  const jd = seconds['de440.bsp'].map(t => t / 86400 + 2451545);
  assert.deepEqual(jd, [2287184.5, 2688976.5]);
});

test('Center-chain coverage follows exact IDs and joins changing closed segments', () => {
  const segments = [descriptor(301, 3), descriptor(399, 3), descriptor(3, 0, -100, 0),
    descriptor(3, 0, 0, 100, { type: 3 })];
  requireCenterChain(segments, 301, -100, 100);
  requireCenterChain(segments, 399, -100, 100);
  requireCenterChain([], 0, -100, 100);
  assert.throws(() => requireCenterChain(segments, 199, -100, 100), /exact NAIF target 199/);
  assert.throws(() => requireCenterChain(segments.filter(s => s.target !== 3), 301, 0, 0), /exact NAIF target 3/);
  assert.throws(() => requireCenterChain([descriptor(1, 0)], 199, 0, 0), /exact NAIF target 199/);
  const gap = [descriptor(301, 3), descriptor(3, 0, -100, -1), descriptor(3, 0, 1, 100)];
  assert.throws(() => requireCenterChain(gap, 301, -100, 100), /No covered/);
  assert.throws(() => requireCenterChain(segments, 301, -101, 100), /No covered/);
  assert.throws(() => requireCenterChain(segments, 301, -100, 101), /No covered/);
});

test('Selected later segments fail closed at interior intervals and singleton boundaries', () => {
  const base = [descriptor(301, 3), descriptor(3, 0)];
  for (const extra of [{ type: 99 }, { frame: 2 }, { center: 301 }]) {
    for (const [start, end] of [[-10, 10], [0, 0]]) {
      const segments = [...base, descriptor(301, 3, start, end, extra)];
      assert.throws(() => requireCenterChain(segments, 301, -100, 100), /Unsupported|Cyclic/);
    }
  }
  // Later supported descriptors can replace an unsupported descriptor entirely.
  requireCenterChain([descriptor(301, 0, -100, 100, { type: 99 }),
    descriptor(301, 3), descriptor(3, 0)], 301, -100, 100);
  const long = Array.from({ length: 65 }, (_, i) => descriptor(i + 1, i === 64 ? 0 : i + 2));
  assert.throws(() => requireCenterChain(long, 1, 0, 0), /excessive/);
  for (const args of [[null, 301, 0, 1], [base, NaN, 0, 1], [base, 301, NaN, 1],
    [base, 301, 1, 0], [[descriptor(301, 0, 1, 0)], 301, 0, 1],
    [[descriptor(301, 0, NaN, 1)], 301, 0, 1]]) {
    assert.throws(() => requireCenterChain(...args), /Invalid/);
  }
});

test('Reference selection uses full DE440 rather than the abbreviated DE440s span', () => {
  const full = inventedKernel('de440.bsp');
  const kernels = [inventedKernel('de441_part-2.bsp'), inventedKernel('de440s.bsp'),
    full, inventedKernel('de441_part-1.bsp')];
  const j2000 = Date.UTC(2000, 0, 1, 12);
  for (const ms of [SAMPLE_SPAN.startMs, Date.UTC(1840, 0, 1), Date.UTC(1969, 6, 1),
    Date.UTC(2160, 0, 1), SAMPLE_SPAN.endMs]) {
    const tdb = ttToTdb((ms - j2000) / 1000).tdbSeconds;
    const selected = selectReference(kernels, tdb);
    assert.equal(selected.group, 'DE440');
    assert.equal(selected.kernel, full);
    assert.equal(selected.paddingSeconds, 86400);
  }
  assert.throws(() => selectReference(kernels.filter(k => k !== full), 0), /Full DE440 required/);
  assert.throws(() => selectReference(kernels, NaN), /Finite TDB/);
});

test('Reference selection pads the lower boundary and uses DE441 outside full DE440', () => {
  const full = inventedKernel('de440.bsp');
  const early = inventedKernel('de441_part-1.bsp'), late = inventedKernel('de441_part-2.bsp');
  const kernels = [late, full, early];
  const span = REFERENCE_CATALOG['de440.bsp'];
  assert.equal(selectReference(kernels, span.startTdbSeconds).kernel, early);
  assert.equal(selectReference(kernels, span.startTdbSeconds + LIGHT_TIME_PADDING_SECONDS - 1).kernel, early);
  assert.equal(selectReference(kernels, span.startTdbSeconds + LIGHT_TIME_PADDING_SECONDS).kernel, full);
  assert.equal(selectReference(kernels, span.endTdbSeconds).kernel, full);
  assert.equal(selectReference(kernels, span.endTdbSeconds + 1).kernel, late);
  assert.equal(selectReference([...kernels].reverse(), span.endTdbSeconds + 1).kernel, late);
  assert.throws(() => selectReference([full], span.endTdbSeconds + 1), /No covered/);
  assert.throws(() => selectReference([early], REFERENCE_CATALOG['de441_part-1.bsp'].startTdbSeconds), /No covered/);
  assert.throws(() => selectReference([late], REFERENCE_CATALOG['de441_part-2.bsp'].endTdbSeconds + 1), /No covered/);
  // Advertised span alone is insufficient if a selected actual descriptor is broken.
  full.receipt.coverage.segments.push(descriptor(399, 3, -10, 10, { frame: 2 }));
  assert.throws(() => selectReference(kernels, 0), /Unsupported selected/);
});

test('The requested TT plan has no DE441 partition and never substitutes system barycenters', () => {
  const full = inventedKernel('de440.bsp');
  const plan = createReferencePlan([inventedKernel('de441_part-2.bsp'), full]);
  assert.equal(plan.sampling.start, '1800-01-01T00:00:00.000Z');
  assert.equal(plan.sampling.endExclusive, '2200-01-01T00:00:00.000Z');
  assert.equal(plan.sampling.timeScale, 'TT');
  assert.equal(plan.sampling.bounds, 'half-open');
  assert.equal(plan.groups.DE440.status, 'available');
  assert.deepEqual(plan.groups.DE440.intervals, [{ startMs: SAMPLE_SPAN.startMs, endMs: SAMPLE_SPAN.endMs }]);
  assert.equal(plan.groups.DE441.status, 'empty');
  assert.deepEqual(plan.groups.DE441.intervals, []);
  assert.match(plan.groups.DE441.reason, /within full DE440/);
  for (const body of ['Sun', 'Moon', 'Mercury', 'Venus']) assert.equal(plan.bodies[body].status, 'available');
  for (const body of ['Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']) {
    assert.equal(plan.bodies[body].status, 'unavailable');
    assert.equal(plan.bodies[body].target, EXACT_TARGETS[body]);
    assert.match(plan.bodies[body].reason, /No system-barycenter substitution/);
  }
  assert.deepEqual(plan.references, [
    { name: 'de440.bsp', sha256: 'a'.repeat(64) },
    { name: 'de441_part-2.bsp', sha256: 'a'.repeat(64) }]);
  assert.match(plan.unavailableComparisons.join('\n'), /Swiss Ephemeris is not installed/);
  assert.match(plan.purpose, /no chart comparisons/);
  assert(!/"(?:position|velocity|direction)":/.test(JSON.stringify(plan)));
});

test('Unavailable references and broken Earth chains are stated without inventing coverage', () => {
  const absent = createReferencePlan([]);
  assert.equal(absent.groups.DE440.status, 'unavailable');
  assert(Object.values(absent.bodies).every(body => body.status === 'unavailable'));
  const full = inventedKernel('de440.bsp');
  full.receipt.coverage.segments = full.receipt.coverage.segments.filter(s => s.target !== 399);
  const broken = createReferencePlan([full]);
  assert.equal(broken.groups.DE440.status, 'unavailable');
  assert(Object.values(broken.bodies).every(body => body.status === 'unavailable'));
  assert.match(broken.bodies.Sun.reason, /exact NAIF target 399/);
  for (const kernels of [null, [{}], [inventedKernel('de440.bsp', { sha256: 'bad' })],
    [inventedKernel('de440.bsp'), inventedKernel('de440.bsp')]]) {
    assert.throws(() => createReferencePlan(kernels), /verified kernel|Verified opened/);
  }
});
