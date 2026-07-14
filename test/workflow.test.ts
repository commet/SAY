import { describe, expect, it } from "vitest";
import { createCase, deleteCase, familyMessage, getCard, getNextAction, inspectNotice, updateStatus } from "../src/tools/handlers.js";
import { buildCard } from "../src/core/cardBuilder.js";
import { CardStore, store } from "../src/core/store.js";
import { hospital, smishing } from "./fixtures.js";

const cardCodeFrom = (text: string) => text.match(/SAY-(?:[A-Z2-9]{4}-){3}[A-Z2-9]{4}/)?.[0];

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
    expect(inspection.risk_signals.map((risk: { rule_id: string }) => risk.rule_id)).toEqual(["R2", "R8", "R3", "R7"]);

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
    const dismissed = updateStatus(code!, undefined, "a1", "not_applicable", "홍길동", 1, now);
    expect(dismissed).toContain("선행 확인");
    const skipped = updateStatus(code!, undefined, "verify-source", "not_applicable", "보호자", 1, now);
    expect(skipped).toContain("건너뛸 수 없어요");
    expect(updateStatus(code!, undefined, "verify-source", "done", "보호자", 1, now)).toContain("result_note");
    const verified = updateStatus(code!, undefined, "verify-source", "done", "보호자", 1, now, "공식 배송 앱에서 해당 요청이 없음을 확인");
    expect(verified).toContain("업데이트용 버전: 2");
    const replayed = updateStatus(code!, undefined, "verify-source", "done", "보호자", 1, now, "공식 배송 앱에서 해당 요청이 없음을 확인");
    expect(replayed).toContain("업데이트용 버전: 2");
    const stale = updateStatus(code!, undefined, "a1", "done", "보호자", 1, now);
    expect(stale).toContain("먼저 케이스를 수정");

    expect(deleteCase(code!)).toContain("삭제됐어요");
    expect(getCard(code!, now)).toContain("찾지 못했어요");
  });

  it("bounds mutation history and audit events", () => {
    const inspection = JSON.parse(inspectNotice({ raw_text: hospital }));
    const code = cardCodeFrom(createCase(inspection.inspection_token, true))!;
    for (let index = 0; index < 60; index += 1) {
      const result = updateStatus(code, undefined, "a1", index % 2 ? "done" : "in_progress", "보호자", index + 1);
      expect(result).not.toContain("먼저 케이스를 수정");
    }
    const card = store.get(code)!;
    expect(card.actionItems.find((item) => item.id === "a1")?.history).toHaveLength(20);
    expect(card.events).toHaveLength(50);
    deleteCase(code);
  });

  it("retains a privacy-redacted confirmation result and closes the matching information gap", () => {
    const now = new Date();
    const inspection = JSON.parse(inspectNotice({ raw_text: hospital }, now));
    const code = cardCodeFrom(createCase(inspection.inspection_token, true, now))!;
    const initial = store.get(code)!;
    const medication = initial.actionItems.find((item) => item.fieldKey === "medication_allowed")!;
    const initialPrivacyCount = initial.privacySummary.total;

    expect(updateStatus(code, undefined, medication.id, "done", "보호자", 1, now)).toContain("result_note");
    const rawResult = "병원 확인: 김민수님은 혈압약 복용 가능, 연락처 010-1234-5678";
    const updated = updateStatus(code, undefined, medication.id, "done", "보호자", 1, now, rawResult);
    expect(updated).toContain("확인 결과: 병원 확인: 김○○님은 혈압약 복용 가능, 연락처 [전화번호 숨김]");
    expect(updated).not.toContain("김민수");
    expect(updated).not.toContain("010-1234-5678");

    const stored = store.get(code)!;
    expect(stored.version).toBe(2);
    expect(stored.privacySummary.total).toBeGreaterThan(initialPrivacyCount);
    expect(stored.actionItems.find((item) => item.id === medication.id)).toEqual(expect.objectContaining({
      status: "done",
      actorName: "보호자",
      resultNote: "병원 확인: 김○○님은 혈압약 복용 가능, 연락처 [전화번호 숨김]",
    }));
    const missingSection = updated.split("아직 비어 있는 내용")[1]?.split("할 일과 현재 상태")[0] ?? "";
    expect(missingSection).not.toContain("평소 약 복용 가능 여부");
    expect(familyMessage(code, "family_room", "plain")).toContain("확인 결과: 병원 확인");

    const replay = updateStatus(code, undefined, medication.id, "done", undefined, 1, now, rawResult);
    expect(replay).toContain("업데이트용 버전: 2");
    expect(store.get(code)?.privacySummary.total).toBe(stored.privacySummary.total);
    deleteCase(code);
  });

  it("does not retain or create an empty case for unrelated text", () => {
    const inspection = JSON.parse(inspectNotice({ raw_text: "토요일 오후 두 시에 동호회 정기 모임이 있습니다." }));
    expect(inspection).toEqual(expect.objectContaining({ can_create_case: false, inspection_token: null, expires_at: null }));
    expect(inspection.next_step).toContain("안내문 전체");
  });
});
