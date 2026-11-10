import { handleRequest } from "./http.js";

// Cloudflare module Worker entry. Calculation needs no bindings or context.
export default { fetch: handleRequest };
