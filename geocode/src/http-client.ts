import { isIP } from "node:net";

export const PROXY_LIMITS = Object.freeze({ trustedAddresses: 256, forwardedAddresses: 32 });

/** Exact IP literals only. Canonical IPv6 and mapped IPv4 share bucket keys. */
export function normalizeClientIp(value: string): string {
  if (typeof value !== "string" || value.trim() !== value || value.includes("%") || !isIP(value)) {
    throw new RangeError("Expected an IP address literal.");
  }
  if (isIP(value) === 4) return value;
  const canonical = new URL(`http://[${value}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/u.exec(canonical);
  if (!mapped) return canonical;
  const high = parseInt(mapped[1]!, 16);
  const low = parseInt(mapped[2]!, 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}

export function createClientIdentifier(trustedProxies: readonly string[] = []) {
  if (!Array.isArray(trustedProxies) || trustedProxies.length > PROXY_LIMITS.trustedAddresses) {
    throw new RangeError("Expected a bounded list of trusted proxy IP literals.");
  }
  const trusted = new Set(trustedProxies.map(normalizeClientIp));
  return (peer: string, rawHeaders: readonly string[]): string => {
    let client = normalizeClientIp(peer);
    // Ignore all forwarding claims from an untrusted immediate peer.
    if (!trusted.has(client)) return client;
    const fields: string[] = [];
    for (let index = 0; index < rawHeaders.length; index += 2) {
      if (rawHeaders[index]!.toLowerCase() === "x-forwarded-for") fields.push(rawHeaders[index + 1]!);
    }
    if (!fields.length) return client;
    if (fields.length !== 1) throw new RangeError("Invalid forwarded address header.");
    const addresses = fields[0]!.split(",");
    if (addresses.length > PROXY_LIMITS.forwardedAddresses) throw new RangeError("Forwarded chain exceeds the limit.");
    const chain = addresses.map((address) => normalizeClientIp(address.trim()));
    for (let index = chain.length - 1; index >= 0 && trusted.has(client); index -= 1) client = chain[index]!;
    return client;
  };
}
