import { checklists } from "../data/checklists.js";
import type { Fact, NoticeType } from "./types.js";

const dateRe = /(?:\d{4}년\s*)?\d{1,2}월\s*\d{1,2}일(?:\([^)]+\))?|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}/;
const timeRe = /(?:오전|오후|밤|저녁)?\s*\d{1,2}시(?:\s*\d{1,2}분)?|\d{1,2}:\d{2}/;
const amountRe = /[\d,]+원/;

function lineValue(line: string, type: NoticeType, key: string): string | undefined {
  const after = line.split(/[:：]/).slice(1).join(":").trim();
  if (after) return after.slice(0, 160);
  if (key === "amount") return line.match(amountRe)?.[0];
  if (["appointment_date", "deadline", "due_date"].includes(key)) return [line.match(dateRe)?.[0], line.match(timeRe)?.[0]].filter(Boolean).join(" ") || undefined;
  if (["arrival_time", "fasting_start"].includes(key)) return line.match(timeRe)?.[0];
  if (type === "delivery_or_smishing" && key === "has_link") return /https?:\/\//.test(line) ? "링크 있음" : undefined;
  return line.trim().slice(0, 160) || undefined;
}

export function patternExtract(rawText: string, type: NoticeType): Fact[] {
  const facts: Fact[] = [];
  const lines = rawText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  for (const field of checklists[type]) {
    const line = lines.find((x) => field.keywords.test(x));
    if (!line) continue;
    const value = lineValue(line, type, field.fieldKey);
    if (value) facts.push({ fieldKey: field.fieldKey, label: field.label, value, confidence: "confirmed", quote: line.slice(0, 120) });
  }
  return facts;
}

export function parseDateTime(value: string, now: Date): string | undefined {
  const kstNow = new Date(now.getTime() + 9 * 3600_000);
  let year = kstNow.getUTCFullYear(); let month: number | undefined; let day: number | undefined;
  const full = value.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일|(?:(\d{4})-(\d{2})-(\d{2}))|(?:(\d{1,2})월\s*(\d{1,2})일)|(?:(\d{1,2})\/(\d{1,2}))/);
  if (full) {
    year = Number(full[1] ?? full[4] ?? year); month = Number(full[2] ?? full[5] ?? full[7] ?? full[9]); day = Number(full[3] ?? full[6] ?? full[8] ?? full[10]);
  }
  if (!month || !day) return undefined;
  const t = value.match(/(오전|오후|밤|저녁)?\s*(\d{1,2})(?::|시)\s*(\d{1,2})?/);
  let hour = Number(t?.[2] ?? 0); const minute = Number(t?.[3] ?? 0);
  if (t?.[1] === "오후" || t?.[1] === "밤" || t?.[1] === "저녁") { if (hour < 12) hour += 12; }
  if (t?.[1] === "오전" && hour === 12) hour = 0;
  let result = new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
  const hasExplicitYear = Boolean(full?.[1] || full?.[4]);
  if (!hasExplicitYear && result.getTime() < now.getTime() - 86400_000) result = new Date(Date.UTC(year + 1, month - 1, day, hour - 9, minute));
  return result.toISOString();
}
