# SAY evaluation contract

`eval/notices.json` is a synthetic, privacy-safe Korean notice corpus. It contains 24 cases across hospital, government, insurance/payment, delivery/smishing, apartment management and unknown notices.

Run the reproducible scorecard:

```bash
npm run eval
npm run improve
npm run quality
```

The release fails unless all of these gates pass:

- notice classification accuracy is at least 95%
- every annotated expected field is extracted
- every annotated expected risk rule is detected
- no annotated identifier survives in a stored case
- no source quote is retained in a stored case

`npm test` separately checks consent, single-use inspection tokens, source/domain mismatch, safe action ordering, dependency blocking, optimistic concurrency, deletion, MCP initialization, tool discovery and a representative multi-tool conversation.

`npm run improve` combines this deterministic evaluation with an optional privacy-safe feedback summary (`npm run improve -- path/to/summary.json`). Evaluation regressions are immediate release blockers. Runtime feedback needs at least five matching samples before it can produce a human-review experiment candidate. It never edits source files.

This corpus measures deterministic regression behavior, not real-world model quality. It deliberately does not claim fraud detection accuracy or medical/legal correctness.
