# Geocode implementation plan

Work only in `geocode/`. Each session implements the next unchecked milestone,
runs its checks, marks it complete, appends a line to `CHANGES.txt`, and stops.
The harness owns commits, pushes and the draft pull request. Engine source,
packed files, release archives and root configuration remain unchanged.

The owner's `SCOPE-CHANGE.md` requires reuse of `atlas/` and the existing geo
API documented in `api/geo.api.md`. Atlas results take precedence within its
covered places and dates. New code adds worldwide place lookup and timezone
coverage outside that slice, without reimplementing either resolver.

- [x] M1 Establish an isolated private TypeScript project, Vitest checks, an immutable validated place-data contract, and architecture and licensing notes. Verify malformed data, coordinate boundaries, missing elevation, duplicate identifiers and snapshot isolation with synthetic fixtures.
- [x] M2 Add a small attributed GeoNames sample and a streaming offline index builder with source digests, deterministic output and strict field validation. Document downloading and rebuilding; ignore full dumps and generated indexes, and shard output so every generated data file stays below the repository file limit.
- [x] M3 Implement pure offline lookup for city, region and country text, Unicode normalization, aliases, explicit filters, deterministic ranking and ambiguity reporting. Test known cities from the sample, duplicate names, unknown queries and polar settlements.
- [x] M4 Add adapters to the existing atlas resolver and the engine's geo API via relative imports. Match atlas places by source GeoNames ID and give its covered results precedence; use IANA resolution outside that coverage. Preserve citations, uncertainty, provider metadata and gap/fold outcomes without reimplementing time math. Test atlas routing and independent tzdb references, including half-hour and quarter-hour zones.
- [x] M5 Compose lookup and civil-time resolution into the public library API. Require explicit place selection for ambiguous names, retain place and atlas/tzdb provenance, handle unavailable zones without offset guesses, and distinguish a date-only request from an instant. Test atlas coverage edges and propagate covered uncertainties instead of silently replacing them with tzdb.
- [x] M6 Add the `geocode lookup` and `geocode tz` CLI with local index selection, JSON output, help, input validation and stable exit statuses. Exercise it in subprocess tests without network access.
- [x] M7 Add an optional small HTTP server over the same library with lookup and timezone routes, bounded inputs, structured errors, loopback defaults and explicit startup and shutdown. Test request handling on ephemeral ports.
- [ ] M8 Add bounded per-client rate limiting, monotonic refill timing, overload handling and configurable proxy trust. Verify limits, recovery, concurrent clients and cleanup with a controlled clock.
- [ ] M9 Expand independent timezone evidence for historical DST gaps/folds, date-line jumps, old offsets and polar places outside the atlas slice. Test that atlas rules take precedence where they differ from tzdb. Record reference versions and sources, and test behavior when the host timezone database lacks an identifier.
- [ ] M10 Harden index loading and rebuilding against corrupt or mixed generations, partial writes, oversized rows and malformed source archives. Test atomic publication and interrupted builds using local synthetic sources.
- [ ] M11 Add an engine integration example using synthetic input and document API, CLI and service operation, data rebuilds, attribution, timezone limitations and privacy. Ensure examples run and every quantitative claim points to committed evidence.
- [ ] M12 Run the complete geocode checks, review library import side effects and offline operation, verify package exclusion and file sizes, and record final acceptance evidence and remaining limitations.

The API will return data and unresolved choices without chart computation.
Civil-time rules come from the existing atlas where covered, then the IANA
data already used by the engine elsewhere. A modern place record is not
evidence of historical jurisdiction boundaries; that limitation must remain
explicit. No timezone is inferred from longitude alone.
