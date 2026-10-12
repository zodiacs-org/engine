import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireErfa, erfaCatalog, erfaDirectory, loadNutationTerms, sha256 } from '../lib/erfa.mjs';
import { nutation2000B, precession2006, trueOfDate, FRAME_MODEL } from '../lib/frames.mjs';
import { relativisticAberration, solarDeflection } from '../lib/apparent.mjs';
import { C_KM_S, unit } from '../lib/reduction.mjs';
import { emptyStats, addResidual, summarize } from '../lib/statistics.mjs';
import { sampleCase } from '../lib/sampling.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const args=process.argv.slice(2);
if (args.length>1 || (args.length && args[0]!=='--check')) throw Error('Usage: node crosscheck/tools/validate-frames.mjs [--check]');
await acquireErfa();
const terms=await loadNutationTerms();
const executable=join(root,'runtime/erfa-reference');
const sources=Object.keys(erfaCatalog.files).filter(n => n.endsWith('.c') && n!=='t_erfa_c.c').map(n => join(erfaDirectory,n));
const compileArgs=['-std=c99','-O2','-fno-fast-math','-I',erfaDirectory,join(root,'tools/erfa-reference.c'),...sources,'-lm','-o',executable];
const compile=spawnSync('cc',compileArgs,{encoding:'utf8',timeout:30000,maxBuffer:100000});
if (compile.error || compile.status!==0) throw Error('ERFA reference compilation failed: '+(compile.stderr || compile.error));
const compiler=spawnSync('cc',['--version'],{encoding:'utf8',timeout:10000,maxBuffer:100000});
if (compiler.error || compiler.status!==0) throw Error('Compiler identity unavailable');
const direction = sample => {
  const lat=sample.latitude*Math.PI/180,lon=sample.longitude*Math.PI/180;
  return [Math.cos(lat)*Math.cos(lon),Math.cos(lat)*Math.sin(lon),Math.sin(lat)];
};
const cases=[];
const sampling={seed:'crosscheck-erfa-M5c',startMs:Date.UTC(2000,0,1),endMs:Date.UTC(2001,0,1)};
for (let index=0;index<257;index++) {
  const a=sampleCase(sampling,index*3),b=sampleCase(sampling,index*3+1),c=sampleCase(sampling,index*3+2);
  let p=direction(a),e=direction(b),q=direction(c);
  // Deterministic limb, conjunction and opposition cases exercise limiter.
  if (index%8===0) p=unit(e.map((v,i) => -v+(i===0?1e-8:0)));
  if (index%8===1) p=e;
  if (index%8<2) q=p;
  const velocity=direction(c).map(v => v*0.001*C_KM_S);
  cases.push({ttDays:-36525+73050*index/256,p,e,q,velocity,s:0.5+index/128});
}
const input=cases.map(c => [c.ttDays,...c.p,...c.velocity.map(v => v/C_KM_S),...c.e,...c.q,c.s].join(' ')).join('\n')+'\n';
const reference=spawnSync(executable,[],{input,encoding:'utf8',timeout:30000,maxBuffer:1000000});
if (reference.error || reference.status!==0) throw Error('ERFA reference execution failed');
const rows=reference.stdout.trim().split('\n').map(row => row.split(' ').map(Number));
if (rows.length!==cases.length || rows.some(r => r.length!==33 || !r.every(Number.isFinite))) throw Error('Invalid ERFA protocol output');
const tolerance=5e-14;
const stats=Object.fromEntries(['nutation','precession','true-equator-matrix','true-ecliptic-matrix','relativistic-aberration','finite-target-solar-deflection','distant-solar-deflection'].map(k => [k,emptyStats(tolerance)]));
cases.forEach((c,i) => {
  const n=nutation2000B(c.ttDays,terms),p=precession2006(c.ttDays);
  const values=[['nutation',[n.dpsi,n.deps],0],['precession',Object.values(p),2],
    ['true-equator-matrix',trueOfDate(c.ttDays,terms,'true-equator-equinox-date').matrix.flat(),6],
    ['true-ecliptic-matrix',trueOfDate(c.ttDays,terms,'true-ecliptic-equinox-date').matrix.flat(),15],
    ['relativistic-aberration',relativisticAberration(c.p,c.velocity,c.s),24],
    ['finite-target-solar-deflection',solarDeflection(c.p,c.q,c.e,c.s),27],
    ['distant-solar-deflection',solarDeflection(c.p,c.p,c.e,c.s),30]];
  for(const [key,actual,offset] of values) actual.forEach((v,j) => {stats[key]=addResidual(stats[key],v-rows[i][offset+j]);});
});
// Published independent ERFA test for the actual pinned coefficient series.
const published=nutation2000B((2400000.5-2451545)+53736,terms);
if (Math.abs(published.dpsi-(-0.9632552291148362783e-5))>1e-13 || Math.abs(published.deps-0.4063197106621159367e-4)>1e-13) throw Error('Published nut00b reference failed');
const tooling={};
for(const name of ['lib/frames.mjs','lib/apparent.mjs','lib/erfa.mjs','lib/erfa-catalog.json','lib/sampling.mjs','lib/statistics.mjs','tools/validate-frames.mjs','tools/erfa-reference.c']) tooling[name]=sha256(await readFile(join(root,name)));
const report={schema:1,what:'Frame and correction implementation validation against ERFA, not engine accuracy or a chart campaign',
  command:'node crosscheck/tools/validate-frames.mjs',node:process.version,compiler:compiler.stdout.split('\n')[0],
  compilerOptions:['-std=c99','-O2','-fno-fast-math','-lm'],reference:erfaCatalog,tooling,
  frameModel:FRAME_MODEL,span:{minTtDaysSinceJ2000:-36525,maxTtDaysSinceJ2000:36525},cases:cases.length,
  sampling:{...sampling,selection:'Uniformly spaced TT epochs including endpoints; indexed synthetic directions; conjunction and opposition override every eighth index',
    speedKmS:0.001*C_KM_S,minSolarDistanceAu:0.5,maxSolarDistanceAu:2.5},
  tolerance:{nutation:'radians',precession:'radians',otherGroups:'dimensionless Cartesian or matrix components',absolute:tolerance},
  groups:Object.fromEntries(Object.entries(stats).map(([key,s]) => [key,summarize(s)])),
  exclusions:['Shared published model constants and runtime coefficient data; this checks implementation, not model accuracy',
    'IAU2000B abridged nutation, not IAU2000A or observed celestial pole offsets',
    'No IAU2006 secular adjustment of nutation',
    'Static single-Sun deflection and ERFA limiter, not moving-body ray integration',
    'No end-to-end JPL apparent-coordinate accuracy validation',
    'No engine charts, Swiss instrument, UTC resolution, topocentric positions or corrected velocities']};
