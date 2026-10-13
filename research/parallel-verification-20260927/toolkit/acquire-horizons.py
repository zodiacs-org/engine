#!/usr/bin/env python3
"""Acquire independent reference data, sequentially; never calls the target engine."""
import argparse, csv, datetime as dt, hashlib, io, json, pathlib, urllib.parse, urllib.request

HERE = pathlib.Path(__file__).resolve().parent
ENDPOINT = 'https://ssd.jpl.nasa.gov/api/horizons.api'
def digest(b): return hashlib.sha256(b).hexdigest()
def now(): return dt.datetime.now(dt.timezone.utc).isoformat()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', type=pathlib.Path, default=HERE/'references')
    ap.add_argument('--refresh', action='store_true')
    args = ap.parse_args()
    raw_cases = (HERE/'cases.json').read_bytes()
    cases = json.loads(raw_cases)
    args.out.mkdir(parents=True, exist_ok=True)
    times = [(dt.datetime.fromisoformat(t.replace('Z','+00:00')) + dt.timedelta(seconds=cases['deltaTSeconds'])).strftime('%Y-%m-%d %H:%M:%S') for t in cases['instants']]
    manifest = {'schemaVersion':1, 'createdAt':now(), 'casesSha256':digest(raw_cases), 'endpoint':ENDPOINT, 'rows':[], 'responses':[], 'conventions':cases['referenceConvention'], 'knownDifferences':cases['knownDifferences']}
    for body in cases['bodies']:
        jds=[dt.datetime.strptime(t,'%Y-%m-%d %H:%M:%S').replace(tzinfo=dt.timezone.utc).timestamp()/86400+2440587.5 for t in times]
        params = {'format':'json','COMMAND':body['command'],'EPHEM_TYPE':'OBSERVER','CENTER':'500@399','TLIST':"'"+','.join(f'{j:.10f}' for j in jds)+"'",'TLIST_TYPE':'JD','TIME_TYPE':'TT','CAL_TYPE':'GREGORIAN','TIME_DIGITS':'FRACSEC','QUANTITIES':'31','CSV_FORMAT':'YES','EXTRA_PREC':'YES','OBJ_DATA':'YES'}
        url = ENDPOINT+'?'+urllib.parse.urlencode(params)
        dst=args.out/(body['body'].lower()+'.json')
        receipt=args.out/(body['body'].lower()+'.receipt.json')
        if dst.exists() and receipt.exists() and not args.refresh:
            raw=dst.read_bytes(); rec=json.loads(receipt.read_text())
            if rec['url']!=url or rec['sha256']!=digest(raw): raise ValueError('Cached reference mismatch; choose new output directory')
        else:
            started=now()
            req=urllib.request.Request(url,headers={'User-Agent':'Zodiacs-independent-validation/1.0'})
            with urllib.request.urlopen(req,timeout=50) as response: raw=response.read()
            rec={'requestStartedAt':started,'retrievedAt':now(),'url':url,'parameters':params,'sha256':digest(raw)}
            dst.write_bytes(raw); receipt.write_text(json.dumps(rec,indent=2)+'\n')
        data=json.loads(raw)
        if 'error' in data: raise ValueError(data['error'])
        result=data.get('result','')
        if '$$SOE' not in result or '$$EOE' not in result or 'TT' not in result: raise ValueError('Missing ephemeris markers/time scale')
        rows=list(csv.reader(io.StringIO(result.split('$$SOE')[1].split('$$EOE')[0].strip())))
        if len(rows)!=len(times): raise ValueError('Unexpected reference count')
        for i,row in enumerate(rows):
            observed=row[0].strip()
            parsed=dt.datetime.strptime(observed,'%Y-%b-%d %H:%M:%S.%f')
            expected=dt.datetime.strptime(times[i],'%Y-%m-%d %H:%M:%S')
            if abs((parsed-expected).total_seconds()*1000)>cases['referenceEpochToleranceMilliseconds']: raise ValueError('Reference epoch mismatch')
            lon,lat=float(row[3]),float(row[4])
            if not (0<=lon<360 and -90<=lat<=90): raise ValueError('Invalid reference coordinates')
            manifest['rows'].append({'id':body['body']+'-'+str(i),'body':body['body'],'utc':cases['instants'][i],'deltaT':cases['deltaTSeconds'],'referenceTT':times[i],'lon':lon,'lat':lat,'command':body['command'],'referenceTarget':body['referenceTarget'],'rawFile':dst.name,'rawSha256':digest(raw)})
        manifest['responses'].append({'body':body['body'],'file':dst.name,**rec,'apiSignature':data.get('signature'), 'targetLine':next((l for l in result.splitlines() if l.startswith('Target body name:')),None)})
        print(body['body'],len(rows),'reference epochs',flush=True)
    (args.out/'positions.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('Saved',len(manifest['rows']),'independent reference rows')
if __name__=='__main__':main()
