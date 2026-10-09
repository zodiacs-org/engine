import importlib.metadata, json, os, platform, sys, unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import client_checks
import zodiacs_compute
suite=unittest.defaultTestLoader.loadTestsFromModule(client_checks)
result=unittest.TextTestRunner(verbosity=2).run(suite)
if not result.wasSuccessful() or result.skipped: raise SystemExit(1)
report={"schema":"zodiacs.python-compute-client-check.v1","source":os.environ.get("PROGRAMME_HEAD"),"checkout":os.environ.get("GITHUB_SHA"),"run":os.environ.get("GITHUB_RUN_ID"),"mode":os.environ["CLIENT_MODE"],"python":platform.python_version(),"httpx":importlib.metadata.version("httpx"),"modulePath":str(Path(zodiacs_compute.__file__).resolve()),"tests":result.testsRun,"skipped":len(result.skipped),"failures":len(result.failures),"errors":len(result.errors),"endpointFixtures":len(client_checks.FIXTURES["operations"]),"httpFailureFixtures":len(client_checks.FIXTURES["errors"]),"fixtureSourceSha256":client_checks.FIXTURES["sourceSha256"],"limitations":["Contract regression and transport behavior; not independent astronomical accuracy","Synthetic loopback and mock requests only; no live birth data or retries"]}
Path(os.environ["CLIENT_REPORT"]).write_text(json.dumps(report,indent=2)+"\n")
