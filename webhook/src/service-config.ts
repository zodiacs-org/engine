import { resolve, relative, isAbsolute } from "node:path";
import { parseControlPolicy, type ControlPolicy } from "./control-http.js";
import { parseDeliveryPolicy, DELIVERY_LIMITS } from "./delivery-policy.js";
import type { DeliveryWorkerPolicy } from "./delivery-worker.js";
import { describeEventSearch } from "./event-search.js";
import type { ScanPolicy } from "./scan-types.js";
import { HttpsTransport, type TransportPolicy } from "./transport.js";

export class ServiceError extends Error {
  constructor(readonly code: "invalid-config" | "invalid-credentials" | "startup-failed" | "shutdown-failed") {
    super(`Webhook service: ${code}.`); this.name = "ServiceError";
  }
}
export interface ServiceConfig {
  readonly stateDirectory: string;
  readonly host: "127.0.0.1" | "::1";
  readonly port: number;
  readonly pollIntervalMs: number;
  readonly scanPageSize: number;
  readonly deliveryBatchSize: number;
  readonly lookAheadMs: number;
  readonly shutdownGraceMs: number;
  readonly scan: ScanPolicy;
  readonly delivery: DeliveryWorkerPolicy;
  readonly transport: TransportPolicy;
  readonly control: ControlPolicy;
}
const DAY = 86_400_000;
export const SERVICE_DEFAULTS = Object.freeze({
  stateDirectory: "var", host: "127.0.0.1", port: 8787, pollIntervalMs: 1000,
  scanPageSize: 10, deliveryBatchSize: 10, lookAheadMs: DAY, shutdownGraceMs: 5000,
  scan: Object.freeze({ maxWindowMs: DAY, stepMs: DAY / 4, maxEvaluations: 20_000 }),
  delivery: Object.freeze({ maxAttempts: 8, baseDelayMs: 1000, maxDelayMs: 3_600_000,
    leaseMs: 30_000, deadlineMs: 10_000 }),
  transport: Object.freeze({ deadlineMs: 10_000, maxResponseBytes: 16_384,
    maxResponseHeaderBytes: 8192, maxAddresses: 16 }),
} as const);
export const SERVICE_LIMITS = Object.freeze({
  port: 65_535, pollIntervalMs: 60_000, scanPageSize: 100, deliveryBatchSize: 100,
  lookAheadMs: 31 * DAY, shutdownGraceMs: 60_000, maxWindowMs: 31 * DAY,
  stepMs: DAY, maxEvaluations: 100_000, settingsBytes: 16_384, pathBytes: 4096,
});
function record(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input) ||
    ![null, Object.prototype].includes(Object.getPrototypeOf(input))) throw new Error();
  const result: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(input)) {
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (typeof key !== "string" || !keys.includes(key) || !descriptor?.enumerable || !("value" in descriptor)) throw new Error();
    result[key] = descriptor.value;
  }
  return result;
}
function bounded(value: unknown, cap: number, minimum = 1): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > cap) throw new Error();
}
export function statePath(projectDirectory: string, directory: string): string {
  const root = resolve(projectDirectory), path = resolve(root, directory), delta = relative(root, path);
  if (!delta || delta === ".." || delta.startsWith("../") || isAbsolute(delta)) throw new ServiceError("invalid-config");
  return path;
}

