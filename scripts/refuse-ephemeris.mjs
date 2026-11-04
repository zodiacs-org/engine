// Check L4 of docs/evidence/1.1.0-rc.2-20261102/lite/PREREGISTRATION.md: load
// this module first (`node --import ./scripts/refuse-ephemeris.mjs ...`) and
// the process cannot load astronomy-engine. It registers a resolve hook that
// throws, with a message that begins "refuse-ephemeris:", for the specifier
// astronomy-engine and any path under it. The export smoke test imports
// @zodiacs/engine/lite under it, which must load with every export defined,
// and the root entry, which must fail with the hook's message (the control).
// It has no other effect, and exports nothing.
import { register } from "node:module";

const hooks = `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === "astronomy-engine" || specifier.startsWith("astronomy-engine/")) {
    throw new Error("refuse-ephemeris: " + specifier + " may not be loaded; imported by " + (context.parentURL ?? "the command line"));
  }
  return nextResolve(specifier, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);
