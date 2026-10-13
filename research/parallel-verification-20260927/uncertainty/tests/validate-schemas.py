"""Optional structural gate; requires jsonschema==4.26.0 (not a runtime dependency)."""
import json
import copy
import pathlib
import importlib.metadata
import jsonschema

root = pathlib.Path(__file__).resolve().parents[1]
checked = []
for name, files in {
    "request": ["utc-window.json", "local-fold-proposal.json"],
    "result": ["rc10-finite-preview.json"],
}.items():
    schema = json.loads((root / "schemas" / f"{name}.schema.json").read_text())
    jsonschema.Draft202012Validator.check_schema(schema)
    validator = jsonschema.Draft202012Validator(schema)
    for filename in files:
        validator.validate(json.loads((root / "examples" / filename).read_text()))
        checked.append(filename)
    example = copy.deepcopy(json.loads((root / "examples" / files[0]).read_text()))
    container, key = (example["model"], "engineCommit") if name == "request" else (example["provenance"], "assertedEngineCommit")
    container[key] = None
    validator.validate(example)
    container[key] = "unknown"
    assert not validator.is_valid(example), "Unknown ancestry must use null, not a misleading placeholder string"
print(f"jsonschema {importlib.metadata.version('jsonschema')}: 2 schemas and {len(checked)} examples valid; nullable ancestry accepted and placeholder string rejected")
