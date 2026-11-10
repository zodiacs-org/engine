import { describe, expect, it } from "vitest";
import { isPublicAddress, matchesPinnedAddress } from "../src/destination.js";

describe("conservative public destination policy", () => {
  it.each([
    "0.0.0.0", "0.255.255.255", "10.0.0.0", "10.255.255.255",
    "100.64.0.0", "100.127.255.255", "127.0.0.0", "127.255.255.255",
    "169.254.0.0", "169.254.255.255", "172.16.0.0", "172.31.255.255",
    "192.0.0.0", "192.0.0.255", "192.0.2.0", "192.0.2.255",
    "192.31.196.0", "192.31.196.255", "192.52.193.0", "192.52.193.255",
    "192.88.99.0", "192.88.99.255", "192.168.0.0", "192.168.255.255",
    "192.175.48.0", "192.175.48.255", "198.18.0.0", "198.19.255.255",
    "198.51.100.0", "198.51.100.255", "203.0.113.0", "203.0.113.255",
    "224.0.0.0", "239.255.255.255", "240.0.0.0", "255.255.255.255", "168.63.129.16",
    "::", "::1", "::127.0.0.1", "::ffff:127.0.0.1", "::ffff:8.8.8.8", "::ffff:808:808",
    "64:ff9b::a00:1", "64:ff9b:1::1", "100::1", "100:0:0:1::1",
    "2001::", "2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff", "2001:db8::", "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff",
    "2002::", "2002:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "2620:4f:8000::", "2620:4f:8000:ffff:ffff:ffff:ffff:ffff",
    "3fff::", "3fff:fff:ffff:ffff:ffff:ffff:ffff:ffff", "5f00::1", "fc00::1", "fdff::1", "fe80::1", "fec0::1", "ff02::1",
    "2001:4860::1%eth0", "[2001:4860::1]", "127.1", "2130706433", "0x7f000001",
    "010.0.0.1", "8.8.8.8\n", "256.1.2.3", "receiver.example", "", null, undefined, 123,
  ])("rejects disallowed or invalid address %#", address => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    "8.8.8.8", "1.1.1.1", "100.63.255.255", "100.128.0.0", "172.15.255.255", "172.32.0.0",
    "192.0.1.0", "192.31.195.255", "192.31.197.0", "198.17.255.255", "198.20.0.0", "223.255.255.255",
    "2000::", "2001:200::", "2001:4860:4860::8888", "2606:4700:4700::1111", "3ffe:ffff::1", "3fff:1000::",
  ])("accepts allowed address without connecting %#", address => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it("compares exact numeric peers while accommodating OS IPv4 mapping", () => {
    expect(matchesPinnedAddress("8.8.8.8", "8.8.8.8")).toBe(true);
    expect(matchesPinnedAddress("::ffff:8.8.8.8", "8.8.8.8")).toBe(true);
    expect(matchesPinnedAddress("::ffff:808:808", "8.8.8.8")).toBe(true);
    expect(matchesPinnedAddress("2606:4700:4700:0:0:0:0:1111", "2606:4700:4700::1111")).toBe(true);
    for (const peer of ["::8.8.8.8", "::ffff:127.0.0.1", "8.8.4.4", "127.0.0.1", "8.8.8.8%eth0", undefined]) {
      expect(matchesPinnedAddress(peer, "8.8.8.8")).toBe(false);
    }
    expect(matchesPinnedAddress("2001:4860::1", "2001:4860::2")).toBe(false);
  });
});
