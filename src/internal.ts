/**
 * Zodiacs.org site compatibility primitives.
 *
 * This entry point is intentionally not part of the public API promise. It
 * exists so the site and the published package execute the same ephemeris
 * implementation without making scanner-oriented primitives permanent API.
 * Third-party integrations should import from `@zodiacs/engine` instead.
 *
 * @internal
 */
export { bodyLongitude, computeBodies, computeChart, longitudeSpeed } from "./ephemeris.js";
