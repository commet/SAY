import { describe, expect, it } from "vitest";
import { createCase, deleteCase, getCard, getNextAction, inspectNotice, updateStatus } from "../src/tools/handlers.js";
import { buildCard } from "../src/core/cardBuilder.js";
import { CardStore } from "../src/core/store.js";
import { smishing } from "./fixtures.js";

const cardCodeFrom = (text: string) => text.match(/SAY-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/)?.[0];

describe("guarded case workflow", () => {
  it("uses an absolute expiry that reads cannot extend", () => {
    const localStore = new CardStore(undefined);
    const createdAt = new Date(Date.now() - 25 * 60 * 60_000);
    const expired = buildCard({ raw_text: "병원 예약일: 7월 14일 오전 9시" }, createdAt);
    localStore.put(expired);
    expect(localStore.get(expired.code)).toBeUndefined();
  });

  it("requires inspection and consent, orders verification first, rejects stale updates, and deletes", () => {
    const now = new Date();
    const inspection = JSON.parse(inspectNotice({ raw_text: smishing }, now));
    expect(inspection.source_assessment.trust).toBe("mismatch");
    expect(inspection.risk_signals.map((risk: { rule_id: string }) => risk.rule_id)).toEqual(["R2", "R3", "R7"]);

    expect(createCase(inspection.inspection_token, false, now)).toContain("동의가 확인되지 않아");
    const created = createCase(inspection.inspection_token, true, now);
    const code = cardCodeFrom(created);
    expect(code).toBeTruthy();
    expect(created).toContain("공식 채널 확인 필요");
    expect(createCase(inspection.inspection_token, true, now)).toContain("만료됐어요");

    const next = JSON.parse(getNextAction(code!));
    expect(next.next_action.id).toBe("verify-source");
    expect(next.guardrail).toContain("문자 속 링크");

    const blocked = updateStatus(code!, undefined, "a1", "in_progress", "홍길동", 1, now);
    expect(blocked).toContain("선행 확인");
    const verified = updateStatus(code!, undefined, "verify-source", "done", "보호자", 1, now);
    expect(verified).toContain("버전: 2");
    const replayed = updateStatus(code!, undefined, "verify-source", "done", "보호자", 1, now);
    expect(replayed).toContain("버전: 2");
    const stale = updateStatus(code!, undefined, "a1", "done", "보호자", 1, now);
    expect(stale).toContain("먼저 케이스를 수정");

    expect(deleteCase(code!)).toContain("삭제됐어요");
    expect(getCard(code!, now)).toContain("찾지 못했어요");
  });
});