const json=JSON.stringify(report,null,2)+'\n';
const markdown=['# True-of-date frame and relativistic correction validation','',report.what+'.','',
  'Command: `'+report.command+'` on '+report.node+'.',
  'Reference: ERFA '+erfaCatalog.version+', compiled with `'+report.compiler+'`.',
  'Exact commands, source and tooling SHA-256 digests, synthetic selection, TT span and acceptance limits are in [frame-validation.json](frame-validation.json).','',
  'The frame uses IAU 2006 bias and precession with unadjusted IAU 2000B nutation. The C reference independently evaluates the same specified composition. Aberration includes the ERFA solar-potential term. Solar deflection tests cover finite-target geometry, distant-source geometry and the near-Sun limiter. Shared model constants and coefficients make this an implementation check, not independent evidence for the physical model.','',
  'The apparent SPK pipeline uses converged reception light-time, deflection before aberration, and rotation last. Unit and published-reference tests check ordering and rotation signs. Its static reception-Sun geometry is an explicit approximation; it has not been validated end to end against apparent JPL coordinates.','',
  '| Group | Components compared | Maximum absolute residual | Failures |','| --- | ---: | ---: | ---: |',
  ...Object.entries(report.groups).map(([key,s]) => `| ${key} | ${s.n} | ${s.maxAbs} | ${s.failed} |`),'',
  'Nutation and precession residuals are in radians; all other groups use dimensionless components. Limits are implementation acceptance checks, not engine accuracy bounds. No Swiss output or per-case positions are retained.'].join('\n')+'\n';
const csv=['group,unit,n,passed,failed,mean,mean_abs,rms,population_std_dev,max_abs',
  ...Object.entries(report.groups).map(([key,s]) => [key,['nutation','precession'].includes(key)?'rad':'dimensionless',s.n,s.passed,s.failed,s.mean,s.meanAbs,s.rms,s.populationStdDev,s.maxAbs].join(','))].join('\n')+'\n';
for(const [extension,text] of [['json',json],['md',markdown],['csv',csv]]) {
  const path=join(root,'reports/frame-validation.'+extension);
  if (args[0]==='--check') {
    if (await readFile(path,'utf8')!==text) throw Error('Frame validation report differs');
  } else await writeFile(path,text);
}
const failures=Object.values(report.groups).reduce((sum,s) => sum+s.failed,0);
console.log(JSON.stringify({cases:cases.length,failures}));
if (failures) process.exitCode=1;
