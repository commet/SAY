# Changelog

## 2.1.0 — 2026-07-14

- Added privacy-redacted confirmation results to action updates so facts learned from hospitals, official apps and family members remain attached to the short-lived case.
- Required result evidence before closing official-source verification or missing-information actions, while preserving idempotent replay and optimistic concurrency.
- Changed low-confidence inspection to issue no storage token until the user explicitly confirms the notice type and re-runs the privacy gate.
- Reduced user-facing card noise by removing internal scores and showing concise classification, source, retention and update information.
- Anchored preparation and fasting reminders to real KST appointment times and hid reminders after their related actions close.
- Added stateless HTTP tool-call coverage and a repeatable average/p99 MCP performance release gate.
- Removed the unused host-extraction path so server-owned deterministic extraction remains the only fact-ingestion boundary.

## 2.0.0 — 2026-07-13

- Added weighted, explainable classification with confidence, margin, alternatives and low-confidence workflow gates.
- Fixed inline and relative date extraction and rejected impossible calendar dates.
- Expanded privacy redaction to URL components, labeled names, birth dates, passport/business/device identifiers, UUIDs, OTPs and Unicode control characters; risk evidence is re-redacted.
- Added HTTP, IP/local, embedded-credential and punycode link-risk rules while preserving conservative source assessment.
- Increased inspection and case bearer secrets to about 80 bits and added explicit case expiry.
- Added bounded histories/events, validated case loading, serialized atomic writes and graceful shutdown flush.
- Added common MCP output schemas and structured results to all 10 tools.
- Added security headers, request IDs, content-type/body guards, retry headers and privacy-safe health metrics.
- Made the improvement loop's minimum-support state visible without exposing case-level data.
- Expanded the synthetic corpus from 24 to 40 cases and added risk precision, per-type classification and confidence regression gates.
- Hardened the container with a non-root runtime user, health check and bounded `/data` persistence.
