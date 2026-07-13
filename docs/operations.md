# SAY 2.0 operations runbook

## Release gate

1. Confirm the worktree contains only intended changes.
2. Run `npm ci` and `npm run quality`.
3. Confirm `/health` reports version `2.0.0`, `raw_notice_logging: false`, and the intended persistence flags.
4. Run the MCP smoke path: `initialize → tools/list → inspect_notice → explicit consent → create_case → get_next_action → update_action → delete_case`.
5. Test one invalid JSON request, one unsupported content type and one PII-heavy notice.
6. Deploy a new KC server from the reviewed public Git commit. Keep the previous healthy endpoint until the new endpoint passes the smoke path.
7. Update the PlayMCP **draft** endpoint and use “정보 불러오기.” Do not request review until the owner gives explicit approval.

## Health and privacy-safe observability

`GET /health` exposes only service version, process uptime, persistence mode, maximum retention policy and aggregate request/rejection/rate-limit counters. It contains no IP, case code, notice type or user content. Every response has a random `X-Request-Id`; application logs must not join it to notice text.

Operational checks:

- health endpoint returns HTTP 200 and `ok: true`
- MCP initialization negotiates both PlayMCP-supported protocol versions covered by tests
- rejection count is not increasing unexpectedly
- rate-limited count is compatible with expected test or abuse traffic
- `/data` is writable by the non-root `node` user when persistence is enabled

## Incident response

### Suspected privacy leak

1. Stop the affected KC server and keep the previous known-good endpoint if available.
2. Do not paste a user's original notice into an issue, chat, commit or test.
3. Record only the identifier category, code path, release version and a synthetic reproduction.
4. Treat any deterministic corpus PII leak or retained quote as a release-blocking regression.
5. Patch the narrowest redaction boundary, add a synthetic regression case, run `npm run quality`, obtain review, then deploy a new endpoint.

### Elevated errors or unavailable MCP

1. Check `/health`, KC build/runtime state and the Git commit used for the image.
2. If health fails, roll the PlayMCP draft endpoint back to the previous healthy KC endpoint.
3. If health passes but tool calls fail, reproduce with MCP initialize and a synthetic notice; use request IDs only for infrastructure correlation.
4. Never enable raw request logging to debug production content.

### Corrupt persistence file

The loader ignores invalid objects and expired cases. Stop the process before manual file handling. Cases are disposable and should be removed rather than repaired from user data. The anonymous feedback summary can be retained only if it passes `parseFeedbackSummary`; otherwise rebuild it from authorized, sanitized events or reset it.

## Rollback and data lifecycle

- Rollback changes the PlayMCP draft endpoint to the last healthy KC server; it does not migrate live cases.
- Cases have no backup and may disappear during restart or rollback by design.
- The previous server should be stopped after the replacement passes the full smoke path, then deleted only when capacity is needed and the owner agrees.
- `delete_case` removes the case immediately. An already unlinkable outcome aggregate cannot be singled out for deletion.

## Improvement cycle

Run `npm run improve -- /data/improvement-summary.json` against an authorized aggregate export. A candidate is a review prompt, never an instruction to patch production. Reproduce accepted signals with synthetic text, make one minimal change, preserve all privacy/security invariants, and require the full release gate and human approval.
