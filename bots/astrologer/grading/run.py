import json,subprocess,sys,os,re,threading,concurrent.futures as cf
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
# The writer (first reading and revisions) and the grader; both opus, the grader with its own prompt.
WRITER='opus'; GRADER='opus'
class UsageLimit(Exception):
  """A usage or rate limit in claude's output: the whole run stops, with no retry and no fallback."""
STOP=threading.Event()
LIMIT=re.compile(r'(usage|rate)[ _-]?limit|limit (reached|exceeded)|too many requests',re.I)
def claude(model,sysf,prompt,reading=True):
  if STOP.is_set(): raise UsageLimit('run stopped: usage or rate limit reached earlier')
  r=subprocess.run(['claude','-p','--model',model,'--system-prompt',open(sysf).read(),'--tools',''],input=prompt,capture_output=True,text=True,timeout=900,cwd='/tmp')
  m=LIMIT.search(r.stdout+'\n'+r.stderr)
  if m:
    STOP.set()
    raise UsageLimit(f'claude ({model}) hit a usage or rate limit ("{m.group(0)}"); stopping the run: '+(r.stdout+r.stderr).strip()[-300:])
  if r.returncode: raise RuntimeError(r.stderr[-300:])
  if reading and len(r.stdout.strip())<200 and sysf==WSYS: raise RuntimeError('empty reading')
  return r.stdout
WSYS=G+'/writer_system.md'; GSYS=G+'/grader_system.md'
# The writer's system prompt is the bot template itself: INSTRUCTIONS.md, then SOURCES.md, then the harness note.
TPL=ENGINE+'/bots/astrologer/template'
open(WSYS,'w').write(open(TPL+'/INSTRUCTIONS.md').read()+'\n\n'+open(TPL+'/SOURCES.md').read()+'\n\n\nTest note: links in tool results are placeholders; use them as given.')
# After writing, the reading is checked against its sheet (bots/astrologer/facts/check-cli.ts): every
# aspect, transit, station or angle contact it names must be a sheet line with the same aspect and
# direction; birthday dates and ages, every date, date range and orb must match the line it is tied to;
# a house or sign given for a planet must be its natal one or, for a transiting or stationing planet, the
# one its line gives (a planet named with no ID is read as the moving one in a dated or 90-day sentence); house,
# sign and chart rulers must be the whole sign houses' traditional rulers; angle placements in any wording need a [C] line; and on a
# two-chart sheet (fold or gap) each claim must hold in the chart it is attributed to, shared and 'only in' claims must match the
# sheet, chart-specific facts must name their chart, and a clock state tied to a chart must match the sheet. Interpretation in the voice of
# fact is flagged too (v9 C2): rankings the sheet does not make (hardest, heaviest, most reliable), a planet's sign said to hold
# under a change of birth time, and an outer planet's meaning called traditional. A relative date phrase ("two days earlier", "the next day",
# "a week later", "the same week", "that weekend") must match the day difference of the dated lines it relates (v10 P14);
# its violation quotes the phrase, and both revision prompts pass that quote on. On a violation the writer is given only
# the flagged sentences and asked for replacements, which are spliced into the reading in place; the rest
# of the reading is kept as written. Only when no flagged sentence can be located, or the reply cannot be
# read, is the whole reading rewritten. At most MAX_REVISIONS rounds before grading. Each chart's checks
# are recorded in checks/<id>.json, and earlier drafts in readings/<id>.draftN.md.
MAX_REVISIONS=2
def check(sp,rp):
  r=subprocess.run([ENGINE+'/node_modules/.bin/vite-node','bots/astrologer/facts/check-cli.ts','--','--sheet',sp,'--reading',rp,'--json'],capture_output=True,text=True,timeout=300,cwd=ENGINE)
  if r.returncode not in (0,1): raise RuntimeError('checker: '+r.stderr[-300:])
  return json.loads(r.stdout)
# Before each check the reading's en and em dashes are removed in place (bots/astrologer/facts/dedash-cli.ts,
# deterministic, no model call): after the first writing and after each revision.
def dedash(rp):
  r=subprocess.run([ENGINE+'/node_modules/.bin/vite-node','bots/astrologer/facts/dedash-cli.ts','--','--write',rp],capture_output=True,text=True,timeout=300,cwd=ENGINE)
  if r.returncode!=0 or json.loads(r.stdout)['after']!=0: raise RuntimeError('dedash: '+(r.stderr or r.stdout)[-300:])
def violations_text(res):
  return '\n'.join(f"{i+1}. "+(f'In "{v["sentence"]}": ' if v['sentence'] else '')+v['message'] for i,v in enumerate(res['violations']))
def write_prompt(s):
  return "New person, interview already done. Here are the tool results for this person (treat as returned by the zodiacs.org MCP tools in this conversation):\n\n"+s+"\n\nGive the first reading now: natal reading then the 90-day calendar. Max 900 words."
def flagged(reading,res):
  # Flagged sentences that occur in the reading, each with its problems, in reading order.
  g={}
  for v in res['violations']:
    if v['sentence'] and v['sentence'] in reading: g.setdefault(v['sentence'],[]).append(v['message'])
  return sorted(g.items(),key=lambda kv:reading.find(kv[0]))
