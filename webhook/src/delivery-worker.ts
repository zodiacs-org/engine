import { DELIVERY_LIMITS, parseDeliveryPolicy, type DeliveryPolicy } from "./delivery-policy.js";
import type { SigningKeyVault } from "./secrets.js";
import { StorageError, WebhookStore } from "./storage.js";
import type { AttemptResult, StoredDelivery } from "./storage-types.js";
import type { TransportRequest, TransportResult } from "./transport.js";

export interface DeliveryWorkerPolicy extends DeliveryPolicy {
  /** Local whole-attempt deadline. Must be shorter than the requested lease. */
  readonly deadlineMs: number;
}
export interface DeliveryTransport { send(input: TransportRequest): Promise<TransportResult> }
export type DeliverySigner = Pick<SigningKeyVault, "sign">;
export type DeliveryWorkerResult =
  | { readonly status: "idle" | "cancelled" }
  | { readonly status: "lease-lost"; readonly eventId: string }
  | { readonly status: "recovered" | "attempted"; readonly delivery: StoredDelivery };

export class DeliveryWorkerError extends Error {
  constructor() { super("Invalid webhook delivery worker input."); this.name = "DeliveryWorkerError"; }
}

/** A caller drives each iteration. No automatic polling or unbounded batch drain. */
export class DeliveryWorker {
  #policy: DeliveryWorkerPolicy;
  #transport: DeliveryTransport;
  #signer: DeliverySigner;
  #clock: () => number;

  constructor(private readonly store: WebhookStore, signer: DeliverySigner,
    transport: DeliveryTransport, policy: DeliveryWorkerPolicy, clock: () => number = Date.now) {
    try {
      const parsed = parseDeliveryPolicy(policy);
      const deadlineMs = policy.deadlineMs;
      if (!Number.isSafeInteger(deadlineMs) || deadlineMs <= 0 || deadlineMs > DELIVERY_LIMITS.deadlineMs
        || deadlineMs >= parsed.leaseMs || typeof clock !== "function"
        || typeof signer.sign !== "function" || typeof transport.send !== "function"
        || !(store instanceof WebhookStore)) throw new Error();
      this.#policy = Object.freeze({ ...parsed, deadlineMs });
      this.#clock = clock;
      this.#signer = { sign: signer.sign.bind(signer) };
      this.#transport = { send: transport.send.bind(transport) };
    } catch { throw new DeliveryWorkerError(); }
  }

  #now(): number {
    const now = this.#clock();
    if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000) throw new DeliveryWorkerError();
    return now;
  }

  async deliverNext(input: { readonly signal?: AbortSignal } = {}): Promise<DeliveryWorkerResult> {
    if (!input || typeof input !== "object" || (input.signal !== undefined && !(input.signal instanceof AbortSignal))) {
      throw new DeliveryWorkerError();
    }
    const signal = input.signal;
    if (signal?.aborted) return { status: "cancelled" };
    const claim = this.store.claimDelivery(this.#now(), this.#policy);
    if (claim.status !== "claimed") return claim;
    const { lease, delivery, event } = claim;
    const body = Buffer.from(event.payload, "utf8");
    let outcome: AttemptResult;
    let headers: TransportRequest["headers"] | undefined;
    try {
      headers = this.#signer.sign(delivery.secretRef, {
        body, idempotencyKey: event.idempotencyKey, timestamp: Math.floor(lease.startedAt / 1000),
      });
    } catch {
      // No key material, URL, payload, arbitrary exception or receiver content is saved.
    }
    if (!headers) outcome = { kind: "signing-error" };
    else {
      const beforeSend = Math.max(lease.startedAt, this.#now());
      // A retained policy may have a shorter lease than this worker's new settings.
      const remaining = Math.min(this.#policy.deadlineMs - (beforeSend - lease.startedAt),
        lease.expiresAt - beforeSend - 1);
      outcome = remaining <= 0 ? { kind: "timeout" }
        : await this.#send({ callbackUrl: delivery.callbackUrl, body, headers }, signal, remaining);
    }
    const finishedAt = Math.max(lease.startedAt, this.#now());
    try {
      return { status: "attempted", delivery: this.store.finishDelivery(lease.eventId, lease.token, outcome, finishedAt) };
    } catch (error) {
      if (error instanceof StorageError && error.code === "conflict") return { status: "lease-lost", eventId: lease.eventId };
      // An uncertain DB commit leaves durable lease recovery in charge. Do not resend here.
      throw error;
    }
  }

  #send(request: Omit<TransportRequest, "signal">, signal: AbortSignal | undefined,
    deadlineMs: number): Promise<AttemptResult> {
    return new Promise(resolve => {
      const controller = new AbortController();
      let settled = false;
      const finish = (outcome: AttemptResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        controller.abort();
        resolve(outcome);
      };
      const cancel = (): void => finish({ kind: "cancelled" });
      const timer = setTimeout(() => finish({ kind: "timeout" }), deadlineMs);
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) { cancel(); return; }
      // A trusted transport rejection is ambiguous too, even if it threw before send.
      void Promise.resolve().then(() => settled ? undefined
        : this.#transport.send({ ...request, signal: controller.signal }))
        .then(outcome => {
          if (settled) return;
          switch (outcome?.kind) {
            case "http":
              if (Number.isInteger(outcome.status) && outcome.status >= 200 && outcome.status <= 599) {
                finish({ kind: "http", status: outcome.status });
              } else finish({ kind: "network-error" });
              break;
            case "timeout": case "network-error": case "destination-rejected": case "cancelled":
              finish({ kind: outcome.kind }); break;
            default: finish({ kind: "network-error" });
          }
        }).catch(() => finish({ kind: "network-error" }));
    });
  }
}
