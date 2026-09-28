# Research sources and scope

This companion contains original research scripts, reference requests/responses, numerical fixtures and measurement reports. It includes no Swiss Ephemeris code, binary, data file or Swiss-generated expected outputs. Existing engine and dependency notices remain applicable; this file does not change their licenses.

- NASA/JPL Horizons supplies the archived vector and observer-table references. Exact request parameters, returned solution labels, timestamps and raw digests are preserved. Consult the [manual](https://ssd.jpl.nasa.gov/horizons/manual.html) and [API documentation](https://ssd-api.jpl.nasa.gov/doc/horizons.html) for conventions and limitations.
- ERFA/PyERFA supplies independently generated orientation matrices. Its upstream source lineage derives from SOFA. Pinned versions, referenced official functions and selected numerical controls are documented under `rotation/`. Installed ERFA binaries are not redistributed in this package.
- Astronomy Engine 2.1.19 supplies the frozen engine's existing position model. This audit inspects and evaluates that dependency; it does not claim the same-dependency diagnostics are independent astronomical truth. Its MIT license and upstream notices remain applicable when the separate bootstrap installs it.
- Source inspection references pinned upstream code rather than redistributing an upstream source tree. See `source-review/SOURCE-REVIEW.md` and `source-manifest.json`.

No source organization endorses this work. All review in this package was performed by AI agents. Finite comparisons do not establish certified physical error bounds, all-date precision, event-search completeness, probabilities or astrology's predictive validity.

The original 21 dates are follow-up diagnostic inputs, not blind holdouts. Mean-J2000 frame interpretation and physical-center controls are sensitivities with explicit limits. No production code or release configuration is changed.
