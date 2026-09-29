/*
 * A small JSON Schema (2020-12) validator for atlas/schema/atlas.schema.json.
 *
 * It implements the keywords that schema uses and refuses any other, so a
 * schema edit cannot silently stop being enforced: $ref (local, #/$defs/...),
 * type, required, properties, additionalProperties (false only), enum, const,
 * pattern, minLength, minItems, minProperties, minimum, maximum, items, oneOf,
 * plus the annotations $schema, $id, title and description.
 */

const KEYWORDS = new Set([
  '$schema', '$id', '$defs', '$ref', 'title', 'description',
  'type', 'required', 'properties', 'additionalProperties', 'enum', 'const',
  'pattern', 'minLength', 'minItems', 'minProperties', 'minimum', 'maximum', 'items', 'oneOf',
]);

function typeOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function typeMatches(expected, value) {
  const actual = typeOf(value);
  if (expected === 'number') return actual === 'number' || actual === 'integer';
  return actual === expected;
}

function resolveRef(root, ref) {
  if (!ref.startsWith('#/')) throw new Error(`schema: only local $ref is supported (${ref})`);
  let node = root;
  for (const part of ref.slice(2).split('/')) {
    node = node?.[part];
    if (node === undefined) throw new Error(`schema: unresolved $ref ${ref}`);
  }
  return node;
}

/** Throws if the schema uses a keyword this validator does not implement. */
export function checkSchemaKeywords(schema, path = '#') {
  if (typeof schema !== 'object' || schema === null) return;
  for (const [key, value] of Object.entries(schema)) {
    if (!KEYWORDS.has(key)) throw new Error(`schema: unsupported keyword ${key} at ${path}`);
    if (key === 'additionalProperties' && value !== false) {
      throw new Error(`schema: additionalProperties must be false at ${path}`);
    }
    if (key === '$defs' || key === 'properties') {
      for (const [name, sub] of Object.entries(value)) checkSchemaKeywords(sub, `${path}/${key}/${name}`);
    } else if (key === 'items') {
      checkSchemaKeywords(value, `${path}/items`);
    } else if (key === 'oneOf') {
      value.forEach((sub, index) => checkSchemaKeywords(sub, `${path}/oneOf/${index}`));
    }
  }
}

/**
 * Validates `value` against `schema` (with `root` holding $defs).
 * Returns a list of problems, each "<json path>: <message>"; empty when valid.
 */
export function validate(value, schema, root = schema, path = '$') {
  const problems = [];
  if (schema.$ref) return validate(value, resolveRef(root, schema.$ref), root, path);

  if (schema.oneOf) {
    const results = schema.oneOf.map((sub) => validate(value, sub, root, path));
    const passing = results.filter((result) => result.length === 0).length;
    if (passing !== 1) {
      if (passing === 0) {
        // Report the branch that got furthest (fewest problems), which is
        // usually the one the author meant.
        const best = results.reduce((a, b) => (b.length < a.length ? b : a));
        problems.push(`${path}: matches none of ${schema.oneOf.length} alternatives`, ...best);
      } else {
        problems.push(`${path}: matches ${passing} alternatives, expected exactly one`);
      }
    }
    return problems;
  }

  if (schema.type && !typeMatches(schema.type, value)) {
    return [`${path}: expected ${schema.type}, found ${typeOf(value)}`];
  }
  if ('const' in schema && value !== schema.const) problems.push(`${path}: expected ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) problems.push(`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`);

  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) problems.push(`${path}: shorter than ${schema.minLength}`);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, 'u').test(value)) problems.push(`${path}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${path}: below ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${path}: above ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) problems.push(`${path}: fewer than ${schema.minItems} items`);
    if (schema.items) value.forEach((item, index) => problems.push(...validate(item, schema.items, root, `${path}[${index}]`)));
  }
  if (typeOf(value) === 'object') {
    for (const key of schema.required ?? []) {
      if (!(key in value)) problems.push(`${path}: missing ${key}`);
    }
    if (schema.minProperties !== undefined && Object.keys(value).length < schema.minProperties) {
      problems.push(`${path}: fewer than ${schema.minProperties} properties`);
    }
    const properties = schema.properties ?? {};
    for (const [key, item] of Object.entries(value)) {
      if (key in properties) problems.push(...validate(item, properties[key], root, `${path}.${key}`));
      else if (schema.additionalProperties === false) problems.push(`${path}: unexpected property ${key}`);
    }
  }
  return problems;
}
