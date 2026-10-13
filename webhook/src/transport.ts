import { X509Certificate } from "node:crypto";
import { lookup } from "node:dns/promises";
import type { ClientRequest, IncomingMessage } from "node:http";
import { request as httpsRequest, type RequestOptions } from "node:https";
import { isIP } from "node:net";
import { checkServerIdentity, type TLSSocket } from "node:tls";
import { isPublicAddress, matchesPinnedAddress } from "./destination.js";
import { parseCallbackUrl } from "./subscription.js";
import { MAX_WEBHOOK_BODY_BYTES, parseSignatureHeaders, type WebhookSignatureHeaders } from "./signatures.js";
import type { AttemptResult } from "./storage-types.js";

export const TRANSPORT_LIMITS = Object.freeze({
  deadlineMs: 60_000,
  responseBytes: 65_536,
  responseHeaderBytes: 16_384,
  addresses: 64,
});

export interface TransportPolicy {
  /** Whole attempt, including name resolution, connect, TLS and response. */
  readonly deadlineMs: number;
  readonly maxResponseBytes: number;
  readonly maxResponseHeaderBytes: number;
  readonly maxAddresses: number;
}
export interface ResolvedAddress { readonly address: string; readonly family: 4 | 6 }
/** Trusted implementation seams, never configurable by subscriptions or control JSON. */
export interface TransportDependencies {
  readonly resolve: (hostname: string, signal: AbortSignal) => Promise<readonly ResolvedAddress[]>;
  readonly request: (options: RequestOptions, receive: (response: IncomingMessage) => void) => ClientRequest;
}
export interface TransportRequest {
  readonly callbackUrl: string;
  /** Exact saved UTF-8 payload bytes, already signed. Copied before asynchronous work. */
  readonly body: Uint8Array;
  readonly headers: WebhookSignatureHeaders;
  readonly signal?: AbortSignal;
}
export type TransportResult = AttemptResult | { readonly kind: "cancelled" };

export class TransportError extends Error {
  readonly code = "invalid-input";
  constructor() { super("Invalid webhook transport input."); this.name = "TransportError"; }
}

const defaults: TransportDependencies = {
  // Node's OS resolver is not cancellable. Late results are discarded by send().
  resolve: async hostname => lookup(hostname, { all: true, verbatim: true }) as Promise<ResolvedAddress[]>,
  request: (options, receive) => httpsRequest(options, receive),
};

function limit(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= max;
}
function headerBytes(headers: readonly string[]): number {
  return headers.reduce((size, value) => size + Buffer.byteLength(value, "utf8") + 2, 0);
}

/** One attempt only. Persistence, retries, leases and key selection belong to the worker. */
export class HttpsTransport {
  #policy: TransportPolicy;
  #dependencies: TransportDependencies;

  constructor(policy: TransportPolicy, dependencies: TransportDependencies = defaults) {
    try {
      const { deadlineMs, maxResponseBytes, maxResponseHeaderBytes, maxAddresses } = policy;
      if (!limit(deadlineMs, TRANSPORT_LIMITS.deadlineMs)
        || !limit(maxResponseBytes, TRANSPORT_LIMITS.responseBytes)
        || !limit(maxResponseHeaderBytes, TRANSPORT_LIMITS.responseHeaderBytes)
        || !limit(maxAddresses, TRANSPORT_LIMITS.addresses)
        || typeof dependencies.resolve !== "function" || typeof dependencies.request !== "function") throw new Error();
      this.#policy = Object.freeze({ deadlineMs, maxResponseBytes, maxResponseHeaderBytes, maxAddresses });
      this.#dependencies = Object.freeze({ resolve: dependencies.resolve, request: dependencies.request });
    } catch { throw new TransportError(); }
  }

