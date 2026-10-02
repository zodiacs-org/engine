"""Stage JSR metadata around an immutable, separately verified npm archive.
No package publication, build, dependency installation, or archive modification.
"""
import hashlib,json,pathlib,re,sys,tarfile
archive=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2]); out.mkdir(exist_ok=False)
assert hashlib.sha256(archive.read_bytes()).hexdigest()=="43a72d30e483d8ff22024e403c4bd0d86d81bb6e1d0ad138f857cd001ab015d8"
original=[]
with tarfile.open(archive) as t:
 for m in t.getmembers():
  assert m.isfile() and m.name.startswith("package/") and ".." not in pathlib.PurePosixPath(m.name).parts
  name=m.name[len("package/"):]; data=t.extractfile(m).read(); dest=out/name; dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
  original.append({"path":name,"sha256":hashlib.sha256(data).hexdigest()})
p=json.loads((out/"package.json").read_text()); types=out/"jsr-types";types.mkdir();rewrites=[]
for f in sorted((out/"dist").glob("*.d.ts")):
 def replace(m):
  target=f.parent/(m.group(2)+".d.ts"); assert target.is_file(),str(target)
  return m.group(1)+m.group(2)+".d.ts"+m.group(1)
 text=re.sub(r"([\"'])(\./[^\"']+)\.js\1",replace,f.read_text())
 (types/f.name).write_text(text);rewrites.append({"source":"dist/"+f.name,"target":"jsr-types/"+f.name,"sha256":hashlib.sha256(text.encode()).hexdigest()})
exports={}; wrappers=[]
for key,v in p["exports"].items():
 name="jsr-"+pathlib.Path(v["import"]).stem+".js"; typ="./jsr-types/"+pathlib.Path(v["types"]).name
 (out/name).write_text('/* @ts-self-types="'+typ+'" */\nexport * from "'+v["import"]+'";\n');exports[key]="./"+name;wrappers.append(name)
config={"name":p["name"],"version":p["version"],"license":p["license"],"exports":exports,"publish":{"include":["dist/**","jsr-types/**",*wrappers,"README.md","CHANGELOG.md","LICENSE","LICENSING.md","NOTICE","package.json"]}}
(out/"deno.json").write_text(json.dumps(config,indent=2)+"\n")
for f in original:assert hashlib.sha256((out/f["path"]).read_bytes()).hexdigest()==f["sha256"]
(out.parent/(out.name+"-bindings.json")).write_text(json.dumps({"archiveSha256":hashlib.sha256(archive.read_bytes()).hexdigest(),"originalFiles":original,"declarationCopies":rewrites,"wrappers":wrappers},indent=2)+"\n")
print(len(original),"unchanged files;",len(rewrites),"declaration copies;",len(wrappers),"wrappers")
