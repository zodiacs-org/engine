import { assert, circularDifference, digest, equal, statistics } from './common.mjs';
import { validateProtocol } from './protocol.mjs';

const gate = (passed, details) => ({ status: passed ? 'pass' : 'fail', ...details });
const failed = details => ({ status: 'not-evaluated', ...details });
function validRows(execution, references) {
  const errors = [], rows = new Map();
  if (!execution || !Array.isArray(execution.rows)) return { rows, errors: ['Missing execution rows'] };
  const expected = new Set(references.map(r => r.id)), referenceMap = new Map(references.map(r => [r.id,r]));
  for (const row of execution.rows) {
    if (!row || typeof row.id !== 'string' || !expected.has(row.id) || rows.has(row.id)) { errors.push('Unexpected or duplicate row'); continue; }
    const reference = referenceMap.get(row.id);
    const valid = row.status === 'ok' && row.body === reference.body && row.utc === reference.utc && row.deltaT === reference.deltaT && Number.isFinite(row.lon) && Number.isFinite(row.lat) && row.lon >= 0 && row.lon < 360 && Math.abs(row.lat) <= 90;
    rows.set(row.id, valid ? row : {...row,status:'error'});
    if (!valid) errors.push('Invalid/missing result or observation metadata: ' + row.id);
  }
  for (const id of expected) if (!rows.has(id)) errors.push('Missing result: ' + id);
  return { rows, errors };
}
function validProbes(execution, probes) {
  if (!Array.isArray(execution?.probes)) return false;
  const expected = probes.map(p => p.id).sort(), actual = execution.probes.map(p => p?.id).sort();
  return equal(expected, actual) && execution.probes.every(p => p.passed === true);
}
function validTiming(timing, expectedCount) {
  const t = timing?.chartMs;
  return t && t.count === expectedCount && ['median','p95','max'].every(k => Number.isFinite(t[k]) && t[k] >= 0) && t.median <= t.p95 && t.p95 <= t.max;
}

