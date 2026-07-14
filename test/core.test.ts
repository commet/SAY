import { describe, expect, it } from "vitest";
import { evidenceGate, normalize } from "../src/core/evidenceGate.js";
import { classifyNotice, classifyNoticeDetailed } from "../src/core/classify.js";
import { buildCard } from "../src/core/cardBuilder.js";
import { cardCode } from "../src/core/cardCode.js";
import { detectRiskSignals } from "../src/core/riskRules.js";
import { parseDateTime } from "../src/core/patternExtract.js";
import { inspectNotice } from "../src/core/inspectNotice.js";
import { hospital, government, smishing, fixedNow } from "./fixtures.js";

describe("evidence gate", () => {
  it("normalizes whitespace and NFC", () => expect(normalize("  가\n 나  ")).toBe("가 나"));
  it("confirms only source-backed quotes", () => {
    expect(evidenceGate(hospital, "신분증", "신분증을 반드시 지참해 주세요.")).toBe("confirmed");
    expect(evidenceGate(hospital, "수면내시경", "수면내시경 검사가 포함")).toBe("inferred");
  });
});
describe("classification and cards", () => {
  it("classifies the three submission scenarios", () => {
    expect(classifyNotice(hospital)).toBe("hospital"); expect(classifyNotice(government)).toBe("government"); expect(classifyNotice(smishing)).toBe("delivery_or_smishing");
  });
  it("returns an explainable confidence assessment", () => {
    const assessment = classifyNoticeDetailed(hospital);
    expect(assessment).toEqual(expect.objectContaining({ type: "hospital", confidence: "high" }));
    expect(assessment.score).toBeGreaterThan(assessment.alternatives[0].score);
    expect(assessment.matchedSignals).toEqual(expect.arrayContaining([expect.stringContaining("건강검진")]));
  });
  it("creates unguessable-format card codes and preserves privacy", () => {
    const card = buildCard({ raw_text: hospital }, fixedNow);
    expect(card.code).toMatch(/^SAY-(?:[A-Z2-9]{4}-){3}[A-Z2-9]{4}$/); expect(card).not.toHaveProperty("rawText");
    expect(Date.parse(card.expiresAt) - Date.parse(card.createdAt)).toBe(24 * 60 * 60_000);
    expect(card.facts.some((x) => x.fieldKey === "appointment_date")).toBe(true);
    expect(card.missingFields.map((x) => x.fieldKey)).toContain("medication_allowed");
  });
  it("generates a different bearer code for each card", () => {
    const codes = new Set(Array.from({ length: 100 }, () => cardCode()));
    expect(codes.size).toBe(100);
  });
  it("extracts government required facts", () => {
    const card = buildCard({ raw_text: government }, fixedNow);
    const keys = card.facts.map((x) => x.fieldKey);
    expect(keys).toEqual(expect.arrayContaining(["who_eligible", "deadline", "required_docs", "how_to_submit"]));
    expect(card.facts.find((fact) => fact.fieldKey === "deadline")?.value).toBe("7월 18일 18:00");
  });
  it("extracts an inline appointment and rejects impossible dates", () => {
    const inline = buildCard({ raw_text: "[새봄병원] 2026-07-20 오전 10시 건강검진 예약" }, fixedNow);
    expect(inline.facts.find((fact) => fact.fieldKey === "appointment_date")?.value).toBe("2026-07-20 오전 10시");
    const invalid = buildCard({ raw_text: "[새봄병원] 검진일: 2026-02-30 오전 10시" }, fixedNow);
    expect(invalid.facts.some((fact) => fact.fieldKey === "appointment_date")).toBe(false);
    expect(parseDateTime("2026-02-30 오전 10시", fixedNow)).toBeUndefined();
    expect(parseDateTime("오늘까지", fixedNow)).toBe("2026-07-11T14:59:00.000Z");
  });
  it("does not retain unrelated text based only on a host classification guess", () => {
    const inspection = JSON.parse(inspectNotice({ raw_text: "토요일 오후 두 시에 동호회 정기 모임이 있습니다.", notice_type_guess: "hospital" }));
    expect(inspection).toEqual(expect.objectContaining({ can_create_case: false, inspection_token: null, expires_at: null }));
  });
});
describe("risk rules", () => {
  it("finds independent impersonation, HTTP, urgency, and sender signals without redundant R1", () => {
    const risks = detectRiskSignals(smishing);
    expect(risks.map((x) => x.ruleId)).toEqual(["R2", "R8", "R3", "R7"]);
    expect(risks[0].severity).toBe("high");
  });
  it("detects bare short links and deceptive URL structures", () => {
    expect(detectRiskSignals("택배 확인 bit.ly/change").map((risk) => risk.ruleId)).toEqual(["R1"]);
    expect(detectRiskSignals("택배 확인 parcel.xyz/change").map((risk) => risk.ruleId)).toEqual(["R1"]);
    expect(detectRiskSignals("배송 http://192.168.0.1/a").map((risk) => risk.ruleId)).toEqual(["R8", "R9"]);
    expect(detectRiskSignals("CJ대한통운 배송 https://cjlogistics.com@evil.example/login").map((risk) => risk.ruleId)).toEqual(["R2", "R9"]);
    expect(detectRiskSignals("택배 https://xn--cj-9d0j.example/a").map((risk) => risk.ruleId)).toEqual(["R10"]);
  });
});
