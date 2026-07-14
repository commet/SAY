import { describe, expect, it } from "vitest";
import { buildCard } from "../src/core/cardBuilder.js";
import { inspectPrivacy, mergePrivacySummaries, safeActorRole, sanitizeNoticeText } from "../src/core/privacy.js";
import { fixedNow } from "./fixtures.js";

describe("server-side privacy", () => {
  it("redacts common identifiers before output or retention", () => {
    const input = [
      "[병원] 홍길동님 예약 안내",
      "주민등록번호: 900101-1234567",
      "문의: 010-1234-5678",
      "이메일: hong@example.com",
      "주소: 서울시 중구 세종대로 1",
      "카드번호: 1234-5678-9012-3456",
      "확인: https://example.com/check?ref=case-demo",
    ].join("\n");
    const safe = sanitizeNoticeText(input);
    expect(safe).not.toContain("홍길동");
    expect(safe).not.toContain("900101-1234567");
    expect(safe).not.toContain("010-1234-5678");
    expect(safe).not.toContain("hong@example.com");
    expect(safe).not.toContain("세종대로");
    expect(safe).not.toContain("1234-5678-9012-3456");
    expect(safe).not.toContain("case-demo");
  });

  it("does not retain source quotes or identifiers in a card", () => {
    const input = "[한마음병원] 홍길동님 예약 안내\n검진일: 7월 12일 오전 8시\n문의: 010-1234-5678";
    const card = buildCard({ raw_text: input }, fixedNow);
    const serialized = JSON.stringify(card);
    expect(serialized).not.toContain("홍길동");
    expect(serialized).not.toContain("010-1234-5678");
    expect(card.facts.every((fact) => fact.quote === undefined)).toBe(true);
  });

  it("redacts common Korean customer-name and provincial road-address forms", () => {
    const input = "홍길동 고객님\n경기도 성남시 분당구 판교로 242";
    const inspected = inspectPrivacy(input);
    expect(inspected.redactedText).not.toContain("홍길동");
    expect(inspected.redactedText).not.toContain("경기도 성남시 분당구 판교로 242");
    expect(inspected.summary.findings).toEqual(expect.arrayContaining([
      { kind: "person_name", count: 1 }, { kind: "address", count: 1 },
    ]));
  });

  it("redacts sensitive URL components while retaining only the host for safety checks", () => {
    const inspected = inspectPrivacy("https://example-user@example.com/person/HONG123?ref=case-demo#account");
    expect(inspected.redactedText).toBe("https://example.com/[경로숨김]?[쿼리숨김]#[조각숨김]");
    expect(inspected.summary.findings).toEqual(expect.arrayContaining([
      { kind: "url_credentials", count: 1 }, { kind: "url_path", count: 1 },
      { kind: "url_query", count: 1 }, { kind: "url_fragment", count: 1 },
    ]));
  });

  it("redacts labeled identity, device identifiers, UUIDs, and bidi controls", () => {
    const input = [
      "이름: 홍길동", "생년월일: 1990-01-02", "여권번호: M12345678", "123-45-67890",
      "기기 ID: DEVICE-DEMO-12345", ["550e8400", "e29b", "41d4", "a716", "446655440000"].join("-"), "안내\u202Etxt.exe",
      "인증번호: 839201 입력 요청",
      "서울 중구 세종대로 110", "우편번호: 04524", "공동현관 접근코드: 0000", "12가 3456", "보험증권번호: ABCD-123456",
    ].join("\n");
    const inspected = inspectPrivacy(input);
    const uuid = ["550e8400", "e29b", "41d4", "a716", "446655440000"].join("-");
    for (const secret of ["홍길동", "1990-01-02", "M12345678", "123-45-67890", "DEVICE-DEMO-12345", uuid, "839201", "세종대로 110", "04524", "0000", "12가 3456", "ABCD-123456", "\u202E"]) {
      expect(inspected.redactedText).not.toContain(secret);
    }
    expect(inspected.summary.total).toBeGreaterThanOrEqual(13);
  });

  it("never reintroduces an OTP through stored risk evidence", () => {
    const card = buildCard({ raw_text: "보험료 안내\n인증번호: 839201 입력 요청" }, fixedNow);
    expect(card.riskSignals.map((risk) => risk.ruleId)).toContain("R4");
    expect(JSON.stringify(card)).not.toContain("839201");
  });

  it("combines raw notice and sender privacy counts without retaining values", () => {
    const merged = mergePrivacySummaries(inspectPrivacy("홍길동님").summary, inspectPrivacy("010-1234-5678").summary);
    expect(merged.total).toBe(2);
    expect(merged.findings.map((finding) => finding.kind)).toEqual(["person_name", "phone"]);
  });

  it("stores only generic actor roles", () => {
    expect(safeActorRole("엄마")).toBe("엄마");
    expect(safeActorRole("홍길동")).toBe("가족 구성원");
    expect(safeActorRole()).toBeUndefined();
  });
});
