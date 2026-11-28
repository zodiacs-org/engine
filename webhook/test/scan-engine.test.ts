import { describe, expect, it } from "vitest";
import { ScanWorker } from "../src/scan-worker.js";
import { WebhookStore } from "../src/storage.js";
import { parseEventFilter } from "../src/subscription.js";

const DAY = 86_400_000;
const examples = [
  { filter: { kind: "ingress", body: "Sun", sign: "aquarius" }, start: "2000-01-01", end: "2000-02-01" },
  { filter: { kind: "aspect-exact", bodies: ["Moon", "Sun"], angle: 0 }, start: "2000-01-01", end: "2000-02-01" },
  { filter: { kind: "station", body: "Mercury" }, start: "2000-02-01", end: "2000-04-01" },
  { filter: { kind: "eclipse", type: "any" }, start: "2000-01-01", end: "2000-03-01" }
];

describe("worker with the relative-source engine (integration, not accuracy evidence)", () => {
  it.each(examples)("retains identical $filter.kind deliveries when rescan windows change", example => {
    const store = new WebhookStore(":memory:");
    try {
      const start = Date.parse(example.start + "T00:00:00Z"), end = Date.parse(example.end + "T00:00:00Z");
      const spec = {
        callbackUrl: "https://receiver.example/events", secretRef: "runtime_key_ref",
        filter: parseEventFilter(example.filter),
        window: { start: new Date(start).toISOString(), end: new Date(end).toISOString() }
      };
      store.createSubscription("engine-integration", spec, start - 1);
      const policy = {
        maxWindowMs: end - start, stepMs: DAY / 4, maxEvaluations: 20_000,
        // Invented radii exercise delegation; they are not astronomical reference data.
        eclipse: { model: { sunRadiusAu: 0.005, earthRadiusAu: 0.00005, moonRadiusAu: 0.00001 },
          derivativeStepMs: 60_000 }
      };
      const worker = new ScanWorker(store, policy);
      const first = worker.scanSubscription("engine-integration", { now: end, through: end });
      expect(first.status).toBe("committed");
      const events = store.listEvents("engine-integration");
      expect(events.length).toBeGreaterThan(0);
      expect(store.getCursor("engine-integration")?.nextAt).toBe(end);
      for (const event of events) {
        const body = JSON.parse(event.payload);
        expect(body.event.positions.length).toBeGreaterThan(0);
        expect(body.event.positions.every((position: { receipt: { schema: string } }) =>
          position.receipt.schema === "zodiacs.calc-receipt.v1")).toBe(true);
        store.recordAttempt({ eventId: event.id, number: 1, startedAt: end, finishedAt: end,
          result: { kind: "http", status: 204 } }, { status: "delivered" });
      }
      const deliveries = store.listDeliveries();
      store.updateSubscription("engine-integration", 1, {
        ...spec, callbackUrl: "https://replacement.example/events", secretRef: "replacement_key_ref"
      }, end + 1);
      const partitioned = new ScanWorker(store, { ...policy, maxWindowMs: 7 * DAY, maxEvaluations: 40_000 });
      let inserted = 0, duplicates = 0;
      for (let offset = start; offset < end; offset += 7 * DAY) {
        const result = partitioned.scanSubscription("engine-integration", { now: end + 1, through: end });
        expect(result.status).toBe("committed");
        if (result.status !== "committed") throw new Error("Synthetic rescan did not commit.");
        inserted += result.inserted;
        duplicates += result.duplicates;
      }
      expect(inserted).toBe(0);
      expect(duplicates).toBe(events.length);
      expect(store.listEvents("engine-integration")).toEqual(events);
      expect(store.listDeliveries()).toEqual(deliveries);
      expect(store.getCursor("engine-integration")?.nextAt).toBe(end);
    } finally { store.close(); }
  });
});
