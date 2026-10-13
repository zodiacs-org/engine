import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { openKernel } from '../lib/kernels.mjs';
import { createSpkReader } from '../lib/spk.mjs';
import { ttToTdb, reduceJpl, separationArcseconds, AU_KM, TIME_MODEL } from '../lib/reduction.mjs';
import { parseHorizons, selectRows, HORIZONS_LIMITS } from '../lib/horizons.mjs';
import { emptyStats, addResidual, summarize } from '../lib/statistics.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const repository = fileURLToPath(new URL('../../', import.meta.url));
const source = join(repository, 'docs/evidence/calc-api/horizons');
const digest = data => createHash('sha256').update(data).digest('hex');
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) throw Error('Usage: node crosscheck/tools/validate-jpl.mjs [--check]');
const kernel = await openKernel(join(root, 'runtime/cache/de440s'), 'c1c7feeab882263fc493a9d5a5b2ddd71b54826cdf65d8d17a76126b260a49f2');
const read = createSpkReader([kernel]);
const segments = kernel.receipt.coverage.segments;
const start = Math.max(...segments.map(s => s.startTdbSeconds)), end = Math.min(...segments.map(s => s.endTdbSeconds));
const targets = new Set([10,301,199,299,4,5,6,7,8,9]);
const files = (await readdir(source)).sort().filter(name => {
  const match = /^geo-(NONE|LT|LTS)-(\d+)(?:\.2)?\.txt$/.exec(name);
  return match && targets.has(Number(match[2]));
});
const references = [], aggregate = {};
let minJd = Infinity, maxJd = -Infinity, outsideCoverage = 0, eligible = 0, tested = 0;
for (const name of files) {
  const [,mode,id] = /^geo-(NONE|LT|LTS)-(\d+)/.exec(name);
  const correction = {NONE:'NONE',LT:'CN',LTS:'CN+S'}[mode], target = Number(id);
  const bytes = await readFile(join(source,name));
  const selected = selectRows(parseHorizons(bytes.toString('utf8'),target,correction),start,end,ttToTdb);
  references.push({ path: `docs/evidence/calc-api/horizons/${name}`, sha256:digest(bytes), selected:selected.rows.length, eligible:selected.eligible, outsideCoverage:selected.outsideCoverage });
  outsideCoverage += selected.outsideCoverage; eligible += selected.eligible;
  const group = `${correction}/${target}`;
  aggregate[group] ??= { angle:emptyStats(HORIZONS_LIMITS.angleArcseconds), range:emptyStats(HORIZONS_LIMITS.rangeKm) };
  for (const row of selected.rows) {
    const time = ttToTdb((row.jdTt - 2451545)*86400);
    const result = await reduceJpl(read,{target,center:399,tdbSeconds:time.tdbSeconds,correction});
    const reference = row.positionAu.map(v => v*AU_KM);
    const angle = separationArcseconds(result.position,reference);
    const range = Math.hypot(...result.position) - Math.hypot(...reference);
    aggregate[group].angle = addResidual(aggregate[group].angle,angle);
    aggregate[group].range = addResidual(aggregate[group].range,range);
    tested++; minJd = Math.min(minJd,row.jdTt); maxJd = Math.max(maxJd,row.jdTt);
  }
}
if (!tested || Object.keys(aggregate).length !== targets.size*3) throw Error('Incomplete public reference coverage');
const tooling = {};
for (const name of ['lib/kernels.mjs','lib/spk.mjs','lib/reduction.mjs','lib/horizons.mjs','lib/statistics.mjs','tools/validate-jpl.mjs']) tooling[name] = digest(await readFile(join(root,name)));
const groups = Object.fromEntries(Object.entries(aggregate).sort().map(([key,s]) => [key,{angleArcseconds:summarize(s.angle), rangeKm:summarize(s.range)}]));
const report = { schema:1, what:'Reference reduction validation, not an engine error report or random chart campaign',
  command:'node crosscheck/tools/validate-jpl.mjs', software:{node:process.version}, tooling,
  kernel:{name:kernel.receipt.name,sha256:kernel.receipt.sha256,source:kernel.receipt.source},
  conventions:{frame:'ICRF (DE440 SPK frame 1)',center:399,timeScale:'TT input, TDB kernel evaluation',timeModel:TIME_MODEL,
    lightTime:'converged Newtonian reception',stellarAberration:'SPICE Newtonian',deflection:'none',
    targets:'Sun 10; Moon 301; Mercury 199; Venus 299; Mars through Pluto system barycenters 4 through 9'},
  comparedWith:'JPL Horizons DE441 geometric, LT and LT+S ICRF geocentric Cartesian positions; CN is compared to Horizons LT',
  selection:'First, middle and last eligible row per file; a reception margin of one day at kernel start; all other covered rows unsampled',
  limits:HORIZONS_LIMITS,span:{minJdTt:minJd,maxJdTt:maxJd},tested,eligible,outsideCoverage,references,groups,
  exclusions:['No engine positions evaluated','No Swiss instrument invoked','No true-of-date frames','No solar deflection or relativistic aberration','DE440 versus DE441 model differences included','No accuracy bound outside selected epochs'] };
