import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";

const schema = JSON.parse(readFileSync(
  new URL("../schema/meaning-entry.schema.json", import.meta.url), "utf8"
));
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validateSchema = ajv.compile(schema);

/** Check a parsed JSON entry without coercion, defaults, or network access. */
export function validateEntry(entry) {
  const valid = validateSchema(entry);
  const errors = valid ? [] : validateSchema.errors.map(({ instancePath, keyword, message }) => ({
    path: instancePath || "/", keyword, message
  }));
  if (valid && entry.factor.kind === "aspect" && entry.factor.a === entry.factor.b) {
    errors.push({ path: "/factor", keyword: "distinctBodies", message: "aspect bodies must differ" });
  }
  return { valid: errors.length === 0, errors };
}