def fix_prompt(s,reading,items):
  numbered='\n\n'.join(f'{i+1}. SENTENCE: {k}\n   PROBLEM: '+' / '.join(v) for i,(k,v) in enumerate(items))
  return (write_prompt(s)+"\n\nYou already wrote the reading below. An automatic check against the tool results flagged these sentences:\n\n"+numbered
    +"\n\nRewrite only these sentences; the rest of the reading stays as it is. Each replacement keeps the sentence's place and purpose in its paragraph and any leading markdown (such as '- ' or bold), names an aspect, transit, station, angle contact, birthday, age, date, date range, orb, house, sign or ruler only as its sheet line gives it (with the ID, and on a two-chart sheet with its chart), drops any claim the sheet does not support, and gives interpretation as a reading, marked as such, never as a calculated fact: no ranking of planets, contacts or periods, no conclusion about a change of birth time that the sheet does not give, and no outer-planet meaning called traditional. Where a problem quotes relative date words (such as \"two days earlier\" or \"the next day\"), the replacement gives each line's own date from the sheet and corrects or drops those quoted words. A replacement may be one or two sentences, or an empty string to delete the sentence. Reply with JSON only: an object from sentence number to replacement, such as {\"1\": \"...\", \"2\": \"...\"}.\n\nYOUR READING:\n"+reading)
def splice(reading,items,out):
  j=json.loads(out[out.find('{'):out.rfind('}')+1])
  new=reading; done=0
  for i,(sent,_) in enumerate(items):
    r=j.get(str(i+1))
    if not isinstance(r,str) or sent not in new: continue
    # An empty replacement deletes the sentence and the space after it.
    new=new.replace(sent+' ' if not r.strip() and sent+' ' in new else sent,r.strip(),1); done+=1
  return new,done
def revise(s,reading,res):
  # Sentence-level fix first; a whole rewrite only as a fallback.
  items=flagged(reading,res)
  if items:
    try:
      new,done=splice(reading,items,claude(WRITER,WSYS,fix_prompt(s,reading,items),reading=False))
      if done: return new,'splice'
    except (ValueError,RuntimeError): pass
  return claude(WRITER,WSYS,revise_prompt(s,reading,res)),'rewrite'
def revise_prompt(s,reading,res):
  return (write_prompt(s)+"\n\nYou already wrote the reading below. An automatic check against the tool results found aspects, transits, station or angle contacts, birthday dates, dates, date ranges, orbs, houses or signs that are not on the sheet as named, or interpretation written as a calculated fact:\n\n"
    +violations_text(res)+"\n\nRewrite the whole reading. Name each aspect, transit, station or contact only by quoting its sheet line with its ID, exactly as written (same planets, same aspect word, same order), and copy dates, ranges and orbs from that line. Where a problem quotes relative date words (such as \"two days earlier\" or \"the next day\"), give each line's own date from the sheet and correct or drop those words. Remove any claim the sheet does not support, and mark interpretation as a reading rather than ranking or stating it as fact. Keep everything else. Max 900 words.\n\nYOUR PREVIOUS READING:\n"+reading)
def do(c):
  cid=c['id']; sp=f"{G}/sheets/{cid}.txt"; rp=f"{G}/readings/{cid}.md"; gp=f"{G}/grades/{cid}.json"; kp=f"{G}/checks/{cid}.json"
  s=sheet(c); open(sp,'w').write(s)
  if not os.path.exists(rp):
    open(rp,'w').write(claude(WRITER,WSYS,write_prompt(s)))
  if not os.path.exists(kp):
    attempts=[]
    dedash(rp); res=check(sp,rp); attempts.append({'attempt':0,'ok':res['ok'],'mentions':res['mentions'],'violations':res['violations'],'cited':res['cited']})
    while not res['ok'] and len(attempts)<=MAX_REVISIONS:
      n=len(attempts); prev=open(rp).read()
      open(f"{G}/readings/{cid}.draft{n}.md",'w').write(prev)
      new,mode=revise(s,prev,res); open(rp,'w').write(new)
      dedash(rp); res=check(sp,rp); attempts.append({'attempt':n,'mode':mode,'ok':res['ok'],'mentions':res['mentions'],'violations':res['violations'],'cited':res['cited']})
    json.dump({'chart':cid,'final_ok':res['ok'],'revisions':len(attempts)-1,'attempts':attempts},open(kp,'w'),indent=1)
  if not os.path.exists(gp):
    out=claude(GRADER,GSYS,"CHART SHEET:\n"+s+"\n\nREADING (author unknown):\n"+open(rp).read())
    j=out[out.find('{'):out.rfind('}')+1]; json.loads(j); open(gp,'w').write(j)
  return cid
for d in ('sheets','readings','grades','checks'): os.makedirs(f'{G}/{d}',exist_ok=True)
ids=sys.argv[1:]
cs=[c for c in D['charts'] if not ids or c['id'] in ids]
FACTS.update(build_sheets(cs))
limited=None
with cf.ThreadPoolExecutor(3) as ex:
  for f in cf.as_completed([ex.submit(do,c) for c in cs]):
    if f.cancelled(): continue
    try: print('done',f.result(),flush=True)
    except UsageLimit as x:
      if not limited: limited=x; print('STOP',x,flush=True); ex.shutdown(wait=False,cancel_futures=True)
    except Exception as x: print('ERR',x,flush=True)
if limited: sys.exit('run stopped: '+str(limited))