const json = JSON.stringify(report,null,2)+'\n';
const lines = ['# JPL inertial reduction validation','',report.what+'.','',
  'Command: `'+report.command+'` on '+process.version+'.',
  'Kernel SHA-256: `'+report.kernel.sha256+'`.',
  'Exact tooling and public input hashes, selection rules, tolerances and TT span are in [jpl-reduction.json](jpl-reduction.json).','',
  'This compares the independently authored SPK reduction with committed JPL Horizons DE441 responses. Differences include DE440 versus DE441, the truncated NAIF TT/TDB model, and CN versus Horizons LT semantics. Limits are acceptance checks fixed in lib/horizons.mjs before the comparison, not an engine accuracy claim.','',
  'True-of-date rotation and relativistic corrections are still pending. No random chart campaign or Swiss comparison has been run.','',
  '| Correction / NAIF target | Compared | Angular max (arcsec) | Range max (km) | Failed angle / range |',
  '| --- | ---: | ---: | ---: | ---: |'];
for (const [key,g] of Object.entries(groups)) lines.push(`| ${key} | ${g.angleArcseconds.n} | ${g.angleArcseconds.maxAbs} | ${g.rangeKm.maxAbs} | ${g.angleArcseconds.failed} / ${g.rangeKm.failed} |`);
const markdown = lines.join('\n')+'\n';
const csv = ['correction,target,metric,unit,n,passed,failed,mean,mean_abs,rms,population_std_dev,max_abs'];
for (const [key,g] of Object.entries(groups)) {
  const [correction,target] = key.split('/');
  for (const [metric,unit,stats] of [['angle','arcsec',g.angleArcseconds],['range','km',g.rangeKm]]) csv.push([correction,target,metric,unit,stats.n,stats.passed,stats.failed,stats.mean,stats.meanAbs,stats.rms,stats.populationStdDev,stats.maxAbs].join(','));
}
const csvText = csv.join('\n')+'\n';
const output = join(root,'reports');
if (args[0] === '--check') {
  if (await readFile(join(output,'jpl-reduction.json'),'utf8') !== json || await readFile(join(output,'jpl-reduction.md'),'utf8') !== markdown || await readFile(join(output,'jpl-reduction.csv'),'utf8') !== csvText) throw Error('Reference validation report differs');
} else {
  await mkdir(output,{recursive:true});
  await writeFile(join(output,'jpl-reduction.json'),json);
  await writeFile(join(output,'jpl-reduction.md'),markdown);
  await writeFile(join(output,'jpl-reduction.csv'),csvText);
}
console.log(JSON.stringify({ tested,eligible,outsideCoverage,failures:Object.values(groups).reduce((n,g) => n+g.angleArcseconds.failed+g.rangeKm.failed,0) }));
if (Object.values(groups).some(g => g.angleArcseconds.failed || g.rangeKm.failed)) process.exitCode=1;
