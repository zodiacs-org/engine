# Interpretation generation

The generator creates unreviewed symbolic meaning variants from explicitly
selected source entries. It defaults to the offline mock described in
[BACKENDS.md](BACKENDS.md). The mock exercises the pipeline; it does not read
factors or assess interpretive quality. No provider SDK, credential or paid
service is needed. The committed seed is authored separately from this pipeline;
generated meanings and manifests remain in ignored output directories.

## Run the CLI

After the local installation in [README.md](README.md), save a plan as
`evals/scratch/meaning-plan.json` from the repository root:

```sh
node --input-type=module <<'JS'
import { mkdir, writeFile } from "node:fs/promises";
await mkdir("evals/scratch", { recursive: true });
await writeFile("evals/scratch/meaning-plan.json", JSON.stringify({
  schemaVersion: "1.0.0",
  id: "example-meanings",
  seed: 0,
  license: { spdxId: "MIT", attribution: "Original local draft contributions." },
  targets: [{
    id: "draft-sun-aries",
    factor: { kind: "placement", body: "Sun", sign: "aries" },
    sourceEntryIds: ["seed-sun-aries"]
  }]
}, null, 2), { flag: "wx" });
JS
node evals/bin/generate-interpretations.mjs evals/data/seed.json evals/scratch/meaning-plan.json > evals/scratch/generation-summary.json
```

The command's JSON summary is saved in the ignored scratch directory. It has
the form `{ "directory": "evals/generated/<digest>", "reused": false }`.
The directory contains `dataset.json` and `manifest.json`. Its path is relative
to the repository root regardless of the working directory; input paths are
relative to the working directory. The CLI supports an explicit `--backend mock`
after its input paths. It does not load adapter modules or inspect environment
variables for a provider. `npm --prefix evals run generate -- <sources> <plan>`
is equivalent, with input paths relative to `evals/`.

Read the summary and validate the returned dataset from the repository root:

```sh
node --input-type=module <<'JS'
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
const { directory } = JSON.parse(await readFile("evals/scratch/generation-summary.json", "utf8"));
execFileSync(process.execPath, ["evals/bin/validate-dataset.mjs", `${directory}/dataset.json`], {
  stdio: "inherit"
});
JS
```

Rerun the generation command with the saved plan to check reuse. The input setup
uses `flag: "wx"` and refuses to replace an existing plan; it need not run again.
Identical inputs on the same implementation and runtime reuse a run only when
both existing output files match byte for byte. They are never overwritten.
This is a general dataset, not an authored seed, so validation omits `--seed`.
The example factor has no personal birth data. The
[CLI tests](tests/generator-cli.checks.mjs) exercise this plan shape, offline
generation, byte-identical reuse and dataset validation.

Exit status is zero on success, one on generation or input-contract failure,
and two on usage, file-read or file-write failure. Diagnostics are fixed messages
and do not echo paths, input prose or model errors. Successful output necessarily
contains the supplied meanings and attribution. Keep credentials out of inputs,
adapter labels, response text and files.

## Plan and generation contract

[generation-plan.schema.json](schema/generation-plan.schema.json) specifies
`schemaVersion`, output dataset `id`, integer `seed`, a required `license` and
`targets`. Each target has its own output `id`, a factor in the existing meaning
vocabulary and `sourceEntryIds` naming entries in the supplied source dataset.
Language is English and tradition is Western tropical. The caller supplies the
MIT attribution for new drafts; the model cannot supply or change it. A rights
label is a supplied claim, not evidence that a model response is original or
licensed for redistribution. Review generated prose and rights before reuse.

All source entries are retained with their original fields, text, provenance
and licenses. This keeps references closed even when a selected source itself
cites generated ancestors. New targets can cite only supplied sources; they
cannot depend on another target of the same run. Target ids must be unique
and cannot collide with a source id. Multiple meanings for a factor are allowed.
The generator does not verify whether a dignity assignment is astronomically
applicable or whether symbolic prose accurately describes its factor. Those are
separate questions from schema validity.

`generateInterpretations(sources, plan, options)` in
[lib/generate-interpretations.mjs](lib/generate-interpretations.mjs) returns an
immutable `{ dataset, manifest }`. Source and plan snapshots precede the first
asynchronous backend call; caller mutation cannot alter an in-progress run.
The library writes nothing. Options are `backend`, `adapters`, `limits` and
`signal`, using the existing backend contract. For a caller-owned adapter:

```js
import { generateInterpretations } from "./evals/lib/generate-interpretations.mjs";
import { writeGeneration } from "./evals/lib/generation-files.mjs";

// sources and plan are parsed local JSON; adapter follows BACKENDS.md.
const result = await generateInterpretations(sources, plan, {
  backend: adapter.id,
  adapters: [adapter]
});
const output = await writeGeneration(result);
```

