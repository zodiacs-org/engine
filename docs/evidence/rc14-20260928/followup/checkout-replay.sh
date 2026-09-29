#!/usr/bin/env bash
# The second review of the rebuilt rc.14 steered the check at b221534 from the
# checkout it ran in. Replayed on real history: in a throwaway clone of
# b221534, a new commit changes engine code under 0.1.1-rc.14, so the honest
# verdict is a failure. Then, in the clone, outside its git objects:
#
#   C. a git in node_modules/.bin that checks out HEAD's parent when asked
#      for HEAD (run with npm run archive:binding, which puts it on PATH);
#   N. an .npmrc whose node-options loads a hook into the build that writes
#      dist/ from the carried archive (npm run archive:binding);
#   T. TMPDIR inside the clone, and a node in node_modules/.bin that does the
#      same when it runs tsup (run with node directly);
#   H. a post-checkout hook in .git that puts HEAD's parent's sources back
#      (run with node directly).
#
# Each case runs b221534's check and then this checkout's. npm run runs the
# clone's scripts/verify-archive-binding.mjs, so that file is b221534's for
# the first run and this checkout's for the second; the check reads git
# objects, which that swap does not touch.
#
# usage: checkout-replay.sh <engine checkout>
set -u
ENGINE=$(cd "$1" && pwd)
CLONE=$(mktemp -d "${TMPDIR:-/tmp}/zodiacs-checkout-replay-XXXXXX")
trap 'rm -rf "$CLONE"' EXIT
g() { git -C "$CLONE" -c user.name=Replay -c user.email=replay@example.invalid -c commit.gpgsign=false "$@"; }
git clone -q --no-local "$ENGINE" "$CLONE"
g checkout -q -B replay b221534e75842c9d7e589c456ed57957844cd06b
sed -i 's/return "New Moon";/return "Full Moon";/' "$CLONE/src/api.ts"
g commit -q -am "Change the engine under 0.1.1-rc.14"
HEAD_COMMIT=$(g rev-parse HEAD)
echo "HEAD: $(g log --oneline -1) (engine code changed under 0.1.1-rc.14; its parent is the carrier b221534)"
OLD=$(mktemp -d "${TMPDIR:-/tmp}/zodiacs-checkout-replay-old-XXXXXX")
trap 'rm -rf "$CLONE" "$OLD"' EXIT
g show b221534:scripts/verify-archive-binding.mjs > "$OLD/verify-archive-binding.mjs"
mkdir -p "$CLONE/node_modules/.bin"
COPY='rm -rf dist && mkdir -p dist && git show HEAD:artifacts/zodiacs-engine-0.1.1-rc.14.tgz | tar -xzf - -C dist --strip-components=2 package/dist'
REAL_GIT=$(command -v git)
REAL_NODE=$(command -v node)
use() { cp "$1" "$CLONE/scripts/verify-archive-binding.mjs"; }
show() { cut -c1-240 | grep -E '::error|byte-identical to a rebuild of HEAD|recorded archives|failure|package/dist|Running the check'; }
npmrun() {
  echo "-- npm run archive:binding, with the check of $1"
  use "$2"
  (cd "$CLONE" && npm run --silent archive:binding 2>&1) | sed "s|$CLONE|<clone>|g" | show; echo "exit=${PIPESTATUS[0]}"
}
direct() {
  local label=$1 script=$2; shift 2
  echo "-- node <the check of $label> --root <clone>${*:+, with $*}" | sed "s|$CLONE|<clone>|g"
  (cd "$CLONE" && env "$@" node "$script" --root "$CLONE" 2>&1) | sed "s|$CLONE|<clone>|g" | show; echo "exit=${PIPESTATUS[0]}"
}
both() {
  "$1" b221534 "$OLD/verify-archive-binding.mjs" "${@:2}"
  "$1" "this checkout" "$ENGINE/scripts/verify-archive-binding.mjs" "${@:2}"
  g checkout -q -- scripts/verify-archive-binding.mjs
}

echo; echo "#### Control: nothing planted"
direct b221534 "$OLD/verify-archive-binding.mjs"
direct "this checkout" "$ENGINE/scripts/verify-archive-binding.mjs"

