# Compute API TypeScript client preparation

This private package calls the seven hosted Compute API endpoints.
Its request and response types are generated from the committed Compute-only
subset of the publicly served OpenAPI 3.1 document. The full served document
was compared with the build of site source
`e9a21981eeeb99b34f44b1a2325d80160dcf0fb0` in
[run 37895777038](https://github.com/zodiacs-org/site/actions/runs/37895777038).
`contracts/provenance.json` binds the full document and derived subset to
their digests and explains the transformation.

This is preparation under `clients/`, outside the engine package's packed
files and import graph. Its placeholder version is not a release. No npm
publication or acceptance of P3.4 is claimed. Stable core, Python client
delivery and final release/privacy checks remain separate.

## Usage

After a local build, import the private package's module:

~~~ts
import { createComputeClient, ComputeHttpError } from "./dist/index.js";

const client = createComputeClient({ timeoutMs: 15_000 });
try {
  const answer = await client.positions({
    instants: ["2026-09-29T12:00:00Z"],
    bodies: ["Sun", "Moon"],
  });
  console.log(answer.backend.version);
} catch (error) {
  if (error instanceof ComputeHttpError && error.status === 429) {
    console.log({ status: error.status, retryAfter: error.retryAfter });
  } else {
    throw error;
  }
}
~~~

The methods are `chart`, `positions`, `houses`, `events`, `time`,
`skyFact` and `elections`; `call` provides the typed endpoint vocabulary.
Each request accepts an optional `signal`. A custom `origin` and standard
`fetch` implementation support local development and embedding.

Calls send the request to the selected server. The client uses POST bodies,
omits credentials, refuses redirects and requests no-store behavior. It
does not cache results, log request data or retry failures. Successful
responses retain the backend version, receipt and citation. HTTP failures
retain status, Retry-After and the response separately from the error message.
The timeout covers fetch and response-body reading; caller cancellation
propagates without an automatic retry.

Generated TypeScript types describe the structural contract. Numeric ranges,
array budgets, calendar validity and other JSON Schema constraints remain
server checks. The transport checks the response envelope and schema identity;
it is not a complete runtime JSON Schema validator.

## Checks

From the engine checkout after `npm ci`:

~~~sh
node clients/typescript/scripts/generate-contract.mjs --check
npx --no-install tsc -p clients/typescript/tsconfig.checks.json --noEmit
npx --no-install tsc -p clients/typescript/tsconfig.json
node --test clients/typescript/checks/client.mjs
~~~

The read-only client workflow runs these on Node 20, 22 and 24. It checks
all seven source-contract examples, HTTP errors, cancellation, timeout,
real native-fetch body timeout and the generated request vocabulary.
Source-bound actual reports and producer identities are in `evidence/`.
The workflow also packs and installs the private client in a fresh temporary
consumer, compiling public request types and running transport checks against
its installed declarations and JavaScript. Final-carrier checks remain separate. The unchanged
engine, archive-rebuild, conformance and atlas gates remain required.

Contract material and generated declarations are derived from Zodiacs'
CC BY 4.0 OpenAPI document; authored transport code uses this repository's
MIT licence. See `NOTICE.md`. Private birth-data search inputs from the
previous executor are unavailable, so no new release-range/staged search
or private clearance is claimed. Publication waits for those prerequisites.
