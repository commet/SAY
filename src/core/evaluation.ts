import { buildCard } from "./cardBuilder.js";
import { classifyNotice } from "./classify.js";
import { sanitizeNoticeText } from "./privacy.js";
import { detectRiskSignals } from "./riskRules.js";
import type { NoticeType } from "./types.js";

export interface EvaluationCase {
  id: string;
  expectedType: NoticeType;
  text: string;
  expectedFields: string[];
  expectedRisks: string[];
  forbidden?: string[];
}

export interface EvaluationFailure {
  id: string;
  classification?: { expected: NoticeType; actual: NoticeType };
  missingFields: string[];
  missingRisks: string[];
  piiLeakCount: number;
  retainedQuoteCount: number;
}

export interface EvaluationResult {
  metrics: {
    corpusCases: number;
    classificationAccuracyPercent: number;
    expectedFieldRecallPercent: number;
    expectedRiskRecallPercent: number;
    piiRedactionChecks: number;
    piiLeaks: number;
    retainedQuoteFields: number;
  };
  failures: EvaluationFailure[];
  passed: boolean;
}

const percent = (value: number, total: number) => total === 0 ? 100 : Math.round((value / total) * 1000) / 10;

export function evaluateCorpus(cases: EvaluationCase[]): EvaluationResult {
  let classifications = 0;
  let expectedFields = 0;
  let matchedFields = 0;
  let expectedRisks = 0;
  let matchedRisks = 0;
  let piiChecks = 0;
  let piiLeaks = 0;
  let quoteLeaks = 0;
  const failures: EvaluationFailure[] = [];

  for (const item of cases) {
    const actualType = classifyNotice(item.text);
    if (actualType === item.expectedType) classifications += 1;
    const card = buildCard({ raw_text: item.text });
    const fieldKeys = new Set(card.facts.map((fact) => fact.fieldKey));
    const missingFields = item.expectedFields.filter((key) => !fieldKeys.has(key));
    expectedFields += item.expectedFields.length;
    matchedFields += item.expectedFields.length - missingFields.length;
    const riskIds = new Set(detectRiskSignals(sanitizeNoticeText(item.text)).map((risk) => risk.ruleId));
    const missingRisks = item.expectedRisks.filter((id) => !riskIds.has(id));
    expectedRisks += item.expectedRisks.length;
    matchedRisks += item.expectedRisks.length - missingRisks.length;
    const serialized = JSON.stringify(card);
    const casePiiLeaks = (item.forbidden ?? []).filter((value) => serialized.includes(value)).length;
    const caseQuoteLeaks = card.facts.filter((fact) => fact.quote !== undefined).length;
    piiChecks += item.forbidden?.length ?? 0;
    piiLeaks += casePiiLeaks;
    quoteLeaks += caseQuoteLeaks;
    if (actualType !== item.expectedType || missingFields.length || missingRisks.length || casePiiLeaks || caseQuoteLeaks) {
      failures.push({
        id: item.id,
        classification: actualType === item.expectedType ? undefined : { expected: item.expectedType, actual: actualType },
        missingFields,
        missingRisks,
        piiLeakCount: casePiiLeaks,
        retainedQuoteCount: caseQuoteLeaks,
      });
    }
  }

  const metrics = {
    corpusCases: cases.length,
    classificationAccuracyPercent: percent(classifications, cases.length),
    expectedFieldRecallPercent: percent(matchedFields, expectedFields),
    expectedRiskRecallPercent: percent(matchedRisks, expectedRisks),
    piiRedactionChecks: piiChecks,
    piiLeaks,
    retainedQuoteFields: quoteLeaks,
  };
  const passed = metrics.classificationAccuracyPercent >= 95
    && metrics.expectedFieldRecallPercent === 100
    && metrics.expectedRiskRecallPercent === 100
    && piiLeaks === 0
    && quoteLeaks === 0;
  return { metrics, failures, passed };
}
