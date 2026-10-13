import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadServiceEnvironment, parseServiceConfig, SERVICE_DEFAULTS, SERVICE_LIMITS, ServiceError, statePath } from "../src/service-config.js";

describe("service configuration", () => {
  it("applies detached frozen defaults and explicit bounds without credentials", () => {
    expect(parseServiceConfig()).toMatchObject(SERVICE_DEFAULTS);
    const input = { scan: { maxEvaluations: Number(SERVICE_LIMITS.maxEvaluations) }, delivery: { maxAttempts: 1 }, control: { defaultPageSize: 1 } };
    const config = parseServiceConfig(input); input.scan.maxEvaluations = 0;
    expect(config.scan.maxEvaluations).toBe(SERVICE_LIMITS.maxEvaluations);
    expect(Object.isFrozen(config.scan)).toBe(true);
    expect(Object.isFrozen(config.delivery)).toBe(true);
    expect(Object.isFrozen(config.transport)).toBe(true);
    expect(Object.isFrozen(config.control)).toBe(true);
    for (const key of ["pollIntervalMs", "scanPageSize", "deliveryBatchSize", "lookAheadMs", "shutdownGraceMs"] as const) {
      expect(parseServiceConfig({ [key]: SERVICE_LIMITS[key] })[key]).toBe(SERVICE_LIMITS[key]);
      expect(() => parseServiceConfig({ [key]: SERVICE_LIMITS[key] + 1 })).toThrow(ServiceError);
    }
    expect(parseServiceConfig({ port: 0, lookAheadMs: 0 })).toMatchObject({ port: 0, lookAheadMs: 0 });
    expect(parseServiceConfig({ port: 65535, host: "::1" })).toMatchObject({ port: 65535, host: "::1" });
    expect(() => parseServiceConfig({ port: 65536 })).toThrow(ServiceError);
    for (const key of ["maxWindowMs", "stepMs", "maxEvaluations"] as const) {
      expect(parseServiceConfig({ scan: { [key]: SERVICE_LIMITS[key] } }).scan[key]).toBe(SERVICE_LIMITS[key]);
      expect(() => parseServiceConfig({ scan: { [key]: SERVICE_LIMITS[key] + 1 } })).toThrow(ServiceError);
    }
    const eclipse = { model: { sunRadiusAu: 0.005, earthRadiusAu: 0.00005, moonRadiusAu: 0.00001 }, derivativeStepMs: 60_000 };
    const parsed = parseServiceConfig({ scan: { eclipse } }); eclipse.model.sunRadiusAu = 0;
    expect(parsed.scan.eclipse?.model.sunRadiusAu).toBe(0.005);
    expect(Object.isFrozen(parsed.scan.eclipse?.model)).toBe(true);
  });
  it("rejects malformed policies, secrets, unknown fields and paths outside the project", () => {
    for (const input of [null, [], { token: "private-marker" }, { host: "0.0.0.0" }, { port: -1 }, { stateDirectory: "/tmp/outside" },
      { stateDirectory: ".." }, { stateDirectory: "../escape" }, { stateDirectory: "." }, { stateDirectory: "bad\0path" },
      { stateDirectory: "x".repeat(4097) }, { pollIntervalMs: 0 }, { deliveryBatchSize: 1.5 },
      { scan: null }, { scan: { maxEvaluations: 0 } }, { scan: { eclipse: {} } }, { scan: { unknown: 1 } },
      { delivery: null }, { delivery: { deadlineMs: 30000 } }, { delivery: { maxAttempts: 101 } },
      { delivery: { secret: "marker" } }, { transport: null }, { transport: { maxAddresses: 65 } },
      { control: null }, { control: { requestTimeoutMs: 60001 } }, { control: { defaultPageSize: 100, maxPageSize: 1 } }]) {
      expect(() => parseServiceConfig(input)).toThrow("Webhook service: invalid-config.");
    }
    expect(() => parseServiceConfig({ get scan() { throw new Error("getter-marker"); } })).toThrow("invalid-config");
    expect(() => statePath("/project", "../escape")).toThrow(ServiceError);
  });
  it("loads canonical runtime credentials and bounded JSON policy with fixed errors", () => {
    const key = randomBytes(32);
    const environment = { WEBHOOK_ADMIN_TOKEN: key.toString("base64url"), WEBHOOK_WRAPPING_KEY: randomBytes(32).toString("base64url"),
      WEBHOOK_SETTINGS: JSON.stringify({ port: 0 }), PATH: "ordinary-env" };
    const loaded = loadServiceEnvironment(environment);
    try {
      expect(loaded.config.port).toBe(0);
      expect(loaded.credentials.adminToken).toEqual(key);
      expect(JSON.stringify(loaded.config)).not.toContain(environment.WEBHOOK_ADMIN_TOKEN);
      for (const overrides of [{ WEBHOOK_ADMIN_TOKEN: undefined }, { WEBHOOK_WRAPPING_KEY: "private-marker" },
        { WEBHOOK_WRAPPING_KEY: environment.WEBHOOK_WRAPPING_KEY + "=" }, { WEBHOOK_SETTINGS: "{" },
        { WEBHOOK_SETTINGS: " ".repeat(SERVICE_LIMITS.settingsBytes + 1) }, { WEBHOOK_TYPO: "marker" }]) {
        expect(() => loadServiceEnvironment({ ...environment, ...overrides })).toThrow(ServiceError);
      }
    } finally { key.fill(0); loaded.credentials.adminToken.fill(0); loaded.credentials.wrappingKey.fill(0); }
  });
});
