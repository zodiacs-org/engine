import { describeEventSearch, searchEvents } from "./event-search.js";
import type { DiscoveredEvent, EventSearchRequest, EventSearchResult } from "./event-search-types.js";
import { createOccurrence, digest, occurrencePolicy, stableJson } from "./occurrence.js";
import { StorageError, STORAGE_LIMITS, WebhookStore } from "./storage.js";
import type { ScanPageRequest, ScanPageResult, ScanPolicy, ScanRequest, ScanResult } from "./scan-types.js";
import { customQueryMatches, parseCustomQuery, requiresEclipse } from "./custom-query.js";

export class ScanWorkerError extends Error {
  constructor(readonly code: "invalid-options" | "invalid-search-result" | "search-failed") {
    super(`Webhook scan: ${code}.`);
    this.name = "ScanWorkerError";
  }
}

function invalid(): never { throw new ScanWorkerError("invalid-options"); }
function positive(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) invalid();
}
function instant(value: unknown): asserts value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || Math.abs(value) > 8.64e15) invalid();
}
function validateRequest(request: ScanRequest): void {
  if (!request || typeof request !== "object") invalid();
  instant(request.now);
  instant(request.through);
  if (request.signal !== undefined && !(request.signal instanceof AbortSignal)) invalid();
}

function eventMatches(event: DiscoveredEvent, request: EventSearchRequest): boolean {
  const { filter } = request, definition = event.definition;
  if (event.kind !== filter.kind || !Number.isSafeInteger(event.atMs) ||
      event.atMs < Date.parse(request.window.start) || event.atMs >= Date.parse(request.window.end) ||
      event.at !== new Date(event.atMs).toISOString() || definition.atMs !== event.atMs || definition.clock !== "utc" ||
      !Array.isArray(event.positions) || event.positions.length === 0 ||
      event.positions.some(position => position.status !== "ok" || !position.receipt)) return false;
  switch (filter.kind) {
    case "custom": return customQueryMatches(parseCustomQuery(filter.expression), definition);
    case "ingress": return definition.kind === "sign-ingress" && definition.body === filter.body &&
      definition.toSign.toLowerCase() === filter.sign && (filter.direction === "any" || definition.direction === filter.direction);
    case "station": return definition.kind === "station" && definition.body === filter.body &&
      (filter.direction === "any" || definition.direction === filter.direction);
    case "aspect-exact": return definition.kind === "exact-aspect" && definition.body === filter.bodies[0] &&
      definition.target.kind === "moving" && definition.target.body === filter.bodies[1] &&
      definition.aspect.angleDegrees === filter.angle;
    case "eclipse": return (definition.kind === "solar" || definition.kind === "lunar") &&
      (filter.type === "any" || definition.kind === filter.type);
  }
}

/**
 * Pull-driven discovery worker. Each call scans at most one bounded slice per
 * subscription. It performs no HTTP, starts no timer, and never holds a SQLite
 * write transaction during calculation. The optional search is trusted local code.
 */
export class ScanWorker {
  readonly #policy: ScanPolicy;
  readonly #search: (input: EventSearchRequest) => EventSearchResult;

