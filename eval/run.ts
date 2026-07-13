import { readFileSync } from "node:fs";
import { buildCard } from "../src/core/cardBuilder.js";
import { classifyNotice } from "../src/core/classify.js";
import { sanitizeNoticeText } from "../src/core/privacy.js";
import { detectRiskSignals } from "../src/core/riskRules.js";
import type { NoticeType } from "../src/core/types.js";

interface EvalCase {
  id: string;
  expectedType: NoticeType;
  text: string;
  expectedFields: string[];
  expectedRisks: string[];
  forbidden?: string[];
}

const cases = JSON.parse(readFileSync(new URL("./notices.json", import.meta.url), "utf8")) as EvalCase[];
let classifications = 0;
let expectedFields = 0;
let matchedFields = 0;
let expectedRisks = 0;
let matchedRisks = 0;
let piiChecks = 0;
let piiLeaks = 0;
let quoteLeaks = 0;

for (const item of cases) {
  if (classifyNotice(item.text) === item.expectedType) classifications += 1;
  const card = buildCard({ raw_text: item.text });
  const fieldKeys = new Set(card.facts.map((fact) => fact.fieldKey));
  expectedFields += item.expectedFields.length;
  matchedFields += item.expectedFields.filter((key) => fieldKeys.has(key)).length;
  const riskIds = new Set(detectRiskSignals(sanitizeNoticeText(item.text)).map((risk) => risk.ruleId));
  expectedRisks += item.expectedRisks.length;
  matchedRisks += item.expectedRisks.filter((id) => riskIds.has(id)).length;
  const serialized = JSON.stringify(card);
  piiChecks += item.forbidden?.length ?? 0;
  piiLeaks += (item.forbidden ?? []).filter((value) => serialized.includes(value)).length;
  quoteLeaks += card.facts.filter((fact) => fact.quote !== undefined).length;
}

const percent = (value: number, total: number) => total === 0 ? 100 : Math.round((value / total) * 1000) / 10;
const report = {
  corpus_cases: cases.length,
  classification_accuracy_percent: percent(classifications, cases.length),
  expected_field_recall_percent: percent(matchedFields, expectedFields),
  expected_risk_recall_percent: percent(matchedRisks, expectedRisks),
  pii_redaction_checks: piiChecks,
  pii_leaks: piiLeaks,
  retained_quote_fields: quoteLeaks,
};

console.log(JSON.stringify(report, null, 2));
if (classifications / cases.length < 0.95 || matchedFields !== expectedFields || matchedRisks !== expectedRisks || piiLeaks > 0 || quoteLeaks > 0) {
  process.exitCode = 1;
}
