# Phase 2 checklist

Changes stay in mcp/ and, when needed, .github/workflows/mcp.yml. Preserve
the phase 1 tools, native receipts, synthetic inputs and parent package isolation.
Use Node 22, at most three worker processes and gitignored generated folders.
Keep each file below 2 MB and project disk use below 2 GB; stop and record a
blocked run here before exceeding that cap.

- [x] P1 Add optional HTTP bearer authentication from an operator-selected environment variable or file, compare credentials in constant time, keep stdio unchanged, document configuration and test accepted, missing, wrong and invalid credentials without secret logging.
- [x] P2 Run event searches in stoppable workers with a per-request time budget, honour MCP cancellation, and test that interrupted work stops and later requests still succeed.
- [x] P3 Add HTTP rate and request size policies with bounded bookkeeping and tests for limits, recovery and authentication interaction.
- [x] P4 Exercise every tool through the official SDK client over stdio and HTTP, validate each structured result against its advertised JSON schema, and cover input errors, calculation errors and resource refusals.
- [x] P5 Review tool descriptions and outputs for computed facts and receipts, and add a regression scan of descriptions and synthetic example outputs for predictive wording.
- [ ] P6 Update client configuration snippets and add a short gateway operator checklist covering authentication, limits, cancellation, HTTPS, headers and private logs.
- [ ] P7 Run the complete MCP checks on Node 22, record reproducible phase 2 evidence and isolation checks, and keep the MCP workflow aligned with the project's own lockfile and checks.

P2 preserves stateless HTTP. Stdio cancellation notifications and current HTTP
request-stream cancellation stop workers. Older HTTP disconnects also stop work;
separate older cancellation POSTs cannot securely identify another client's
request. Those searches retain the execution deadline. The README documents
this boundary, and the cancellation tests enforce client isolation.

After each session, tick the completed milestone, append a plain one-line summary
to CHANGES.txt and stop. The harness handles commits, pushes and CI.
