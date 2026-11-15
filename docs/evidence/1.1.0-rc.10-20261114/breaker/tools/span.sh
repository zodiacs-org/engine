#!/usr/bin/env bash
set -u
base=/tmp/job9rc-brk; out=$base/out
cd $base/consumer
node probe.mjs intact 1990 "" $out/hash-intact.json > $out/probe-intact-1990.log 2>&1
node probe.mjs intact-ae 1990 ae $out/hash-ae.json > $out/probe-ae-1990.log 2>&1
for y in 1750 2195 2230; do node probe.mjs intact $y > $out/probe-intact-$y.log 2>&1; done
rm -rf $base/dmg-flip-one && cp -r $base/consumer $base/dmg-flip-one && node $base/scripts/damage.mjs $base/dmg-flip-one flip-one >/dev/null
cd $base/dmg-flip-one && node probe.mjs flip-one 1990 "" $out/hash-flip-one.json > $out/probe-flip-one.log 2>&1
node -e '
const r=(n)=>JSON.parse(require("fs").readFileSync(process.argv[1]+"/hash-"+n+".json","utf8"));
const a=r("intact"),b=r("flip-one"),c=r("ae");
for(const k of Object.keys(a)) console.log((a[k]===b[k]?"same-as-intact   ":"DIFFERS-on-damage").padEnd(18),(b[k]===c[k]?"=chosen-AE":"!=chosen-AE").padEnd(12),k);' $out
