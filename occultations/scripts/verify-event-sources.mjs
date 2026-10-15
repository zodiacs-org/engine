import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Explicit online audit only. Nothing is executed from, or written by, a source.
// Large historical documents are streamed rather than saved to the checkout.
const register = JSON.parse(readFileSync(new URL("../test/fixtures/events/sources.json", import.meta.url), "utf8"));
const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === "--source"),
  "usage: node scripts/verify-event-sources.mjs [--source ID]");
const sources = args.length ? register.sources.filter((source) => source.id === args[1]) : register.sources;
assert(sources.length > 0, "no matching reference source");
for (const source of sources) {
  if (!source.verification) {
    console.log(`${source.id}: manual review only; ${source.verificationNote}`);
    continue;
  }
  const { bytes, sha256, normalization, normalizedBytes, normalizedSha256 } = source.verification;
  assert(normalization === undefined || normalization === "naoj-conjunction-illustration-v1"
    || normalization === "naoj-contact-illustration-v1",
    "unknown source normalization");
  let { url } = source.verification;
  if (source.verification.mode === "naoj-map") {
    // The server assigns an ephemeral map filename. Discover it anew without
    // storing the wrapper HTML or invoking any map provider's script/service.
    const wrapper = await fetch(source.verification.queryUrl, { signal: AbortSignal.timeout(30_000) });
    assert(wrapper.ok, `${source.id}: cannot request published map`);
    const html = await wrapper.text();
    assert(html.length < 2_000_000, "unexpected map wrapper size");
    const match = html.match(/(?:\/koyomi)?\/koyomix\/work\/gmaps_\d+\.js/u);
    assert(match, `${source.id}: published map data link missing`);
    url = new URL(match[0].startsWith("/koyomi/") ? match[0] : "/koyomi" + match[0],
      "https://eco.mtk.nao.ac.jp").href;
  }
  assert.equal(new URL(url).protocol, "https:");
  assert(Number.isSafeInteger(bytes) && bytes > 0 && bytes < 64_000_000, "invalid source size");
  assert(/^[a-f0-9]{64}$/u.test(sha256), "invalid source digest");
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  assert(response.ok && response.body, `${source.id}: HTTP ${response.status}`);
  let size = 0;
  const hash = createHash("sha256");
  const chunks = [];
  for await (const chunk of response.body) {
    size += chunk.length;
    assert(size <= (normalization ? 2_000_000 : bytes),
      `${source.id}: upstream grew; inspect changes without replacing the fixture`);
    hash.update(chunk);
    if (normalization) chunks.push(chunk);
  }
  if (normalization) {
    // Only the ephemeral illustration URL varies. Latin-1 round-trips every
    // byte, including the EUC-JP result table; no decoded text is discarded.
    const raw = Buffer.concat(chunks).toString("latin1");
    const pattern = normalization === "naoj-conjunction-illustration-v1"
      ? /\/koyomi\/koyomix\/work\/phenom_conf_\d+\.png/gu
      : /\/koyomi\/koyomix\/work\/pocl_\d+\.png/gu;
    assert.equal([...raw.matchAll(pattern)].length, 1, `${source.id}: expected one illustration filename`);
    const normalized = Buffer.from(raw.replace(pattern, (path) => path.replace(/\d+\.png$/u, "VOLATILE.png")), "latin1");
    assert.equal(normalized.length, normalizedBytes, `${source.id}: normalized source length changed`);
    assert.equal(createHash("sha256").update(normalized).digest("hex"), normalizedSha256,
      `${source.id}: normalized source bytes changed`);
    console.log(`${source.id}: normalized length and SHA-256 verified (illustration filename only)`);
    continue;
  }
  assert.equal(size, bytes, `${source.id}: source length changed`);
  assert.equal(hash.digest("hex"), sha256, `${source.id}: source bytes changed`);
  console.log(`${source.id}: source length and SHA-256 verified`);
}
