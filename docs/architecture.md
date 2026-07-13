# SAY 2.0 — Privacy-first family operations agent

## Product thesis

SAY is not a notice summarizer. It turns a private, ambiguous household notice into a safe, evidence-backed case that a family can close together.

The product promise is:

> Before anything is stored, SAY removes identifiers, explains uncertainty, blocks unsafe actions, and then keeps the smallest possible action state until the family finishes the case.

## What makes the service agentic

The agent follows a guarded workflow instead of exposing unrelated utilities:

1. **Inspect** — detect and redact identifiers without retaining the original.
2. **Confirm** — show the redacted preview, uncertainty, and risk to the user.
3. **Create** — create a short-lived case only after explicit consent.
4. **Plan** — compute the safest next action from risk, missing facts, deadlines, and dependencies.
5. **Coordinate** — let family roles claim or complete actions with optimistic version checks.
6. **Close** — delete completed cases immediately or expire them automatically.
7. **Learn** — accept one voluntary structured outcome, aggregate only unlinkable counters, and propose guarded experiments after repeated evidence.

The MCP host performs conversational reasoning. The server owns deterministic privacy, validation, state transitions, and invariants.

## Tool surface

| Tool | Role | State change |
|---|---|---|
| `inspect_notice` | Redact, classify, extract and assess risk; issue a 10-minute inspection token | Temporary sanitized inspection only |
| `create_case` | Create a case from a valid inspection token after explicit consent | Creates case |
| `check_scam_signals` | Standalone link/sender/risk check with server-side redaction | None |
| `get_case` | Retrieve a short-lived case using its bearer code | None |
| `get_next_action` | Compute one safe next action and explain why | None |
| `update_action` | Claim, hold or complete an action with optional version precondition | Updates case |
| `make_family_message` | Produce a privacy-minimized family message | None |
| `list_open_cases` | List open work across supplied bearer codes | None |
| `record_outcome` | Record one voluntary, no-free-text outcome and update unlinkable counters | Updates case and aggregate |
| `delete_case` | Delete a case immediately | Deletes case |

## State model

```text
inspection (10 min)
    └─ explicit consent
       └─ needs_confirmation ── safe verification ── ready
                                      │
                                      ▼
                                in_progress
                                  │      │
                                  ▼      ▼
                               blocked  completed ── immediate delete / expiry
```

Case status is derived from risk and action state, not accepted blindly from the model.

## Trust boundary

- Raw notice text may enter one request, but is never logged or stored.
- The inspection cache stores only redacted text and expires after 10 minutes.
- Case storage is memory-only by default, capped, and expires at a fixed deadline within 24 hours of creation. Reads and updates never extend it.
- Source quotes are not retained.
- Names become generic family roles.
- Case codes are random bearer secrets; no case enumeration API exists.
- Case and inspection bearer secrets each carry about 80 bits of entropy.
- URL paths, queries, fragments and embedded credentials are removed before retention; Unicode bidi/control characters are stripped.
- The endpoint rate-limits clients, rejects unsupported content types and oversized JSON, and emits security/retry/request-ID headers.
- Outcome feedback contains no raw text, free text, case code, actor or exact event time in its aggregate. It is optional and accepted once per live case.
- Selecting OAuth or Key/Token in PlayMCP is incorrect until that protocol is implemented end-to-end.

## Evidence and source trust

Every extracted fact records a confidence class derived from deterministic evidence rules. Source assessment is deliberately conservative:

Notice classification also returns weighted matched signals, score, margin, alternatives and a high/medium/low confidence. A low-confidence non-unknown classification creates a blocking confirmation action instead of silently pretending certainty.

- `official`: the claimed organization and domain match a maintained registry.
- `mismatch`: an organization is claimed but a link uses another domain.
- `unknown`: there is not enough evidence.
- `no_link`: there is no link to assess.

SAY never declares a message genuine solely because a domain looks plausible.

## Reliability invariants

1. No raw text or quote exists in a persisted case.
2. High-risk cases cannot recommend opening a message link.
3. A completed case has no open action.
4. Updates with a stale expected version are rejected.
5. Expired or deleted codes never disclose whether another case exists.
6. The same mutation request is idempotent for the same target state.
7. Runtime feedback can propose an experiment but can never modify code, weaken a gate or deploy itself.
8. Feedback with fewer than five supporting cases cannot become a runtime-driven improvement candidate.
9. Persisted state is schema-validated, write-serialized and bounded; action history and case events cannot grow without limit.
10. Every MCP tool returns both backward-compatible text and a common schema-validated structured result envelope.

## Evaluation contract

The repository must ship a synthetic, privacy-safe evaluation corpus spanning:

- hospital/checkup
- government/welfare
- insurance/card/payment
- delivery/smishing
- apartment management
- mixed and unknown notices
- adversarial identifiers, malformed links, Unicode and prompt-injection text

Release gates:

- 100% known PII patterns redacted in the corpus
- 0 raw quote fields in stored cases
- classification accuracy reported, not implied
- risk-rule recall reported per rule
- workflow invariant and optimistic concurrency tests
- MCP initialize, tools/list and representative multi-tool E2E test
- dependency audit with zero production vulnerabilities
- improvement-candidate generation with no automatic code mutation

## Delivery phases

### Phase A — competition-ready core

- Two-phase inspect/create workflow
- Case state, versioning, deletion and next-action policy
- Official-domain assessment
- Bounded stores and rate limiting
- Evaluation corpus and MCP E2E tests

### Phase B — public beta

- Durable encrypted storage with user-scoped authorization
- OAuth or PlayMCP-supported identity when available
- Public-data connectors for official contacts and deadlines
- Observability, SLO dashboards and incident runbook

### Phase C — Kakao Tools product

- Family-room handoff and consent-aware sharing
- Widget-ready structured response payloads
- Reminder/calendar connectors with explicit confirmation
- Korean notice benchmark and continuous evaluation
