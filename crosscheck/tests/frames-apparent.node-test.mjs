import test from 'node:test';
import assert from 'node:assert/strict';
import { precession2006, fukushimaWilliamsMatrix, trueOfDate, rotate, parseNutationTerms, nutation2000B, MAX_FRAME_TT_DAYS } from '../lib/frames.mjs';
import { relativisticAberration, solarDeflection, apparentJpl } from '../lib/apparent.mjs';
import { unit, C_KM_S, AU_KM } from '../lib/reduction.mjs';

// Published ERFA v2.0.1 t_erfa_c.c expectations; BSD notice retained in
// ../ERFA-NOTICE.txt. Independent of this engine and Swiss.
const close = (a,b,tolerance=1e-12) => {
  assert.equal(a.length,b.length);
  a.forEach((v,i) => assert.ok(Math.abs(v-b[i])<=tolerance,`${i}: ${v} vs ${b[i]}`));
};
test('Published ERFA pfw06 and fw2m checks establish rotation signs and bias', () => {
  const p=precession2006((2400000.5-2451545)+50123.9999);
  close(Object.values(p),[-0.2243387670997995690e-5,0.4091014602391312808,-0.9501954178013031895e-3,0.4091014316587367491],1e-15);
  const matrix=fukushimaWilliamsMatrix({gamma:-0.2243387670997992368e-5,phi:0.4091014602391312982,psi:-0.9501954178013015092e-3,epsilon:0.4091014316587367472});
  close(matrix.flat(),[0.9999995505176007047,0.8695404617348192957e-3,0.3779735201865582571e-3,
    -0.8695404723772016038e-3,0.9999996219496027161,-0.1361752496887100026e-6,
    -0.3779734957034082790e-3,-0.1924880848087615651e-6,0.9999999285679971958]);
  const atZero=fukushimaWilliamsMatrix(precession2006(0));
  assert.notEqual(atZero[0][1],0); // ICRF frame bias is present at J2000.
});

test('Published ERFA ab and ldsun examples', () => {
  const p=[-0.76321968546737951,-0.60869453983060384,-0.21676408580639883];
  const v=[2.1044018893653786e-5,-8.9108923304429319e-5,-3.8633714797716569e-5].map(x => x*C_KM_S);
  close(relativisticAberration(p,v,0.99980921395708788),[-0.7631631094219556269,-0.6087553082505590832,-0.2167926269368471279]);
  const source=[-0.763276255,-0.608633767,-0.216735543],sunObserver=[-0.973644023,-0.20925523,-0.0907169552];
  close(solarDeflection(source,source,sunObserver,0.999809214),[-0.7632762580731413169,-0.6086337635262647900,-0.2167355419322321302]);
});

const zeroTerms=() => Array.from({length:77},() => Array(11).fill(0));
test('Independent zero-series offsets, orthogonality and ecliptic pole construction', () => {
  const terms=zeroTerms();
  const n=nutation2000B(0,terms);
  close([n.dpsi,n.deps],[-0.000135,0.000388].map(x => x*Math.PI/(180*3600)),1e-24);
  assert.equal(MAX_FRAME_TT_DAYS,2*36525);
  for(const days of [-73050,-36525,0,36525,73050]) {
    const eq=trueOfDate(days,terms,'true-equator-equinox-date');
    const ec=trueOfDate(days,terms,'true-ecliptic-equinox-date');
    const transpose=eq.matrix[0].map((_,i) => eq.matrix.map(row => row[i]));
    const input=unit([1,2,3]);
    close(rotate(transpose,rotate(eq.matrix,input)),input,1e-15);
    // Equator vector at true obliquity must lie along ecliptic y.
    const vector=[0,Math.cos(eq.trueObliquity),Math.sin(eq.trueObliquity)];
    const inertial=rotate(transpose,vector);
    close(rotate(ec.matrix,inertial),[0,1,0],1e-15);
    const [a,b,c]=eq.matrix;
    const det=a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]);
    assert.ok(Math.abs(det-1)<1e-15);
  }
  const source='} x[] = {\n'+terms.map(r => '{'+r.join(',')+'}').join(',\n')+'\n};';
  assert.deepEqual(parseNutationTerms(source),terms);
  for(const bad of [source.replace('0,0','NaN,0'),source.replace('0,0','1.1,0'),source.replace('};','{oops}\n};'),source.replace(/\{0[^}]+\},/,'')]) assert.throws(() => parseNutationTerms(bad));
});

