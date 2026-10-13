import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { assert, clone, digest, equal, exactKeys, sha256 } from './common.mjs';
import { identifyArtifact } from './identity.mjs';
import { loadReferences } from './references.mjs';
import { loadProtocol, validateProtocol } from './protocol.mjs';
import { validateDeclaration, FROZEN_BASELINE_DIGEST } from './declaration.mjs';
import { executeEngine, DEFAULT_PROBES } from './execute.mjs';
import { evaluateComparison } from './evaluate.mjs';
import { renderReport } from './report.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const inside = (root, file) => file === root || file.startsWith(root + path.sep);
export async function harnessIdentity() {
  const files = {};
  async function walk(relative) {
    const stat = await fs.lstat(path.join(ROOT, relative));
    assert(!stat.isSymbolicLink(), 'Harness symlinks are unsupported');
    if (stat.isDirectory()) for (const name of (await fs.readdir(path.join(ROOT, relative))).sort()) await walk(relative + '/' + name);
    else { assert(stat.isFile(), 'Unsupported harness entry'); files[relative] = sha256(await fs.readFile(path.join(ROOT, relative))); }
  }
  for (const relative of ['src','data','scripts','package.json','examples/rc10-declaration.json']) await walk(relative);
  return { files, digest: digest(files) };
}
async function baselineDeclaration(artifact, references) {
  assert(artifact.digest === FROZEN_BASELINE_DIGEST, 'Baseline must be the exact standalone frozen rc.10 installation');
  const declaration = JSON.parse(await fs.readFile(path.join(ROOT, 'examples/rc10-declaration.json'), 'utf8'));
  return validateDeclaration(declaration, artifact, references);
}

/** Freeze inputs without loading or executing either target. */
export async function createPlan({ baselineEntry, candidateEntry, candidateDeclaration }) {
  const references = await loadReferences(), protocol = await loadProtocol();
  const baselineArtifact = await identifyArtifact(baselineEntry), candidateArtifact = await identifyArtifact(candidateEntry);
  const baseDeclaration = await baselineDeclaration(baselineArtifact, references);
  validateDeclaration(candidateDeclaration, candidateArtifact, references);
  return { schemaVersion:1, kind:'zodiacs-engine-qualification-plan', createdAt:new Date().toISOString(),
    chronology:'Local timestamp and hash commitment only; not an independent timestamp or proof of preregistration.',
    protocol, harness:await harnessIdentity(), referenceDigest:references.digest, probes:clone(DEFAULT_PROBES),
    baseline:{entry:path.resolve(baselineEntry),artifact:baselineArtifact,declaration:baseDeclaration},
    candidate:{entry:path.resolve(candidateEntry),artifact:candidateArtifact,declaration:clone(candidateDeclaration)} };
}

export async function freshDirectory(output, forbiddenRoots = []) {
  assert(typeof output === 'string' && output.length > 0, 'An output directory is required');
  const absolute = path.resolve(output);
  const parent = await fs.realpath(path.dirname(absolute));
  const resolved = path.join(parent, path.basename(absolute));
  for (const root of forbiddenRoots) assert(!inside(await fs.realpath(root), resolved), 'Output must be outside the engine installations');
  await fs.mkdir(resolved); // exclusive: no reused directory or symbolic-link target
  return resolved;
}
async function writeJson(directory, name, value) {
  await fs.writeFile(path.join(directory, name), JSON.stringify(value, null, 2) + '\n', {flag:'wx'});
}
function checkPlanShape(plan) {
  exactKeys(plan, ['schemaVersion','kind','createdAt','chronology','protocol','harness','referenceDigest','probes','baseline','candidate'], 'Plan');
  assert(plan.schemaVersion === 1 && plan.kind === 'zodiacs-engine-qualification-plan', 'Unsupported plan');
  assert(typeof plan.createdAt === 'string' && Number.isFinite(Date.parse(plan.createdAt)), 'Invalid plan timestamp');
  for (const target of [plan.baseline,plan.candidate]) {
    exactKeys(target, ['entry','artifact','declaration'], 'Plan target');
    assert(typeof target.entry === 'string' && path.isAbsolute(target.entry), 'Plan entry must be absolute');
  }
}

