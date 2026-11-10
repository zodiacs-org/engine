import type { DirectionConvention } from "../src/index.js";

// Compiler checks for the same incompatibilities enforced at the JSON boundary.
const valid = {
  system: "placidus-semiarc",
  mode: "zodiacal",
  motion: "direct",
  latitude: "zero-both",
  key: "ptolemy"
} as const satisfies DirectionConvention;

// @ts-expect-error A mundane convention must explicitly retain both latitudes.
const mixed: DirectionConvention = { ...valid, mode: "mundane" };
// @ts-expect-error The direction of motion cannot be inferred.
const missing: DirectionConvention = { system: valid.system, mode: valid.mode, latitude: valid.latitude, key: valid.key };
// @ts-expect-error A different direction method cannot masquerade as semi-arc.
const otherSystem: DirectionConvention = { ...valid, system: "regiomontanus" };
// @ts-expect-error Converse must name its construction, not infer an arc sign.
const implicitConverse: DirectionConvention = { ...valid, motion: "converse" };
// @ts-expect-error Direct motion must not carry an irrelevant converse choice.
const irrelevantConverse: DirectionConvention = { ...valid, converseConstruction: "placidus-role-swap" };
void mixed;
void missing;
void otherSystem;
void implicitConverse;
void irrelevantConverse;
