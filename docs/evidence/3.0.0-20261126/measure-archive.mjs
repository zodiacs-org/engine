// The sizes of a packed archive that the 3.0.0 release notes give, read from
// the archive itself (gzip and tar, with Node's own modules):
//
//   node docs/evidence/3.0.0-20261126/measure-archive.mjs zodiacs-engine-3.0.0.tgz
//
// It prints one JSON object: the archive's SHA-256 and bytes, its regular
// files and their bytes unpacked, the base64 characters of the DE440 pack in
// package/dist/de440-pack.js and of the minor-body tables in
// package/dist/minor-bodies.js (found as scripts/verify-package-contents.mjs
// finds them), and the rest, the bytes that check holds to its cap.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { gunzipSync } from "node:zlib";

const [path] = process.argv.slice(2);
if (!path) throw new Error("usage: measure-archive.mjs ARCHIVE.tgz");
const CAP = 1_463_000;
const DATA = /"([A-Za-z0-9+/]{1000,}={0,2})"/gu;
const archive = readFileSync(path);
const tar = gunzipSync(archive);
const text = (start, length) => tar.subarray(start, start + length).toString("utf8").replace(/\0.*$/su, "");
const files = new Map();
let pending = null;
for (let offset = 0; offset + 512 <= tar.length; ) {
  if (tar.subarray(offset, offset + 512).every((byte) => byte === 0)) break;
  const size = Number.parseInt(text(offset + 124, 12).trim() || "0", 8);
  const type = text(offset + 156, 1) || "0";
  const prefix = text(offset + 345, 155);
  const name = pending ?? (prefix ? `${prefix}/${text(offset, 100)}` : text(offset, 100));
  const body = tar.subarray(offset + 512, offset + 512 + size);
  pending = null;
  if (type === "x") {
    // A pax header: take its path, if it gives one, for the next entry.
    pending = /(?:^|\n)\d+ path=([^\n]*)\n/u.exec(body.toString("utf8"))?.[1] ?? null;
  } else if (type === "0") {
    files.set(name, body);
  }
  offset += 512 + Math.ceil(size / 512) * 512;
}
const base64In = (name) => [...(files.get(name)?.toString("utf8") ?? "").matchAll(DATA)].reduce((sum, match) => sum + match[1].length, 0);
const unpackedBytes = [...files.values()].reduce((sum, body) => sum + body.length, 0);
const de440PackBase64Bytes = base64In("package/dist/de440-pack.js");
const minorBodyTablesBase64Bytes = base64In("package/dist/minor-bodies.js");
const version = JSON.parse(files.get("package/package.json").toString("utf8")).version;
console.log(
  JSON.stringify(
    {
      archive: basename(path),
      version,
      sha256: createHash("sha256").update(archive).digest("hex"),
      bytes: archive.length,
      files: files.size,
      unpackedBytes,
      de440PackBase64Bytes,
      minorBodyTablesBase64Bytes,
      restBytes: unpackedBytes - de440PackBase64Bytes - minorBodyTablesBase64Bytes,
      cap: CAP
    },
    null,
    2
  )
);
