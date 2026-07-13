# SAY 2.0 threat model

## Assets and trust boundaries

| Asset | Allowed lifetime | Persistence |
|---|---:|---|
| Raw notice and sender hint | One request only | Never intentionally logged or stored |
| Redacted inspection | 10 minutes, single use | Memory only |
| Redacted action case | Maximum 24 hours | Memory by default; validated `/data` file in the container |
| Case/inspection bearer secret | Same as its object | Only inside the corresponding bounded store |
| Structured outcome aggregate | Operator-defined | Low-cardinality counters only; no case code, raw text, actor, free text or exact event time |

The MCP host is outside the server trust boundary. Host-provided extraction, hints, tool order and feedback are untrusted inputs. The public network, KC ingress, persisted files and operational logs are separate boundaries.

## Threats, controls and residual risk

| Threat | Primary controls | Residual risk / decision |
|---|---|---|
| Raw PII retained or echoed | Server-side redaction before inspection storage; no quote fields; URL component removal; risk evidence re-redaction; regression corpus | Novel identifier formats can evade deterministic patterns. Users must still review the redacted preview. |
| Bearer-code guessing | About 80 bits of entropy, fixed 24-hour maximum expiry, IP rate limit, no enumeration endpoint, indistinguishable missing/deleted response | There is no user-bound authorization in 2.0. Anyone who obtains a live code can use it. Share only with trusted family. |
| Deceptive or malicious link | Claimed-organization/domain comparison; short/risky TLD, HTTP, IP/local, embedded credentials and punycode signals; official-channel verification dependency | Domain matching never proves message authenticity. SAY deliberately does not fetch or open supplied URLs. |
| Prompt injection inside a notice | Deterministic extraction and risk rules; notice content is data, never an executable instruction; no server-side LLM or open-world tool call | The MCP host may still be influenced. Tool descriptions require showing server output without weakening gates. |
| Concurrent family updates | Monotonic version, optional `expected_version`, dependency checks, idempotent replay | A caller that omits `expected_version` accepts last-write behavior for that action. |
| State corruption or lost writes | Schema-validated load, atomic rename, serialized write queue, bounded stores, graceful flush | Container filesystem durability depends on KC runtime behavior. Cases are intentionally disposable and are not backed up. |
| Unbounded memory or body abuse | 64KB JSON limit, 8,000-character tool limit, 60 requests/minute/IP, maximum 200 inspections and 500 cases, bounded history/events | Distributed traffic can exceed a single-IP limiter. KC/ingress protections remain necessary. |
| Feedback poisoning or self-modification | Fixed categories, one response/case, minimum support 5, synthetic reproduction, full quality gate, human approval, no automatic code changes | Aggregates are signals, not truth; coordinated malicious ratings can still bias candidates. |
| Sensitive operational logs | No raw notice logging; generic request metrics and random request IDs; structured event logging off by default | Hosting infrastructure may attach network/timing metadata. Operator access and retention must be restricted. |
| Compromised process or host | Non-root runtime user, production-only dependencies, dependency audits, minimal container image, security headers | Application controls cannot protect data from a fully compromised host. Short retention limits exposure. |

## Authentication decision

SAY 2.0 does not implement OAuth or Key/Token authentication. Selecting either option in PlayMCP would falsely claim a protocol the endpoint cannot complete. The compensating boundary is data minimization, explicit consent, random short-lived bearer codes, no enumeration and immediate deletion.

This is suitable for the contest's temporary workflow, not for long-term medical, financial or identity records. Public beta requires PlayMCP-compatible user identity, user-scoped encrypted storage, revocation and an authorization audit.

## Security invariants

1. Raw notice text and source quotes never enter a persisted case.
2. Every value derived from raw text, including risk evidence, is redacted before retention.
3. Expiry is absolute and cannot be extended by reads or updates.
4. High-risk/source-mismatch actions cannot bypass official-channel verification.
5. No runtime feedback can edit code, modify a gate or deploy a release.
6. A failed privacy or retained-quote evaluation blocks release immediately.
