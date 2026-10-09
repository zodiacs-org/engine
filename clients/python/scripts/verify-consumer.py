import hashlib, json, os, shutil, subprocess, sys, tarfile, tempfile, zipfile
from pathlib import Path
root=Path(__file__).resolve().parents[1]
repo=root.parents[1]
with tempfile.TemporaryDirectory(prefix="zodiacs-python-consumer-",dir=os.environ.get("RUNNER_TEMP")) as temporary:
    work=Path(temporary)
    subprocess.run([sys.executable,"-m","build","--wheel","--sdist","--outdir",str(work/"dist"),str(root)],check=True)
    wheels=list((work/"dist").glob("*.whl"));sdists=list((work/"dist").glob("*.tar.gz"))
    assert len(wheels)==len(sdists)==1
    with zipfile.ZipFile(wheels[0]) as z:
        members=z.namelist()
        assert "zodiacs_compute/py.typed" in members
        assert {n for n in members if n.startswith("zodiacs_compute/")}=={"zodiacs_compute/__init__.py","zodiacs_compute/client.py","zodiacs_compute/contract.py","zodiacs_compute/py.typed"}
        metadata=z.read(next(n for n in members if n.endswith(".dist-info/METADATA"))).decode()
        assert "Classifier: Private :: Do Not Upload" in metadata
        assert "License: MIT AND CC-BY-4.0" in metadata
        assert "Requires-Dist: httpx==0.28.1" in metadata
    with tarfile.open(sdists[0],"r:gz") as t:
        names=t.getnames()
        assert not any("/node_modules/" in n or "/artifacts/" in n or n.endswith(".tgz") for n in names)
    subprocess.run([sys.executable,"-m","venv",str(work/"venv")],check=True)
    python=work/"venv/bin/python"
    subprocess.run([str(python),"-m","pip","install",str(wheels[0]),"mypy==1.19.1"],check=True)
    shutil.copytree(root/"checks",work/"checks")
    env={**os.environ,"CLIENT_MODE":"fresh-wheel","CLIENT_REPORT":str(work/"installed.json")}
    env.pop("PYTHONPATH",None);env.pop("MYPYPATH",None)
    subprocess.run([str(python),str(work/"checks/types_check.py")],cwd=work,env=env,check=True)
    subprocess.run([str(python),str(work/"checks/run.py")],cwd=work,env=env,check=True)
    report=json.loads((work/"installed.json").read_text())
    assert Path(report["modulePath"]).is_relative_to(work/"venv")
    report["wheel"]={"file":wheels[0].name,"bytes":wheels[0].stat().st_size,"sha256":hashlib.sha256(wheels[0].read_bytes()).hexdigest(),"members":members}
    report["sdist"]={"file":sdists[0].name,"bytes":sdists[0].stat().st_size,"sha256":hashlib.sha256(sdists[0].read_bytes()).hexdigest()}
    report["dependencies"]=subprocess.check_output([str(python),"-m","pip","freeze"],text=True).splitlines()
    output=root/"evidence"/("python-"+str(sys.version_info.major)+"."+str(sys.version_info.minor)+"-consumer.json")
    output.parent.mkdir(exist_ok=True)
    output.write_text(json.dumps(report,indent=2)+"\n")
