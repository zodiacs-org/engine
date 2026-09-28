#!/usr/bin/env bash
# The final rc.14 review's attack D, replayed on real history. In a throwaway
# clone, the second local rc.14 build is carried on its source commit 90d6cdb,
# as the dropped carrier a4ee426 did. Then:
#
#   A. a source commit at version 0.1.1-rc.14+evil that also changes engine
#      code, and a child that carries its archive and puts HEAD's version and
#      code back to rc.14's. npm's semver.eq takes 0.1.1-rc.14+evil for
#      0.1.1-rc.14;
#   B. from the carrier instead, a commit that changes the packed README and
#      sets the version to 0.1.1-rc.14+changed, which no archive is carried for,
#      so the check at 90d6cdb skipped HEAD's rebuild.
#
# The check as it stood at 90d6cdb passes both; this checkout's check must
# fail both, by default and with --rebuild-all.
#
# usage: semver-replay.sh <engine checkout> <the second rc.14 build's .tgz>
set -u
ENGINE=$(cd "$1" && pwd)
SECOND=$2
CLONE=$(mktemp -d "${TMPDIR:-/tmp}/zodiacs-semver-replay-XXXXXX")
OLD=$(mktemp -d "${TMPDIR:-/tmp}/zodiacs-semver-old-XXXXXX")
trap 'rm -rf "$CLONE" "$OLD"' EXIT
g() { git -C "$CLONE" -c user.name=Replay -c user.email=replay@example.invalid -c commit.gpgsign=false "$@"; }
# carry <archive> <version> <source commit>: the archive, its receipt, its manifest entry and README row.
carry() {
  local file="zodiacs-engine-$2.tgz" digest
  cp "$1" "$CLONE/artifacts/$file"
  digest=$(sha256sum < "$1" | cut -c1-64)
  echo "$digest  $file" > "$CLONE/artifacts/zodiacs-engine-$2.sha256"
  node -e '
const fs = require("fs");
const [path, version, file, digest, bytes, source] = process.argv.slice(1);
const manifest = JSON.parse(fs.readFileSync(path, "utf8"));
manifest.archives.push({ version, file, sha256: digest, bytes: Number(bytes), files: 30, sourceCommit: source, status: "carried" });
fs.writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");' "$CLONE/artifacts/archives.json" "$2" "$file" "$digest" "$(wc -c < "$1")" "$3"
  echo "| $2 | \`$digest\` | replayed |" >> "$CLONE/artifacts/README.md"
}
checks() {
  echo "== the check at 90d6cdb, default"
  node "$OLD/verify-archive-binding.mjs" --root "$CLONE" 2>&1 | tail -3; echo "exit=${PIPESTATUS[0]}"
  echo "== the check at 90d6cdb, --rebuild-all"
  node "$OLD/verify-archive-binding.mjs" --root "$CLONE" --rebuild-all 2>&1 | grep -E "rc\.14|recorded archives|failure"; echo "exit=${PIPESTATUS[0]}"
  echo "== this checkout's check, default"
  node "$ENGINE/scripts/verify-archive-binding.mjs" --root "$CLONE" 2>&1; echo "exit=$?"
  echo "== this checkout's check, --rebuild-all"
  node "$ENGINE/scripts/verify-archive-binding.mjs" --root "$CLONE" --rebuild-all 2>&1; echo "exit=$?"
}
git clone -q --no-local "$ENGINE" "$CLONE"
git -C "$CLONE" show 90d6cdba89253d14449e2ab4de05aa58f736e121:scripts/verify-archive-binding.mjs > "$OLD/verify-archive-binding.mjs"
g checkout -q --detach 90d6cdba89253d14449e2ab4de05aa58f736e121
carry "$SECOND" 0.1.1-rc.14 90d6cdba89253d14449e2ab4de05aa58f736e121
g add -A artifacts
g commit -q -m "Carry the second rc.14 build (replay of a4ee426)"
CARRIER=$(g rev-parse HEAD)
echo "replayed carrier: $(g log --oneline -1)"
# The attacker's toolchain, to build the other archive (the checks install their own).
(cd "$CLONE" && npm ci --ignore-scripts --no-audit --no-fund > /dev/null 2>&1) || { echo "npm ci failed"; exit 1; }
echo "npm's semver.eq(\"0.1.1-rc.14+evil\", \"0.1.1-rc.14\"): $(node -e 'console.log(require(process.execPath.replace(/bin\/node$/u, "lib/node_modules/npm/node_modules/semver")).eq("0.1.1-rc.14+evil", "0.1.1-rc.14"))')"

echo
echo "#### A. A second archive under 0.1.1-rc.14+evil, with changed engine code"
node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));p.version="0.1.1-rc.14+evil";fs.writeFileSync(process.argv[1],JSON.stringify(p,null,2)+"\n")' "$CLONE/package.json"
sed -i 's/return "New Moon";/return "Full Moon";/' "$CLONE/src/api.ts"
g commit -q -am "0.1.1-rc.14+evil, with the new-Moon phase renamed"
EVIL=$(g rev-parse HEAD)
PACK=$(mktemp -d "${TMPDIR:-/tmp}/zodiacs-semver-pack-XXXXXX")
(cd "$CLONE" && npm run build > /dev/null 2>&1 && npm pack --ignore-scripts --pack-destination "$PACK" > /dev/null 2>&1) || { echo "the attacker's build failed"; exit 1; }
EVIL_TGZ=$(ls "$PACK"/*.tgz)
echo "source $(g log --oneline -1 | cut -c1-60): packed $(basename "$EVIL_TGZ"), sha256 $(sha256sum < "$EVIL_TGZ" | cut -c1-64), $(wc -c < "$EVIL_TGZ") bytes"
carry "$EVIL_TGZ" 0.1.1-rc.14+evil "$EVIL"
rm -rf "$PACK"
g checkout -q "$CARRIER" -- package.json src/api.ts
g add -A
g commit -q -m "Carry 0.1.1-rc.14+evil; HEAD back to 0.1.1-rc.14"
echo "HEAD: $(g log --oneline -1), version $(node -p 'require(process.argv[1]).version' "$CLONE/package.json")"
checks

echo
echo "#### B. A packed README changed under 0.1.1-rc.14+changed"
g checkout -q --detach "$CARRIER"
node -e 'const fs=require("fs");const p=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));p.version="0.1.1-rc.14+changed";fs.writeFileSync(process.argv[1],JSON.stringify(p,null,2)+"\n")' "$CLONE/package.json"
echo "A line that the carried archive does not pack." >> "$CLONE/README.md"
g commit -q -am "Change the packed README; version 0.1.1-rc.14+changed"
echo "HEAD: $(g log --oneline -1), version $(node -p 'require(process.argv[1]).version' "$CLONE/package.json")"
checks
