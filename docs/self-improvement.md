# SAY bounded self-improvement loop

SAY improves continuously without becoming a self-modifying production system.

```text
voluntary record_outcome
  → no-free-text improvement event
  → unlinkable aggregate counters
  → minimum-support and regression analysis
  → human-reviewed experiment candidate
  → synthetic, privacy-safe regression case
  → minimal code change
  → npm run quality
  → approved deployment
```

## Runtime signal contract

`record_outcome` accepts only fixed categories for final outcome, classification quality, extraction quality, risk quality and workflow friction. It requires a live bearer code but never copies that code into the improvement event. Raw notice text, source quotes, names, free-form comments and action history are not accepted by the tool schema.

- one outcome per live case
- exact replay is idempotent
- a different second outcome is rejected
- optional `expected_version` prevents stale writes
- case deletion cannot remove an already unlinkable aggregate count
- sanitized event logging is off by default; `IMPROVEMENT_EVENT_LOG=true` enables it only after an operator approves collection and retention
- `IMPROVEMENT_STORE_PATH` optionally persists only aggregate counters

All runtime signals are untrusted. A person must consider poisoning, selection bias and low sample size before accepting a candidate. Even though the event JSON has no identifier, the hosting platform may attach timestamps or infrastructure metadata; operational logs therefore need restricted access and a short retention policy.

## Operator cycle

1. Collect the sanitized `say_improvement_event` lines from authorized operational logs. They contain categories only.
2. Rebuild an idempotent aggregate from the full event export:

   ```bash
   npm run improve:ingest -- events.log data/improvement-summary.json
   ```

3. Generate candidates together with the current evaluation corpus:

   ```bash
   npm run improve -- data/improvement-summary.json
   ```

   A synthetic five-event demonstration is included at `improve/example-events.txt`; it should produce a `classifier:hospital` review candidate when ingested.

4. Review candidates. Runtime candidates need at least five matching cases; privacy regressions from the synthetic corpus block release immediately.
5. Convert an accepted candidate into a synthetic notice and expected result. Never add a user's original notice to the repository.
6. Make one minimal rule or workflow change and run:

   ```bash
   npm run quality
   ```

7. Require human review before deployment. The report intentionally has `automatic_code_changes: false`.

Repository branch protection should require the CI workflow and at least one reviewer. The included pull-request template makes the evidence, privacy and release checks explicit; repository settings still need to enforce the reviewer rule.

## Candidate families

- classifier boundary confusion
- missing or incorrect extraction
- risk false alarm or missed risk
- workflow friction, including privacy concern
- abandoned or unsafe-to-continue outcomes
- deterministic evaluation regression

The loop optimizes only within fixed privacy and safety invariants. More completions never justify retaining raw notices, opening message links, lowering consent requirements or bypassing release gates.
