import { checklists } from "../data/checklists.js";
import { classifyNotice } from "./classify.js";
import { inspectionStore } from "./inspectionStore.js";
import { patternExtract } from "./patternExtract.js";
import { inspectPrivacy, sanitizeNoticeText } from "./privacy.js";
import { assessSource, detectRiskSignals } from "./riskRules.js";
import type { NoticeType } from "./types.js";

export interface InspectArgs { raw_text: string; notice_type_guess?: NoticeType; sender_hint?: string; }

export function inspectNotice(args: InspectArgs, now = new Date()): string {
  const privacy = inspectPrivacy(args.raw_text);
  const senderHint = args.sender_hint ? sanitizeNoticeText(args.sender_hint) : undefined;
  const noticeType = classifyNotice(privacy.redactedText, args.notice_type_guess);
  const facts = patternExtract(privacy.redactedText, noticeType).map(({ quote: _quote, ...fact }) => fact);
  const confirmed = new Set(facts.map((fact) => fact.fieldKey));
  const missing = checklists[noticeType].filter((field) => field.required && !confirmed.has(field.fieldKey)).map((field) => field.label);
  const risks = detectRiskSignals(privacy.redactedText, senderHint);
  const sourceAssessment = assessSource(privacy.redactedText, senderHint);
  const inspection = inspectionStore.create({ redactedText: privacy.redactedText, noticeType, senderHint, privacySummary: privacy.summary, sourceAssessment }, now);
  return JSON.stringify({
    inspection_token: inspection.token,
    expires_at: inspection.expiresAt,
    redacted_preview: privacy.redactedText.slice(0, 2000),
    privacy: privacy.summary,
    classification: noticeType,
    source_assessment: sourceAssessment,
    extracted_facts: facts.map(({ fieldKey, label, value, confidence }) => ({ field_key: fieldKey, label, value, confidence })),
    missing_required: missing,
    risk_signals: risks.map(({ ruleId, label, severity, saferNextStep }) => ({ rule_id: ruleId, label, severity, safer_next_step: saferNextStep })),
    next_step: "사용자에게 마스킹 결과와 위험 신호를 보여주고, 저장 동의를 명시적으로 받은 뒤 create_case를 호출하세요.",
  }, null, 2);
}
