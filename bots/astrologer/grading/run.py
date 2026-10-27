import json,subprocess,sys,os,concurrent.futures as cf
B='/workspace/astrologer-bot'; G=B+'/grading'
D=json.load(open(B+'/testset/charts.json'))
# Every computed number in a sheet comes from the engine's reading facts builder
# (bots/astrologer/facts/ in the engine checkout), run once for all charts in the run.
ENGINE=os.environ.get('ENGINE_DIR',B+'/wt-astrologer-template')
def build_sheets(cs):
  r=subprocess.run([ENGINE+'/node_modules/.bin/vite-node','bots/astrologer/facts/cli.ts','--','--batch'],input=json.dumps({c['id']:c['input'] for c in cs}),capture_output=True,text=True,timeout=3600,cwd=ENGINE)
  if r.returncode: raise RuntimeError(r.stderr[-500:])
  return json.loads(r.stdout)
FACTS={}
def sheet(c):
  i=c['input']
  born=f"{i['date']} {i['time']} local" if i['timeKnown'] else f"{i['date']}, birth time unknown"
  src="Birth time source: birth certificate." if i['timeKnown'] else "Birth time source: none."
  return '\n'.join([f"Person: born {born}, zone {i['zone']}, lat {i['lat']}, lon {i['lon']}. {src}","Chart link: https://zodiacs.org/chart/?id=TEST",FACTS[c['id']]])
def claude(model,sysf,prompt):
  r=subprocess.run(['claude','-p','--model',model,'--system-prompt',open(sysf).read(),'--tools',''],input=prompt,capture_output=True,text=True,timeout=900,cwd='/tmp')
  if r.returncode: raise RuntimeError(r.stderr[-300:])
  if len(r.stdout.strip())<200 and model=='sonnet': raise RuntimeError('empty reading')
  return r.stdout
WSYS=G+'/writer_system.md'; GSYS=G+'/grader_system.md'
# The writer's system prompt is the bot template itself: INSTRUCTIONS.md, then SOURCES.md, then the harness note.
TPL=ENGINE+'/bots/astrologer/template'
open(WSYS,'w').write(open(TPL+'/INSTRUCTIONS.md').read()+'\n\n'+open(TPL+'/SOURCES.md').read()+'\n\n\nTest note: links in tool results are placeholders; use them as given.')
# After writing, the reading is checked against its sheet (bots/astrologer/facts/check-cli.ts): every
# aspect, transit or station contact it names must be a sheet line with the same aspect and direction.
# On a violation the writer gets one revision prompt listing them, at most MAX_REVISIONS times, before
# grading. Each chart's checks are recorded in checks/<id>.json, and earlier drafts in readings/<id>.draftN.md.
MAX_REVISIONS=2
def check(sp,rp):
  r=subprocess.run([ENGINE+'/node_modules/.bin/vite-node','bots/astrologer/facts/check-cli.ts','--','--sheet',sp,'--reading',rp,'--json'],capture_output=True,text=True,timeout=300,cwd=ENGINE)
  if r.returncode not in (0,1): raise RuntimeError('checker: '+r.stderr[-300:])
  return json.loads(r.stdout)
def violations_text(res):
  return '\n'.join(f"{i+1}. "+(f'In "{v["sentence"]}": ' if v['sentence'] else '')+v['message'] for i,v in enumerate(res['violations']))
def write_prompt(s):
  return "New person, interview already done. Here are the tool results for this person (treat as returned by the zodiacs.org MCP tools in this conversation):\n\n"+s+"\n\nGive the first reading now: natal reading then the 90-day calendar. Max 900 words."
def revise_prompt(s,reading,res):
  return (write_prompt(s)+"\n\nYou already wrote the reading below. An automatic check against the tool results found aspects, transits or station contacts that are not on the sheet as named:\n\n"
    +violations_text(res)+"\n\nRewrite the whole reading. Name each aspect, transit, station or contact only by quoting its sheet line with its ID, exactly as written (same planets, same aspect word, same order). Remove any claim the sheet does not support. Keep everything else. Max 900 words.\n\nYOUR PREVIOUS READING:\n"+reading)
def do(c):
  cid=c['id']; sp=f"{G}/sheets/{cid}.txt"; rp=f"{G}/readings/{cid}.md"; gp=f"{G}/grades/{cid}.json"; kp=f"{G}/checks/{cid}.json"
  s=sheet(c); open(sp,'w').write(s)
  if not os.path.exists(rp):
    open(rp,'w').write(claude('sonnet',WSYS,write_prompt(s)))
  if not os.path.exists(kp):
    attempts=[]
    res=check(sp,rp); attempts.append({'attempt':0,'ok':res['ok'],'mentions':res['mentions'],'violations':res['violations'],'cited':res['cited']})
    while not res['ok'] and len(attempts)<=MAX_REVISIONS:
      n=len(attempts); prev=open(rp).read()
      open(f"{G}/readings/{cid}.draft{n}.md",'w').write(prev)
      open(rp,'w').write(claude('sonnet',WSYS,revise_prompt(s,prev,res)))
      res=check(sp,rp); attempts.append({'attempt':n,'ok':res['ok'],'mentions':res['mentions'],'violations':res['violations'],'cited':res['cited']})
    json.dump({'chart':cid,'final_ok':res['ok'],'revisions':len(attempts)-1,'attempts':attempts},open(kp,'w'),indent=1)
  if not os.path.exists(gp):
    out=claude('opus',GSYS,"CHART SHEET:\n"+s+"\n\nREADING (author unknown):\n"+open(rp).read())
    j=out[out.find('{'):out.rfind('}')+1]; json.loads(j); open(gp,'w').write(j)
  return cid
for d in ('sheets','readings','grades','checks'): os.makedirs(f'{G}/{d}',exist_ok=True)
ids=sys.argv[1:]
cs=[c for c in D['charts'] if not ids or c['id'] in ids]
FACTS.update(build_sheets(cs))
with cf.ThreadPoolExecutor(3) as ex:
  for f in cf.as_completed([ex.submit(do,c) for c in cs]):
    try: print('done',f.result(),flush=True)
    except Exception as x: print('ERR',x,flush=True)
