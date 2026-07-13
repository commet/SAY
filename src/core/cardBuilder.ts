import { cardCode } from "./cardCode.js";
import { classifyNotice, titles } from "./classify.js";
import { evidenceGate } from "./evidenceGate.js";
import { parseDateTime, patternExtract } from "./patternExtract.js";
import { assessSource, detectRiskSignals } from "./riskRules.js";
import { inspectPrivacy, sanitizeNoticeText } from "./privacy.js";
import { checklists } from "../data/checklists.js";
import type { ActionItem, ExtractedInput, Fact, NoticeCard, NoticeType, PrivacySummary, SourceAssessment } from "./types.js";

export interface AnalyzeArgs { raw_text: string; notice_type_guess?: NoticeType; extracted?: ExtractedInput[]; sender_hint?: string; privacy_summary?: PrivacySummary; source_assessment?: SourceAssessment; }

export function buildCard(args: AnalyzeArgs, now = new Date()): NoticeCard {
  const privacy = inspectPrivacy(args.raw_text);
  const rawText = privacy.redactedText;
  const senderHint = args.sender_hint ? sanitizeNoticeText(args.sender_hint) : undefined;
  const noticeType = classifyNotice(rawText, args.notice_type_guess);
  const fields = checklists[noticeType];
  const byKey = new Map(fields.map((x) => [x.fieldKey, x]));
  const facts = patternExtract(rawText, noticeType).map(({ quote: _quote, ...fact }) => fact);
  for (const item of args.extracted ?? []) {
    const meta = byKey.get(item.field_key);
    const value = sanitizeNoticeText(item.value);
    const quote = item.quote ? sanitizeNoticeText(item.quote) : undefined;
    const fact: Fact = { fieldKey: item.field_key, label: meta?.label ?? item.field_key.replaceAll("_", " "), value, confidence: evidenceGate(rawText, value, quote) };
    const index = facts.findIndex((x) => x.fieldKey === fact.fieldKey);
    if (index >= 0) { if (fact.confidence === "confirmed") facts[index] = fact; } else facts.push(fact);
  }
  const confirmedKeys = new Set(facts.filter((x) => x.confidence === "confirmed").map((x) => x.fieldKey));
  const missingFields = fields.filter((x) => x.required && !confirmedKeys.has(x.fieldKey)).map((x) => ({ fieldKey: x.fieldKey, label: x.label, whyItMatters: x.whyItMatters, suggestedQuestion: x.suggestedQuestion }));
  if (noticeType === "hospital" && /수면내시경/.test(rawText) && !confirmedKeys.has("guardian_needed")) {
    const x = fields.find((f) => f.fieldKey === "guardian_needed")!;
    missingFields.push({ fieldKey: x.fieldKey, label: x.label, whyItMatters: x.whyItMatters, suggestedQuestion: x.suggestedQuestion });
  }
  const riskSignals = detectRiskSignals(rawText, senderHint);
  const sourceAssessment = args.source_assessment ?? assessSource(rawText, senderHint);
  const needsVerification = riskSignals.some((risk) => risk.severity === "high") || sourceAssessment.trust === "mismatch";
  const planned = [...facts.filter((fact) => fact.confidence === "confirmed" && byKey.get(fact.fieldKey)?.actionLabel).map((fact) => {
    const meta = byKey.get(fact.fieldKey)!; return { label: `${meta.actionLabel} (${fact.value})`, dueAt: parseDateTime(fact.value, now) };
  }).map((item) => ({ ...item, kind: "complete_notice" as const, priority: 2 as const })), ...missingFields.map((x) => ({ label: `'${x.label}' 확인하기`, dueAt: undefined, kind: "clarify" as const, priority: 3 as const }))];
  const actionItems: ActionItem[] = planned.map((item, i) => ({ id: `a${i + 1}`, ...item, dependsOn: needsVerification ? ["verify-source"] : undefined, status: "unchecked", history: [{ at: now.toISOString(), status: "unchecked" }] }));
  if (needsVerification) actionItems.unshift({ id: "verify-source", label: "문자 링크를 열지 않고 공식 앱·대표번호로 발신 내용 확인하기", kind: "verify_source", priority: 1, status: "unchecked", history: [{ at: now.toISOString(), status: "unchecked" }] });
  const reminders = facts.filter((fact) => fact.confidence === "confirmed" && byKey.get(fact.fieldKey)?.reminderText).slice(0, 3).map((fact) => {
    const meta = byKey.get(fact.fieldKey)!; const iso = parseDateTime(fact.value, now);
    return { atLabel: iso ? new Date(Date.parse(iso) - 10 * 60_000).toISOString() : `${fact.value} 직전`, text: meta.reminderText! };
  });
  const candidates = [...actionItems.map((x) => x.dueAt), ...reminders.map((x) => /^\d{4}-/.test(x.atLabel) ? x.atLabel : undefined)].filter((x): x is string => Boolean(x)).sort();
  return {
    code: cardCode(), noticeType, title: titles[noticeType], facts, actionItems, missingFields, riskSignals,
    status: needsVerification ? "needs_confirmation" : "ready", version: 1,
    privacySummary: args.privacy_summary ?? privacy.summary, sourceAssessment,
    events: [{ at: now.toISOString(), type: "created", detail: needsVerification ? "공식 채널 확인이 필요한 상태로 생성" : "행동 가능한 상태로 생성" }],
    reminderSuggestions: reminders, nextCheckAt: candidates[0], createdAt: now.toISOString(), lastAccessAt: now.toISOString(),
  };
}
