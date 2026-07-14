# SAY evaluation contract

`eval/notices.json` is a synthetic, privacy-safe Korean notice corpus. It contains 40 cases across hospital, government, insurance/payment, delivery/smishing, apartment management and unknown notices. It includes inline dates, invalid calendar dates, relative deadlines, bare short links, HTTP/IP/userinfo/punycode URLs, URL query values, labeled identifiers, bidi controls and prompt-injection text.

Run the reproducible scorecard:

```bash
npm run eval
npm run perf
npm run improve
npm run quality
```

The release fails unless all of these gates pass:

- notice classification accuracy is at least 95%
- every annotated expected field is extracted
- every annotated expected risk rule is detected
- no unannotated risk rule is emitted (100% corpus risk precision)
- no high-confidence classification is wrong
- annotated impossible/forbidden fields are not extracted
- no annotated identifier survives in a stored case
- no source quote is retained in a stored case

`npm test` separately checks consent, single-use inspection tokens, source/domain mismatch, safe action ordering, dependency blocking, optimistic concurrency, bounded/serialized persistence, deletion, HTTP security boundaries, MCP input/output schemas and a representative multi-tool conversation.

`npm run perf` executes 200 representative `inspect_notice` calls through MCP SDK validation and an in-memory transport after warm-up. It fails the release when average latency exceeds 100ms or p99 exceeds 3,000ms. HTTP E2E separately exercises an actual stateless `tools/call`; production ingress latency must still be checked after deployment.

`npm run improve` combines this deterministic evaluation with an optional privacy-safe feedback summary (`npm run improve -- path/to/summary.json`). Evaluation regressions are immediate release blockers. Runtime feedback needs at least five matching samples before it can produce a human-review experiment candidate. It never edits source files.

This corpus measures deterministic regression behavior, not real-world model quality. It deliberately does not claim fraud detection accuracy or medical/legal correctness.
