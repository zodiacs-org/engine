import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
const root = new URL("../", import.meta.url);
const bytes = await readFile(new URL("contracts/openapi.json", root));
const manifest = JSON.parse(await readFile(new URL("contracts/provenance.json", root), "utf8"));
if (createHash("sha256").update(bytes).digest("hex") !== manifest.subsetSha256) throw new Error("Contract digest mismatch");
const document = JSON.parse(bytes.toString("utf8"));
function contractTypes(document) {
  function typeOf(s) {
    if (s.$ref) {
      const match = /^#\/components\/schemas\/([^/]+)$/.exec(s.$ref);
      if (!match || !document.components.schemas[match[1]]) throw new Error("Unsupported schema reference");
      return "ComputeSchemas[" + JSON.stringify(match[1]) + "]";
    }
    if (Object.hasOwn(s, "const")) return JSON.stringify(s.const);
    if (s.enum) return s.enum.map(value => JSON.stringify(value)).join(" | ");
    const alternatives = s.oneOf || s.anyOf || s.allOf;
    if (alternatives) {
      const base = { ...s };
      delete base.oneOf; delete base.anyOf; delete base.allOf;
      const requiredOnly = s.oneOf && s.oneOf.every(item => Object.keys(item).every(key => key === "required"));
      const requiredNames = requiredOnly ? new Set(s.oneOf.flatMap(item => item.required || [])) : new Set();
      const branches = alternatives.map(item => {
        if (!requiredOnly) return typeOf(item);
        const required = new Set(item.required || []);
        return "{ " + [...requiredNames].map(key => JSON.stringify(key) + (required.has(key) ? ": unknown" : "?: never")).join("; ") + " }";
      });
      const combined = "(" + branches.join(s.allOf ? " & " : " | ") + ")";
      return Object.keys(base).some(key => ["type", "properties", "required"].includes(key)) ? "(" + typeOf(base) + ") & " + combined : combined;
    }
    if (Array.isArray(s.type)) return "(" + s.type.map(type => typeOf({ ...s, type })).join(" | ") + ")";
    if (s.type === "array") {
      if (s.prefixItems) return "[" + s.prefixItems.map(typeOf).join(", ") + (s.items === false || s.maxItems === s.prefixItems.length ? "" : ", ..." + typeOf(s.items && typeof s.items === 'object' ? s.items : {}) + "[]") + "]";
      if (Array.isArray(s.items)) throw new Error("Unsupported array contract");
      return "Array<" + typeOf(s.items && typeof s.items === 'object' ? s.items : {}) + ">";
    }
    if (s.type === "object" || s.properties || s.required) {
      const required = new Set(s.required || []);
      const properties = s.properties || {};
      const keys = [...new Set([...Object.keys(properties), ...required])];
      const rows = keys.map(key => JSON.stringify(key) + (required.has(key) ? "" : "?") + ": " + typeOf(properties[key] || {}));
      if (s.additionalProperties && typeof s.additionalProperties === "object") rows.push("[key: string]: " + typeOf(s.additionalProperties));
      else if (s.type === "object" && s.additionalProperties !== false) rows.push("[key: string]: unknown");
      return "{ " + rows.join("; ") + " }";
    }
    if (s.type === "string") return "string";
    if (s.type === "integer" || s.type === "number") return "number";
    if (s.type === "boolean") return "boolean";
    if (s.type === "null") return "null";
    if (s.type !== undefined) throw new Error("Unsupported schema type");
    return "unknown";
  }
  const operations = Object.entries(document.paths).filter(([_, path]) => path.post);
  if (operations.length !== 7) throw new Error("Expected seven compute operations");
  const lines = ["// Generated from contracts/openapi.json; regenerate with scripts/generate-contract.mjs.", "export interface ComputeSchemas {"];
  for (const [name, schema] of Object.entries(document.components.schemas)) lines.push(JSON.stringify(name) + ": " + typeOf(schema) + ";");
  lines.push("}", "export interface ComputeOperations {");
  for (const [path, item] of operations) {
    const post = item.post;
    const endpoint = path.replace("/api/v1/", "");
    lines.push(JSON.stringify(endpoint) + ": { request: " + typeOf(post.requestBody.content["application/json"].schema) + "; response: " + typeOf(post.responses["200"].content["application/json"].schema) + " };");
  }
  lines.push("}", "export const RESPONSE_SCHEMAS = {");
  for (const [path, item] of operations) {
    const endpoint = path.replace("/api/v1/", "");
    const example = Object.values(item.post.responses["200"].content["application/json"].examples)[0].value;
    if (typeof example.schema !== "string") throw new Error("Missing response schema identity");
    lines.push(JSON.stringify(endpoint) + ": " + JSON.stringify(example.schema) + ",");
  }
  lines.push("} as const;", "");
  return lines.join("\n");
}
const generated = contractTypes(document);
const output = new URL("src/contract.ts", root);
if (process.argv.includes("--check")) {
  if (await readFile(output, "utf8") !== generated) throw new Error("Generated Compute API types differ; regenerate");
} else {
  await writeFile(output, generated);
}
