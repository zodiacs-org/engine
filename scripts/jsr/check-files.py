"""Check the fixed rc.16 staging inventory, including rejection of extra files."""
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1]).resolve()
expected = json.loads(pathlib.Path(__file__).with_name('expected-files.json').read_text())
if sys.argv[2:] == ['--with-dependency']:
    dependency = json.loads(pathlib.Path(__file__).with_name('expected-dependency-files.json').read_text())
    expected.update({'node_modules/astronomy-engine/' + name: digest for name, digest in dependency.items()})
elif sys.argv[2:]:
    raise SystemExit('unknown inventory option')
actual = {}
for path in sorted(root.rglob('*')):
    if path.is_symlink():
        raise SystemExit('symlinks are forbidden in the staged package')
    if path.is_file():
        actual[path.relative_to(root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
if actual != expected:
    raise SystemExit('staged files differ from the reviewed 103-file inventory')
print(json.dumps({'files': len(actual), 'exactReviewedInventory': True}, sort_keys=True))
