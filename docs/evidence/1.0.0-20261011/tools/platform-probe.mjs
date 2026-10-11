// platform-probe-lib.mjs in Node, on the checkout's dist/:
//
//   node platform-probe.mjs <engine checkout> > <file>
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { probe } from "./platform-probe-lib.mjs";

const root = process.argv[2];
if (!root) throw new Error("usage: node platform-probe.mjs <engine checkout>");
const load = (name) => import(pathToFileURL(`${root}/dist/${name}.js`).href);
const [calcEntry, techniques, internal, index] = await Promise.all([load("calc"), load("techniques"), load("internal"), load("index")]);
const json = (path) => JSON.parse(readFileSync(`${root}/${path}`, "utf8"));
const result = probe({
  runtime: { engine: "V8", node: process.version, platform: process.platform, arch: process.arch },
  packageApi: { ...calcEntry, techniques, bodyLongitude: internal.bodyLongitude, matchAspect: index.matchAspect },
  fixtures: {
    calcRoundtrip: json("src/fixtures/calc-roundtrip.json"),
    returns: json("src/techniques/fixtures/site-parity/returns.json"),
    voidOfCourse: json("src/techniques/fixtures/site-parity/void-of-course.json"),
  },
});
console.log(JSON.stringify(result, null, 1));
