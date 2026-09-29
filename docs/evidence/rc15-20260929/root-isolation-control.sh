#!/bin/sh
# Negative controls for the export smoke test's check that the root entry
# reaches no timing, Vedic or geo module (scripts/root-isolation.mjs). Each
# case is a copy of the checkout whose root entry imports one opt-in module
# without exporting any of its names; `node scripts/module-resolution-smoke.mjs`
# must fail naming the module, and the unchanged copy must pass:
#
# 1. src/timing/rulers.ts, as the rc.15 check was tested;
# 2. the same module renamed src/timing/rulers.mts, the bypass a review of
#    rc.15 found: the rc.15 check read only `// src/<path>.ts` markers;
# 3. a Vedic module whose file name has a space, src/vedic/space name.ts.
#
#   sh root-isolation-control.sh <checkout> <scratch directory>
set -u
checkout=$1
scratch=$2
fresh() {
  rm -rf "$scratch" && mkdir -p "$scratch"
  (cd "$checkout" && git ls-files -z | xargs -0 -I{} cp --parents {} "$scratch"/)
  ln -s "$checkout/node_modules" "$scratch/node_modules"
}
smoke() {
  npm run build > build.log 2>&1 || { echo "build failed"; exit 2; }
  node scripts/module-resolution-smoke.mjs > smoke.log 2>&1
  status=$?
  grep -o "the root entry reaches .*" smoke.log || tail -1 smoke.log
  echo "exit $status"
}
root_imports() {
  printf '\nimport { %s } from "%s";\n/** A negative control only. */\nexport const CONTROL = %s;\n' "$1" "$2" "$1" >> src/index.ts
}

echo "## 1. root imports src/timing/rulers.ts"
fresh && cd "$scratch"
root_imports TRADITIONAL_RULERS ./timing/rulers.js
smoke

echo "## 2. root imports src/timing/rulers.mts (the review's bypass)"
fresh && cd "$scratch"
mv src/timing/rulers.ts src/timing/rulers.mts
grep -rl 'rulers\.js"' src | xargs sed -i 's#rulers\.js"#rulers.mjs"#g'
root_imports TRADITIONAL_RULERS ./timing/rulers.mjs
smoke
grep -h '^// src/timing/rulers.mts' dist/*.js | head -1

echo "## 3. root imports src/vedic/space name.ts"
fresh && cd "$scratch"
printf '/** A negative control only. */\nexport const SPACED = 1;\n' > "src/vedic/space name.ts"
root_imports SPACED "./vedic/space name.js"
smoke
grep -h '^// src/vedic/space name.ts' dist/*.js | head -1

echo "## 4. unchanged"
fresh && cd "$scratch"
smoke
