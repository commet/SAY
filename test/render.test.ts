import { describe, expect, it } from "vitest";
import { buildCard } from "../src/core/cardBuilder.js";
import { renderCard, renderRisks } from "../src/render/renderText.js";
import { hospital, smishing, fixedNow } from "./fixtures.js";

describe("submission output", () => {
  it("renders a short actionable hospital card", () => {
    const output = renderCard(buildCard({ raw_text: hospital }, fixedNow), fixedNow);
    expect(output).toContain("확인된 내용"); expect(output).toContain("평소 약 복용 가능 여부"); expect(output).toContain("가족과 나누기");
    expect(output).toContain('오늘 19:50 — "신분증·준비물 챙길 시간"');
    expect(output).toContain('오늘 21:50 — "금식 시작 10분 전"');
    expect(output).not.toContain("신분증을 반드시 지참해 주세요. 직전");
  });
  it("does not make a definitive scam verdict", () => {
    const output = renderRisks(buildCard({ raw_text: smishing }, fixedNow).riskSignals);
    expect(output).toContain("위험 신호 4개"); expect(output).not.toContain("스미싱입니다");
  });
  it("contains no fixed forbidden tone", () => {
    const outputs = [renderCard(buildCard({ raw_text: hospital }, fixedNow), fixedNow), renderRisks(buildCard({ raw_text: smishing }, fixedNow).riskSignals)];
    for (const output of outputs) expect(output).not.toMatch(/제가 다 알아서|챙겨드릴게요|걱정하지 마세요|효도|담당자 지정|독촉/);
  });
  it("hides stale reminder suggestions after their matching actions are closed", () => {
    const card = buildCard({ raw_text: hospital }, fixedNow);
    for (const item of card.actionItems) item.status = "not_applicable";
    card.status = "completed";
    const output = renderCard(card, fixedNow);
    expect(output).not.toContain("알림으로 걸어두면 좋은 것");
    expect(output).not.toContain("지난 확인 예정");
  });
});
