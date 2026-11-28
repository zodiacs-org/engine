import { readFileSync } from "node:fs";
import Ajv2020 from "ajv/dist/2020.js";
import { validateEntry } from "./validate-entry.mjs";

const readSchema = (name) => JSON.parse(readFileSync(
  new URL(`../schema/${name}.schema.json`, import.meta.url), "utf8"
));
const schema = readSchema("meaning-dataset");
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(readSchema("meaning-entry"));
const validateSchema = ajv.compile(schema);

// Field order is explicit. Aspect direction is immaterial under this policy.
// Called only after schema validation, so unknown factor kinds cannot enter.
function factorIdentity({ language, tradition, factor: f }) {
  let fields;
  switch (f.kind) {
    case "placement": fields = [f.body, f.sign]; break;
    case "aspect": fields = [...[f.a, f.b].sort(), f.aspect, f.policy]; break;
    case "house": fields = [f.body, f.house, f.houseSystem]; break;
    case "dignity": fields = [f.body, f.sign, f.dignity, f.system]; break;
  }
  return JSON.stringify([language, tradition, f.kind, ...fields]);
}

/**
 * Validate parsed JSON without mutation or external reference resolution.
 * General datasets may contain meaning variants of a factor. Seed mode requires
 * authored entries, distinct factors and coverage of each supported category.
 * Source entry IDs refer only to entries in this dataset, in any order.
 */
export function validateDataset(dataset, { seed = false } = {}) {
  const errors = [];
  const error = (path, keyword, message) => errors.push({ path, keyword, message });
  const report = () => ({ valid: errors.length === 0, errors });

  // Refuse oversized arrays before Ajv inspects every member with allErrors.
  if (Array.isArray(dataset?.entries) && dataset.entries.length > schema.properties.entries.maxItems) {
    error("/entries", "maxItems", `must NOT have more than ${schema.properties.entries.maxItems} items`);
    return report();
  }
  if (!validateSchema(dataset)) {
    for (const { instancePath, keyword, message } of validateSchema.errors) {
      error(instancePath || "/", keyword, message);
    }
    return report();
  }

  const { entries } = dataset;
  const indexById = new Map();
  let duplicateIds = false;
  entries.forEach((entry, index) => {
    // Preserve entry-level semantic rules as that validator evolves.
    for (const issue of validateEntry(entry).errors) {
      error(`/entries/${index}${issue.path === "/" ? "" : issue.path}`, issue.keyword, issue.message);
    }
    if (indexById.has(entry.id)) {
      duplicateIds = true;
      error(`/entries/${index}/id`, "uniqueEntryId", "entry id must be unique within the dataset");
    } else {
      indexById.set(entry.id, index);
    }
  });
  // Duplicate IDs make source resolution ambiguous; never choose one silently.
  if (duplicateIds) return report();

  if (seed) {
    const factors = new Set();
    const kinds = new Set();
    const dignities = new Set();
    entries.forEach((entry, index) => {
      if (entry.provenance.kind !== "authored") {
        error(`/entries/${index}/provenance/kind`, "authoredSeed", "seed entries must have authored provenance");
      }
      const key = factorIdentity(entry);
      if (factors.has(key)) {
        error(`/entries/${index}/factor`, "uniqueSeedFactor", "seed factor must be unique within its language and tradition");
      }
      factors.add(key);
      kinds.add(entry.factor.kind);
      if (entry.factor.kind === "dignity") dignities.add(entry.factor.dignity);
    });
    for (const kind of ["placement", "aspect", "house", "dignity"]) {
      if (!kinds.has(kind)) error("/entries", "seedCoverage", `seed must include a ${kind} factor`);
    }
    for (const dignity of ["domicile", "exaltation", "detriment", "fall"]) {
      if (!dignities.has(dignity)) error("/entries", "seedCoverage", `seed must include a ${dignity} factor`);
    }
  }

  // Keep provenance closed: no network lookup, implicit catalog or filename.
  const sources = entries.map((entry, index) => {
    if (entry.provenance.kind !== "generated") return [];
    const links = [];
    entry.provenance.sourceEntryIds.forEach((id, sourceIndex) => {
      const path = `/entries/${index}/provenance/sourceEntryIds/${sourceIndex}`;
      if (id === entry.id) {
        error(path, "selfSource", "entry must not cite itself as a source");
      } else if (!indexById.has(id)) {
        error(path, "missingSource", "source entry id must resolve within the dataset");
      } else {
        links.push({ index: indexById.get(id), path });
      }
    });
    return links;
  });

  // The entry cap also bounds recursion. A back edge proves a provenance cycle.
  const state = new Array(entries.length).fill(0);
  function visit(index) {
    state[index] = 1;
    for (const source of sources[index]) {
      if (state[source.index] === 1) {
        error(source.path, "sourceCycle", "source references must not form a cycle");
      } else if (state[source.index] === 0) {
        visit(source.index);
      }
    }
    state[index] = 2;
  }
  entries.forEach((_, index) => { if (state[index] === 0) visit(index); });
  return report();
}
