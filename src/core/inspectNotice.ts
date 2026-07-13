import { checklists } from "../data/checklists.js";
import { classifyNoticeDetailed } from "./classify.js";
import { inspectionStore } from "./inspectionStore.js";
import { patternExtract } from "./patternExtract.js";
import { inspectPrivacy, mergePrivacySummaries } from "./privacy.js";
import { assessSource, detectRiskSignals } from "./riskRules.js";
import type { NoticeType } from "./types.js";

export interface InspectArgs { raw_text: string; notice_type_guess?: NoticeType; sender_hint?: string; }

export function inspectNotice(args: InspectArgs, now = new Date()): string {
  const privacy = inspectPrivacy(args.raw_text);
  const senderPrivacy = args.sender_hint ? inspectPrivacy(args.sender_hint) : undefined;
  const senderHint = senderPrivacy?.redactedText;
  const combinedPrivacy = mergePrivacySummaries(privacy.summary, senderPrivacy?.summary);
  const classification = classifyNoticeDetailed(privacy.redactedText, args.notice_type_guess);
  const noticeType = classification.type;
  const facts = patternExtract(privacy.redactedText, noticeType).map(({ quote: _quote, ...fact }) => fact);
  const confirmed = new Set(facts.map((fact) => fact.fieldKey));
  const missing = checklists[noticeType].filter((field) => field.required && !confirmed.has(field.fieldKey)).map((field) => field.label);
  const risks = detectRiskSignals(args.raw_text, args.sender_hint);
  const sourceAssessment = assessSource(args.raw_text, args.sender_hint);
  const canCreateCase = noticeType !== "other" || facts.length > 0;
  const inspection = canCreateCase ? inspectionStore.create({ redactedText: privacy.redactedText, noticeType, classification, senderHint, privacySummary: combinedPrivacy, sourceAssessment, riskSignals: risks }, now) : undefined;
  return JSON.stringify({
    inspection_token: inspection?.token ?? null,
    expires_at: inspection?.expiresAt ?? null,
    redacted_preview: privacy.redactedText.slice(0, 2000),
    privacy: combinedPrivacy,
    classification,
    source_assessment: sourceAssessment,
    extracted_facts: facts.map(({ fieldKey, label, value, confidence }) => ({ field_key: fieldKey, label, value, confidence })),
    missing_required: missing,
    risk_signals: risks.map(({ ruleId, label, severity, saferNextStep }) => ({ rule_id: ruleId, label, severity, safer_next_step: saferNextStep })),
    can_create_case: canCreateCase,
    next_step: canCreateCase ? "사용자에게 마스킹 결과와 위험 신호를 보여주고, 저장 동의를 명시적으로 받은 뒤 create_case를 호출하세요." : "행동 케이스로 만들 정보가 부족합니다. 안내문 전체를 다시 받아 inspect_notice를 호출하세요.",
  }, null, 2);
}
