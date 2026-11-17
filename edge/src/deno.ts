import { handleRequest } from "./http.js";

// Only the host API used here, kept local to avoid a runtime types dependency.
declare const Deno: {
  serve(options: { hostname: string; port: number; onListen: () => void }, handler: typeof handleRequest): unknown;
};

export { handleRequest };

// Importing the handler in a test or application must not open a listener.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  Deno.serve({
    hostname: "127.0.0.1",
    port: 8787,
    onListen: () => console.log("Chart HTTP listening on http://127.0.0.1:8787")
  }, handleRequest);
}
