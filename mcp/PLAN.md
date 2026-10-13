# zodiacs-astro implementation plan

All changes stay in mcp/. Engine sources, release files and archives remain unchanged.
Use synthetic examples and preserve native engine receipts without claiming predictive validity.

- [x] M1 Record scope, milestones and repository constraints. Validate the plan for the harness.
- [x] M2 Scaffold an isolated TypeScript package with locked SDK dependencies and test commands.
- [ ] M3 Define validated inputs, structured outputs and receipt serialization.
- [ ] M4 Implement and test natal charts.
- [ ] M5 Implement and test transits at a date and now with an injectable clock.
- [ ] M6 Implement and test synastry without invented compatibility scores.
- [ ] M7 Implement and test solar and lunar returns.
- [ ] M8 Implement and test Moon phase and bounded event search.
- [ ] M9 Register MCP tools and verify discovery, schemas and protocol errors.
- [ ] M10 Implement and test stdio and Streamable HTTP transports and lifecycle.
- [ ] M11 Document client configuration, deployment boundaries and receipt citation.
- [ ] M12 Run integration and repository isolation checks, record evidence and prepare the draft PR handoff.

After each session run relevant checks, tick completed milestones and append a
one-line summary to CHANGES.txt, then stop. The harness commits, pushes and
updates the draft PR. Never run git commit, git push or gh; never merge, publish,
run the release workflow or cut an engine candidate.
