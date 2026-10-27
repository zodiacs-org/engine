import json,subprocess,sys,os,concurrent.futures as cf
from datetime import datetime
from zoneinfo import ZoneInfo
B='/workspace/astrologer-bot'; G=B+'/grading'
D=json.load(open(B+'/testset/charts.json'))
S=['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces']
def fmt(l):
  m=int(round(l*60))%21600; s=m//1800; r=m%1800; return f"{r//60}°{r%60:02d}' {S[s]}"
ASP={0:'conjunction',60:'sextile',90:'square',120:'trine',180:'opposition'}
def loc(u,z): return datetime.fromisoformat(u.replace('Z','+00:00')).astimezone(ZoneInfo(z)).strftime('%Y-%m-%d %H:%M')
def natal(e,z,label=''):
  L=[f"Calculated chart {label}(tropical, whole sign houses, true node). Link: https://zodiacs.org/chart/?id=TEST"]
  asc=e['asc']; a=int(asc//30)
  L.append(f"Ascendant {fmt(asc)}; MC {fmt(e['mc'])} (whole sign house {(int(e['mc']//30)-a)%12+1})")
  for b,l in e['bodies'].items():
    L.append(f"{b} {fmt(l)}, house {(int(l//30)-a)%12+1}{' retrograde' if b in e['retrograde'] else ''}")
  if e.get('placidus')=='undefined': L.append("Placidus houses: undefined at this latitude.")
  bs=list(e['bodies'].items())+[('ASC',asc),('MC',e['mc'])]; A=[]
  for i in range(len(bs)):
    for j in range(i+1,len(bs)):
      d=abs(bs[i][1]-bs[j][1])%360; d=min(d,360-d)
      for k,n in ASP.items():
        if abs(d-k)<=(8 if k in(0,90,180,120) else 6): A.append(f"{bs[i][0]} {n} {bs[j][0]} (orb {abs(d-k):.1f}°)")
  L.append("Major aspects: "+'; '.join(A))
  return '\n'.join(L)
def sheet(c):
  i=c['input'];e=c['expect'];z=i['zone']
  L=[f"Person: born {i['date']} {i['time'] if i['timeKnown'] else '(time unknown)'} local, zone {z}, lat {i['lat']}, lon {i['lon']}. Birth time source: birth certificate.",f"resolve_civil_time status: {e['status']}"]
  if e['status']=='gap': L.append("UTC candidates: "+', '.join(e['utc'])+". "+e['note'])
  elif e['status']=='fold':
    L.append("The local time happened twice. Earlier occurrence:"); L.append(natal(e,z,'(earlier) '))
    L.append("Later occurrence:"); L.append(natal({**e,**e['later']},z,'(later) ') if isinstance(e['later'],dict) and 'bodies' in e['later'] else "Later occurrence data: "+json.dumps(e['later']))
  elif e['status']=='time-unknown':
    L.append("Time unknown. "+json.dumps({k:e[k] for k in e if k!='status'}))
  else:
    if 'lmt' in c['tags']: L.append("Zone note: place used local mean time (lmt) at this date.")
    L.append(natal(e,z))
  if e['status'] in('resolved',):
    L.append(f"Transits 2026-11-01 to 2027-01-30 (90 days), exact times in person's zone ({z}):")
    for t in e.get('transits',[]): L.append(f"- transiting {t['body']} {t['aspect']} natal {t['natal']}: exact {loc(t['exactUtc'],z)}")
    if not e.get('transits'): L.append("- no hard transits (conj/square/opp) to Sun, Moon, ASC, MC by Sun..Pluto in window")
    L.append("Sky stations in window: "+'; '.join(f"{s['body']} stations {s['kind']} {loc(s['utc'],z)} at {fmt(s['lon'])}" for s in D['skyStations']))
  return '\n'.join(L)
def claude(model,sysf,prompt):
  r=subprocess.run(['claude','-p','--model',model,'--system-prompt',open(sysf).read(),'--tools',''],input=prompt,capture_output=True,text=True,timeout=900,cwd='/tmp')
  if r.returncode: raise RuntimeError(r.stderr[-300:])
  if len(r.stdout.strip())<200 and model=='sonnet': raise RuntimeError('empty reading')
  return r.stdout
WSYS=G+'/writer_system.md'; GSYS=G+'/grader_system.md'
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
with cf.ThreadPoolExecutor(3) as ex:
  for f in cf.as_completed([ex.submit(do,c) for c in cs]):
    try: print('done',f.result(),flush=True)
    except Exception as x: print('ERR',x,flush=True)
