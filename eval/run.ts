import { readFileSync } from "node:fs";
import { evaluateCorpus, type EvaluationCase } from "../src/core/evaluation.js";

const cases = JSON.parse(readFileSync(new URL("./notices.json", import.meta.url), "utf8")) as EvaluationCase[];
const result = evaluateCorpus(cases);
console.log(JSON.stringify({
  corpus_cases: result.metrics.corpusCases,
  classification_accuracy_percent: result.metrics.classificationAccuracyPercent,
  expected_field_recall_percent: result.metrics.expectedFieldRecallPercent,
  expected_risk_recall_percent: result.metrics.expectedRiskRecallPercent,
  pii_redaction_checks: result.metrics.piiRedactionChecks,
  pii_leaks: result.metrics.piiLeaks,
  retained_quote_fields: result.metrics.retainedQuoteFields,
  failure_cases: result.failures.length,
}, null, 2));
if (!result.passed) process.exitCode = 1;
