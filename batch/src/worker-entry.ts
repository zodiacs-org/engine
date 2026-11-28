import { parentPort } from "node:worker_threads";
import { executeWorkItem } from "./execution.js";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol.js";

if (!parentPort) throw new Error("The calculation worker requires a parent port.");
const port = parentPort;

port.on("message", (request: WorkerRequest) => {
  // Only this pool sends requests. Malformed transport input stops the worker
  // without echoing any supplied values to stderr or back to the parent.
  if (!request || typeof request.taskId !== "string" || !request.item
    || !Number.isSafeInteger(request.item.index) || request.item.index < 0
    || !["charts", "transit-grid", "synastry-matrix"].includes(request.item.kind)) {
    process.exit(1);
  }
  let response: WorkerResponse;
  try {
    response = { taskId: request.taskId, ok: true, row: executeWorkItem(request.item) };
  } catch {
    response = { taskId: request.taskId, ok: false, code: "calculation-failed" };
  }
  port.postMessage(response);
});

port.on("messageerror", () => { process.exit(1); });
