import { buildCard } from "./cardBuilder.js";
import { classifyNoticeDetailed } from "./classify.js";
import { detectRiskSignals } from "./riskRules.js";
import type { NoticeType } from "./types.js";

export interface EvaluationCase {
  id: string;
  expectedType: NoticeType;
  text: string;
  expectedFields: string[];
  expectedRisks: string[];
  forbidden?: string[];
  forbiddenFields?: string[];
}

export interface EvaluationFailure {
  id: string;
  classification?: { expected: NoticeType; actual: NoticeType };
  missingFields: string[];
  missingRisks: string[];
  unexpectedRisks: string[];
  forbiddenFieldsFound: string[];
  piiLeakCount: number;
  retainedQuoteCount: number;
}

export interface EvaluationResult {
  metrics: {
    corpusCases: number;
    classificationAccuracyPercent: number;
    expectedFieldRecallPercent: number;
    expectedRiskRecallPercent: number;
    riskPrecisionPercent: number;
    unexpectedRiskSignals: number;
    lowConfidenceClassifications: number;
    highConfidenceMisclassifications: number;
    classificationByType: Partial<Record<NoticeType, { cases: number; accuracyPercent: number }>>;
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
  let actualRisks = 0;
  let unexpectedRisks = 0;
  let lowConfidenceClassifications = 0;
  let highConfidenceMisclassifications = 0;
  let piiChecks = 0;
  let piiLeaks = 0;
  let quoteLeaks = 0;
  const failures: EvaluationFailure[] = [];
  const byType = new Map<NoticeType, { cases: number; correct: number }>();

  for (const item of cases) {
    const assessment = classifyNoticeDetailed(item.text);
    const actualType = assessment.type;
    if (actualType === item.expectedType) classifications += 1;
    if (assessment.confidence === "low") lowConfidenceClassifications += 1;
    if (assessment.confidence === "high" && actualType !== item.expectedType) highConfidenceMisclassifications += 1;
    const typeBucket = byType.get(item.expectedType) ?? { cases: 0, correct: 0 };
    typeBucket.cases += 1;
    if (actualType === item.expectedType) typeBucket.correct += 1;
    byType.set(item.expectedType, typeBucket);
    const card = buildCard({ raw_text: item.text });
    const fieldKeys = new Set(card.facts.map((fact) => fact.fieldKey));
    const missingFields = item.expectedFields.filter((key) => !fieldKeys.has(key));
    const forbiddenFieldsFound = (item.forbiddenFields ?? []).filter((key) => fieldKeys.has(key));
    expectedFields += item.expectedFields.length;
    matchedFields += item.expectedFields.length - missingFields.length;
    const riskIds = new Set(detectRiskSignals(item.text).map((risk) => risk.ruleId));
    const missingRisks = item.expectedRisks.filter((id) => !riskIds.has(id));
    const caseUnexpectedRisks = [...riskIds].filter((id) => !item.expectedRisks.includes(id));
    expectedRisks += item.expectedRisks.length;
    matchedRisks += item.expectedRisks.length - missingRisks.length;
    actualRisks += riskIds.size;
    unexpectedRisks += caseUnexpectedRisks.length;
    const serialized = JSON.stringify(card);
    const casePiiLeaks = (item.forbidden ?? []).filter((value) => serialized.includes(value)).length;
    const caseQuoteLeaks = card.facts.filter((fact) => fact.quote !== undefined).length;
    piiChecks += item.forbidden?.length ?? 0;
    piiLeaks += casePiiLeaks;
    quoteLeaks += caseQuoteLeaks;
    if (actualType !== item.expectedType || missingFields.length || forbiddenFieldsFound.length || missingRisks.length || caseUnexpectedRisks.length || casePiiLeaks || caseQuoteLeaks) {
      failures.push({
        id: item.id,
        classification: actualType === item.expectedType ? undefined : { expected: item.expectedType, actual: actualType },
        missingFields,
        missingRisks,
        unexpectedRisks: caseUnexpectedRisks,
        forbiddenFieldsFound,
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
    riskPrecisionPercent: percent(actualRisks - unexpectedRisks, actualRisks),
    unexpectedRiskSignals: unexpectedRisks,
    lowConfidenceClassifications,
    highConfidenceMisclassifications,
    classificationByType: Object.fromEntries([...byType.entries()].map(([type, bucket]) => [type, { cases: bucket.cases, accuracyPercent: percent(bucket.correct, bucket.cases) }])),
    piiRedactionChecks: piiChecks,
    piiLeaks,
    retainedQuoteFields: quoteLeaks,
  };
  const passed = metrics.classificationAccuracyPercent >= 95
    && metrics.expectedFieldRecallPercent === 100
    && metrics.expectedRiskRecallPercent === 100
    && metrics.riskPrecisionPercent === 100
    && metrics.highConfidenceMisclassifications === 0
    && piiLeaks === 0
    && quoteLeaks === 0;
  return { metrics, failures, passed };
}
