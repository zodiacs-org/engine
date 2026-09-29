#!/bin/sh
# Mutation checks for the invented charts that replace people's birth data
# in the timing tests. Each mutation puts back one defect the replaced tests
# guard against; a replacement test must fail under every mutation its old
# test failed under, and the unmutated copy must pass. The tests they replace
# run beside them from d90a00a, found by describe block and position so that
# their titles, which name the people, are not repeated here:
#
#   signs    annual profections of given ascendants and ages
#   dated    dated profections of untimed births either side of a birthday
#   capri    zodiacal releasing from Spirit in Scorpio into Capricorn's
#            loosing of the bond
#   211      the loosing of the bond 211 months into Virgo and Aquarius
#
#   sh birth-data-mutations.sh <checkout> <scratch directory>
#
# d90a00a, the first cut's source commit, is a local commit that was never
# pushed: its tests held the birth data these invented charts replace, and the
# history was rebuilt before its first push so that no commit carries it
# (README.md, *The published history*). The script runs only where that
# commit exists; birth-data-mutations.txt is the record of its run.
set -u
checkout=$1
scratch=$2
rm -rf "$scratch" && mkdir -p "$scratch"
(cd "$checkout" && git ls-files -z | xargs -0 -I{} cp --parents {} "$scratch"/)
ln -s "$checkout/node_modules" "$scratch/node_modules"
cd "$scratch" || exit 2
git -C "$checkout" show d90a00a:src/timing/profections.test.ts > src/timing/old-profections.test.ts
git -C "$checkout" show d90a00a:src/timing/releasing.test.ts > src/timing/old-releasing.test.ts
files="src/timing/profections.test.ts src/timing/releasing.test.ts src/timing/old-profections.test.ts src/timing/old-releasing.test.ts"

cat > report.mjs <<'EOF'
import { readFileSync } from "node:fs";
const [label, path] = process.argv.slice(2);
const results = JSON.parse(readFileSync(path, "utf8")).testResults;
const tests = (file) => results.find((result) => result.name.endsWith(`/src/timing/${file}`))?.assertionResults ?? [];
const status = (row) => (row ? (row.status === "passed" ? "pass" : "FAIL") : "missing");
const nth = (file, describe, index) => status(tests(file).filter((row) => row.ancestorTitles[0] === describe)[index]);
const titled = (file, title) => status(tests(file).find((row) => row.title === title));
const old = [
  ["signs", nth("old-profections.test.ts", "annual profections: published worked examples", 1)],
  ["dated", nth("old-profections.test.ts", "dated profections", 0)],
  ["capri", nth("old-releasing.test.ts", "zodiacal releasing: Brennan and Schaim's published timelines", 0)],
  ["211", nth("old-releasing.test.ts", "zodiacal releasing: Brennan and Schaim's published timelines", 1)]
];
const next = [
  ["signs", titled("profections.test.ts", "invented charts: the sign, lord and house of the year, counted by hand")],
  ["dated", titled("profections.test.ts", "turn at the solar return: invented untimed births, days either side of a birthday")],
  ["capri", titled("releasing.test.ts", "an invented birth with Spirit in Scorpio: Capricorn from 27 years, its loosing of the bond to Cancer")],
  ["211", titled("releasing.test.ts", "an invented birth with Spirit in Virgo and Fortune in Aquarius: both loosen 211 months in, 17.3 years")]
];
const line = (rows) => rows.map(([name, value]) => `${name} ${value}`).join(", ");
const weaker = old.filter(([name, value], index) => value === "FAIL" && next[index][1] !== "FAIL").map(([name]) => name);
console.log(`${label}\n  d90a00a: ${line(old)}\n  invented: ${line(next)}${weaker.length ? `\n  NOT CAUGHT by the replacement: ${weaker.join(", ")}` : ""}`);
EOF

run() {
  label=$1
  file=$2
  expression=$3
  if [ -n "$file" ]; then
    sed -i "$expression" "$file"
    if cmp -s "$checkout/$file" "$file"; then echo "$label: the mutation did not apply"; exit 2; fi
  fi
  npx vitest run $files --reporter=json --outputFile=result.json > vitest.log 2>&1
  node report.mjs "$label" result.json
  if [ -n "$file" ]; then cp "$checkout/$file" "$file"; fi
}

run "none (control)" "" ""
run "house counted one short (placeFrom)" src/timing/shared.ts 's/((((offset % 12) + 12) % 12) + 1)/((((offset % 12) + 11) % 12) + 1)/'
run "sign one ahead (annualProfection)" src/timing/profections.ts 's/signAt(start.index + (years % 12))/signAt(start.index + ((years + 1) % 12))/'
run "age counted from one (solar-return years)" src/timing/solar-years.ts 's/return { age, start: returnMs(age), end: returnMs(age + 1) };/return { age: age + 1, start: returnMs(age), end: returnMs(age + 1) };/'
run "Scorpio ruled by Pluto" src/timing/rulers.ts 's/scorpio: "Mars",/scorpio: "Pluto",/'
run "365.25-day years by default" src/timing/releasing.ts 's/"valens-360": 18_000_000,/"valens-360": 18_262_500,/'
run "30.4375-day months" src/timing/releasing.ts 's/{ 1: 1728, 2: 144, 3: 12, 4: 1 }/{ 1: 1728, 2: 146.1, 3: 12, 4: 1 }/'
run "loosing after eleven signs" src/timing/releasing.ts 's/if (!loosed \&\& emitted === 12) {/if (!loosed \&\& emitted === 11) {/'
run "loosing to the sign after the opposite" src/timing/releasing.ts 's/sign = (span.sign + 6) % 12;/sign = (span.sign + 7) % 12;/'
run "no loosing of the bond" src/timing/releasing.ts 's/if (!loosed \&\& emitted === 12) {/if (false) {/'