Registration does not select an adapter unless its id is explicit. Adapters are
trusted host code, not sandboxed. The generator uses serial calls with no retry,
fallback, implicit cache, continuation or resume. It prevalidates the full plan,
source dataset, combined entry count, call budget and every prompt before calling
the backend. A response must finish with `stop` and parse as exactly the meaning
object. Markdown fences, invented metadata, invalid Unicode, extra fields,
invalid symbolic status and truncated or refused responses fail the entire run.
No partial dataset is returned or written. A later failure cannot undo backend
work already performed; custom adapters must enforce their own transport limits.

Generated provenance always records `kind: "generated"`, the selected backend
and model, prompt version, invocation digest, source ids and
`reviewStatus: "unreviewed"`. The generator checks every assembled entry and
the complete dataset. It does not rewrite source records or interpret validation
as review. Structural manifests have their own
[schema](schema/generation-manifest.schema.json).

## Prompt and reproducibility

[prompts/meaning-v1.json](prompts/meaning-v1.json) contains the original system
instruction, task text and version. The prompt requests only a symbolic meaning
object. The user message is canonical JSON containing the task, language,
tradition, target factor and selected source entries, including their metadata.
Treat changes to prompt behavior as a new versioned prompt. A custom model's
compliance with these instructions is not guaranteed by the schema.

The manifest records:

- The generator version, Node version and an implementation digest over named
  local code, schemas, prompt and dependency-lock bytes. The file list is explicit
  in the generator. Restart the process after changing these files.
- The canonical source dataset digest and its ordered entry ids, the full plan,
  selected backend metadata, transport limits and prompt digest.
- Each target's invocation digest from the backend contract, exact raw response
  digest and completed finish reason, followed by the canonical dataset digest.

Canonical JSON sorts object keys, preserves array order and exact string content,
and normalizes negative zero to zero. UTF-8 SHA-256 digests of that compact JSON
omit the file's trailing newline. No timestamp, temporary path or working
directory enters the manifest. Sources can be reconstructed from their manifest
id and ordered entry ids in the exported dataset; the full plan and committed
prompt reconstruct requests. Raw backend text is hashed before parsing but is
not saved separately. Its whitespace cannot be reconstructed from the dataset.

The output directory digest covers both complete file byte sequences, including
their newlines, using the framing in `writeGeneration`. Changed raw response
bytes therefore change the manifest and output directory even when their parsed
meaning is identical. The transport's invocation digest is independent of output
bytes. Output ids and the caller's new license enter the plan and artifact identity,
but do not enter the prompt; they do not change the invocation digest by themselves.

These records identify local inputs and outputs, not authenticated provider
receipts. A dependency lock does not authenticate the installed dependency bytes,
and custom adapter implementation bytes are not hashed. Their model and version
labels are supplied declarations. A seed alone cannot guarantee reproducibility
for a model. The [generator tests](tests/generator.checks.mjs) verify mock
repeatability across fresh processes, working directories and JSON key orders on
the same runtime, and independently check digest construction. No result here
establishes independent astronomical accuracy or predictive validity.

## Limits and file handling

The generator limits each input and each output file to 1 MiB. Written files
reserve space for a trailing newline. The source and generated entries together
must fit the dataset's cap of 256 entries, so a plan allows at most 255 targets;
each target may cite at most 32 sources. Canonical encoding additionally bounds
nesting depth and visited values. Backend requests and responses retain the byte,
call and deadline limits in [BACKENDS.md](BACKENDS.md). These are operational
ceilings, enforced by the [generator tests](tests/generator.checks.mjs) and
[file tests](tests/generation-files.checks.mjs), not accuracy claims. Oversized
aggregate output fails even when every individual meaning is valid.

The writer uses only `evals/generated/`, creates a temporary staging directory,
and renames a completed pair into its digest directory. Ordinary failures remove
staging files and locks. Existing destinations must contain exactly the matching
dataset and manifest. Readers reject nonregular files and invalid UTF-8; readers
and writers reject symlink path components. The file tests cover these refusals,
size boundaries, concurrent writers and injected staging/publication failures.
These checks assume a local filesystem not concurrently manipulated by an
uncooperative process; they are not a filesystem sandbox.

A held per-digest lock refuses another writer. A process crash can leave a lock
or staging directory. After confirming the process is no longer active, review
and remove only that abandoned ignored directory before retrying. Existing final
output files are never repaired or replaced automatically. Generated output is
not promoted into the committed seed set.
