import { checklists } from "../data/checklists.js";
import { classifyNoticeDetailed } from "./classify.js";
import { inspectionStore } from "./inspectionStore.js";
import { patternExtract } from "./patternExtract.js";
import { inspectPrivacy, mergePrivacySummaries } from "./privacy.js";
import { assessSource, detectRiskSignals } from "./riskRules.js";
import type { NoticeType } from "./types.js";

export interface InspectArgs { raw_text: string; notice_type_guess?: NoticeType; confirmed_notice_type?: NoticeType; sender_hint?: string; }

function applyUserConfirmation(classification: ReturnType<typeof classifyNoticeDetailed>, confirmedType?: NoticeType) {
  if (!confirmedType) return classification;
  const ranked = [{ type: classification.type, score: classification.score }, ...classification.alternatives];
  const selectedScore = ranked.find((item) => item.type === confirmedType)?.score ?? 0;
  return {
    type: confirmedType,
    confidence: "high" as const,
    score: selectedScore,
    margin: 0,
    matchedSignals: ["사용자가 안내 종류를 직접 확인함"],
    alternatives: ranked.filter((item) => item.type !== confirmedType).slice(0, 3),
    confirmedByUser: true,
  };
}

export function inspectNotice(args: InspectArgs, now = new Date()): string {
  const privacy = inspectPrivacy(args.raw_text);
  const senderPrivacy = args.sender_hint ? inspectPrivacy(args.sender_hint) : undefined;
  const senderHint = senderPrivacy?.redactedText;
  const combinedPrivacy = mergePrivacySummaries(privacy.summary, senderPrivacy?.summary);
  const inferredClassification = classifyNoticeDetailed(privacy.redactedText, args.notice_type_guess);
  const classification = applyUserConfirmation(inferredClassification, args.confirmed_notice_type);
  const noticeType = classification.type;
  const facts = patternExtract(privacy.redactedText, noticeType).map(({ quote: _quote, ...fact }) => fact);
  const confirmed = new Set(facts.map((fact) => fact.fieldKey));
  const missing = checklists[noticeType].filter((field) => field.required && !confirmed.has(field.fieldKey)).map((field) => field.label);
  const risks = detectRiskSignals(args.raw_text, args.sender_hint);
  const sourceAssessment = assessSource(args.raw_text, args.sender_hint);
  // A host-provided guess is not consent or evidence. Low-confidence results
  // require an explicit user-confirmed type before a retention token is issued.
  const classificationConfirmationRequired = inferredClassification.confidence === "low" && !args.confirmed_notice_type && noticeType !== "other";
  const hasActionableEvidence = classification.score > 0 || facts.length > 0 || classification.confirmedByUser;
  const canCreateCase = noticeType !== "other" && !classificationConfirmationRequired && Boolean(hasActionableEvidence);
  const inspection = canCreateCase ? inspectionStore.create({ redactedText: privacy.redactedText, noticeType, classification, senderHint, privacySummary: combinedPrivacy, sourceAssessment, riskSignals: risks }, now) : undefined;
  const classificationForOutput = {
    type: classification.type,
    confidence: classification.confidence,
    confirmed_by_user: classification.confirmedByUser ?? false,
    reasons: classification.matchedSignals.slice(0, 5).map((reason) => reason.replace(/\(\+\d+\)$/, "")),
    alternatives: classification.confidence === "low" ? classification.alternatives.filter((item) => item.score > 0).map((item) => item.type) : [],
  };
  const previewLimit = 2000;
  return JSON.stringify({
    inspection_token: inspection?.token ?? null,
    expires_at: inspection?.expiresAt ?? null,
    redacted_preview: privacy.redactedText.slice(0, previewLimit),
    preview_truncated: privacy.redactedText.length > previewLimit,
    privacy: combinedPrivacy,
    classification: classificationForOutput,
    classification_confirmation_required: classificationConfirmationRequired,
    source_assessment: sourceAssessment,
    extracted_facts: facts.map(({ fieldKey, label, value, confidence }) => ({ field_key: fieldKey, label, value, confidence })),
    missing_required: missing,
    risk_signals: risks.map(({ ruleId, label, severity, saferNextStep }) => ({ rule_id: ruleId, label, severity, safer_next_step: saferNextStep })),
    can_create_case: canCreateCase,
    next_step: canCreateCase
      ? "사용자에게 마스킹 결과와 위험 신호를 보여주고, 저장 동의를 명시적으로 받은 뒤 create_case를 호출하세요."
      : classificationConfirmationRequired
        ? "사용자에게 안내 종류를 확인한 뒤, 사용자가 직접 고른 종류를 confirmed_notice_type에 넣어 inspect_notice를 다시 호출하세요."
        : "행동 케이스로 만들 정보가 부족합니다. 안내문 전체를 다시 받아 inspect_notice를 호출하세요.",
  }, null, 2);
}
