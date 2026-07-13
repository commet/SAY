import { cardCode } from "./cardCode.js";
import { classifyNotice, titles } from "./classify.js";
import { evidenceGate } from "./evidenceGate.js";
import { parseDateTime, patternExtract } from "./patternExtract.js";
import { detectRiskSignals } from "./riskRules.js";
import { checklists } from "../data/checklists.js";
import type { ExtractedInput, Fact, NoticeCard, NoticeType } from "./types.js";

export interface AnalyzeArgs { raw_text: string; notice_type_guess?: NoticeType; extracted?: ExtractedInput[]; sender_hint?: string; }

export function buildCard(args: AnalyzeArgs, now = new Date()): NoticeCard {
  const noticeType = classifyNotice(args.raw_text, args.notice_type_guess);
  const fields = checklists[noticeType];
  const byKey = new Map(fields.map((x) => [x.fieldKey, x]));
  const facts = patternExtract(args.raw_text, noticeType);
  for (const item of args.extracted ?? []) {
    const meta = byKey.get(item.field_key);
    const fact: Fact = { fieldKey: item.field_key, label: meta?.label ?? item.field_key.replaceAll("_", " "), value: item.value, confidence: evidenceGate(args.raw_text, item.value, item.quote), quote: item.quote?.slice(0, 120) };
    const index = facts.findIndex((x) => x.fieldKey === fact.fieldKey);
    if (index >= 0) { if (fact.confidence === "confirmed") facts[index] = fact; } else facts.push(fact);
  }
  const confirmedKeys = new Set(facts.filter((x) => x.confidence === "confirmed").map((x) => x.fieldKey));
  const missingFields = fields.filter((x) => x.required && !confirmedKeys.has(x.fieldKey)).map((x) => ({ fieldKey: x.fieldKey, label: x.label, whyItMatters: x.whyItMatters, suggestedQuestion: x.suggestedQuestion }));
  if (noticeType === "hospital" && /수면내시경/.test(args.raw_text) && !confirmedKeys.has("guardian_needed")) {
    const x = fields.find((f) => f.fieldKey === "guardian_needed")!;
    missingFields.push({ fieldKey: x.fieldKey, label: x.label, whyItMatters: x.whyItMatters, suggestedQuestion: x.suggestedQuestion });
  }
  const actionItems = [...facts.filter((fact) => fact.confidence === "confirmed" && byKey.get(fact.fieldKey)?.actionLabel).map((fact) => {
    const meta = byKey.get(fact.fieldKey)!; return { label: `${meta.actionLabel} (${fact.value})`, dueAt: parseDateTime(fact.value, now) };
  }), ...missingFields.map((x) => ({ label: `'${x.label}' 확인하기`, dueAt: undefined }))]
    .map((x, i) => ({ id: `a${i + 1}`, label: x.label, dueAt: x.dueAt, status: "unchecked" as const, history: [{ at: now.toISOString(), status: "unchecked" as const }] }));
  const reminders = facts.filter((fact) => fact.confidence === "confirmed" && byKey.get(fact.fieldKey)?.reminderText).slice(0, 3).map((fact) => {
    const meta = byKey.get(fact.fieldKey)!; const iso = parseDateTime(fact.value, now);
    return { atLabel: iso ? new Date(Date.parse(iso) - 10 * 60_000).toISOString() : `${fact.value} 직전`, text: meta.reminderText! };
  });
  const candidates = [...actionItems.map((x) => x.dueAt), ...reminders.map((x) => /^\d{4}-/.test(x.atLabel) ? x.atLabel : undefined)].filter((x): x is string => Boolean(x)).sort();
  return { code: cardCode(args.raw_text), noticeType, title: titles[noticeType], facts, actionItems, missingFields, riskSignals: detectRiskSignals(args.raw_text, args.sender_hint), reminderSuggestions: reminders, nextCheckAt: candidates[0], createdAt: now.toISOString(), lastAccessAt: now.toISOString() };
}
