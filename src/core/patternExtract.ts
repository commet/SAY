import { checklists } from "../data/checklists.js";
import type { Fact, NoticeType } from "./types.js";

const dateRe = /(?:\d{4}년\s*)?\d{1,2}월\s*\d{1,2}일(?:\([^)]+\))?|\d{4}[-.]\d{1,2}[-.]\d{1,2}|\d{1,2}\/\d{1,2}/;
const timeRe = /(?:오전|오후|밤|저녁)?\s*\d{1,2}시(?:\s*\d{1,2}분)?|\d{1,2}:\d{2}/;
const amountRe = /\d{1,3}(?:,\d{3})*원|\d+원/;
const linkRe = /https?:\/\/|www\.|(?:bit\.ly|t\.ly|url\.kr|han\.gl|vo\.la|me2\.do)(?:\/|\b)|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|kr|co|xyz|top|shop|club|click|live)(?:\/|\b)/i;

function bounded(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 160) : undefined;
}

function dateTimeValue(line: string, preferLast = false): string | undefined {
  const dates = [...line.matchAll(new RegExp(dateRe.source, "g"))];
  const selectedDate = preferLast ? dates.at(-1) : dates[0];
  const date = selectedDate?.[0];
  const relative = line.match(/오늘|내일|모레/)?.[0];
  if (!date && !relative) return undefined;
  if (!date && relative) {
    const time = line.match(timeRe)?.[0];
    return `${relative}${line.includes("까지") ? "까지" : ""}${time ? ` ${time}` : ""}`;
  }
  if (!date) return undefined;
  const explicit = date.match(/(?:(\d{4})년\s*)?(\d{1,2})월\s*(\d{1,2})일|(\d{4})[-.](\d{1,2})[-.](\d{1,2})|(\d{1,2})\/(\d{1,2})/);
  if (explicit) {
    const year = Number(explicit[1] ?? explicit[4] ?? 2000);
    const month = Number(explicit[2] ?? explicit[5] ?? explicit[7]);
    const day = Number(explicit[3] ?? explicit[6] ?? explicit[8]);
    if (!isValidCalendarDate(year, month, day)) return undefined;
  }
  const dateAt = selectedDate?.index ?? line.indexOf(date);
  const afterDate = line.slice(dateAt + date.length);
  const time = afterDate.match(timeRe)?.[0] ?? line.slice(0, dateAt).match(timeRe)?.[0];
  return [date, time].filter(Boolean).join(" ");
}

function lineValue(line: string, type: NoticeType, key: string): string | undefined {
  if (["appointment_date", "deadline", "due_date"].includes(key)) return dateTimeValue(line, key !== "appointment_date");
  if (key === "arrival_time") return line.match(timeRe)?.[0];
  if (key === "fasting_start") return line.match(timeRe)?.[0] ?? bounded(line);
  if (key === "amount") return line.match(amountRe)?.[0];
  if (type === "delivery_or_smishing" && key === "has_link") return linkRe.test(line) ? "링크 있음" : undefined;

  const after = line.split(/[:：]/).slice(1).join(":").trim();
  return bounded(after || line);
}

export function patternExtract(rawText: string, type: NoticeType): Fact[] {
  const facts: Fact[] = [];
  const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const field of checklists[type]) {
    for (const line of lines) {
      field.keywords.lastIndex = 0;
      if (!field.keywords.test(line)) continue;
      const value = lineValue(line, type, field.fieldKey);
      if (!value) continue;
      facts.push({ fieldKey: field.fieldKey, label: field.label, value, confidence: "confirmed", quote: line.slice(0, 120) });
      break;
    }
  }
  return facts;
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

export function parseDateTime(value: string, now: Date): string | undefined {
  const kstNow = new Date(now.getTime() + 9 * 3600_000);
  const time = value.match(/(오전|오후|밤|저녁)?\s*(\d{1,2})(?::|시)\s*(\d{1,2})?/);
  let hour = Number(time?.[2] ?? (value.includes("까지") ? 23 : 0));
  const minute = Number(time?.[3] ?? (value.includes("까지") && !time ? 59 : 0));
  if (minute > 59 || (time?.[1] ? hour < 1 || hour > 12 : hour > 23)) return undefined;
  if (time?.[1] === "오후" || time?.[1] === "밤" || time?.[1] === "저녁") {
    if (hour < 12) hour += 12;
  }
  if (time?.[1] === "오전" && hour === 12) hour = 0;

  const relative = value.match(/오늘|내일|모레/)?.[0];
  if (relative) {
    const offset = relative === "오늘" ? 0 : relative === "내일" ? 1 : 2;
    return new Date(Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate() + offset, hour - 9, minute)).toISOString();
  }

  let year = kstNow.getUTCFullYear();
  let month: number | undefined;
  let day: number | undefined;
  const full = value.match(/(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일|(?:(\d{4})[-.](\d{1,2})[-.](\d{1,2}))|(?:(\d{1,2})월\s*(\d{1,2})일)|(?:(\d{1,2})\/(\d{1,2}))/);
  if (full) {
    year = Number(full[1] ?? full[4] ?? year);
    month = Number(full[2] ?? full[5] ?? full[7] ?? full[9]);
    day = Number(full[3] ?? full[6] ?? full[8] ?? full[10]);
  }
  if (!month || !day || !isValidCalendarDate(year, month, day)) return undefined;

  let result = new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
  const hasExplicitYear = Boolean(full?.[1] || full?.[4]);
  if (!hasExplicitYear && result.getTime() < now.getTime() - 86400_000) {
    year += 1;
    if (!isValidCalendarDate(year, month, day)) return undefined;
    result = new Date(Date.UTC(year, month - 1, day, hour - 9, minute));
  }
  return result.toISOString();
}
