import assert from "node:assert/strict";
import { createHash } from "node:crypto";

/** Single-record CSV parser; quoted commas and escaped quotes are retained. */
export function parseCsvLine(line) {
  assert(!/[\r\n]/u.test(line), "multiline CSV records are unsupported");
  const fields = [];
  let cursor = 0;
  while (cursor <= line.length) {
    let field = "";
    if (line[cursor] === '"') {
      cursor++;
      let closed = false;
      while (cursor < line.length) {
        const char = line[cursor++];
        if (char !== '"') field += char;
        else if (line[cursor] === '"') { field += '"'; cursor++; }
        else { closed = true; break; }
      }
      assert(closed, "unterminated CSV quote");
      assert(cursor === line.length || line[cursor] === ",", "unexpected text after CSV quote");
    } else {
      while (cursor < line.length && line[cursor] !== ",") {
        assert(line[cursor] !== '"', "quote in unquoted CSV field");
        field += line[cursor++];
      }
    }
    fields.push(field);
    if (cursor === line.length) break;
    cursor++;
  }
  return fields;
}

/** Stream, hash and retain only requested records. No bulk download on disk. */
export async function selectHyg(resource, selections, fetchImplementation = fetch) {
  const wanted = new Set(selections.map(({ hip }) => hip));
  assert(wanted.size === selections.length, "duplicate selected HIP id");
  for (const hip of wanted) assert(/^[1-9]\d*$/u.test(hip), "invalid selected HIP id");
  const response = await fetchImplementation(resource.url, { signal: AbortSignal.timeout(60_000) });
  assert(response.ok && response.body, "HYG source unavailable");
  const hash = createHash("sha256");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const rows = new Map();
  let pending = "";
  let header;
  let bytes = 0;
  function accept(line) {
    line = line.replace(/\r$/u, "");
    assert(line.length <= 16_384, "CSV record exceeds budget");
    if (!header) {
      assert.equal(line, resource.csvHeader, "HYG header changed");
      header = parseCsvLine(line);
      assert(header.includes("id") && header.includes("hip"), "HYG identifiers missing");
      return;
    }
    if (!line) return;
    const fields = parseCsvLine(line);
    assert.equal(fields.length, header.length, "HYG field count changed");
    const row = Object.fromEntries(header.map((key, i) => [key, fields[i]]));
    if (wanted.has(row.hip)) {
      assert(!rows.has(row.hip), "duplicate HYG HIP row");
      rows.set(row.hip, { id: row.id, hip: row.hip, line });
    }
  }
  for await (const chunk of response.body) {
    hash.update(chunk);
    bytes += chunk.byteLength;
    assert(bytes <= resource.maximumBytes, "HYG download exceeds budget");
    pending += decoder.decode(chunk, { stream: true });
    let end;
    while ((end = pending.indexOf("\n")) >= 0) {
      accept(pending.slice(0, end));
      pending = pending.slice(end + 1);
    }
    assert(pending.length <= 16_384, "CSV record exceeds budget");
  }
  pending += decoder.decode();
  if (pending) accept(pending);
  assert(header, "HYG header missing");
  assert.equal(hash.digest("hex"), resource.sha256, "HYG source digest changed");
  assert.equal(rows.size, wanted.size, "selected HYG row missing");
  return {
    schema: "fixedstars-hyg-selection/1",
    license: "CC-BY-SA-4.0",
    attribution: "HYG Database v4.1, David Nash / Astronexus; https://creativecommons.org/licenses/by-sa/4.0/; see NOTICE.txt and sources/manifest.json. No endorsement implied.",
    changes: "Selected HIP-backed rows only; header and original CSV records retained without coordinate conversion in this fixture.",
    sourceId: "hyg-v41",
    sourceSha256: resource.sha256,
    sourceBytes: bytes,
    header: resource.csvHeader,
    rows: selections.map(({ hip }) => rows.get(hip))
  };
}