  send(input: TransportRequest): Promise<TransportResult> {
    let url: URL;
    let body: Buffer;
    let headers: WebhookSignatureHeaders;
    let signal: AbortSignal | undefined;
    try {
      const { callbackUrl, body: inputBody, headers: inputHeaders, signal: inputSignal } = input;
      url = new URL(parseCallbackUrl(callbackUrl));
      if (!(inputBody instanceof Uint8Array) || inputBody.byteLength > MAX_WEBHOOK_BODY_BYTES) throw new Error();
      body = Buffer.from(inputBody);
      const parsed = parseSignatureHeaders(inputHeaders);
      // Transport never forwards arbitrary headers, including authorization or Host overrides.
      if (!parsed || Object.keys(inputHeaders).length !== 4) throw new Error();
      headers = Object.freeze(parsed);
      signal = inputSignal;
      if (signal !== undefined && !(signal instanceof AbortSignal)) throw new Error();
    } catch { throw new TransportError(); }
    const hostname = url.hostname.replace(/^\[|\]$/gu, "");
    const policy = this.#policy;

    return new Promise(resolve => {
      let settled = false;
      let request: ClientRequest | undefined;
      let response: IncomingMessage | undefined;
      const controller = new AbortController();
      const finish = (result: TransportResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener("abort", cancel);
        controller.abort();
        response?.destroy();
        request?.destroy();
        resolve(Object.freeze(result));
      };
      const cancel = (): void => finish({ kind: "cancelled" });
      const timer = setTimeout(() => finish({ kind: "timeout" }), policy.deadlineMs);
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) { cancel(); return; }

      const receive = (incoming: IncomingMessage): void => {
        if (settled) { incoming.destroy(); return; }
        response = incoming;
        incoming.on("error", () => finish({ kind: "network-error" }));
        incoming.once("aborted", () => finish({ kind: "network-error" }));
        incoming.once("close", () => {
          if (!incoming.complete) finish({ kind: "network-error" });
        });
        const status = incoming.statusCode;
        if (!Number.isInteger(status) || status! < 200 || status! > 599
          || headerBytes(incoming.rawHeaders) > policy.maxResponseHeaderBytes) {
          finish({ kind: "network-error" }); return;
        }
        // Never follow Location, even to another public HTTPS destination.
        if (status! >= 300 && status! < 400) { finish({ kind: "http", status: status! }); return; }
        const contentLength = incoming.headers["content-length"];
        if (contentLength !== undefined && (!/^\d+$/u.test(contentLength)
          || BigInt(contentLength) > BigInt(policy.maxResponseBytes))) {
          finish({ kind: "network-error" }); return;
        }
        let bytes = 0;
        // Discard chunks; never retain, decompress, parse or log receiver content.
        incoming.on("data", (chunk: Buffer) => {
          bytes += chunk.byteLength;
          if (bytes > policy.maxResponseBytes) finish({ kind: "network-error" });
        });
        incoming.once("end", () => {
          if (!incoming.complete || headerBytes(incoming.rawHeaders) + headerBytes(incoming.rawTrailers)
            > policy.maxResponseHeaderBytes) finish({ kind: "network-error" });
          else finish({ kind: "http", status: status! });
        });
      };

      const start = async (): Promise<void> => {
        const family = isIP(hostname);
        const answers = family ? [{ address: hostname, family }]
          : await this.#dependencies.resolve(hostname, controller.signal);
        if (settled) return;
        if (!Array.isArray(answers) || answers.length === 0 || answers.length > policy.maxAddresses
          || answers.some(answer => !answer || !isPublicAddress(answer.address)
            || isIP(answer.address) !== answer.family)) {
          finish({ kind: "destination-rejected" }); return;
        }
        const pinned = answers[0]!;
        const options: RequestOptions & { autoSelectFamily: false } = {
          protocol: "https:", hostname: pinned.address, family: pinned.family,
          port: url.port ? Number(url.port) : 443,
          method: "POST", path: url.pathname + url.search,
          agent: false, autoSelectFamily: false, rejectUnauthorized: true,
          minVersion: "TLSv1.2", servername: family ? "" : hostname,
          // Certificate identity remains the original name, never the selected IP.
          checkServerIdentity: (_name, cert) => {
            if (!family) return checkServerIdentity(hostname, cert);
            // checkIP reads the IP SAN directly, including IPv6. Some Node 22
            // checkServerIdentity versions apply DNS normalization to IPv6 text.
            try {
              if (new X509Certificate(cert.raw).checkIP(hostname)) return undefined;
            } catch { /* Return a fixed mismatch, without certificate or URL data. */ }
            return new Error("Webhook TLS identity mismatch.");
          },
          maxHeaderSize: policy.maxResponseHeaderBytes,
          headers: {
            ...headers, host: url.host, "content-type": "application/json",
            "content-length": String(body.byteLength), connection: "close",
          },
        };
        request = this.#dependencies.request(options, receive);
        request.on("error", () => finish({ kind: "network-error" }));
        request.once("upgrade", (_incoming, socket) => { socket.destroy(); finish({ kind: "network-error" }); });
        request.once("socket", socket => {
          // No headers or body are flushed until authenticated TLS and the peer pin agree.
          socket.once("secureConnect", () => {
            if (settled) return;
            const tls = socket as TLSSocket;
            if (!tls.encrypted || !tls.authorized) { finish({ kind: "network-error" }); return; }
            if (!matchesPinnedAddress(tls.remoteAddress, pinned.address)) {
              finish({ kind: "destination-rejected" }); return;
            }
            try { request!.end(body); } catch { finish({ kind: "network-error" }); }
          });
        });
      };
      void start().catch(() => finish({ kind: "network-error" }));
    });
  }
}
