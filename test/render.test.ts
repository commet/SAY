import { describe, expect, it } from "vitest";
import { buildCard } from "../src/core/cardBuilder.js";
import { renderCard, renderRisks } from "../src/render/renderText.js";
import { hospital, smishing, fixedNow } from "./fixtures.js";

describe("submission output", () => {
  it("renders a short actionable hospital card", () => {
    const output = renderCard(buildCard({ raw_text: hospital }, fixedNow), fixedNow);
    expect(output).toContain("확인된 내용"); expect(output).toContain("평소 약 복용 가능 여부"); expect(output).toContain("가족과 나누기");
  });
  it("does not make a definitive scam verdict", () => {
    const output = renderRisks(buildCard({ raw_text: smishing }, fixedNow).riskSignals);
    expect(output).toContain("위험 신호 3개"); expect(output).not.toContain("스미싱입니다");
  });
  it("contains no fixed forbidden tone", () => {
    const outputs = [renderCard(buildCard({ raw_text: hospital }, fixedNow), fixedNow), renderRisks(buildCard({ raw_text: smishing }, fixedNow).riskSignals)];
    for (const output of outputs) expect(output).not.toMatch(/제가 다 알아서|챙겨드릴게요|걱정하지 마세요|효도|담당자 지정|독촉/);
  });
});
