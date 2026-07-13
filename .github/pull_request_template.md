## Improvement evidence

- Candidate or issue ID:
- Repeated signal and sample count:
- Why this is not a poisoned or selection-biased signal:

## Minimal experiment

- [ ] No user notice, identifier, case code, log line or free-form feedback was committed.
- [ ] A synthetic privacy-safe regression case was added first.
- [ ] This PR changes one minimal rule or workflow boundary.
- [ ] Privacy and safety gates were not weakened to improve completion metrics.

## Release gates

- [ ] `npm run quality` passes.
- [ ] Classification, expected-field and expected-risk gates do not regress.
- [ ] PII leaks and retained quote fields remain zero.
- [ ] MCP tool descriptions, schemas and all five annotations remain PlayMCP-compliant.
- [ ] A human reviewer approves deployment; no automated feedback process deploys this change.
