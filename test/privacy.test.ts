import { describe, expect, it } from "vitest";
import { buildCard } from "../src/core/cardBuilder.js";
import { safeActorRole, sanitizeNoticeText } from "../src/core/privacy.js";
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
      "확인: https://example.com/check?token=secret123",
    ].join("\n");
    const safe = sanitizeNoticeText(input);
    expect(safe).not.toContain("홍길동");
    expect(safe).not.toContain("900101-1234567");
    expect(safe).not.toContain("010-1234-5678");
    expect(safe).not.toContain("hong@example.com");
    expect(safe).not.toContain("세종대로");
    expect(safe).not.toContain("1234-5678-9012-3456");
    expect(safe).not.toContain("secret123");
  });

  it("does not retain source quotes or identifiers in a card", () => {
    const input = "[한마음병원] 홍길동님 예약 안내\n검진일: 7월 12일 오전 8시\n문의: 010-1234-5678";
    const card = buildCard({ raw_text: input }, fixedNow);
    const serialized = JSON.stringify(card);
    expect(serialized).not.toContain("홍길동");
    expect(serialized).not.toContain("010-1234-5678");
    expect(card.facts.every((fact) => fact.quote === undefined)).toBe(true);
  });

  it("stores only generic actor roles", () => {
    expect(safeActorRole("엄마")).toBe("엄마");
    expect(safeActorRole("홍길동")).toBe("가족 구성원");
    expect(safeActorRole()).toBeUndefined();
  });
});
