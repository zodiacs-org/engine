import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {assessInputTimeSensitivity, compareObservedBoundaryMargin, SENSITIVITY_POLICY} from './sensitivity.mjs';

const input = overrides => ({body:'Synthetic body', utc:'2000-01-01T00:00:00.000Z',
  longitudeDifferenceArcsec:1, longitudeRateArcsecPerSecond60s:2,
  longitudeRateArcsecPerSecond300s:2, conventionStatus:SENSITIVITY_POLICY.conventionStatus, ...overrides});
const checks = [];
function test(id, description, fn) { fn(); checks.push({id, description, status:'passed'}); }
test('LINEAR-01','Exact linear rate yields unsigned local equivalent time; two sampled rates are not a timing bound.',()=>{
  const r=assessInputTimeSensitivity(input());assert.equal(r.status,'sampled-linearization');assert.deepEqual(r.equivalentInputTimeSeconds,{estimate:0.5,range:[0.5,0.5]});assert(r.warnings.some(w=>w.includes('not a measured event-time')));
});
test('DIRECTION-01','Negative discrepancy/rates yield nonnegative sensitivity, not signed event correction.',()=>{
  const r=assessInputTimeSensitivity(input({longitudeDifferenceArcsec:-1,longitudeRateArcsecPerSecond60s:-2,longitudeRateArcsecPerSecond300s:-1.9}));assert.equal(r.status,'sampled-linearization');assert.equal(r.equivalentInputTimeSeconds.estimate,0.5);assert.deepEqual(r.equivalentInputTimeSeconds.range,[0.5,1/1.9]);
});
test('CIRCULAR-BRANCH-01','A half-circle discrepancy is directionally ambiguous; larger discrepancies are outside the principal circular branch.',()=>{
  for(const difference of [648000,-648000,648001,-648001]){
    const r=assessInputTimeSensitivity(input({longitudeDifferenceArcsec:difference}));assert.equal(r.status,'unstable-rate');assert.equal(r.equivalentInputTimeSeconds,null);
    assert.equal(r.reason,Math.abs(difference)===648000?'ambiguous-half-circle-difference':'difference-outside-principal-circular-range');
  }
});
test('STATION-01','Zero, tiny and opposing rates are refused even with zero discrepancy.',()=>{
  for(const values of [[0,0],[1e-6,1e-6],[0.01,-0.01]]){
    const r=assessInputTimeSensitivity(input({longitudeDifferenceArcsec:0,longitudeRateArcsecPerSecond60s:values[0],longitudeRateArcsecPerSecond300s:values[1]}));assert.equal(r.status,'unstable-rate');assert.equal(r.equivalentInputTimeSeconds,null);
  }
});
test('SPREAD-01','The declared ten-percent gate is inclusive and rejects larger spread; denominator is max absolute rate.',()=>{
  const accepted=assessInputTimeSensitivity(input({longitudeRateArcsecPerSecond60s:10,longitudeRateArcsecPerSecond300s:9}));assert.equal(accepted.status,'sampled-linearization');assert.equal(accepted.diagnostics.relativeRateSpread,0.1);
  const rejected=assessInputTimeSensitivity(input({longitudeRateArcsecPerSecond60s:10,longitudeRateArcsecPerSecond300s:8.99}));assert.equal(rejected.status,'unstable-rate');assert.equal(rejected.reason,'sampled-rates-disagree');
});
test('FINITE-01','Nonfinite observations, malformed rates and arithmetic overflow fail closed.',()=>{
  for(const override of [{longitudeDifferenceArcsec:NaN},{longitudeDifferenceArcsec:Infinity},{longitudeRateArcsecPerSecond60s:null},{longitudeRateArcsecPerSecond300s:'2'},{longitudeDifferenceArcsec:Number.MAX_VALUE,longitudeRateArcsecPerSecond60s:1e-5,longitudeRateArcsecPerSecond300s:1e-5}]){
    const r=assessInputTimeSensitivity(input(override));assert.equal(r.status,'unstable-rate');assert.equal(r.equivalentInputTimeSeconds,null);
  }
});
test('CONVENTIONS-01','An unaligned or missing convention declaration blocks even numerically benign conversion.',()=>{
  for(const conventionStatus of ['geocentric-vs-topocentric',null,undefined]){const r=assessInputTimeSensitivity(input({conventionStatus}));assert.equal(r.status,'unsupported-conventions');assert.equal(r.equivalentInputTimeSeconds,null);}
});
test('ZERO-AND-THRESHOLD-01','Zero discrepancy at a permitted rate gives zero; exact minimum rate passes the declared heuristic.',()=>{
  const r=assessInputTimeSensitivity(input({longitudeDifferenceArcsec:0,longitudeRateArcsecPerSecond60s:1e-5,longitudeRateArcsecPerSecond300s:1e-5}));assert.equal(r.status,'sampled-linearization');assert.deepEqual(r.equivalentInputTimeSeconds,{estimate:0,range:[0,0]});
});
test('BOUNDARY-01','A discrepancy above a near-cusp margin or on its endpoint proves no label change or interval guarantee.',()=>{
  const over=compareObservedBoundaryMargin({signedMarginArcsec:-0.4,longitudeDifferenceArcsec:0.5});assert.equal(over.differenceExceedsMargin,true);assert.equal(over.labelChangeEstablished,false);
  const equal=compareObservedBoundaryMargin({signedMarginArcsec:0.5,longitudeDifferenceArcsec:-0.5});assert.equal(equal.differenceExceedsMargin,false);assert.equal(equal.labelChangeEstablished,false);
  assert.equal(compareObservedBoundaryMargin({signedMarginArcsec:NaN,longitudeDifferenceArcsec:0.5}).status,'unresolved');
});
test('EXTRAPOLATION-01','A formal 600-second ratio is retained and flagged beyond sampled ±300 seconds, with no postmeasurement gate change.',()=>{
  const r=assessInputTimeSensitivity(input({longitudeDifferenceArcsec:60,longitudeRateArcsecPerSecond60s:0.1,longitudeRateArcsecPerSecond300s:0.1}));
  assert.equal(r.status,'sampled-linearization');assert.deepEqual(r.equivalentInputTimeSeconds,{estimate:600,range:[600,600]});assert.equal(r.sampledNeighborhoodHalfWidthSeconds,300);assert.equal(r.extrapolatesBeyondDerivativeSamples,true);assert(r.warnings.some(w=>w.includes('formal ratio, not a demonstrated input-time shift')));
  const boundary=assessInputTimeSensitivity(input({longitudeDifferenceArcsec:30,longitudeRateArcsecPerSecond60s:0.1,longitudeRateArcsecPerSecond300s:0.1}));assert.equal(boundary.extrapolatesBeyondDerivativeSamples,false);
  const invalid=assessInputTimeSensitivity(input({longitudeRateArcsecPerSecond60s:0}));assert.equal(invalid.extrapolatesBeyondDerivativeSamples,null);
  const rangeOnly=assessInputTimeSensitivity(input({longitudeDifferenceArcsec:29,longitudeRateArcsecPerSecond60s:0.1,longitudeRateArcsecPerSecond300s:0.091}));assert(rangeOnly.equivalentInputTimeSeconds.estimate<300);assert(rangeOnly.equivalentInputTimeSeconds.range[1]>300);assert.equal(rangeOnly.extrapolatesBeyondDerivativeSamples,true);
});
const report={purpose:'Synthetic analytic tests of empirical sensitivity reporting; not ephemeris validation or timing bounds.',policy:SENSITIVITY_POLICY,passed:checks.length,checks};
const args=process.argv.slice(2);assert(args.length===0 || (args.length===2 && args[0]==='--output'),'Usage: node test-sensitivity.mjs [--output result.json]');
if(args.length)await writeFile(args[1],JSON.stringify(report,null,2)+'\n');
process.stdout.write(`${checks.length} product-impact analytic tests passed.\n`);
