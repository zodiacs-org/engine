import { describe, expect, it, vi } from "vitest";
import { ADMISSION_DEFAULTS, createAdmissionController } from "../src/http-admission.js";
import type { Admission, AdmissionOptions } from "../src/http-admission.js";

function allow(result: Admission): () => void {
  expect(result.status).toBe("allowed");
  if (result.status !== "allowed") throw new Error("Expected admission");
  return result.release;
}

describe("bounded request admission with a controlled monotonic clock", () => {
  it("enforces documented defaults and clamps refill to the burst capacity", () => {
    expect(ADMISSION_DEFAULTS).toEqual({
      capacity: 60, refillPerSecond: 1, maxClients: 4096, maxConcurrent: 32,
      idleTimeoutMs: 60_000, cleanupIntervalMs: 10_000
    });
    let time = 0;
    const controller = createAdmissionController({ clock: () => time });
    for (let index = 0; index < 60; index += 1) allow(controller.acquire("client"))();
    expect(controller.acquire("client")).toEqual({ status: "rate-limited", retryAfterSeconds: 1 });
    time = 10_000_000;
    for (let index = 0; index < 60; index += 1) allow(controller.acquire("client"))();
    expect(controller.acquire("client").status).toBe("rate-limited");
  });

  it("recovers at the refill boundary with fractional rates and conservative Retry-After", () => {
    let time = 0;
    const controller = createAdmissionController({ capacity: 2, refillPerSecond: 0.5, clock: () => time });
    allow(controller.acquire("client"))();
    allow(controller.acquire("client"))();
    expect(controller.acquire("client")).toEqual({ status: "rate-limited", retryAfterSeconds: 2 });
    time = 1000;
    expect(controller.acquire("client")).toEqual({ status: "rate-limited", retryAfterSeconds: 1 });
    time = 1999;
    expect(controller.acquire("client").status).toBe("rate-limited");
    time = 2000;
    allow(controller.acquire("client"))();
    expect(controller.acquire("client").status).toBe("rate-limited");
  });

  it("ignores wall-clock changes and never refills from a backwards reading", () => {
    let time = 1000;
    const controller = createAdmissionController({ capacity: 1, clock: () => time });
    allow(controller.acquire("client"))();
    const wallClock = vi.spyOn(Date, "now").mockReturnValue(9_000_000_000);
    try {
      time = 0;
      expect(controller.acquire("client").status).toBe("rate-limited");
      time = 1999;
      expect(controller.acquire("client").status).toBe("rate-limited");
      time = 2000;
      allow(controller.acquire("client"))();
    } finally { wallClock.mockRestore(); }
  });

  it("keeps independent clients and does not reset an exhausted bucket when the table is full", () => {
    let time = 0;
    const controller = createAdmissionController({ capacity: 1, maxClients: 2, clock: () => time });
    allow(controller.acquire("one"))();
    allow(controller.acquire("two"))();
    for (let index = 0; index < 100; index += 1) {
      expect(controller.acquire(`unknown-${index}`).status).toBe("overloaded");
    }
    expect(controller.snapshot()).toMatchObject({ clients: 2, active: 0 });
    expect(controller.acquire("one").status).toBe("rate-limited");
    time = 1000;
    allow(controller.acquire("one"))();
  });

  it("cleans idle fully refilled buckets, retains active or depleted clients, then admits new clients", () => {
    let time = 0;
    const controller = createAdmissionController({
      capacity: 2, refillPerSecond: 1, maxClients: 2, idleTimeoutMs: 100, cleanupIntervalMs: 100,
      clock: () => time
    });
    allow(controller.acquire("idle"))();
    allow(controller.acquire("idle"))();
    const release = allow(controller.acquire("active"));
    time = 500;
    controller.sweep();
    expect(controller.snapshot()).toMatchObject({ clients: 2, active: 1 });
    expect(controller.acquire("new").status).toBe("overloaded");
    time = 2000;
    allow(controller.acquire("new"))();
    expect(controller.snapshot()).toMatchObject({ clients: 2, active: 1 });
    release();
    controller.sweep();
    expect(controller.snapshot()).toMatchObject({ clients: 1, active: 0 });
  });

  it("rejects excess concurrent work without consuming tokens and releases exactly once", () => {
    const controller = createAdmissionController({ capacity: 1, maxConcurrent: 1, clock: () => 0 });
    const release = allow(controller.acquire("one"));
    expect(controller.acquire("two")).toEqual({ status: "overloaded", retryAfterSeconds: 1 });
    expect(controller.snapshot()).toMatchObject({ clients: 1, active: 1 });
    release(); release();
    allow(controller.acquire("two"))();
    expect(controller.snapshot().active).toBe(0);
  });

  it("clears address state on close while accounting for still-pending work", () => {
    const controller = createAdmissionController({ clock: () => 0 });
    const release = allow(controller.acquire("private-client"));
    controller.close(); controller.close(); controller.sweep();
    expect(controller.snapshot()).toEqual({ clients: 0, active: 1, closed: true });
    expect(controller.acquire("other").status).toBe("overloaded");
    release();
    expect(controller.snapshot()).toEqual({ clients: 0, active: 0, closed: true });
  });

  it.each([null, [], { unknown: 1 }, { capacity: undefined }, { capacity: 0 }, { capacity: 1.5 },
    { capacity: 1_000_001 }, { maxClients: 100_001 }, { maxConcurrent: 10_001 },
    { idleTimeoutMs: 86_400_001 }, { cleanupIntervalMs: 3_600_001 },
    { refillPerSecond: 0 }, { refillPerSecond: 0.0001 }, { refillPerSecond: Infinity },
    { refillPerSecond: NaN }, { refillPerSecond: "1" }, { refillPerSecond: 1_000_001 },
    { clock: undefined }, { clock: null }])("refuses malformed configuration %#", (options) => {
    expect(() => createAdmissionController(options as AdmissionOptions)).toThrow(RangeError);
  });

  it.each([NaN, Infinity, -1])("refuses invalid injected clock reading %s", (time) => {
    const controller = createAdmissionController({ clock: () => time });
    expect(() => controller.acquire("client")).toThrow(RangeError);
    expect(controller.snapshot()).toMatchObject({ clients: 0, active: 0 });
  });
});
