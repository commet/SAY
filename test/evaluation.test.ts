import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCard } from "../src/core/cardBuilder.js";
import { detectRiskSignals } from "../src/core/riskRules.js";
import { evaluateCorpus } from "../src/core/evaluation.js";
import type { NoticeType } from "../src/core/types.js";

interface EvalCase { id: string; expectedType: NoticeType; text: string; expectedFields: string[]; expectedRisks: string[]; forbidden?: string[]; forbiddenFields?: string[]; }
const cases = JSON.parse(readFileSync(new URL("../eval/notices.json", import.meta.url), "utf8")) as EvalCase[];

describe("synthetic notice evaluation corpus", () => {
  it("meets the release classification gate", () => {
    const result = evaluateCorpus(cases);
    expect(result.passed).toBe(true);
    expect(result.metrics).toEqual(expect.objectContaining({ corpusCases: 40, classificationAccuracyPercent: 100, expectedFieldRecallPercent: 100, expectedRiskRecallPercent: 100, riskPrecisionPercent: 100, piiLeaks: 0, highConfidenceMisclassifications: 0 }));
  });

  it.each(cases)("extracts expected fields and risks for $id", (item) => {
    const card = buildCard({ raw_text: item.text });
    expect(card.noticeType).toBe(item.expectedType);
    expect(card.facts.map((fact) => fact.fieldKey)).toEqual(expect.arrayContaining(item.expectedFields));
    for (const forbiddenField of item.forbiddenFields ?? []) expect(card.facts.map((fact) => fact.fieldKey)).not.toContain(forbiddenField);
    expect(detectRiskSignals(item.text).map((risk) => risk.ruleId)).toEqual(item.expectedRisks);
    const serialized = JSON.stringify(card);
    for (const forbidden of item.forbidden ?? []) expect(serialized).not.toContain(forbidden);
    expect(card.facts.every((fact) => fact.quote === undefined)).toBe(true);
  });
});
