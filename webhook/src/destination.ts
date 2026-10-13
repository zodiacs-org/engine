import { isIP } from "node:net";

// Conservative service policy, informed by IANA's special-purpose registries.
// Even globally reachable exceptions within these blocks remain disallowed.
const IPV4_DENY = [
  "0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8",
  "169.254.0.0/16", "172.16.0.0/12", "192.0.0.0/24", "192.0.2.0/24",
  "192.31.196.0/24", "192.52.193.0/24", "192.88.99.0/24", "192.168.0.0/16",
  "192.175.48.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24",
  "224.0.0.0/4", "240.0.0.0/4",
  // Azure's host virtual endpoint is publicly numbered but is infrastructure.
  "168.63.129.16/32",
];
const IPV6_DENY = ["2001::/23", "2001:db8::/32", "2002::/16", "2620:4f:8000::/48", "3fff::/20"];

function ipv4Number(address: string): bigint {
  return address.split(".").reduce((value, part) => (value << 8n) | BigInt(part), 0n);
}

function ipv6Number(address: string): bigint {
  let text = address;
  if (text.includes(".")) {
    const colon = text.lastIndexOf(":");
    const tail = ipv4Number(text.slice(colon + 1));
    text = text.slice(0, colon + 1) + (tail >> 16n).toString(16) + ":" + (tail & 65535n).toString(16);
  }
  const halves = text.split("::");
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves[1] ? halves[1].split(":") : [];
  const parts = halves.length === 1 ? left : [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right];
  return parts.reduce((value, part) => (value << 16n) | BigInt(`0x${part}`), 0n);
}

function inBlock(value: bigint, cidr: string, bits: number): boolean {
  const [base, prefix] = cidr.split("/");
  const shift = BigInt(bits - Number(prefix));
  const block = bits === 32 ? ipv4Number(base!) : ipv6Number(base!);
  return (value >> shift) === (block >> shift);
}

/** No zone identifiers, mapped IPv4, translation or tunnel destinations. */
export function isPublicAddress(address: unknown): address is string {
  if (typeof address !== "string" || address.includes("%")) return false;
  const family = isIP(address);
  if (family === 4) {
    const value = ipv4Number(address);
    return !IPV4_DENY.some(cidr => inBlock(value, cidr, 32));
  }
  if (family === 6) {
    const value = ipv6Number(address);
    return inBlock(value, "2000::/3", 128) && !IPV6_DENY.some(cidr => inBlock(value, cidr, 128));
  }
  return false;
}

/** Compare socket peers numerically, including OS IPv4-mapped IPv6 spelling. */
export function matchesPinnedAddress(peer: unknown, pinned: string): boolean {
  if (typeof peer !== "string" || peer.includes("%")) return false;
  const family = isIP(peer);
  const pinFamily = isIP(pinned);
  if (family === 4 && pinFamily === 4) return ipv4Number(peer) === ipv4Number(pinned);
  if (family === 6 && pinFamily === 6) return ipv6Number(peer) === ipv6Number(pinned);
  if (family === 6 && pinFamily === 4) {
    const value = ipv6Number(peer);
    return value >> 32n === 65535n && (value & 0xffffffffn) === ipv4Number(pinned);
  }
  return false;
}
