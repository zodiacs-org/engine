import { lstatSync, mkdirSync, realpathSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import type { Server } from "node:http";
import type { Socket } from "node:net";
import { setImmediate as yieldTurn } from "node:timers/promises";
import { createControlServer } from "./control-api.js";
import { DeliveryWorker, type DeliveryTransport } from "./delivery-worker.js";
import type { EventSearchRequest, EventSearchResult } from "./event-search-types.js";
import { ScanWorker } from "./scan-worker.js";
import type { ScanResult } from "./scan-types.js";
import { SigningKeyVault } from "./secrets.js";
import { parseServiceConfig, ServiceError, statePath, type ServiceCredentials } from "./service-config.js";
import { WebhookStore } from "./storage.js";
import { HttpsTransport } from "./transport.js";

export type ServiceNotice =
  | { readonly kind: "scan-refused"; readonly reason: Extract<ScanResult, { status: "refused" }>["reason"] }
  | { readonly kind: "worker-error"; readonly worker: "scan" | "delivery" }
  | { readonly kind: "server-error" };
/** Trusted local code seams. Never read from configuration or control requests. */
export interface ServiceDependencies {
  readonly now?: () => number;
  readonly transport?: DeliveryTransport;
  readonly search?: (input: EventSearchRequest) => EventSearchResult;
  readonly report?: (notice: ServiceNotice) => void;
}
export interface WebhookService {
  readonly address: { readonly host: string; readonly port: number };
  /** Resolves after shutdown; rejects with a fixed diagnostic if resource closing fails. */
  readonly done: Promise<void>;
  /** Idempotent. Cancels workers and drains control requests before closing local databases. */
  stop(): Promise<void>;
}
function pause(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise(resolve => {
    const end = () => { clearTimeout(timer); signal.removeEventListener("abort", end); resolve(); };
    const timer = setTimeout(end, milliseconds);
    signal.addEventListener("abort", end, { once: true });
    if (signal.aborted) end();
  });
}
/** Refuse symlinked state directories/files before opening SQLite. Host filesystem custody remains required. */
function prepareState(projectDirectory: string, directory: string): string {
  const root = realpathSync(projectDirectory), path = statePath(root, directory);
  let current = root;
  for (const part of relative(root, path).split(sep)) {
    current = join(current, part);
    try { mkdirSync(current, { mode: 0o700 }); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error();
  }
  for (const name of ["service.sqlite", "signing.sqlite"]) {
    for (const suffix of ["", "-wal", "-shm", "-journal"]) {
      try {
        const stat = lstatSync(join(path, name + suffix));
        if (stat.isSymbolicLink() || !stat.isFile()) throw new Error();
      } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    }
  }
  return path;
}
function listen(server: Server, host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const error = () => { server.off("listening", ready); reject(new ServiceError("startup-failed")); };
    const ready = () => { server.off("error", error); resolve(); };
    server.once("error", error); server.once("listening", ready); server.listen(port, host);
  });
}
function closeServer(server: Server, sockets: Set<Socket>, graceMs: number): Promise<void> {
  return new Promise(resolve => {
    // Includes sockets with incomplete headers, which closeAllConnections may omit.
    const timer = setTimeout(() => { for (const socket of sockets) socket.destroy(); }, graceMs);
    server.close(() => { clearTimeout(timer); resolve(); });
    server.closeIdleConnections();
  });
}

