import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCard } from "../src/core/cardBuilder.js";
import { classifyNotice } from "../src/core/classify.js";
import { sanitizeNoticeText } from "../src/core/privacy.js";
import { detectRiskSignals } from "../src/core/riskRules.js";
import type { NoticeType } from "../src/core/types.js";

interface EvalCase { id: string; expectedType: NoticeType; text: string; expectedFields: string[]; expectedRisks: string[]; forbidden?: string[]; }
const cases = JSON.parse(readFileSync(new URL("../eval/notices.json", import.meta.url), "utf8")) as EvalCase[];

describe("synthetic notice evaluation corpus", () => {
  it("meets the release classification gate", () => {
    const correct = cases.filter((item) => classifyNotice(item.text) === item.expectedType).length;
    expect(correct / cases.length).toBeGreaterThanOrEqual(0.95);
  });

  it.each(cases)("extracts expected fields and risks for $id", (item) => {
    const card = buildCard({ raw_text: item.text });
    expect(card.noticeType).toBe(item.expectedType);
    expect(card.facts.map((fact) => fact.fieldKey)).toEqual(expect.arrayContaining(item.expectedFields));
    expect(detectRiskSignals(sanitizeNoticeText(item.text)).map((risk) => risk.ruleId)).toEqual(expect.arrayContaining(item.expectedRisks));
    const serialized = JSON.stringify(card);
    for (const forbidden of item.forbidden ?? []) expect(serialized).not.toContain(forbidden);
    expect(card.facts.every((fact) => fact.quote === undefined)).toBe(true);
  });
});
