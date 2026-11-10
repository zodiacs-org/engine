import test from 'node:test';
import assert from 'node:assert/strict';
import { C_KM_S, ttToTdb, stellarAberration, reduceJpl, separationArcseconds } from '../lib/reduction.mjs';

const state = (position, velocity = [0,0,0]) => ({ position, velocity, frame: 'J2000', timeScale: 'TDB', positionUnit: 'km', velocityUnit: 'km/s', corrections: 'geometric' });

test('NAIF TT/TDB implicit equation at endpoints and intermediate epochs', () => {
  for (const tt of [-6.4e9, -1e9, 0, 1e9, 6.4e9]) {
    const result = ttToTdb(tt);
    const anomaly = 6.239996 + result.tdbSeconds * 1.99096871e-7;
    assert.ok(Math.abs(result.tdbMinusTtSeconds - 0.001657 * Math.sin(anomaly + 0.01671 * Math.sin(anomaly))) < 1e-15);
    assert.ok(Math.abs(result.tdbMinusTtSeconds) <= 0.001657);
  }
  // Choose a TT epoch whose implicit TDB anomaly is pi/2; analytic offset.
  const tdb = (Math.PI / 2 - 6.239996) / 1.99096871e-7;
  const offset = 0.001657 * Math.cos(0.01671);
  assert.ok(Math.abs(ttToTdb(tdb - offset).tdbMinusTtSeconds - offset) < 1e-15);
  for (const bad of [NaN, Infinity, 6.4e9 + 1]) assert.throws(() => ttToTdb(bad));
});

test('Light-time agrees with exact receding linear target; observer stays at reception', async () => {
  const calls = [];
  const reader = async ({target,tdbSeconds}) => {
    calls.push([target,tdbSeconds]);
    return target === 399 ? state([100,0,0], [20,0,0]) : state([100 + C_KM_S*10 + 10*tdbSeconds,0,0], [10,0,0]);
  };
  const result = await reduceJpl(reader, {target:10,center:399,tdbSeconds:0,correction:'CN'});
  const exactTau = 10 / (1 + 10/C_KM_S);
  assert.ok(Math.abs(result.lightTimeSeconds - exactTau) < 1e-9);
  assert.ok(Math.abs(result.position[0] - C_KM_S*exactTau) < 1e-5);
  assert.deepEqual(calls.filter(([id]) => id === 399), [[399,0]]);
  const none = await reduceJpl(reader, {target:10,center:399,tdbSeconds:0,correction:'NONE'});
  assert.equal(none.position[0], C_KM_S*10); assert.equal(none.lightTimeSeconds,0);
});

test('SPICE stellar correction matches analytic transverse rotation and preserves range', () => {
  const v = C_KM_S / 8;
  const result = stellarAberration([8,0,0], [0,v,0]);
  assert.ok(Math.abs(result[0] - Math.sqrt(63)) < 1e-14);
  assert.equal(result[1],1); assert.equal(result[2],0);
  assert.ok(Math.abs(Math.hypot(...result)-8) < 1e-14);
  assert.deepEqual(stellarAberration([8,0,0],[v,0,0]),[8,0,0]);
  assert.throws(() => stellarAberration([1,0,0],[C_KM_S,0,0]));
  assert.ok(Math.abs(separationArcseconds([1,0,0],[0,1,0])-324000) < 1e-10);
  assert.equal(separationArcseconds([1,0,0],[-1,0,0]),648000);
  assert.throws(() => separationArcseconds([0,0,0],[1,0,0]));
});

test('Refuse implicit centers, unsupported frames/corrections, wrong state units, nonconvergence', async () => {
  const valid = {target:10,center:399,tdbSeconds:0,correction:'CN'};
  for (const options of [{center:undefined},{target:399},{frame:'ecliptic-date'},{correction:'LT'},{tdbSeconds:NaN}]) await assert.rejects(reduceJpl(async () => state([1,0,0]), {...valid,...options}));
  await assert.rejects(reduceJpl(async () => ({...state([1,0,0]),positionUnit:'au'}),valid));
  await assert.rejects(reduceJpl(async ({target,tdbSeconds}) => target===399 ? state([0,0,0]) : state([C_KM_S*(tdbSeconds===0 ? 1 : Math.abs(tdbSeconds)+1),0,0]),valid), /did not converge/);
  await assert.rejects(reduceJpl(async () => state([0,0,0]),valid), /range/);
});
