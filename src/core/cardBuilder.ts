import { cardCode } from "./cardCode.js";
import { classifyNoticeDetailed, titles } from "./classify.js";
import { parseDateTime, patternExtract } from "./patternExtract.js";
import { assessSource, detectRiskSignals } from "./riskRules.js";
import { inspectPrivacy, mergePrivacySummaries } from "./privacy.js";
import { cardExpiresAt } from "./retention.js";
import { checklists } from "../data/checklists.js";
import type { ActionItem, ClassificationAssessment, Fact, NoticeCard, NoticeType, PrivacySummary, RiskSignal, SourceAssessment } from "./types.js";

export interface BuildCardArgs { raw_text: string; notice_type_guess?: NoticeType; sender_hint?: string; privacy_summary?: PrivacySummary; source_assessment?: SourceAssessment; classification_assessment?: ClassificationAssessment; risk_signals?: RiskSignal[]; }

function previousKstDayAt(anchorIso: string, hour: number, minute: number): string {
  const local = new Date(Date.parse(anchorIso) + 9 * 3600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 1, hour - 9, minute)).toISOString();
}

function timeOfDay(value: string): { hour: number; minute: number } | undefined {
  const match = value.match(/(오전|오후|밤|저녁)?\s*(\d{1,2})(?::|시)\s*(\d{1,2})?/);
  if (!match) return undefined;
  let hour = Number(match[2]); const minute = Number(match[3] ?? 0);
  if (minute > 59 || (match[1] ? hour < 1 || hour > 12 : hour > 23)) return undefined;
  if (["오후", "밤", "저녁"].includes(match[1]) && hour < 12) hour += 12;
  if (match[1] === "오전" && hour === 12) hour = 0;
  return { hour, minute };
}

function scheduledAt(fact: Fact, facts: Fact[], noticeType: NoticeType, now: Date): string | undefined {
  const direct = parseDateTime(fact.value, now);
  if (direct) return direct;
  const anchorKey = noticeType === "hospital" ? "appointment_date" : noticeType === "apartment" ? "schedule" : undefined;
  const anchorValue = anchorKey ? facts.find((candidate) => candidate.fieldKey === anchorKey)?.value : undefined;
  const anchor = anchorValue ? parseDateTime(anchorValue, now) : undefined;
  if (!anchor) return undefined;
  if (noticeType === "hospital" && fact.fieldKey === "fasting_start") {
    const time = timeOfDay(fact.value);
    return time ? previousKstDayAt(anchor, time.hour, time.minute) : undefined;
  }
  if ((noticeType === "hospital" && fact.fieldKey === "items_to_bring") || (noticeType === "apartment" && fact.fieldKey === "required_action")) {
    return previousKstDayAt(anchor, 20, 0);
  }
  return undefined;
}

