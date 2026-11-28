import { describe, expect, it } from "vitest";
import { createClientIdentifier, normalizeClientIp, PROXY_LIMITS } from "../src/http-client.js";

// Documentation-range IPs are synthetic client and proxy identities.
describe("explicit proxy trust and canonical client identity", () => {
  it.each([
    ["192.0.2.1", "192.0.2.1"], ["::ffff:192.0.2.1", "192.0.2.1"], ["::ffff:c000:201", "192.0.2.1"],
    ["2001:0DB8:0000:0:0:0:0:1", "2001:db8::1"], ["::1", "::1"]
  ])("canonicalizes %s to %s", (ip, expected) => { expect(normalizeClientIp(ip)).toBe(expected); });

  it.each(["", " 192.0.2.1", "192.0.2.1 ", "192.000.2.1", "localhost", "unknown", "192.0.2.1:80",
    "[2001:db8::1]", "fe80::1%eth0", "0x7f000001", "2130706433", "192.0.2.1\n", "::ffff:999.1.1.1"])(
    "refuses nonliteral or ambiguous address %#", (ip) => { expect(() => normalizeClientIp(ip)).toThrow(RangeError); }
  );

  it("ignores forwarding claims from untrusted peers, including malformed and duplicate headers", () => {
    const identify = createClientIdentifier();
    expect(identify("192.0.2.1", ["X-Forwarded-For", "PRIVATE", "X-Forwarded-For", "unknown", "Forwarded", "for=PRIVATE"])).toBe("192.0.2.1");
  });

  it("walks from the nearest peer and stops at the first untrusted hop", () => {
    const identify = createClientIdentifier(["192.0.2.10", "2001:db8::10"]);
    expect(identify("192.0.2.10", ["X-Forwarded-For", "198.51.100.1, 203.0.113.2, 2001:db8::10"])).toBe("203.0.113.2");
    expect(identify("::ffff:192.0.2.10", ["x-forwarded-for", "198.51.100.1, 2001:0db8:0:0:0:0:0:10"])).toBe("198.51.100.1");
    expect(identify("192.0.2.10", [])).toBe("192.0.2.10");
    expect(identify("192.0.2.10", ["Forwarded", "for=198.51.100.1", "X-Real-IP", "198.51.100.1"])).toBe("192.0.2.10");
  });

  it("snapshots trust configuration and canonicalizes all-trusted chains", () => {
    const proxies = ["192.0.2.10", "192.0.2.11"];
    const identify = createClientIdentifier(proxies);
    proxies.push("198.51.100.1");
    expect(identify("192.0.2.10", ["X-Forwarded-For", "203.0.113.1,198.51.100.1"])).toBe("198.51.100.1");
    expect(identify("192.0.2.10", ["X-Forwarded-For", "::ffff:192.0.2.11"])).toBe("192.0.2.11");
  });

  it.each(["", "unknown", "192.0.2.1,", "192.0.2.1:443", "[2001:db8::1]", "2001:db8::1%0"])(
    "rejects malformed forwarding from a trusted proxy %#", (value) => {
      const identify = createClientIdentifier(["192.0.2.10"]);
      expect(() => identify("192.0.2.10", ["X-Forwarded-For", value])).toThrow(RangeError);
    }
  );

  it("bounds configured proxies and chain length and rejects duplicate forwarding fields", () => {
    expect(PROXY_LIMITS).toEqual({ trustedAddresses: 256, forwardedAddresses: 32 });
    expect(() => createClientIdentifier(Array(257).fill("192.0.2.1"))).toThrow(RangeError);
    const identify = createClientIdentifier(["192.0.2.10"]);
    expect(() => identify("192.0.2.10", ["X-Forwarded-For", "192.0.2.1", "x-forwarded-for", "192.0.2.2"])).toThrow(RangeError);
    expect(identify("192.0.2.10", ["X-Forwarded-For", Array(32).fill("192.0.2.1").join(",")])).toBe("192.0.2.1");
    expect(() => identify("192.0.2.10", ["X-Forwarded-For", Array(33).fill("192.0.2.1").join(",")])).toThrow(RangeError);
  });

  it.each([true, null, {}, ["*"], ["localhost"], ["192.0.2.0/24"], [undefined]])("refuses unsafe trust configuration %#", (value) => {
    expect(() => createClientIdentifier(value as unknown as string[])).toThrow(RangeError);
  });
});
