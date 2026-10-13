#!/usr/bin/env node
import { readFile, writeFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { assert, plain, instant, canonicalize } from './core.mjs';
import { compareCharts } from './compare.mjs';

const HELP = `Zodiacs Verify preview (local, no server or network)
Usage: node src/cli.mjs COMMAND REQUEST.json [--engine /absolute/dist/index.js] [--out NEW.json]

Commands:
  calculate    request: {subjectId,utc,timeKnowledge,houseSystem,latitude?,longitude?,deltaT?}
  compare      request: {left:<receipt>,right:<receipt>,options?:{longitudeToleranceArcsec}}
  uncertainty  request: {subjectId,intervals,features,birth:{timeKnowledge,houseSystem,latitude?,longitude?,deltaT?},maxSamples?,resolutionMs?,bounds?}
  claims       request: {receipts,uncertaintyReports,claims,rules,trustedReceiptIds,trustedReportIds,trustedBoundIds,trustedRuleIds}

--engine is required for calculate/uncertainty and is operator configuration.
--out refuses to overwrite existing files. Otherwise prints JSON to stdout.
Exit: 0 completed; 1 invalid request/runtime failure; 2 claims not all supported.
Comparison disagreement and incomplete uncertainty are successful diagnostic responses.
`;

export async function runCli(args) {
  if (args.length === 0 || args.includes('--help')) return {text:HELP,code:0};
  const [command, file, ...flags] = args;
  assert(['calculate','compare','uncertainty','claims'].includes(command), 'unknown command');
  assert(file && !file.startsWith('--'), 'request JSON path required');
  const options = {};
  for (let i=0;i<flags.length;i+=2) {
    assert(['--engine','--out'].includes(flags[i]) && flags[i+1] && !flags[i+1].startsWith('--'), 'invalid CLI option');
    assert(!Object.hasOwn(options,flags[i]), 'duplicate CLI option');
    options[flags[i]] = flags[i+1];
  }
  const info = await stat(file);
  assert(info.isFile() && info.size <= 16*1024*1024, 'request must be file at most 16 MiB');
  const request = JSON.parse(await readFile(file,'utf8'));
  plain(request,'request'); canonicalize(request);
  let result;
  if (command === 'calculate' || command === 'uncertainty') {
    assert(options['--engine'], '--engine path required');
    const {loadZodiacsAdapter} = await import('./engine-adapter.mjs');
    const adapter = await loadZodiacsAdapter(resolve(options['--engine']));
    if (command === 'calculate') result = await adapter.calculate(request);
    else {
      const {analyzeUncertainty} = await import('./uncertainty.mjs');
      const allowed = new Set(['subjectId','intervals','features','birth','maxSamples','resolutionMs','bounds']);
      assert(Object.keys(request).every(k=>allowed.has(k)), 'unsupported uncertainty request field');
      plain(request.birth,'birth');
      assert(Object.keys(request.birth).every(k=>['timeKnowledge','houseSystem','latitude','longitude','deltaT'].includes(k)), 'unsupported birth setting');
      assert(Array.isArray(request.intervals) && request.intervals.length>0, 'intervals required');
      const birth = {...request.birth,subjectId:request.subjectId};
      // Validate settings before calling the sampler. Keep the declared model's
      // Delta-T policy across a window; a point's evaluated Delta-T is not constant.
      await adapter.calculate({...birth,utc:new Date(instant(request.intervals[0].from)).toISOString()});
      const model = {
        ...adapter.model,
        conventions:{...adapter.model.conventions,
          ...(Object.hasOwn(birth,'deltaT') ? {deltaT:{model:'pinned',seconds:birth.deltaT}} : {})},
        observer:{latitude:birth.latitude??null,longitude:birth.longitude??null,timeKnowledge:birth.timeKnowledge,houseSystem:birth.houseSystem}
      };
      result = await analyzeUncertainty({
        subjectId:request.subjectId,model,intervals:request.intervals,features:request.features,
        ...(request.bounds===undefined?{}:{bounds:request.bounds}),
        ...(request.maxSamples===undefined?{}:{maxSamples:request.maxSamples}),
        ...(request.resolutionMs===undefined?{}:{resolutionMs:request.resolutionMs}),
        sample:ms=>adapter.sample(ms,birth)
      });
    }
  } else if (command === 'compare') {
    assert(Object.keys(request).every(k=>['left','right','options'].includes(k)), 'unsupported comparison request field');
    result = compareCharts(request.left,request.right,request.options);
  }
  else { const {verifyClaims} = await import('./claims.mjs'); result = verifyClaims(request); }
  const output = JSON.stringify(result,null,2)+'\n';
  if (options['--out']) await writeFile(options['--out'],output,{flag:'wx',mode:0o600});
  return {text:options['--out']?'':output,code:command==='claims'&&!result.allSupported?2:0};
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { const out=await runCli(process.argv.slice(2)); if(out.text) process.stdout.write(out.text); process.exitCode=out.code; }
  catch(error) { process.stderr.write(JSON.stringify({error:'VERIFY_REQUEST_FAILED',message:String(error.message)})+'\n'); process.exitCode=1; }
}