export function buildCard(args: BuildCardArgs, now = new Date()): NoticeCard {
  const privacy = inspectPrivacy(args.raw_text);
  const rawText = privacy.redactedText;
  const senderPrivacy = args.sender_hint ? inspectPrivacy(args.sender_hint) : undefined;
  const senderHint = senderPrivacy?.redactedText;
  const classification = args.classification_assessment ?? classifyNoticeDetailed(rawText, args.notice_type_guess);
  const noticeType = classification.type;
  const fields = checklists[noticeType];
  const byKey = new Map(fields.map((x) => [x.fieldKey, x]));
  const facts = patternExtract(rawText, noticeType).map(({ quote: _quote, ...fact }) => fact);
  const confirmedKeys = new Set(facts.filter((x) => x.confidence === "confirmed").map((x) => x.fieldKey));
  const missingFields = fields.filter((x) => x.required && !confirmedKeys.has(x.fieldKey)).map((x) => ({ fieldKey: x.fieldKey, label: x.label, whyItMatters: x.whyItMatters, suggestedQuestion: x.suggestedQuestion }));
  if (noticeType === "hospital" && /수면내시경/.test(rawText) && !confirmedKeys.has("guardian_needed")) {
    const x = fields.find((f) => f.fieldKey === "guardian_needed")!;
    missingFields.push({ fieldKey: x.fieldKey, label: x.label, whyItMatters: x.whyItMatters, suggestedQuestion: x.suggestedQuestion });
  }
  const riskSignals = args.risk_signals ?? detectRiskSignals(args.raw_text, args.sender_hint);
  const sourceAssessment = args.source_assessment ?? assessSource(rawText, senderHint);
  const needsVerification = riskSignals.some((risk) => risk.severity === "high") || sourceAssessment.trust === "mismatch";
  const needsClassificationConfirmation = classification.confidence === "low" && !classification.confirmedByUser && noticeType !== "other";
  const gateIds = [...(needsVerification ? ["verify-source"] : []), ...(needsClassificationConfirmation ? ["confirm-type"] : [])];
  const planned = [...facts.filter((fact) => fact.confidence === "confirmed" && byKey.get(fact.fieldKey)?.actionLabel).map((fact) => {
    const meta = byKey.get(fact.fieldKey)!; return { fieldKey: fact.fieldKey, label: `${meta.actionLabel} (${fact.value})`, dueAt: scheduledAt(fact, facts, noticeType, now) };
  }).map((item) => ({ ...item, kind: "complete_notice" as const, priority: 2 as const })), ...missingFields.map((x) => ({ fieldKey: x.fieldKey, label: `'${x.label}' 확인하기`, dueAt: undefined, kind: "clarify" as const, priority: 3 as const }))];
  const actionItems: ActionItem[] = planned.map((item, i) => ({ id: `a${i + 1}`, ...item, dependsOn: gateIds.length ? gateIds : undefined, status: "unchecked", history: [{ at: now.toISOString(), status: "unchecked" }] }));
  if (needsClassificationConfirmation) actionItems.unshift({ id: "confirm-type", label: `안내 종류가 '${titles[noticeType]}'가 맞는지 확인하기`, kind: "clarify", priority: 1, status: "unchecked", history: [{ at: now.toISOString(), status: "unchecked" }] });
  if (needsVerification) actionItems.unshift({ id: "verify-source", label: "문자 링크를 열지 않고 공식 앱·대표번호로 발신 내용 확인하기", kind: "verify_source", priority: 1, status: "unchecked", history: [{ at: now.toISOString(), status: "unchecked" }] });
  const reminders = facts.filter((fact) => fact.confidence === "confirmed" && byKey.get(fact.fieldKey)?.reminderText).slice(0, 3).map((fact) => {
    const meta = byKey.get(fact.fieldKey)!; const iso = scheduledAt(fact, facts, noticeType, now);
    return iso ? { fieldKey: fact.fieldKey, atLabel: new Date(Date.parse(iso) - 10 * 60_000).toISOString(), text: meta.reminderText! } : undefined;
  }).filter((reminder): reminder is NonNullable<typeof reminder> => Boolean(reminder));
  const candidates = [...actionItems.map((x) => x.dueAt), ...reminders.map((x) => /^\d{4}-/.test(x.atLabel) ? x.atLabel : undefined)].filter((x): x is string => Boolean(x)).sort();
  return {
    code: cardCode(), noticeType, title: titles[noticeType], facts, actionItems, missingFields, riskSignals,
    status: needsVerification || needsClassificationConfirmation ? "needs_confirmation" : "ready", version: 1,
    privacySummary: args.privacy_summary ?? mergePrivacySummaries(privacy.summary, senderPrivacy?.summary), sourceAssessment, classification,
    events: [{ at: now.toISOString(), type: "created", detail: needsVerification ? "공식 채널 확인이 필요한 상태로 생성" : needsClassificationConfirmation ? "안내 종류 확인이 필요한 상태로 생성" : "행동 가능한 상태로 생성" }],
    reminderSuggestions: reminders, nextCheckAt: candidates[0], createdAt: now.toISOString(), expiresAt: cardExpiresAt(now), lastAccessAt: now.toISOString(),
  };
}