/** JSON configuration contains policy only. Credentials have a separate runtime boundary. */
export function parseServiceConfig(input: unknown = {}): ServiceConfig {
  try {
    const data = record(input, [...Object.keys(SERVICE_DEFAULTS), "control"]);
    const value = { ...SERVICE_DEFAULTS, ...data } as ServiceConfig;
    if (typeof value.stateDirectory !== "string" || !value.stateDirectory || isAbsolute(value.stateDirectory) ||
      Buffer.byteLength(value.stateDirectory) > SERVICE_LIMITS.pathBytes || /[\u0000-\u001f\u007f]/u.test(value.stateDirectory)) throw new Error();
    statePath(process.cwd(), value.stateDirectory);
    if (value.host !== "127.0.0.1" && value.host !== "::1") throw new Error();
    bounded(value.port, SERVICE_LIMITS.port, 0);
    for (const field of ["pollIntervalMs", "scanPageSize", "deliveryBatchSize", "lookAheadMs", "shutdownGraceMs"] as const) {
      bounded(value[field], SERVICE_LIMITS[field], field === "lookAheadMs" ? 0 : 1);
    }
    const scan = { ...SERVICE_DEFAULTS.scan, ...record(data.scan === undefined ? {} : data.scan, ["maxWindowMs", "stepMs", "maxEvaluations", "eclipse"]) } as ScanPolicy;
    for (const field of ["maxWindowMs", "stepMs", "maxEvaluations"] as const) bounded(scan[field], SERVICE_LIMITS[field]);
    const metadata = describeEventSearch({
      filter: scan.eclipse === undefined ? { kind: "ingress", body: "Sun", sign: "aries", direction: "any" } : { kind: "eclipse", type: "any" },
      window: { start: "2000-01-01T00:00:00Z", end: "2000-01-02T00:00:00Z" },
      stepMs: scan.stepMs, maxEvaluations: scan.maxEvaluations,
      ...(scan.eclipse === undefined ? {} : { eclipse: scan.eclipse }),
    });
    const delivery = { ...SERVICE_DEFAULTS.delivery, ...record(data.delivery === undefined ? {} : data.delivery, Object.keys(SERVICE_DEFAULTS.delivery)) } as DeliveryWorkerPolicy;
    const parsedDelivery = parseDeliveryPolicy(delivery);
    bounded(delivery.deadlineMs, DELIVERY_LIMITS.deadlineMs);
    if (delivery.deadlineMs >= delivery.leaseMs) throw new Error();
    const transport = { ...SERVICE_DEFAULTS.transport, ...record(data.transport === undefined ? {} : data.transport, Object.keys(SERVICE_DEFAULTS.transport)) } as TransportPolicy;
    new HttpsTransport(transport); // Constructor validates policy without making requests.
    const control = parseControlPolicy(record(data.control === undefined ? {} : data.control, ["maxRequestBytes", "maxHeaderBytes", "requestTimeoutMs", "defaultPageSize", "maxPageSize"]));
    return Object.freeze({ ...value,
      scan: Object.freeze({ maxWindowMs: scan.maxWindowMs, stepMs: scan.stepMs, maxEvaluations: scan.maxEvaluations,
        ...(metadata.eclipse === null ? {} : { eclipse: metadata.eclipse }) }),
      delivery: Object.freeze({ ...parsedDelivery, deadlineMs: delivery.deadlineMs }),
      transport: Object.freeze({ ...transport }), control,
    });
  } catch { throw new ServiceError("invalid-config"); }
}

export interface ServiceCredentials { readonly adminToken: Uint8Array; readonly wrappingKey: Uint8Array }
/** Caller owns and erases returned buffers. Never serialize this result or log environment values. */
export function loadServiceEnvironment(environment: NodeJS.ProcessEnv): { config: ServiceConfig; credentials: ServiceCredentials } {
  let adminToken: Buffer | undefined, wrappingKey: Buffer | undefined;
  try {
    const allowed = ["WEBHOOK_SETTINGS", "WEBHOOK_ADMIN_TOKEN", "WEBHOOK_WRAPPING_KEY"];
    if (Object.keys(environment).some(key => key.startsWith("WEBHOOK_") && !allowed.includes(key))) throw new ServiceError("invalid-config");
    const settings = environment.WEBHOOK_SETTINGS ?? "{}";
    if (Buffer.byteLength(settings) > SERVICE_LIMITS.settingsBytes) throw new ServiceError("invalid-config");
    let config: ServiceConfig;
    try { config = parseServiceConfig(JSON.parse(settings)); } catch { throw new ServiceError("invalid-config"); }
    const decode = (text: string | undefined): Buffer => {
      if (!text || !/^[A-Za-z0-9_-]{43}$/u.test(text)) throw new ServiceError("invalid-credentials");
      const key = Buffer.from(text, "base64url");
      if (key.length !== 32 || key.toString("base64url") !== text) { key.fill(0); throw new ServiceError("invalid-credentials"); }
      return key;
    };
    adminToken = decode(environment.WEBHOOK_ADMIN_TOKEN); wrappingKey = decode(environment.WEBHOOK_WRAPPING_KEY);
    return { config, credentials: { adminToken, wrappingKey } };
  } catch (error) {
    adminToken?.fill(0); wrappingKey?.fill(0);
    if (error instanceof ServiceError) throw error;
    throw new ServiceError("invalid-config");
  }
}
