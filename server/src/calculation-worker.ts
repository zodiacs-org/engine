import { parentPort } from "node:worker_threads";
import { NatalEnvelopeError } from "../../src/receipt.js";
import { calculate } from "./calculations.js";
import type { CalculationTask } from "./calculations.js";
import { verifyEngine } from "./engine.js";
import { RequestValidationError } from "./request-validation.js";

const port = parentPort;
if (port === null) throw new Error("Calculation worker requires a parent.");

try {
  verifyEngine();
  port.on("message", (message: { type: string; id: number; task: CalculationTask; input: unknown; requestId: string }) => {
    if (message.type !== "calculate") return;
    try {
      const result = calculate(message.task, message.input, message.requestId);
      port.postMessage({ type: "result", id: message.id, result });
    } catch (error) {
      // The parent receives neither exceptions nor their messages or causes.
      const kind = error instanceof RequestValidationError ? "invalid_request"
        : error instanceof NatalEnvelopeError ? "receipt_unavailable" : "internal_error";
      port.postMessage({ type: "error", id: message.id, kind });
    }
  });
  port.postMessage({ type: "ready" });
} catch {
  port.postMessage({ type: "startup_failed" });
  port.close();
}