/** Returns diagnostics only. Never edits any engine, trust inventory or release configuration. */
export async function runPlan({ planBytes, expectedSha256, output }) {
  assert(Buffer.isBuffer(planBytes) || typeof planBytes === 'string', 'Plan bytes required');
  assert(Buffer.byteLength(planBytes) <= 16 * 1024 * 1024, 'Plan exceeds input limit');
  assert(typeof expectedSha256 === 'string' && /^[a-f0-9]{64}$/.test(expectedSha256), 'Explicit expected plan SHA-256 required');
  const actualPlanSha256 = sha256(planBytes), plan = JSON.parse(planBytes);
  checkPlanShape(plan);
  const out = await freshDirectory(output, [path.dirname(path.dirname(plan.baseline.entry)),path.dirname(path.dirname(plan.candidate.entry))]);
  const startedAt = new Date().toISOString();
  const report = { schemaVersion:1, startedAt, planSha256:actualPlanSha256, expectedPlanSha256:expectedSha256,
    status:'blocked', adapterReviewRequired:true, adapterQualified:false, releaseAuthorized:false,
    environment:{node:process.version,platform:process.platform,architecture:process.arch,osRelease:os.release(),cpuModel:os.cpus()[0]?.model ?? 'unknown'},
    gates:{integrity:{status:'fail'}}, limitations:[], checklist:[] };
  let stage = 'plan-integrity';
  try {
    assert(actualPlanSha256 === expectedSha256, 'Plan bytes differ from the explicit expected digest');
    validateProtocol(plan.protocol);
    assert(equal(plan.probes, DEFAULT_PROBES), 'Behavioral probe definitions differ from the committed runner');
    assert(equal(plan.harness, await harnessIdentity()), 'Qualification harness changed after plan creation');
    const references = await loadReferences();
    assert(references.digest === plan.referenceDigest, 'Reference inputs changed after plan creation');
    report.limitations = [...plan.protocol.limitations, ...references.limitations];
    report.protocol = { id:plan.protocol.id,digest:digest(plan.protocol),policyStatus:plan.protocol.policyStatus,thresholds:plan.protocol.thresholds,executionLimits:plan.protocol.executionLimits };
    report.reference = { digest:references.digest,provenance:references.provenance,conventions:references.conventions,expectedRows:references.rows.length };
    stage = 'artifact-preflight';
    const baselineArtifact = await identifyArtifact(plan.baseline.entry), candidateArtifact = await identifyArtifact(plan.candidate.entry);
    assert(equal(baselineArtifact, plan.baseline.artifact), 'Baseline installation changed after plan creation');
    assert(equal(candidateArtifact, plan.candidate.artifact), 'Candidate installation changed after plan creation');
    const baseDeclaration = await baselineDeclaration(baselineArtifact, references);
    assert(equal(baseDeclaration, plan.baseline.declaration), 'Baseline declaration changed');
    validateDeclaration(plan.candidate.declaration, candidateArtifact, references);
    report.artifacts = { baseline:{digest:baselineArtifact.digest,version:baselineArtifact.version,installedBytes:baselineArtifact.installedBytes},candidate:{digest:candidateArtifact.digest,version:candidateArtifact.version,installedBytes:candidateArtifact.installedBytes} };
    report.declarations = {baseline:baseDeclaration,candidate:plan.candidate.declaration,meaning:'Operator/source-review declarations and selected reference profile; not independently authenticated equivalence to JPL conventions.'};
    await writeJson(out, 'baseline-artifact.json', baselineArtifact);
    await writeJson(out, 'candidate-artifact.json', candidateArtifact);
    const cases = references.rows.map(({id,body,utc,deltaT}) => ({id,body,utc,deltaT}));
    stage = 'baseline-execution';
    const baselineExecution = await executeEngine({entry:plan.baseline.entry,cases,probes:plan.probes,limits:plan.protocol.executionLimits});
    stage = 'candidate-execution';
    const candidateExecution = await executeEngine({entry:plan.candidate.entry,cases,probes:plan.probes,limits:plan.protocol.executionLimits});
    report.execution = {baseline:baselineExecution,candidate:candidateExecution};
    stage = 'artifact-postflight';
    assert(equal(baselineArtifact, await identifyArtifact(plan.baseline.entry)), 'Baseline installation mutated during execution');
    assert(equal(candidateArtifact, await identifyArtifact(plan.candidate.entry)), 'Candidate installation mutated during execution');
    assert(equal(plan.harness, await harnessIdentity()), 'Harness mutated during execution');
    assert((await loadReferences()).digest === plan.referenceDigest, 'Reference inputs mutated during execution');
    stage = 'evaluation';
    const evaluation = evaluateComparison({references:references.rows,baselineExecution,candidateExecution,baselineArtifact,candidateArtifact,protocol:plan.protocol,probes:plan.probes});
    report.evaluation = evaluation;
    report.gates = {integrity:{status:'pass',scope:'Full before/after inventory; no proof against transient or hostile mutations'},...evaluation.gates};
    report.status = evaluation.checksPassed ? 'checks-passed-review-required' : 'checks-not-met-review-required';
    report.checklist = [
      'Review candidate source, declared provider conventions and retained reference differences.',
      'Inspect every missing case, failed probe, per-body residual and regression before changing the qualification profile.',
      'Establish independent holdout coverage, additional epochs and required events/houses before broader accuracy claims.',
      'Review browser/mobile performance and product-specific budgets separately from this Node diagnostic.',
      'Deliberately implement and review a new Verify adapter inventory; this runner has not changed it.',
      'Obtain the separate merge/release decision under the project workflow.'
    ];
  } catch (error) {
    report.blocker = {stage,message:error instanceof Error ? error.message : String(error)};
    report.status = 'blocked';
    report.gates.integrity = {status:'fail',stage};
    report.limitations.push('Blocked runs cannot qualify a candidate, even if partial output contains valid rows.');
  }
  report.completedAt = new Date().toISOString();
  report.reportDigest = digest(report);
  await writeJson(out, 'report.json', report);
  await fs.writeFile(path.join(out, 'report.md'), renderReport(report), {flag:'wx'});
  const filenames = (await fs.readdir(out)).sort(), manifest = {};
  for (const name of filenames) manifest[name] = sha256(await fs.readFile(path.join(out, name)));
  await writeJson(out, 'run-manifest.json', {schemaVersion:1,files:manifest,meaning:'Integrity hashes, not a signature or proof of source authority.'});
  return { report, output:out, exitCode:report.status === 'blocked' ? 1 : report.evaluation.checksPassed ? 0 : 2 };
}
