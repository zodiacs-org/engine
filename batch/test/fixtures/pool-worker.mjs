import { parentPort, threadId } from "node:worker_threads";

parentPort.on("message", ({ taskId, item }) => {
  const id = item.person.id;
  if (id === "synthetic-throw") throw new Error("PRIVATE_WORKER_DIAGNOSTIC");
  if (id === "synthetic-exit") process.exit(0);
  if (id === "synthetic-hang") return;
  if (id === "synthetic-malformed") {
    parentPort.postMessage(null);
    return;
  }
  if (id === "synthetic-bad-error") {
    parentPort.postMessage({ taskId, ok: false, code: "PRIVATE_WORKER_DIAGNOSTIC" });
    return;
  }
  const response = {
    taskId: id === "synthetic-wrong-task" ? "incorrect" : taskId,
    ok: true,
    row: {
      version: 1, kind: item.kind, index: item.index, nextCursor: item.index + 1,
      personId: id === "synthetic-wrong-routing" ? "incorrect" : id,
      value: { threadId },
    },
  };
  if (id === "synthetic-bad-row") response.row.value = null;
  setTimeout(() => { parentPort.postMessage(response); }, id === "synthetic-slow" ? 100 : 0);
});
