import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli.js";
import { LOCAL_CLOSEST_APPROACH_LIMITS, searchLocalClosestApproaches, searchWindow } from "../src/index.js";
import type { WindowRequest } from "../src/index.js";

// Development event and synthetic station. These are composition checks;
// published timing accuracy is enforced separately by the frozen references.
const window = { from: "2024-05-31", to: "2024-06-01" };
const observer = { latitude: -20, longitude: 0, elevationMeters: 0 };
const query = { kind: "local-closest-approach", target: "Saturn", observer } as const;
async function* stdin(value: unknown) { yield JSON.stringify(value); }

describe("local closest approach in the window API and CLI", () => {
  it("preserves the direct result and separates a minimum from disk contacts", async () => {
    const result = searchWindow({ window, queries: [query,
      { kind: "lunar-contacts", target: "Saturn", observer }] });
    expect(result.status).toBe("complete");
    if (result.status !== "complete") throw new Error(result.reason);
    const minimum = result.results[0]!;
    const contacts = result.results[1]!;
    if (minimum.kind !== "local-closest-approach" || contacts.kind !== "lunar-contacts") throw new Error("Wrong kinds");
    expect(minimum.result).toEqual(searchLocalClosestApproaches({ window, target: "Saturn", observer }));
    expect(minimum.result.events).toHaveLength(1);
    expect(contacts.result.contacts).toHaveLength(4);
    const at = minimum.result.events[0]!.at;
    expect(at > contacts.result.contacts[1]!.at && at < contacts.result.contacts[2]!.at).toBe(true);
    expect(result.receipt.work.samples).toBe(minimum.result.receipt.search.samples + contacts.result.receipt.search.samples);
    expect(searchWindow(result.receipt.request)).toEqual(result);

    const reply = await runCli(["window"], stdin({ window, queries: [query] }));
    expect(reply.exitCode).toBe(0);
    const encoded = JSON.parse(reply.stdout);
    expect(encoded.result.results[0].result).toEqual(minimum.result);
    expect(encoded.receipt.command).toBe("window");
  });

  it("does not replenish a shared sample budget for the new search", () => {
    const one = searchWindow({ window, queries: [query] });
    expect(one.status).toBe("complete");
    const used = one.receipt.work.samples;
    const exact = searchWindow({ window, queries: [query, query], maxSamples: used });
    expect(exact).toMatchObject({ status: "refused", reason: "sample-budget", results: [],
      failure: { queryIndex: 1, kind: "local-closest-approach", receipt: null },
      receipt: { work: { completedQueries: 1, attemptedQueries: 1, samples: used } } });
    const late = searchWindow({ window, queries: [query, query], maxSamples: 2 * used - 1 });
    expect(late).toMatchObject({ status: "refused", results: [], failure: { queryIndex: 1, reason: "sample-budget" } });
    expect(late.receipt.work.samples).toBeLessThanOrEqual(2 * used - 1);
  });

  it.each([
    { ...query, observer: undefined }, { ...query, observer: null },
    { ...query, target: "Moon" }, { ...query, target: "sao:0" },
    { ...query, maximumSeparationDegrees: 1 },
    { ...query, stepDays: LOCAL_CLOSEST_APPROACH_LIMITS.maximumStepDays * 2 },
    { ...query, maxSamples: LOCAL_CLOSEST_APPROACH_LIMITS.maximumMaxSamples + 1 }
  ])("validates all local-minimum input before any query executes %#", (invalid) => {
    expect(() => searchWindow({ window, queries: [query, invalid] } as WindowRequest)).toThrow(RangeError);
  });
});
