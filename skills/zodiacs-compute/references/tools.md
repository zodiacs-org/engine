# Tool routing and verification

This reference was checked against the site's deployed rc.15-era contracts on
2026-10-01. Re-read live schemas and installed capabilities before use; no
static version label here overrides a returned receipt.

## Local stdio MCP

[Installation and digest instructions](https://zodiacs.org/developers/mcp/)
provide a versioned archive and its SHA-256. Verify those bytes before
extraction, follow the host's permission requirements, and use the documented
`node /absolute/path/to/package/server.mjs` command, not `npm start` as the
stdio host command. The latter writes an npm banner to the protocol stream.
The adapter archive is not an npm publication; do not invent an npm install
command for it.

The verified adapter source exposes:

| Tool | Use | Important boundary |
| --- | --- | --- |
| `get_capabilities` | Discover versions, record schemas, supported options and limits | Read this before choosing arguments |
| `calculate_natal_chart` | One chart from an explicit instant, with optional coordinates | `output: "record"` returns a comparison-ready record; unknown time suppresses angles/houses; no civil-zone resolution |
| `compare_calculation_records` | Explain differences between two records | Pass the `record` fields, not whole tool replies; exact deltas remain identifying |

The adapter's privacy boundary is local computation, not guaranteed local
conversation processing. Its capability metadata and a supplied record are
self-reported statements; neither authenticates arbitrary external records.

Sources: [tool registration and input schemas](https://github.com/zodiacs-org/site/blob/9cfafa3e742de943062c9174338472781724a4b5/src/mcp/server.ts),
[adapter's detailed arguments and privacy model](https://github.com/zodiacs-org/site/blob/9cfafa3e742de943062c9174338472781724a4b5/examples/mcp-server/README.md).

## Hosted computation

Base: `https://zodiacs.org/api/v1/`. All six operations below are POST with
`Content-Type: application/json`. Use the
[live OpenAPI schemas and examples](https://zodiacs.org/api/v1/openapi.json)
for exact request and refusal shapes.

| Path | Use |
| --- | --- |
| `positions` | Longitudes, speeds, signs and retrograde state at explicit instants |
| `houses` | Requested house-system cusps with the actual method/fallback recorded |
| `chart` | Chart calculation from the supported UTC or local-time shape |
| `events` | Supported ingress, station and lunation searches within documented budgets |
| `time` | Civil-time resolution and ambiguity/history flags |
| `sky-fact` | Structured sign, retrograde or phase proposition; true, false or depends |

A public-sky example, containing no person's birth data:

```json
{"kind":"retrograde","body":"Mercury","date":"2026-10-24","zone":"America/New_York"}
```

Send it to `sky-fact`, not to a guessed MCP tool. A date-only answer can be
`depends` when the body stations during that day. Preserve the result's
computed facts rather than replacing the verdict with an all-day yes/no.

The initial production verification in [checkpoint 9](https://github.com/zodiacs-org/site/pull/610)
reported successful synthetic requests but left performance and cost open.
[Checkpoint 11](https://github.com/zodiacs-org/site/blob/be7b02db48bfa56a9c0a9ca735bc39c5f7f07b62/docs/platform/evidence/compute-api-2026-10-01/observability/README.md)
subsequently matched 120 Hot requests and measured warm execution/usage-cost
estimates; it observed no Cold samples and did not resolve the general
rate-limit threshold. The private process-cache retention finding also stays
open until that PR's source fix is deployed and verified.
Prefer local processing for personal charts, and do not infer privacy,
performance or mathematical completeness from HTTP 200.

Sources: [example requests](https://github.com/zodiacs-org/site/blob/9cfafa3e742de943062c9174338472781724a4b5/src/lib/compute-api/examples.ts),
[receipt/citation construction](https://github.com/zodiacs-org/site/blob/9cfafa3e742de943062c9174338472781724a4b5/src/lib/compute-api/receipt.ts),
[methodology and measured limits](https://zodiacs.org/methodology/).

## Direct engine use

Use the installed package's exports and declarations, not the repository's
default branch, as the contract. Check the registry for the version actually
published and compare it with the receipt. On 2026-10-01 the verified
[rc.16 release workflow](https://github.com/zodiacs-org/engine/actions/runs/36858851623)
published engine `0.1.1-rc.16` under `next`; `latest` remained rc.15. A carried
archive alone is not evidence of registry publication or deployed site adoption.

For authorized local use, the root entry calculates charts; `@zodiacs/engine/geo`
provides civil-time preparation/resolution in supported releases. Check the
installed declaration before calling it and preserve returned ambiguity flags.
The separate `calc`, `window`, `houses`, `sky` and `techniques` entries in rc.16
must not be assumed present in an older installed release or in the MCP adapter.

Do not load a third-party ephemeris, fetch a kernel, start a paid service or
publish a package merely because the requested calculation is unsupported.
Report the actual gap and retain the user's chosen execution/privacy boundary.
