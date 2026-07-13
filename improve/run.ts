import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { emptyFeedbackSummary, parseFeedbackSummary } from "../src/core/feedbackStore.js";
import { evaluateCorpus, type EvaluationCase } from "../src/core/evaluation.js";
import { buildImprovementReport } from "../src/core/improvementReport.js";
import type { FeedbackSummary } from "../src/core/types.js";

const feedbackArg = process.argv.find((argument) => argument.startsWith("--feedback="));
const positionalFeedback = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const feedbackPath = feedbackArg?.slice("--feedback=".length) || positionalFeedback || process.env.IMPROVEMENT_STORE_PATH;
let feedback = emptyFeedbackSummary();
let feedbackSource = "empty";
if (feedbackPath) {
  const absolute = resolve(feedbackPath);
  if (existsSync(absolute)) {
    const parsed = parseFeedbackSummary(JSON.parse(readFileSync(absolute, "utf8")) as unknown);
    if (!parsed) throw new Error("Feedback summary does not match schema version 1");
    feedback = parsed as FeedbackSummary;
    feedbackSource = absolute;
  }
}
const cases = JSON.parse(readFileSync(new URL("../eval/notices.json", import.meta.url), "utf8")) as EvaluationCase[];
const report = buildImprovementReport(feedback, evaluateCorpus(cases));
console.log(JSON.stringify({ feedback_source: feedbackSource, ...report }, null, 2));
