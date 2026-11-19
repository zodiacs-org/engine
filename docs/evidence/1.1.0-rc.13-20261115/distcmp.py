import sys,os,re,hashlib
def norm(d,ver):
    out=[]
    for root,_,fs in os.walk(d):
        for f in fs:
            p=os.path.join(root,f); rel=os.path.relpath(p,d)
            b=open(p,'rb').read().decode('utf-8','surrogateescape')
            b=re.sub(r'chunk-[A-Z0-9]{8}','chunk-H',b)
            if ver=='1.1.0-rc.13': b=b.replace('"1.1.0-rc.13"','"1.1.0-rc.12"')
            b=re.sub(r'(types|api)-[A-Za-z0-9_-]{8}\.d\.ts',r'\1-H.d.ts',b)
            name=re.sub(r'chunk-[A-Z0-9]{8}','chunk-H',rel); name=re.sub(r'(types|api)-[A-Za-z0-9_-]{8}\.d\.ts',r'\1-H.d.ts',name)
            out.append((name,hashlib.sha256(b.encode('utf-8','surrogateescape')).hexdigest()))
    return sorted(out)
a=norm(sys.argv[1],sys.argv[2]); b=norm(sys.argv[3],sys.argv[4])
print('files',len(a),len(b)); print('EQUAL' if a==b else 'DIFFERENT')
for x,y in zip(a,b):
    if x!=y: print(x,y)
