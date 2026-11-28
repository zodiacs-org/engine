#!/usr/bin/env python3
"""Materialize a fixed candidate in an isolated runtime; never edit engine sources."""
import argparse, hashlib, json, pathlib, subprocess, tarfile, urllib.request
HERE=pathlib.Path(__file__).resolve().parent
PIN={'version':'0.1.1-rc.10','sourceCommit':'f5f33892a95cd0d6cd4a11a80e66f802b11bccfa','tarballSha256':'a377cdc8c12e25ff7de4fe95ddf77a4cdee8d2da97071b0f8454e340b374565c','dependency':'astronomy-engine','dependencyVersion':'2.1.19'}
URL='https://raw.githubusercontent.com/zodiacs-org/engine/'+PIN['sourceCommit']+'/artifacts/zodiacs-engine-'+PIN['version']+'.tgz'
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--tarball',type=pathlib.Path);ap.add_argument('--runtime',type=pathlib.Path,default=HERE/'.runtime');args=ap.parse_args()
 runtime=args.runtime.resolve()
 if runtime.exists() and (not runtime.is_dir() or any(runtime.iterdir())):raise SystemExit('Choose a fresh or empty --runtime directory; existing files are never overwritten')
 runtime.mkdir(parents=True,exist_ok=True)
 archive=args.tarball or runtime/('zodiacs-engine-'+PIN['version']+'.tgz')
 if not archive.exists():
  if args.tarball:raise SystemExit('Supplied tarball does not exist')
  with urllib.request.urlopen(URL,timeout=60) as response:archive.write_bytes(response.read())
 if hashlib.sha256(archive.read_bytes()).hexdigest()!=PIN['tarballSha256']:raise SystemExit('Candidate archive hash mismatch')
 if (runtime/'package').exists():raise SystemExit('Choose a fresh --runtime directory; existing package is never overwritten')
 with tarfile.open(archive) as t:
  if any(not m.name.startswith('package/') or m.issym() or m.islnk() for m in t.getmembers()):raise SystemExit('Unexpected archive member')
  t.extractall(runtime,filter='data')
 pkg=json.loads((runtime/'package/package.json').read_text())
 if pkg['version']!=PIN['version'] or pkg['dependencies']!={PIN['dependency']:PIN['dependencyVersion']}:raise SystemExit('Unexpected candidate package metadata')
 # Install only the declared runtime dependency in a separate minimal manifest.
 (runtime/'package.json').write_text(json.dumps({'name':'zodiacs-verification-runtime','private':True,'dependencies':{PIN['dependency']:PIN['dependencyVersion']}},indent=2)+'\n')
 subprocess.run(['npm','install','--ignore-scripts','--no-audit','--no-fund','--prefix',str(runtime)],check=True)
 (runtime/'identity.json').write_text(json.dumps({**PIN,'archiveUrl':URL,'engine':str(runtime/'package/dist/index.js')},indent=2)+'\n')
 print(runtime/'package/dist/index.js')
if __name__=='__main__':main()
