import test from 'node:test';
import strict from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../src/cli.mjs';
import { receipt } from './fixtures.mjs';

test('CLI comparison and refusal to overwrite an existing output',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'zverify-cli-'));
  try {
    const input=path.join(dir,'request.json'),output=path.join(dir,'result.json');
    await writeFile(input,JSON.stringify({left:receipt(),right:receipt()}));
    const r=await runCli(['compare',input,'--out',output]);strict.equal(r.code,0);
    strict.equal(JSON.parse(await readFile(output,'utf8')).verdict,'agreement-within-threshold');
    await strict.rejects(()=>runCli(['compare',input,'--out',output]),/EEXIST/);
    await strict.rejects(()=>runCli(['compare',input,'--out',output,'--out',output]),/duplicate/);
    await strict.rejects(()=>runCli(['calculate',input]),/engine/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('CLI claim result uses exit2 for unsupported claims and exit0 for supported',async()=>{
  const dir=await mkdtemp(path.join(os.tmpdir(),'zverify-cli-'));
  try {
    const r=receipt(),input=path.join(dir,'claims.json');
    const request={receipts:[r],uncertaintyReports:[],rules:[],trustedReceiptIds:[r.id],trustedReportIds:[],trustedBoundIds:[],trustedRuleIds:[],claims:[{id:'c',kind:'fact',subjectId:r.subjectId,receiptId:r.id,factId:'longitude:Sun',expected:20,scope:'instant'}]};
    await writeFile(input,JSON.stringify(request));
    strict.equal((await runCli(['claims',input])).code,2);
    request.claims[0].expected=15;await writeFile(input,JSON.stringify(request));
    strict.equal((await runCli(['claims',input])).code,0);
  }finally{await rm(dir,{recursive:true,force:true});}
});
