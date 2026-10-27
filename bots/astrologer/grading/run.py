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
def do(c):
  cid=c['id']; sp=f"{G}/sheets/{cid}.txt"; rp=f"{G}/readings/{cid}.md"; gp=f"{G}/grades/{cid}.json"
  s=sheet(c); open(sp,'w').write(s)
  if not os.path.exists(rp):
    open(rp,'w').write(claude('sonnet',WSYS,"New person, interview already done. Here are the tool results for this person (treat as returned by the zodiacs.org MCP tools in this conversation):\n\n"+s+"\n\nGive the first reading now: natal reading then the 90-day calendar. Max 900 words."))
  if not os.path.exists(gp):
    out=claude('opus',GSYS,"CHART SHEET:\n"+s+"\n\nREADING (author unknown):\n"+open(rp).read())
    j=out[out.find('{'):out.rfind('}')+1]; json.loads(j); open(gp,'w').write(j)
  return cid
ids=sys.argv[1:]
cs=[c for c in D['charts'] if not ids or c['id'] in ids]
FACTS.update(build_sheets(cs))
with cf.ThreadPoolExecutor(3) as ex:
  for f in cf.as_completed([ex.submit(do,c) for c in cs]):
    try: print('done',f.result(),flush=True)
    except Exception as x: print('ERR',x,flush=True)
