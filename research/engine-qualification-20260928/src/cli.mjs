#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { assert, sha256 } from './common.mjs';
import { identifyArtifact } from './identity.mjs';
import { loadReferences } from './references.mjs';
import { declarationTemplate } from './declaration.mjs';
import { createPlan, freshDirectory, runPlan } from './runner.mjs';

const USAGE = `Engine qualification (trusted local candidates only)\n\ninspect --engine ABSOLUTE_DIST_INDEX --out NEW_DIRECTORY\nplan --baseline ABSOLUTE_DIST_INDEX --candidate ABSOLUTE_DIST_INDEX --declaration JSON_FILE --out NEW_DIRECTORY\nrun --plan PLAN_JSON --expect-sha256 HEX_DIGEST --out NEW_DIRECTORY\n\nExit 0: command succeeded / all diagnostic checks pass (review still required).\nExit 1: malformed input, blocked integrity or orchestration/setup error.\nExit 2: completed evaluation with failed or incomplete diagnostic checks, including worker failures.\n`;
async function readJson(file) {
  const stat = await fs.stat(file); assert(stat.isFile() && stat.size <= 16 * 1024 * 1024, 'Input file is too large or not regular');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
async function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === '--help' || command === 'help') { console.log(USAGE); return; }
  const allowed = {inspect:['--engine','--out'],plan:['--baseline','--candidate','--declaration','--out'],run:['--plan','--expect-sha256','--out']}[command];
  assert(allowed, 'Unknown command.\n' + USAGE);
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    assert(allowed.includes(args[i]) && !Object.hasOwn(options,args[i]) && typeof args[i+1] === 'string' && !args[i+1].startsWith('--'), 'Unknown, duplicate or missing option');
    options[args[i]] = args[i+1];
  }
  assert(allowed.every(key => Object.hasOwn(options,key)), 'Every listed option is required.\n' + USAGE);
  if (command === 'inspect') {
    const artifact = await identifyArtifact(options['--engine']), references = await loadReferences();
    const out = await freshDirectory(options['--out'],[path.dirname(path.dirname(options['--engine']))]);
    await fs.writeFile(path.join(out,'artifact.json'),JSON.stringify(artifact,null,2)+'\n',{flag:'wx'});
    await fs.writeFile(path.join(out,'declaration-template.json'),JSON.stringify(declarationTemplate(artifact,references),null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify({output:out,artifactDigest:artifact.digest,next:'Review source conventions and fill every null declaration field before creating a plan.'}));
  } else if (command === 'plan') {
    const plan = await createPlan({baselineEntry:options['--baseline'],candidateEntry:options['--candidate'],candidateDeclaration:await readJson(options['--declaration'])});
    const out = await freshDirectory(options['--out'],[path.dirname(path.dirname(plan.baseline.entry)),path.dirname(path.dirname(plan.candidate.entry))]);
    const bytes = JSON.stringify(plan,null,2)+'\n', hash = sha256(bytes);
    await fs.writeFile(path.join(out,'plan.json'),bytes,{flag:'wx'});
    await fs.writeFile(path.join(out,'plan.sha256'),hash+'  plan.json\n',{flag:'wx'});
    console.log(JSON.stringify({plan:path.join(out,'plan.json'),sha256:hash,targetsExecuted:false,next:'Retain this digest independently and pass it explicitly to the run command.'}));
  } else {
    const stat = await fs.stat(options['--plan']); assert(stat.isFile() && stat.size <= 16*1024*1024,'Invalid/oversized plan file');
    const result = await runPlan({planBytes:await fs.readFile(options['--plan']),expectedSha256:options['--expect-sha256'],output:options['--out']});
    console.log(JSON.stringify({output:result.output,status:result.report.status,checksPassed:result.report.evaluation?.checksPassed ?? false,adapterQualified:false}));
    process.exitCode = result.exitCode;
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