  constructor(readonly store: WebhookStore, policy: ScanPolicy,
    search: (input: EventSearchRequest) => EventSearchResult = searchEvents) {
    if (!policy || typeof policy !== "object" || typeof search !== "function" ||
        Object.keys(policy).some(key => !["maxWindowMs", "stepMs", "maxEvaluations", "eclipse"].includes(key))) invalid();
    positive(policy.maxWindowMs); positive(policy.stepMs); positive(policy.maxEvaluations);
    // Reuse the adapter's validation for the numerical settings without calculation.
    let eclipse: ScanPolicy["eclipse"];
    try {
      const metadata = describeEventSearch({
        filter: policy.eclipse === undefined ? { kind: "ingress", body: "Sun", sign: "aries", direction: "any" }
          : { kind: "eclipse", type: "any" },
        window: { start: "2000-01-01T00:00:00.000Z", end: "2000-01-01T00:00:00.001Z" },
        stepMs: policy.stepMs, maxEvaluations: policy.maxEvaluations,
        ...(policy.eclipse === undefined ? {} : { eclipse: policy.eclipse })
      });
      eclipse = metadata.eclipse ?? undefined;
    } catch { invalid(); }
    this.#policy = Object.freeze({ maxWindowMs: policy.maxWindowMs, stepMs: policy.stepMs,
      maxEvaluations: policy.maxEvaluations, ...(eclipse ? { eclipse } : {}) });
    this.#search = search;
  }

  scanSubscription(subscriptionId: string, input: ScanRequest): ScanResult {
    validateRequest(input);
    // Capture local options before invoking any trusted search seam.
    const { now, through, signal } = input;
    const subscription = this.store.getSubscription(subscriptionId);
    const idle = (reason: Extract<ScanResult, { status: "idle" }>["reason"]): ScanResult =>
      ({ status: "idle", subscriptionId, reason });
    if (!subscription) return idle("not-found");
    if (subscription.deletedAt !== null) return idle("deleted");
    if (!subscription.spec.enabled) return idle("disabled");
    // A page can observe a record edited after its captured clock value. Let
    // later subscriptions proceed; a fresh call can use the updated clock/state.
    if (now < subscription.updatedAt) {
      return { status: "conflict", subscriptionId, window: subscription.spec.window, evaluations: 0 };
    }
    const cursor = this.store.getCursor(subscriptionId);
    // A concurrent subscription edit can fall between these two reads.
    if (!cursor || cursor.revision !== subscription.revision) {
      return { status: "conflict", subscriptionId, window: subscription.spec.window, evaluations: 0 };
    }
    const from = cursor.nextAt, end = Date.parse(subscription.spec.window.end);
    if (from >= end) return idle("schedule-complete");
    if (from >= through) return idle("not-due");
    // Limit the difference first, avoiding an unsafe addition near Date's limits.
    const to = from + Math.min(end - from, through - from, this.#policy.maxWindowMs);
    const window = Object.freeze({ start: new Date(from).toISOString(), end: new Date(to).toISOString() });
    const context = { subscriptionId, window };
    const refused = (reason: Extract<ScanResult, { status: "refused" }>["reason"], evaluations = 0): ScanResult =>
      ({ ...context, status: "refused", reason, evaluations });
    if (signal?.aborted) return refused("cancelled");
    if (subscription.spec.filter.kind === "custom") {
      try { parseCustomQuery(subscription.spec.filter.expression); } catch { return refused("unsupported-filter"); }
    }
    const request: EventSearchRequest = {
      filter: subscription.spec.filter, window, stepMs: this.#policy.stepMs,
      maxEvaluations: this.#policy.maxEvaluations, ...(signal ? { signal } : {}),
      ...(requiresEclipse(subscription.spec.filter) && this.#policy.eclipse ? { eclipse: this.#policy.eclipse } : {})
    };
    let metadata;
    try { metadata = describeEventSearch(request); } catch { invalid(); }
    const policy = occurrencePolicy(metadata), policyKey = `scan_v1_${digest(policy)}`;
    const priorPolicy = this.store.getScanPolicy(subscriptionId);
    if (priorPolicy !== undefined && priorPolicy !== policyKey) return refused("policy-conflict");

    let result: EventSearchResult;
    try { result = this.#search(request); } catch { throw new ScanWorkerError("search-failed"); }
    try {
      if (!result || !Number.isSafeInteger(result.evaluations) || result.evaluations < 0 ||
          result.evaluations > request.maxEvaluations || stableJson(result.search) !== stableJson(metadata) ||
          !Array.isArray(result.events) || (result.status !== "complete" && result.status !== "refused")) {
        throw new Error();
      }
      if (result.status === "refused") {
        if (result.events.length !== 0 || !["evaluation-budget", "cancelled", "time-discontinuity",
          "unsupported-filter", "engine-refused"].includes(result.reason)) throw new Error();
        return refused(result.reason, result.evaluations);
      }
    } catch { throw new ScanWorkerError("invalid-search-result"); }
    if (signal?.aborted) return refused("cancelled", result.evaluations);
    if (result.events.length > STORAGE_LIMITS.eventsPerScan) return refused("event-limit", result.evaluations);
    let events;
    try {
      events = result.events.map(event => {
        if (!eventMatches(event, request)) throw new Error();
        return createOccurrence(subscriptionId, event, policy);
      });
    } catch { throw new ScanWorkerError("invalid-search-result"); }
    if (events.some(event => Buffer.byteLength(event.payload, "utf8") > STORAGE_LIMITS.payloadBytes)) {
      return refused("payload-limit", result.evaluations);
    }
    if (signal?.aborted) return refused("cancelled", result.evaluations);
    try {
      const committed = this.store.commitScan({ subscriptionId, expectedRevision: subscription.revision,
        from, to, now, events, policyKey });
      return { ...context, status: "committed", ...committed, evaluations: result.evaluations };
    } catch (error) {
      if (error instanceof StorageError && (error.code === "conflict" || error.code === "not-found")) {
        return { ...context, status: "conflict", evaluations: result.evaluations };
      }
      throw error;
    }
  }

  /** Continue using lastId even when a subscription refuses; restart at the beginning after exhaustion. */
  scanPage(input: ScanPageRequest): ScanPageResult {
    validateRequest(input);
    positive(input.limit);
    if (input.limit > STORAGE_LIMITS.maxPageSize) invalid();
    const { afterId, limit, now, through, signal } = input;
    const subscriptions = this.store.listSubscriptions({ limit, ...(afterId === undefined ? {} : { afterId }) });
    const results = subscriptions.map(subscription => this.scanSubscription(subscription.id,
      { now, through, ...(signal ? { signal } : {}) }));
    return { results, lastId: subscriptions.at(-1)?.id ?? null, exhausted: subscriptions.length < limit };
  }
}
