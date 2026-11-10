import { expect, it } from "vitest";
import { createBodyAdapter } from "../src/body-adapter.ts";
import { MINOR_BODY_NAMES } from "../src/catalog.ts";
import { loadFullBody } from "../src/full.ts";
import { createIngressSearcher } from "../src/ingresses.ts";
import { invokeCli } from "./cli-process-helper.ts";

// These are CLI integration checks, not additional independent accuracy evidence.
// Missing full-data files fail this explicit suite, as for the other full tests.
it.each(MINOR_BODY_NAMES)("runs a native full-data %s position without a pilot fallback", async body => {
  const adapter = await createBodyAdapter([await loadFullBody(body)]);
  const time = { jd: 2451600.25, scale: "tt" as const };
  const expected = adapter.calcWithMinorBodies({ body, time });
  expect(expected.status).toBe("ok");
  const result = invokeCli(["position", "--body", body, "--jd", String(time.jd), "--scale", time.scale]);
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual(JSON.parse(JSON.stringify(expected)));
}, 120_000);

it("preserves nonempty Vesta ingress directions, sign labels and receipts through the native CLI", async () => {
  const adapter = await createBodyAdapter([await loadFullBody("Vesta")]);
  const request = { body: "Vesta" as const, from: { jd: 2451545.5, scale: "tt" as const },
    to: { jd: 2451908.5, scale: "tt" as const } };
  const expected = (await createIngressSearcher(adapter)).searchIngresses(request);
  if (expected.status !== "complete") throw new Error("Expected a completed Vesta integration scan.");
  expect(expected.ingresses.length).toBeGreaterThan(0);
  expect(expected.ingresses.some(event => event.direction === "retrograde")).toBe(true);
  const result = invokeCli(["ingresses", "--body", "Vesta", "--dataset", "full", "--from-jd", String(request.from.jd),
    "--to-jd", String(request.to.jd), "--scale", "tt"]);
  expect(result.code).toBe(0);
  expect(result.stderr).toBe("");
  expect(JSON.parse(result.stdout)).toEqual(JSON.parse(JSON.stringify(expected)));
}, 120_000);
