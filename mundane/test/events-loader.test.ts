import { beforeEach, expect, it, vi } from "vitest";
import { access } from "node:fs/promises";
import { loadEventsEclipseAdapter } from "../src/events-loader.js";

vi.mock("node:fs/promises", () => ({ access: vi.fn() }));
const settings = { model: { sunRadiusAu: 4, moonRadiusAu: 1, earthRadiusAu: 2 },
  stepMs: 1000, derivativeStepMs: 10, maxEvaluations: 100 };
beforeEach(() => vi.resetAllMocks());

it("checks only the sibling build entry and treats ENOENT as unavailable", async () => {
  vi.mocked(access).mockRejectedValue(Object.assign(new Error("absent"), { code: "ENOENT" }));
  expect(await loadEventsEclipseAdapter(settings)).toEqual({ status: "unavailable", reason: "not-installed" });
  expect(access).toHaveBeenCalledWith(new URL("../../events/build/src/index.js", import.meta.url));
});

it("propagates permission and IO errors instead of treating them as absent modules", async () => {
  const error = Object.assign(new Error("synthetic permission failure"), { code: "EACCES" });
  vi.mocked(access).mockRejectedValue(error);
  await expect(loadEventsEclipseAdapter(settings)).rejects.toBe(error);
});