/** Evaluate every expected row. No missing case can reduce the accuracy denominator. */
export function evaluateComparison({ references, baselineExecution, candidateExecution, baselineArtifact, candidateArtifact, protocol, probes }) {
  validateProtocol(protocol);
  assert(Array.isArray(probes) && probes.length > 0 && new Set(probes.map(p => p.id)).size === probes.length, 'Invalid expected probes');
  assert(Array.isArray(references) && references.length === protocol.expectedRows, 'Wrong reference row count');
  assert(new Set(references.map(r => r.id)).size === references.length, 'Duplicate reference IDs');
  assert(new Set(references.map(r => r.body)).size === protocol.expectedBodies && new Set(references.map(r => r.utc)).size === protocol.expectedEpochs, 'Wrong reference domain');
  for (const r of references) assert(typeof r.id === 'string' && typeof r.body === 'string' && Number.isFinite(r.lon) && r.lon >= 0 && r.lon < 360 && Number.isFinite(r.lat) && Math.abs(r.lat) <= 90, 'Malformed reference');
  const b = validRows(baselineExecution, references), c = validRows(candidateExecution, references);
  const baselineComplete = baselineExecution?.status === 'completed' && b.errors.length === 0;
  const candidateComplete = candidateExecution?.status === 'completed' && c.errors.length === 0;
  const rows = references.map(ref => {
    const result = { id: ref.id, body: ref.body, utc: ref.utc, reference: { lon: ref.lon, lat: ref.lat }, baseline: null, candidate: null, regressionArcsec: null };
    for (const [name, map] of [['baseline',b.rows],['candidate',c.rows]]) {
      const r = map.get(ref.id);
      if (r?.status === 'ok' && Number.isFinite(r.lon) && r.lon >= 0 && r.lon < 360 && Number.isFinite(r.lat) && Math.abs(r.lat) <= 90) {
        const longitudeArcsec = circularDifference(r.lon, ref.lon) * 3600, latitudeArcsec = (r.lat - ref.lat) * 3600;
        result[name] = { lon: r.lon, lat: r.lat, longitudeArcsec, latitudeArcsec, maxCoordinateArcsec: Math.max(Math.abs(longitudeArcsec), Math.abs(latitudeArcsec)) };
      }
    }
    if (result.baseline && result.candidate) result.regressionArcsec = {
      longitude: Math.abs(result.candidate.longitudeArcsec) - Math.abs(result.baseline.longitudeArcsec),
      latitude: Math.abs(result.candidate.latitudeArcsec) - Math.abs(result.baseline.latitudeArcsec)
    };
    return result;
  });
  const t = protocol.thresholds;
  const summarize = group => Object.fromEntries(['baseline','candidate'].map(name => {
    const values = group.filter(r => r[name]).map(r => r[name].maxCoordinateArcsec);
    return [name, { expectedRows: group.length, observedRows: values.length, statistics: values.length ? statistics(values) : null,
      targetExceedances: values.filter(v => v > t.referenceCoordinateTargetArcsec).length }];
  }));
  const summary = summarize(rows);
  const groups = [...new Set(references.map(r => r.body))].map(body => ({ body, ...summarize(rows.filter(r => r.body === body)) }));
  const regressions = rows.filter(r => r.regressionArcsec && Math.max(r.regressionArcsec.longitude, r.regressionArcsec.latitude) > t.perCoordinateRegressionAllowanceArcsec);
  const baselineApi = baselineExecution?.api, candidateApi = candidateExecution?.api;
  const apiValid = api => api && Array.isArray(api.exportNames) && api.exportNames.every(n => typeof n === 'string') && new Set(api.exportNames).size === api.exportNames.length && Array.isArray(api.aspectPolicy) && Array.isArray(api.functionExportNames) && ['natalChart','houseOf'].every(n => api.functionExportNames.includes(n));
  const removedExports = apiValid(baselineApi) && apiValid(candidateApi) ? baselineApi.exportNames.filter(n => !candidateApi.exportNames.includes(n)) : [];
  const apiPass = apiValid(baselineApi) && apiValid(candidateApi) && baselineApi.engineVersion === baselineArtifact.version && candidateApi.engineVersion === candidateArtifact.version &&
    protocol.requiredExports.every(n => baselineApi.exportNames.includes(n) && candidateApi.exportNames.includes(n)) && removedExports.length === 0 && equal(baselineApi.aspectPolicy, candidateApi.aspectPolicy);
  const timingCount = new Set(references.map(r => JSON.stringify([r.utc,r.deltaT]))).size;
  const timingValid = baselineComplete && candidateComplete && validTiming(baselineExecution.timing, timingCount) && validTiming(candidateExecution.timing, timingCount);
  const maxChartP95Ms = timingValid ? candidateExecution.timing.chartMs.p95 : null;
  const chartP95GrowthFactor = timingValid ? candidateExecution.timing.chartMs.p95 / Math.max(baselineExecution.timing.chartMs.p95, t.chartRatioFloorMs) : null;
  const sizeValid = [baselineArtifact.installedBytes,candidateArtifact.installedBytes].every(n => Number.isSafeInteger(n) && n > 0);
  const installedGrowthFactor = sizeValid ? candidateArtifact.installedBytes / Math.max(baselineArtifact.installedBytes, t.installedRatioFloorBytes) : null;
  const gates = {
    baselineExecution: gate(baselineComplete, { expectedRows: references.length, observedRows: summary.baseline.observedRows, errors: b.errors, processStatus: baselineExecution?.status ?? 'missing' }),
    candidateExecution: gate(candidateComplete, { expectedRows: references.length, observedRows: summary.candidate.observedRows, errors: c.errors, processStatus: candidateExecution?.status ?? 'missing' }),
    apiCompatibility: gate(Boolean(apiPass), { removedExports, scope: 'Declared version, required/export-name surface and aspect policy; behavioral probes are separate.' }),
    behavioralContract: gate(validProbes(baselineExecution, probes) && validProbes(candidateExecution, probes), { expectedProbesPerTarget: probes.length }),
    nonRegression: baselineComplete && candidateComplete ? gate(regressions.length === 0, { allowanceArcsec: t.perCoordinateRegressionAllowanceArcsec, failedRows: regressions.map(r => r.id), comparedRows: rows.length }) : failed({ reason: 'Complete valid baseline and candidate are required', comparedRows: rows.filter(r => r.regressionArcsec).length }),
    referenceResidualTarget: candidateComplete ? gate(summary.candidate.targetExceedances === 0, { targetArcsec: t.referenceCoordinateTargetArcsec, failedRows: rows.filter(r => r.candidate.maxCoordinateArcsec > t.referenceCoordinateTargetArcsec).map(r => r.id), expectedRows: rows.length, scope: 'Finite residuals under the selected comparison profile; not a certified error bound.' }) : failed({ reason: 'Incomplete candidate cannot meet an all-case target', expectedRows: rows.length }),
    nodeRuntimeBudget: timingValid ? gate(maxChartP95Ms <= t.maxChartP95Ms && chartP95GrowthFactor <= t.maxChartP95GrowthFactor, { p95Ms: maxChartP95Ms, p95GrowthFactor: chartP95GrowthFactor }) : failed({ reason: 'Complete measured executions are required' }),
    installedSizeBudget: sizeValid ? gate(candidateArtifact.installedBytes <= t.maxInstalledBytes && installedGrowthFactor <= t.maxInstalledGrowthFactor, { candidateBytes: candidateArtifact.installedBytes, installedGrowthFactor }) : failed({ reason: 'Invalid artifact byte counts' })
  };
  const numerical = { schemaVersion: 1, baselineArtifactDigest: baselineArtifact.digest, candidateArtifactDigest: candidateArtifact.digest,
    thresholds: { referenceCoordinateTargetArcsec: t.referenceCoordinateTargetArcsec, perCoordinateRegressionAllowanceArcsec: t.perCoordinateRegressionAllowanceArcsec }, summary, groups, rows };
  return { numericalDigest: digest(numerical), ...numerical, gates, checksPassed: Object.values(gates).every(g => g.status === 'pass'),
    adapterReviewRequired: true, adapterQualified: false, releaseAuthorized: false };
}
