import json,glob,os,statistics as st
C=[f'C{i}' for i in range(1,9)]
D={c['id']:c for c in json.load(open('../testset/charts.json'))['charts']}
R=[]
for f in sorted(glob.glob('grades/*.json')):
  g=json.load(open(f)); cid=os.path.basename(f)[:-5]; g['id']=cid; v=[g[c] for c in C if g[c] is not None]; g['mean']=sum(v)/len(v); g['tags']=D[cid]['tags']; R.append(g)
import csv
with open('scores.csv','w',newline='') as fh:
  w=csv.writer(fh); w.writerow(['chart','tags']+C+['mean','critical_errors','mismatches','worst_problem'])
  for g in R: w.writerow([g['id'],' '.join(g['tags'])]+[g[c] for c in C]+[round(g['mean'],2),len(g['critical_errors']),len(g['position_date_mismatches']),g['worst_problem']])
print(len(R),'graded; overall',round(st.mean(g['mean'] for g in R),2))
for c in C: v=[g[c] for g in R if g[c] is not None]; print(c,round(st.mean(v),2),'n=',len(v))
print('critical',sum(len(g['critical_errors']) for g in R),'charts w/ critical',sum(1 for g in R if g['critical_errors']))
print('mismatch charts',sum(1 for g in R if g['position_date_mismatches']))
R.sort(key=lambda g:g['mean'])
for g in R[:10]: print('WORST',g['id'],g['tags'],round(g['mean'],2),g['worst_problem'])
for g in R[-5:]: print('BEST',g['id'],g['tags'],round(g['mean'],2))
for g in R: print('FIX',g['id'],g['fix_for_writer'])
for g in R: print('CRIT',g['id'],json.dumps(g['critical_errors'])[:300]) if g['critical_errors'] else None
