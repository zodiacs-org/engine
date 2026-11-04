# The control of check L12 (../PREREGISTRATION.md, section 3): the packed
# consumer must fail on a package whose "exports" lack ./lite. This writes a
# copy of scripts/verify-packed-consumer.mjs that, right after it installs the
# archive, deletes "./lite" from the installed package.json's "exports", so
# that the consumer's typed import of @zodiacs/engine/lite cannot resolve; run
# the copy as the script itself is run, with the archive, and it must exit
# non-zero naming @zodiacs/engine/lite. No archive is made or changed.
#
#   python3 -I consumer-control.py <engine checkout> <out .mjs>
#   node <out .mjs> /absolute/path/to/zodiacs-engine-<version>.tgz
#
# With --local <extracted package dir>, the copy installs nothing from the
# network: it copies that package and the checkout's astronomy-engine into the
# consumer and links the checkout's TypeScript, for a trial before the
# evidence run.
import json
import sys

args = sys.argv[1:]
local = None
if "--local" in args:
    at = args.index("--local")
    local = args[at + 1]
    del args[at:at + 2]
checkout, out = args
text = open(f"{checkout}/scripts/verify-packed-consumer.mjs", encoding="utf8").read()


def replace(old, new):
    global text
    if text.count(old) != 1:
        raise SystemExit(f"scripts/verify-packed-consumer.mjs no longer holds, once: {old[:60]}")
    text = text.replace(old, new)


replace('const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));',
        f'const manifest = JSON.parse(readFileSync({json.dumps(checkout + "/package.json")}, "utf8"));')
install = '''run("npm", [
  "install",
  "--ignore-scripts",
  "--no-audit",
  "--no-fund",
  artifact,
  "typescript@5.9.3"
]);'''
if local is None:
    installed = install
else:
    replace('import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";',
            'import { cpSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";')
    installed = f'''cpSync({json.dumps(local)}, join(directory, "node_modules/@zodiacs/engine"), {{ recursive: true }});
cpSync({json.dumps(checkout + "/node_modules/astronomy-engine")}, join(directory, "node_modules/astronomy-engine"), {{ recursive: true }});
symlinkSync({json.dumps(checkout + "/node_modules/typescript")}, join(directory, "node_modules/typescript"));'''
replace(install, installed + '''
// The control: the installed package's "exports" without ./lite.
{
  const path = join(directory, "node_modules/@zodiacs/engine/package.json");
  const installedManifest = JSON.parse(readFileSync(path, "utf8"));
  if (!installedManifest.exports["./lite"]) throw new Error("the archive exports no ./lite to remove");
  delete installedManifest.exports["./lite"];
  writeFileSync(path, JSON.stringify(installedManifest, null, 2));
}''')
open(out, "w", encoding="utf8").write(text)
print(f"wrote {out}")
