// Keep the repository's untyped atlas module behind a local declaration boundary.
// This bridge neither loads its data nor copies its implementation.
export { loadAtlas, resolve } from "../../atlas/tools/lib.mjs";
