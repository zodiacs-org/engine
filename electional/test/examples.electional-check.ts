import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { loadSearchDependencies, parseRuleSet, searchElectional, validateRuleSet } from '../src/index.js';
import { parseCliControls } from '../src/cli-controls.js';
import sourceModel from '../references/avoidance-cases.json';
import type { StreamOptions } from '../src/index.js';

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
describe('executable synthetic condition documents', () => {
  it.each([
    ['synthetic-hours.yaml', 'yaml', 'controls.json'],
    ['synthetic-long-range.yaml', 'yaml', 'controls.json'],
    ['synthetic-conditions.json', 'json', 'conditions-controls.json'],
  ] as const)('validates %s and its explicit controls with JSON/YAML equivalence', async (file, format, controlFile) => {
    const rules = parseRuleSet(await read(`examples/${file}`), format);
    const controls = parseCliControls(await read(`examples/${controlFile}`), rules.rules);
    expect(validateRuleSet(JSON.parse(JSON.stringify(rules)))).toEqual(rules);
    expect(parseRuleSet(JSON.stringify(rules), 'json')).toEqual(rules);
    expect(controls.maxChunks * controls.chunkMs).toBeGreaterThanOrEqual(Date.parse(rules.range.end) - Date.parse(rules.range.start));
    expect(rules.activity.startsWith('Synthetic')).toBe(true);
    expect(rules.location).toEqual({ latitude: 0, longitude: 0 });
    if (rules.natal) expect(rules.natal.synthetic).toBe(true);
    expect(() => parseCliControls(JSON.stringify({ ...controls, scoring: { enabled: true } }), rules.rules)).toThrow();
  });
  it('illustrates every supported condition with one explicitly synthetic natal chart and sourced eclipse radii', async () => {
    const rules = parseRuleSet(await read('examples/synthetic-conditions.json'), 'json');
    expect(new Set(rules.rules.map(r => r.kind))).toEqual(new Set([
      'moon-not-void', 'direct-motion', 'moon-sign', 'moon-phase', 'planetary-hour', 'benefic-house',
      'benefic-angular', 'applying-aspect', 'avoid-eclipses', 'avoid-stations', 'synastry-aspect',
    ]));
    expect(rules.natal).toEqual({ synthetic: true, instant: '2000-01-01T00:00:00Z', clock: 'utc',
      location: { latitude: 0, longitude: 0 }, houseSystem: 'whole' });
    const controls = parseCliControls(await read('examples/conditions-controls.json'), rules.rules);
    expect(controls.eclipse?.model).toEqual({ sunRadiusAu: sourceModel.radiusKm.sun / sourceModel.auKm,
      moonRadiusAu: sourceModel.radiusKm.moon / sourceModel.auKm, earthRadiusAu: sourceModel.radiusKm.earth / sourceModel.auKm });
    expect(controls.eclipse?.derivativeStepMs).toBe(sourceModel.options.derivativeStepMs);
  });
  it('keeps unavailable optional checks unresolved beside native hour and house facts', async () => {
    const rules = parseRuleSet(await read('examples/synthetic-conditions.json'), 'json');
    const controls = parseCliControls(await read('examples/conditions-controls.json'), rules.rules);
    const dependencies = await loadSearchDependencies();
    // Explicit absence is exercised even on a machine with an events build.
    const { chunkMs, maxChunks, maxChunkEvaluations, maxChunkSkySamples, maxFrameBytes, ...search } = controls;
    const facts = searchElectional(rules, { ...dependencies, events: { status: 'missing' } }, search as StreamOptions);
    expect(facts.status).toBe('unresolved'); expect(facts.windows.length).toBeGreaterThan(0);
    expect(facts.eligible).toEqual([{ startMs: Date.parse(rules.range.start), endMs: Date.parse(rules.range.end) }]);
    expect(facts.unresolvedRequired).toEqual([]);
    expect(facts.ruleResults.find(r => r.rule.id === 'known-hour')?.status).toBe('complete');
    expect(facts.ruleResults.find(r => r.rule.id === 'benefic-houses')?.status).toBe('complete');
    expect(facts.ruleResults.find(r => r.rule.id === 'synthetic-natal-contact')).toMatchObject({ status: 'refused', reason: 'missing-capability' });
    expect(facts.windows.every(w => w.explanations.some(e => e.state === 'unresolved'))).toBe(true);
    expect(facts.receipts.every(r => r.engine.ephemeris.version === '2.1.19')).toBe(true);
    expect(JSON.stringify(facts)).not.toMatch(/"(?:score|rank|ranking|scoring|contribution|internalScore|chunkRank)"\s*:/u);
  }, 30000);
});
