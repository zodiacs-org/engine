import json, re, subprocess, sys
from pathlib import Path
root=Path(__file__).resolve().parent
positive=subprocess.run([sys.executable,"-m","mypy","--strict",str(root/"types_positive.py")],text=True,capture_output=True)
if positive.returncode: print(positive.stdout); print(positive.stderr); raise SystemExit("positive type contract failed")
negative=subprocess.run([sys.executable,"-m","mypy","--strict",str(root/"types_negative.py")],text=True,capture_output=True)
expected={i for i,line in enumerate((root/"types_negative.py").read_text().splitlines(),1) if line.endswith("# E")}
found={int(x) for x in re.findall(r"types_negative.py:(\d+): error:",negative.stdout)}
if negative.returncode!=1 or found!=expected: print(negative.stdout);print(negative.stderr);raise SystemExit("negative type controls did not fail exactly where expected")
print(json.dumps({"positive":"pass","negativeControls":len(expected),"negative":"all refused"}))
