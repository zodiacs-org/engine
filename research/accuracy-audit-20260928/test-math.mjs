import test from 'node:test';
import assert from 'node:assert/strict';
import {unit,spherical,fromSpherical,angleArcsec,longitudeDeltaArcsec,rotate,components} from './math.mjs';
const close=(a,b,tol=1e-7)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
test('spherical separation preserves tiny angles without acos cancellation',()=>close(angleArcsec([1,0,0],fromSpherical(1/3600000,0)),.001));
test('antipodal separation is 180 degrees',()=>close(angleArcsec([1,0,0],[-1,0,0]),648000));
test('circular seam is a small signed difference',()=>{close(longitudeDeltaArcsec(.001,359.999),7.2);close(longitudeDeltaArcsec(359.999,.001),-7.2)});
test('separation is scale invariant',()=>close(angleArcsec([2,3,4],[5,1,2]),angleArcsec([20,30,40],[.5,.1,.2])));
test('right angle and latitude preserve vector geometry',()=>{close(angleArcsec([1,0,0],[0,1,0]),324000);close(spherical([0,0,1]).latitude,90)});
test('known rotation maps x onto y',()=>assert.deepEqual(rotate([[0,-1,0],[1,0,0],[0,0,1]],[1,0,0]),[0,1,0]));
test('zero and nonfinite vectors cannot produce apparent agreement',()=>{assert.throws(()=>unit([0,0,0]));assert.throws(()=>unit([1,NaN,0]));assert.throws(()=>angleArcsec([1,0,0],[Infinity,0,0]))});
test('signed-coordinate budget closes through a longitude seam with cancellation',()=>{
  const r=components({longitude:.001,latitude:1},{longitude:359.999,latitude:1.002},{longitude:.002,latitude:.999},{longitude:359.998,latitude:1.001});
  close(r.total.longitude,10.8);close(r.total.latitude,-3.6);close(r.closure.longitude,0);close(r.closure.latitude,0);
  assert.ok(r.rotationChoiceDelta.longitude<0 && r.referenceConventionDelta.longitude>0);
});
test('nonfinite or out-of-domain decomposition inputs are rejected before closure',()=>{
  const valid={longitude:1,latitude:0};
  for(const invalid of [{longitude:NaN,latitude:0},{longitude:1},{longitude:360,latitude:0},{longitude:1,latitude:91}]) assert.throws(()=>components(invalid,valid,valid,valid),/Invalid coordinates/);
});
