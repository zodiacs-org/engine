import { createHash, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import type { IncomingMessage } from "node:http";

export const MAX_TOKEN_BYTES = 4096;
export type BearerAuthSource =
  | { tokenEnv: string; tokenFile?: never }
  | { tokenFile: string; tokenEnv?: never };

const tokenPattern = /^[A-Za-z0-9._~+/-]+=*$/;
const invalidSource = () => new Error("Invalid HTTP authentication configuration.");
const digest = (token: string) => createHash("sha256").update(token, "utf8").digest();

async function readTokenFile(path: string): Promise<string> {
  // Nonblocking open also lets the regular-file check reject FIFOs without waiting.
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    if (!(await file.stat()).isFile()) throw invalidSource();
    // Room for a terminal CRLF and one byte to detect an oversized source.
    const bytes = Buffer.alloc(MAX_TOKEN_BYTES + 3);
    let length = 0;
    while (length < bytes.length) {
      const { bytesRead } = await file.read(bytes, length, bytes.length - length, null);
      if (bytesRead === 0) break;
      length += bytesRead;
    }
    if (length === bytes.length) throw invalidSource();
    return bytes.subarray(0, length).toString("utf8").replace(/\r?\n$/, "");
  } finally { await file.close(); }
}

/** Load once before listening. Retain only a digest and never expose source errors. */
export async function createBearerAuthenticator(source: BearerAuthSource): Promise<(request: IncomingMessage) => boolean> {
  let expected: Buffer;
  try {
    if (!source || typeof source !== "object" || Object.keys(source).length !== 1) throw invalidSource();
    let token: string | undefined;
    if ("tokenEnv" in source && typeof source.tokenEnv === "string" && source.tokenEnv.trim() === source.tokenEnv && /^[A-Za-z_][A-Za-z0-9_]*$/.test(source.tokenEnv)) {
      token = process.env[source.tokenEnv];
    } else if ("tokenFile" in source && typeof source.tokenFile === "string" && source.tokenFile.length > 0) {
      token = await readTokenFile(source.tokenFile);
    } else throw invalidSource();
    if (!token || token.trim() !== token || Buffer.byteLength(token, "utf8") > MAX_TOKEN_BYTES || !tokenPattern.test(token)) throw invalidSource();
    expected = digest(token);
  } catch { throw invalidSource(); }

  return (request) => {
    // Node can discard duplicate Authorization values in the normalized headers.
    let count = 0;
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      if (request.rawHeaders[index]!.toLowerCase() === "authorization") count++;
    }
    const header = request.headers.authorization;
    if (count !== 1 || !header || header.length > MAX_TOKEN_BYTES + 7) return false;
    const match = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/i.exec(header);
    // Fixed-length digests avoid length-dependent credential comparisons.
    return !!match && timingSafeEqual(expected, digest(match[1]!));
  };
}
