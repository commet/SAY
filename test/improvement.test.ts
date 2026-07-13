import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { emptyFeedbackBucket, emptyFeedbackSummary, FeedbackStore } from "../src/core/feedbackStore.js";
import { makeImprovementEvent, parseImprovementEvent } from "../src/core/feedbackEvent.js";
import { buildImprovementReport } from "../src/core/improvementReport.js";
import type { EvaluationResult } from "../src/core/evaluation.js";
import type { OutcomeFeedback } from "../src/core/types.js";
import { createCase, deleteCase, inspectNotice, recordOutcome } from "../src/tools/handlers.js";
import { hospital } from "./fixtures.js";

const passedEvaluation: EvaluationResult = {
  metrics: { corpusCases: 24, classificationAccuracyPercent: 100, expectedFieldRecallPercent: 100, expectedRiskRecallPercent: 100, piiRedactionChecks: 11, piiLeaks: 0, retainedQuoteFields: 0 },
  failures: [],
  passed: true,
};
const feedback: OutcomeFeedback = {
  outcome: "resolved", classificationQuality: "correct", extractionQuality: "complete",
  riskQuality: "appropriate", friction: "none", recordedAt: "2026-07-13T00:00:00.000Z",
};
const cardCodeFrom = (text: string) => text.match(/SAY-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/)?.[0];

describe("bounded self-improvement loop", () => {
  it("aggregates only low-cardinality structured counters", () => {
    const aggregate = new FeedbackStore(undefined);
    for (let index = 0; index < 5; index += 1) aggregate.record("hospital", feedback);
    const snapshot = aggregate.snapshot();
    expect(snapshot.total).toBe(5);
    expect(snapshot.byNoticeType.hospital?.outcomes.resolved).toBe(5);
    expect(JSON.stringify(snapshot)).not.toContain("SAY-");
    expect(JSON.stringify(snapshot)).not.toContain(hospital);
  });

  it("round-trips only the strict no-free-text operator event schema", () => {
    const event = makeImprovementEvent("hospital", feedback);
    expect(parseImprovementEvent(event)).toEqual(event);
    expect(parseImprovementEvent({ ...event, raw_text: hospital })).toBeUndefined();
    expect(JSON.stringify(event)).not.toContain("SAY-");
  });

  it("persists and reloads a schema-validated aggregate without event identity", async () => {
    const directory = await mkdtemp(join(tmpdir(), "say-improvement-"));
    const file = join(directory, "summary.json");
    try {
      const writer = new FeedbackStore(file);
      writer.record("hospital", feedback);
      await writer.flush();
      expect(await readFile(file, "utf8")).not.toContain("SAY-");
      const reader = new FeedbackStore(file);
      await reader.load();
      expect(reader.snapshot().byNoticeType.hospital?.total).toBe(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("requires repeated support before proposing a human-reviewed experiment", () => {
    const summary = emptyFeedbackSummary();
    const bucket = emptyFeedbackBucket();
    bucket.total = 4;
    bucket.classification.incorrect = 4;
    bucket.corrections["hospital->government"] = 4;
    summary.total = 4;
    summary.overall = structuredClone(bucket);
    summary.byNoticeType.hospital = bucket;
    expect(buildImprovementReport(summary, passedEvaluation).candidates).toHaveLength(0);

    bucket.total = 5;
    bucket.classification.incorrect = 5;
    bucket.corrections["hospital->government"] = 5;
    summary.total = 5;
    summary.overall = structuredClone(bucket);
    const report = buildImprovementReport(summary, passedEvaluation);
    expect(report.candidates.map((candidate) => candidate.id)).toContain("classifier:hospital");
    expect(report.automatic_code_changes).toBe(false);
  });

  it("promotes privacy regressions immediately to a critical release blocker", () => {
    const failed: EvaluationResult = {
      metrics: { ...passedEvaluation.metrics, piiLeaks: 1 }, passed: false,
      failures: [{ id: "privacy-case", missingFields: [], missingRisks: [], piiLeakCount: 1, retainedQuoteCount: 0 }],
    };
    const report = buildImprovementReport(emptyFeedbackSummary(), failed);
    expect(report.candidates[0]).toEqual(expect.objectContaining({ id: "regression:privacy", priority: "critical" }));
  });

  it("records at most one voluntary outcome per live case and is replay-safe", () => {
    const previousLogging = process.env.IMPROVEMENT_EVENT_LOG;
    process.env.IMPROVEMENT_EVENT_LOG = "false";
    try {
      const inspection = JSON.parse(inspectNotice({ raw_text: hospital }));
      const created = createCase(inspection.inspection_token, true);
      const code = cardCodeFrom(created)!;
      const args = { outcome: "resolved" as const, classificationQuality: "correct" as const, extractionQuality: "complete" as const, riskQuality: "appropriate" as const, friction: "none" as const };
      const first = JSON.parse(recordOutcome(code, args, 1));
      expect(first).toEqual(expect.objectContaining({ recorded: true, duplicate_ignored: false, case_version: 2 }));
      expect(JSON.stringify(first)).not.toContain(code);
      const replay = JSON.parse(recordOutcome(code, args, 1));
      expect(replay).toEqual(expect.objectContaining({ duplicate_ignored: true, case_version: 2 }));
      expect(recordOutcome(code, { ...args, friction: "too_many_steps" }, 2)).toContain("이미 결과 피드백");
      deleteCase(code);
    } finally {
      if (previousLogging === undefined) delete process.env.IMPROVEMENT_EVENT_LOG;
      else process.env.IMPROVEMENT_EVENT_LOG = previousLogging;
    }
  });
});
