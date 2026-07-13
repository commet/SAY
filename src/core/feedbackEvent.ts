import type { NoticeType, OutcomeFeedback } from "./types.js";

export interface ImprovementEvent {
  schema_version: 1;
  notice_type: NoticeType;
  outcome: OutcomeFeedback["outcome"];
  classification_quality: OutcomeFeedback["classificationQuality"];
  corrected_notice_type?: NoticeType;
  extraction_quality: OutcomeFeedback["extractionQuality"];
  risk_quality: OutcomeFeedback["riskQuality"];
  friction: OutcomeFeedback["friction"];
}

const noticeTypes = new Set<NoticeType>(["hospital", "government", "insurance_card_payment", "delivery_or_smishing", "apartment", "other"]);
const outcomes = new Set(["resolved", "partially_resolved", "abandoned", "unsafe_to_continue"]);
const classifications = new Set(["correct", "incorrect", "unsure"]);
const extractions = new Set(["complete", "missing_information", "incorrect_information", "unsure"]);
const risks = new Set(["appropriate", "false_alarm", "missed_risk", "unsure"]);
const frictions = new Set(["none", "too_many_steps", "unclear_next_action", "coordination_difficulty", "privacy_concern"]);

export function makeImprovementEvent(noticeType: NoticeType, feedback: OutcomeFeedback): ImprovementEvent {
  return {
    schema_version: 1, notice_type: noticeType, outcome: feedback.outcome,
    classification_quality: feedback.classificationQuality, corrected_notice_type: feedback.correctedNoticeType,
    extraction_quality: feedback.extractionQuality, risk_quality: feedback.riskQuality, friction: feedback.friction,
  };
}

export function parseImprovementEvent(value: unknown): ImprovementEvent | undefined {
  if (!value || typeof value !== "object") return undefined;
  const event = value as Record<string, unknown>;
  if (event.schema_version !== 1 || !noticeTypes.has(event.notice_type as NoticeType)) return undefined;
  if (!outcomes.has(event.outcome as string) || !classifications.has(event.classification_quality as string)) return undefined;
  if (!extractions.has(event.extraction_quality as string) || !risks.has(event.risk_quality as string) || !frictions.has(event.friction as string)) return undefined;
  if (event.corrected_notice_type !== undefined && !noticeTypes.has(event.corrected_notice_type as NoticeType)) return undefined;
  if (event.classification_quality === "incorrect" && event.corrected_notice_type === undefined) return undefined;
  if (event.classification_quality !== "incorrect" && event.corrected_notice_type !== undefined) return undefined;
  if (event.notice_type === event.corrected_notice_type) return undefined;
  const allowed = new Set(["schema_version", "notice_type", "outcome", "classification_quality", "corrected_notice_type", "extraction_quality", "risk_quality", "friction"]);
  if (Object.keys(event).some((key) => !allowed.has(key))) return undefined;
  return event as unknown as ImprovementEvent;
}

export function eventToFeedback(event: ImprovementEvent, recordedAt = new Date()): OutcomeFeedback {
  return {
    outcome: event.outcome,
    classificationQuality: event.classification_quality,
    correctedNoticeType: event.corrected_notice_type,
    extractionQuality: event.extraction_quality,
    riskQuality: event.risk_quality,
    friction: event.friction,
    recordedAt: recordedAt.toISOString(),
  };
}