echo; echo "#### C. A git in node_modules/.bin that checks out HEAD's parent when asked for HEAD"
cat > "$CLONE/node_modules/.bin/git" <<SHIM
#!/bin/sh
echo "\$*" >> "$CLONE/node_modules/.git-shim.log"
if [ "\$1" = worktree ] && [ "\$2" = add ] && [ "\$5" = "$HEAD_COMMIT" ]; then exec "$REAL_GIT" worktree add --detach "\$4" "$HEAD_COMMIT^"; fi
exec "$REAL_GIT" "\$@"
SHIM
chmod +x "$CLONE/node_modules/.bin/git"
echo "git status: $(g status --porcelain | wc -l) changed paths"
ran() { [ -f "$CLONE/node_modules/.git-shim.log" ] && wc -l < "$CLONE/node_modules/.git-shim.log" || echo 0; }
npmrun b221534 "$OLD/verify-archive-binding.mjs"
echo "the planted git ran $(ran) times"; rm -f "$CLONE/node_modules/.git-shim.log"
npmrun "this checkout" "$ENGINE/scripts/verify-archive-binding.mjs"
echo "the planted git ran $(ran) times"; g checkout -q -- scripts/verify-archive-binding.mjs
rm -f "$CLONE/node_modules/.bin/git" "$CLONE/node_modules/.git-shim.log"

echo; echo "#### N. An .npmrc whose node-options loads a hook that writes dist/ from the carried archive into tsup's run"
cat > "$CLONE/node_modules/.hook.cjs" <<HOOK
require("node:fs").appendFileSync("$CLONE/node_modules/.hook.log", \`\${process.argv[1]}\n\`);
if (/tsup/u.test(process.argv[1] ?? "")) {
  require("node:child_process").execSync("$COPY");
  process.exit(0);
}
HOOK
echo "node-options=--require $CLONE/node_modules/.hook.cjs" > "$CLONE/.npmrc"
echo "git status: $(g status --porcelain | tr '\n' ' ')"
echo "-- npm run archive:binding, with the check of b221534"
use "$OLD/verify-archive-binding.mjs"; : > "$CLONE/node_modules/.hook.log"
(cd "$CLONE" && npm run --silent archive:binding 2>&1) | sed "s|$CLONE|<clone>|g" | show; echo "exit=${PIPESTATUS[0]}"
echo "the hook ran in: $(sed "s|$CLONE|<clone>|; s|.*/node_modules/|<...>/node_modules/|" "$CLONE/node_modules/.hook.log" | sort | uniq -c | tr -s ' ' | paste -sd';')"
echo "-- npm run archive:binding, with the check of this checkout"
use "$ENGINE/scripts/verify-archive-binding.mjs"; : > "$CLONE/node_modules/.hook.log"
(cd "$CLONE" && npm run --silent archive:binding 2>&1) | sed "s|$CLONE|<clone>|g" | show; echo "exit=${PIPESTATUS[0]}"
echo "the hook ran in: $(sed "s|$CLONE|<clone>|" "$CLONE/node_modules/.hook.log" | sort | uniq -c | tr -s ' ' | paste -sd';')"
g checkout -q -- scripts/verify-archive-binding.mjs
rm -f "$CLONE/.npmrc" "$CLONE/node_modules/.hook.cjs" "$CLONE/node_modules/.hook.log"

echo; echo "#### T. TMPDIR inside the clone, and a node in node_modules/.bin that writes dist/ from the carried archive when it runs tsup"
cat > "$CLONE/node_modules/.bin/node" <<SHIM
#!/bin/sh
case "\$1" in *tsup*) $COPY; exit 0 ;; esac
exec "$REAL_NODE" "\$@"
SHIM
chmod +x "$CLONE/node_modules/.bin/node"
mkdir -p "$CLONE/.tmp"
echo "git status: $(g status --porcelain | tr '\n' ' ')"
both direct TMPDIR="$CLONE/.tmp"
rm -rf "$CLONE/.tmp" "$CLONE/node_modules/.bin/node"

echo; echo "#### H. A post-checkout hook in .git that puts HEAD's parent's sources back"
cat > "$CLONE/.git/hooks/post-checkout" <<HOOK
#!/bin/sh
touch "$CLONE/node_modules/.hook-ran"
git checkout HEAD^ -- src 2>/dev/null
exit 0
HOOK
chmod +x "$CLONE/.git/hooks/post-checkout"
echo "git status: $(g status --porcelain | wc -l) changed paths"
direct b221534 "$OLD/verify-archive-binding.mjs"
echo "the hook ran: $( [ -f "$CLONE/node_modules/.hook-ran" ] && echo yes || echo no)"; rm -f "$CLONE/node_modules/.hook-ran"
direct "this checkout" "$ENGINE/scripts/verify-archive-binding.mjs"
echo "the hook ran: $( [ -f "$CLONE/node_modules/.hook-ran" ] && echo yes || echo no)"
