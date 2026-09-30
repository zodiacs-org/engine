"""Verify bundled archives against the immutable engine artifact and npm lock."""
import base64
import hashlib
import json
from pathlib import Path
import tarfile

root = Path(__file__).resolve().parents[2]
vendor = root / "python/src/zodiacs/_vendor"
manifest = json.loads((vendor / "manifest.json").read_text())
for item in manifest["archives"]:
    archive = vendor / item["file"]
    data = archive.read_bytes()
    assert hashlib.sha256(data).hexdigest() == item["sha256"], archive
    if item["destination"] == "engine":
        assert data == (root / "artifacts" / item["file"]).read_bytes()
        records = json.loads((root / "artifacts/archives.json").read_text())["archives"]
        record, = [entry for entry in records if entry["file"] == item["file"]]
        assert record["sha256"] == item["sha256"]
        assert record["sourceCommit"] == manifest["engineSourceCommit"]
        with tarfile.open(archive) as source:
            package = json.load(source.extractfile("package/package.json"))
        assert package["version"] == manifest["engineVersion"]
    else:
        lock = json.loads((root / "package-lock.json").read_text())
        dependency = lock["packages"]["node_modules/astronomy-engine"]
        integrity = "sha512-" + base64.b64encode(hashlib.sha512(data).digest()).decode()
        assert integrity == dependency["integrity"]
        assert item["source"] == dependency["resolved"]
print("Bundled runtime archives match the immutable artifact and dependency lock")
