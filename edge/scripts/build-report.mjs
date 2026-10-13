// Compact reproducible build evidence. Raw bundles and metadata stay ignored.
import { FILE_LIMIT, TARGETS } from "../build.config.mjs";
import { buildTarget } from "./build-bundles.mjs";

const builds = [];
for (const target of Object.keys(TARGETS)) {
  const { manifest } = await buildTarget(target, { write: false });
  builds.push(manifest);
}
const first = builds[0];
console.log(JSON.stringify({
  schema: "edge-bundle-report/1",
  scope: "Root API, synthetic workloads and Workers, Deno and Bun HTTP builds; this report measures builds only.",
  engineVersion: first.engineVersion,
  ephemeris: first.ephemeris,
  toolchain: first.toolchain,
  fileLimitExclusiveBytes: FILE_LIMIT,
  builds: builds.map(({ target, sourceDigest, outputs }) => ({ target, sourceDigest, outputs }))
}, null, 2));
