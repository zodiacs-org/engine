/*
 * Writes a receipt with "host-zone-data-differs" on this branch's build and
 * reads it with a carried archive's codec: an engine that does not know the
 * flag must refuse the record, not misread it.
 *
 *   npm run build
 *   tar -xzf artifacts/zodiacs-engine-<version>.tgz -C <dir>   # node_modules beside <dir>/package
 *   node docs/evidence/host-zone-probes-20261117/tools/earlier-readers.mjs <dir>/package <version>
 *
 * Run on a host whose tzdb differs from 2026f for Cuba (2026e and earlier), so
 * the real Intl flags the synthetic wall time.
 */
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [archive, label] = process.argv.slice(2);
const branch = (file) => import(pathToFileURL(resolve("dist", file)).href);
const [geo, root, receipt] = await Promise.all([branch("geo.js"), branch("index.js"), branch("receipt.js")]);
const old = await import(pathToFileURL(resolve(archive, "dist/receipt.js")).href);
const resolved = geo.resolveLocalBirth({ date: "2026-12-15", time: "12:00", timeZone: "America/Havana", latitude: 23.1, longitude: -82.4 });
const envelope = receipt.createNatalEnvelope(root.natalChart(resolved.birth), { localResolution: resolved.resolution.localResolution });
const text = JSON.stringify(envelope);
console.log(
  JSON.stringify({
    host_tz: process.versions.tz,
    inputFlags: envelope.receipt.inputFlags,
    branch: receipt.parseNatalEnvelope(text).ok,
    [label]: old.parseNatalEnvelope(text)
  })
);