test('Analytic Lorentz transverse case, limiter and input refusal', () => {
  close(relativisticAberration([1,0,0],[0,C_KM_S/8,0],1e100),[Math.sqrt(63)/8,1/8,0],1e-15);
  close(relativisticAberration([1,0,0],[0,0,0],1),[1,0,0],0);
  close(solarDeflection([-1,0,0],[-1,0,0],[1,0,0],1),[-1,0,0],0);
  assert(solarDeflection(unit([-1,1e-9,0]),unit([-1,1e-9,0]),[1,0,0],1).every(Number.isFinite));
  for(const days of [NaN,Infinity,-Infinity,73050.01,-73050.01]) {
    assert.throws(() => precession2006(days));
    assert.throws(() => nutation2000B(days,zeroTerms()));
    assert.throws(() => trueOfDate(days,zeroTerms(),'true-equator-equinox-date'));
  }
  assert.throws(() => trueOfDate(0,zeroTerms(),'mean-ecliptic'));
  assert.throws(() => nutation2000B(0,[]));
  assert.throws(() => rotate([[1,2,3]], [1,2,3]));
  for(const s of [0,-1,NaN,Infinity]) {
    assert.throws(() => relativisticAberration([1,0,0],[0,0,0],s));
    assert.throws(() => solarDeflection([1,0,0],[1,0,0],[1,0,0],s));
  }
  assert.throws(() => relativisticAberration([1,0,0],[C_KM_S,0,0],1));
  assert.throws(() => relativisticAberration([2,0,0],[0,0,0],1));
});

test('Apparent pipeline orders deflection, aberration, then frame rotation', async () => {
  const positions={399:[AU_KM,0,0],10:[0,0,0],4:[2*AU_KM,AU_KM,0]};
  const velocity=[0,30,0];
  const calls=[];
  const read=async ({target,tdbSeconds}) => {
    calls.push({target,tdbSeconds});
    return {position:positions[target],velocity:target===399?velocity:[0,0,0],frame:'J2000',timeScale:'TDB',positionUnit:'km',velocityUnit:'km/s',corrections:'geometric'};
  };
  const options={target:4,center:399,tdbSeconds:0,ttDays:0,correction:'CN+REL+SUN',frame:'true-ecliptic-equinox-date',terms:zeroTerms()};
  const result=await apparentJpl(read,options);
  const p=unit([1,1,0]),q=unit([2,1,0]);
  const expected=rotate(trueOfDate(0,options.terms,options.frame).matrix,relativisticAberration(unit(solarDeflection(p,q,[1,0,0],1)),velocity,1));
  close(result.direction,unit(expected),1e-15);
  assert.equal(result.correction,options.correction);
  assert(!('position' in result));
  assert(calls.some(c => c.target===4 && c.tdbSeconds<0));
  for(const change of [{center:0},{frame:'implicit'},{ttDays:undefined},{correction:'CN+S'},{target:10}]) await assert.rejects(apparentJpl(read,{...options,...change}));
  await assert.rejects(apparentJpl(async args => ({...await read(args),velocity:[0,NaN,0]}),options));
  const noSun=await apparentJpl(read,{...options,frame:'ICRF',correction:'CN+REL'});
  close(noSun.direction,relativisticAberration(p,velocity,1),1e-15);
  for(const ttDays of [-73050,73050]) {
    for(const frame of ['ICRF','true-equator-equinox-date','true-ecliptic-equinox-date']) {
      const atBoundary=await apparentJpl(read,{...options,ttDays,frame,correction:'CN+REL'});
      const aberrated=relativisticAberration(p,velocity,1);
      const expected=frame==='ICRF'?aberrated:unit(rotate(trueOfDate(ttDays,options.terms,frame).matrix,aberrated));
      close(atBoundary.direction,expected,1e-15);
      assert.equal(atBoundary.ttDaysSinceJ2000,ttDays);
      const previousReads=calls.length;
      await assert.rejects(apparentJpl(read,{...options,ttDays:ttDays+Math.sign(ttDays)*0.01,frame}));
      assert.equal(calls.length,previousReads);
    }
  }
});