/** Owns one control server, store, vault and pair of sequential polling loops. */
export async function startService(input: unknown, credentials: ServiceCredentials,
  projectDirectory = process.cwd(), dependencies: ServiceDependencies = {}): Promise<WebhookService> {
  const config = parseServiceConfig(input);
  if (!credentials || !(credentials.adminToken instanceof Uint8Array) || credentials.adminToken.byteLength !== 32 ||
    !(credentials.wrappingKey instanceof Uint8Array) || credentials.wrappingKey.byteLength !== 32) {
    throw new ServiceError("invalid-credentials");
  }
  const now = dependencies.now ?? Date.now;
  const clock = () => {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) throw new Error();
    return value;
  };
  const report = (notice: ServiceNotice) => { try { dependencies.report?.(notice); } catch { /* Observers cannot stop workers. */ } };
  let store: WebhookStore | undefined, vault: SigningKeyVault | undefined, server: Server | undefined;
  const sockets = new Set<Socket>();
  let scanner: ScanWorker, delivery: DeliveryWorker;
  try {
    clock();
    const path = prepareState(resolve(projectDirectory), config.stateDirectory);
    store = new WebhookStore(join(path, "service.sqlite"));
    vault = new SigningKeyVault(join(path, "signing.sqlite"), credentials.wrappingKey);
    scanner = new ScanWorker(store, config.scan, dependencies.search);
    delivery = new DeliveryWorker(store, vault, dependencies.transport ?? new HttpsTransport(config.transport), config.delivery, clock);
    server = createControlServer({ store, vault, bearerToken: credentials.adminToken, policy: config.control, now: clock });
    server.on("connection", socket => { sockets.add(socket); socket.once("close", () => sockets.delete(socket)); });
    await listen(server, config.host, config.port);
  } catch {
    if (server) await closeServer(server, sockets, config.shutdownGraceMs);
    try { vault?.close(); } catch { /* Preserve the startup diagnostic. */ }
    try { store?.close(); } catch { /* Preserve the startup diagnostic. */ }
    throw new ServiceError("startup-failed");
  }
  const ownedStore = store, ownedVault = vault, ownedServer = server;
  const address = ownedServer.address();
  if (!address || typeof address === "string") throw new ServiceError("startup-failed");
  const controller = new AbortController(), { signal } = controller;
  let afterId: string | undefined;
  const scanLoop = async () => {
    while (!signal.aborted) {
      try {
        const page = ownedStore.listSubscriptions({ limit: config.scanPageSize, ...(afterId === undefined ? {} : { afterId }) });
        for (const subscription of page) {
          await yieldTurn();
          if (signal.aborted) break;
          try {
            const at = clock();
            const through = at + Math.min(config.lookAheadMs, 8_640_000_000_000_000 - at);
            const result = scanner.scanSubscription(subscription.id, { now: at, through, signal });
            if (result.status === "refused") report({ kind: "scan-refused", reason: result.reason });
          } catch { report({ kind: "worker-error", worker: "scan" }); }
          afterId = subscription.id;
        }
        if (page.length < config.scanPageSize) afterId = undefined;
      } catch { report({ kind: "worker-error", worker: "scan" }); }
      await pause(config.pollIntervalMs, signal);
    }
  };
  const deliveryLoop = async () => {
    while (!signal.aborted) {
      for (let count = 0; count < config.deliveryBatchSize && !signal.aborted; count++) {
        try {
          const result = await delivery.deliverNext({ signal });
          if (result.status === "idle" || result.status === "cancelled") break;
        } catch { report({ kind: "worker-error", worker: "delivery" }); break; }
        await yieldTurn();
      }
      await pause(config.pollIntervalMs, signal);
    }
  };
  let finish!: () => void, fail!: (error: ServiceError) => void;
  const done = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject; });
  // A caller can await stop() only; keep done's rejection observed as well.
  void done.catch(() => undefined);
  const loops = Promise.all([scanLoop(), deliveryLoop()]);
  let stopping: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    if (stopping) return stopping;
    stopping = (async () => {
      controller.abort();
      let failed = false;
      try { await Promise.all([loops, closeServer(ownedServer, sockets, config.shutdownGraceMs)]); } catch { failed = true; }
      try { ownedVault.close(); } catch { failed = true; }
      try { ownedStore.close(); } catch { failed = true; }
      if (failed) { const error = new ServiceError("shutdown-failed"); fail(error); throw error; }
      finish();
    })();
    return stopping;
  };
  ownedServer.on("error", () => { report({ kind: "server-error" }); void stop().catch(() => undefined); });
  return Object.freeze({ address: Object.freeze({ host: address.address, port: address.port }), done, stop });
}
