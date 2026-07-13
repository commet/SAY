import { describe, expect, it } from "vitest";
import { evidenceGate, normalize } from "../src/core/evidenceGate.js";
import { classifyNotice } from "../src/core/classify.js";
import { buildCard } from "../src/core/cardBuilder.js";
import { cardCode } from "../src/core/cardCode.js";
import { detectRiskSignals } from "../src/core/riskRules.js";
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
  it("creates unguessable-format card codes and preserves privacy", () => {
    const card = buildCard({ raw_text: hospital }, fixedNow);
    expect(card.code).toMatch(/^SAY-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/); expect(card).not.toHaveProperty("rawText");
    expect(card.facts.some((x) => x.fieldKey === "appointment_date")).toBe(true);
    expect(card.missingFields.map((x) => x.fieldKey)).toContain("medication_allowed");
  });
  it("generates a different bearer code for each card", () => {
    const codes = new Set(Array.from({ length: 100 }, () => cardCode()));
    expect(codes.size).toBe(100);
  });
  it("extracts government required facts", () => {
    const keys = buildCard({ raw_text: government }, fixedNow).facts.map((x) => x.fieldKey);
    expect(keys).toEqual(expect.arrayContaining(["who_eligible", "deadline", "required_docs", "how_to_submit"]));
  });
});
describe("risk rules", () => {
  it("finds impersonation, urgency, and international sender without R1 duplication", () => {
    const risks = detectRiskSignals(smishing);
    expect(risks.map((x) => x.ruleId)).toEqual(["R2", "R3", "R7"]);
    expect(risks[0].severity).toBe("high");
  });
});
