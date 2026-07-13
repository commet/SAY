import type { PrivacySummary } from "./types.js";

const SAFE_ACTOR_ROLES = new Set(["엄마", "아빠", "부모님", "자녀", "보호자", "배우자", "가족"]);

export interface PrivacyInspection { redactedText: string; summary: PrivacySummary; }

/**
 * Defense-in-depth redaction for text that may be returned or retained in a card.
 * The MCP description still asks the host to redact first, but the server never
 * relies on the host doing so correctly.
 */
export function sanitizeNoticeText(value: string): string {
  return inspectPrivacy(value).redactedText;
}

export function inspectPrivacy(value: string): PrivacyInspection {
  const counts = new Map<string, number>();
  let redactedText = value.normalize("NFC");
  const replace = (kind: string, pattern: RegExp, replacement: string | ((...args: string[]) => string)) => {
    redactedText = redactedText.replace(pattern, (...args: string[]) => {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
      return typeof replacement === "string" ? replacement : replacement(...args);
    });
  };
  replace("address", /(주소|배송지|거주지)\s*[:：]\s*[^\r\n]+/g, (_match: string, label: string) => `${label}: [주소 숨김]`);
  replace("labeled_identifier", /(계좌번호|카드번호|고객번호|환자번호|접수번호)\s*[:：]?\s*[A-Z0-9 -]{6,}/gi, (_match: string, label: string) => `${label}: [식별정보 숨김]`);
  replace("resident_id", /(?<!\d)\d{6}[- ]?[1-4]\d{6}(?!\d)/g, "[주민등록번호 숨김]");
  replace("phone", /(?<!\d)(?:\+82[- ]?)?0\d{1,2}[- .]?\d{3,4}[- .]?\d{4}(?!\d)/g, "[전화번호 숨김]");
  replace("identifier", /\b[A-Z][0-9]{7,8}\b/gi, "[식별정보 숨김]");
  replace("email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[이메일 숨김]");
  replace("financial_number", /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g, "[금융번호 숨김]");
  replace("person_name", /([가-힣])([가-힣]{1,3})(?=님)/g, (_match: string, first: string, rest: string) => `${first}${"○".repeat(rest.length)}`);
  replace("url_query", /(https?:\/\/[^\s?<>]+)\?[^\s<>]+/gi, (_match: string, base: string) => `${base}?[쿼리 숨김]`);
  const findings = [...counts.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => a.kind.localeCompare(b.kind));
  return { redactedText, summary: { total: findings.reduce((sum, item) => sum + item.count, 0), findings } };
}

/** Store only non-identifying family roles, never a person's entered name. */
export function safeActorRole(value?: string): string | undefined {
  const role = value?.trim();
  if (!role) return undefined;
  return SAFE_ACTOR_ROLES.has(role) ? role : "가족 구성원";
}
