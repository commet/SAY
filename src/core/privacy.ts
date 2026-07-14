import type { PrivacySummary } from "./types.js";

const SAFE_ACTOR_ROLES = new Set(["엄마", "아빠", "부모님", "자녀", "보호자", "배우자", "가족"]);
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"']+|(?:bit\.ly|t\.ly|url\.kr|han\.gl|vo\.la|me2\.do)(?:\/[^\s<>"']*)?|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|kr|co|xyz|top|shop|club|click|live)(?:\/[^\s<>"']*)?/gi;

export interface PrivacyInspection { redactedText: string; summary: PrivacySummary; }

export function mergePrivacySummaries(...summaries: (PrivacySummary | undefined)[]): PrivacySummary {
  const counts = new Map<string, number>();
  for (const summary of summaries) {
    for (const finding of summary?.findings ?? []) counts.set(finding.kind, (counts.get(finding.kind) ?? 0) + finding.count);
  }
  const findings = [...counts.entries()].map(([kind, count]) => ({ kind, count })).sort((left, right) => left.kind.localeCompare(right.kind));
  return { total: findings.reduce((sum, finding) => sum + finding.count, 0), findings };
}

/** Defense-in-depth redaction before text is returned, retained, or logged. */
export function sanitizeNoticeText(value: string): string {
  return inspectPrivacy(value).redactedText;
}

export function inspectPrivacy(value: string): PrivacyInspection {
  const counts = new Map<string, number>();
  const increment = (kind: string) => counts.set(kind, (counts.get(kind) ?? 0) + 1);
  let redactedText = value.normalize("NFC");
  const replace = (kind: string, pattern: RegExp, replacement: string | ((...args: string[]) => string)) => {
    redactedText = redactedText.replace(pattern, (...args: string[]) => {
      increment(kind);
      return typeof replacement === "string" ? replacement : replacement(...args);
    });
  };

  // Remove characters commonly used to disguise the visual order of a URL or identifier.
  replace("unicode_control", /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069]+/g, "");
  redactedText = redactedText.replace(URL_PATTERN, (candidate) => {
    try {
      const hadScheme = /^https?:\/\//i.test(candidate);
      const parsed = new URL(hadScheme ? candidate : `https://${candidate}`);
      const base = hadScheme ? `${parsed.protocol}//${parsed.host}` : parsed.host;
      const credentials = Boolean(parsed.username || parsed.password);
      const path = parsed.pathname && parsed.pathname !== "/";
      if (credentials) increment("url_credentials");
      if (path) increment("url_path");
      if (parsed.search) increment("url_query");
      if (parsed.hash) increment("url_fragment");
      if (!credentials && !path && !parsed.search && !parsed.hash) return candidate;
      return `${base}${path ? "/[경로숨김]" : ""}${parsed.search ? "?[쿼리숨김]" : ""}${parsed.hash ? "#[조각숨김]" : ""}`;
    } catch {
      increment("url_unparseable");
      return "[링크 숨김]";
    }
  });

  replace("address", /(주소|배송지|거주지)\s*[:：]\s*[^\r\n]+/g, (_match: string, label: string) => `${label}: [주소 숨김]`);
  replace("address", /(?:서울(?:특별시|시)?|부산(?:광역시|시)?|대구(?:광역시|시)?|인천(?:광역시|시)?|광주(?:광역시|시)?|대전(?:광역시|시)?|울산(?:광역시|시)?|세종(?:특별자치시|시)?|경기(?:도)?|강원(?:특별자치도|도)?|충청(?:북도|남도)?|충북|충남|전라(?:북도|남도)?|전북|전남|경상(?:북도|남도)?|경북|경남|제주(?:특별자치도|도)?)(?:\s+[가-힣0-9]+(?:시|군|구)){0,2}\s+[가-힣0-9]+(?:로|길|동|읍|면)\s*\d+(?:-\d+)?/g, "[주소 숨김]");
  replace("postal_code", /(우편번호)\s*[:：]?\s*\d{5}/g, (_match: string, label: string) => `${label}: [우편번호 숨김]`);
  replace("person_name", /(성명|이름|환자명|수신인|예금주)\s*[:：]\s*(?:[가-힣]{2,5}|[A-Z][A-Z .'-]{1,40})/gi, (_match: string, label: string) => `${label}: [이름 숨김]`);
  replace("date_of_birth", /(생년월일|생일)\s*[:：]?\s*(?:(?:19|20)?\d{2}[.\/-]\d{1,2}[.\/-]\d{1,2}|\d{6})/g, (_match: string, label: string) => `${label}: [생년월일 숨김]`);
  replace("passport_number", /(여권번호|passport(?:\s*no\.?)?)\s*[:：]?\s*[A-Z0-9-]{6,12}/gi, (_match: string, label: string) => `${label}: [여권번호 숨김]`);
  replace("business_number", /(?<!\d)\d{3}-\d{2}-\d{5}(?!\d)/g, "[사업자번호 숨김]");
  replace("device_identifier", /(기기\s*(?:ID|식별자)|device\s*id|push\s*token)\s*[:：]?\s*[A-Z0-9._:-]{8,}/gi, (_match: string, label: string) => `${label}: [기기식별자 숨김]`);
  replace("one_time_code", /(인증번호|인증코드|OTP|일회용\s*코드)\s*[:：]?\s*\d{4,10}/gi, (_match: string, label: string) => `${label}: [일회용 코드 숨김]`);
  replace("access_secret", /((?:공동현관\s*)?(?:비밀번호|접근코드)|PIN)\s*[:：]?\s*[A-Z0-9#*]{4,12}/gi, (_match: string, label: string) => `${label}: [접근코드 숨김]`);
  replace("vehicle_plate", /(?<!\d)\d{2,3}[가-힣]\s?\d{4}(?!\d)/g, "[차량번호 숨김]");
  replace("uuid", /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[고유식별자 숨김]");
  replace("labeled_identifier", /(계좌번호|카드번호|고객번호|환자번호|접수번호|회원번호|보험증권번호|계약번호|운전면허번호|처방전번호)\s*[:：]?\s*[A-Z0-9 -]{6,}/gi, (_match: string, label: string) => `${label}: [식별정보 숨김]`);
  replace("resident_id", /(?<!\d)\d{6}[- ]?[1-4]\d{6}(?!\d)/g, "[주민등록번호 숨김]");
  replace("phone", /(?<!\d)(?:\+82[- ]?)?0\d{1,2}[- .]?\d{3,4}[- .]?\d{4}(?!\d)/g, "[전화번호 숨김]");
  replace("identifier", /\b[A-Z][0-9]{7,8}\b/gi, "[식별정보 숨김]");
  replace("email", /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[이메일 숨김]");
  replace("financial_number", /(?<!\d)(?:\d[ -]?){13,19}(?!\d)/g, "[금융번호 숨김]");
  replace("person_name", /(?<![가-힣])(?!(?:고객|보호자)(?:님)?)([가-힣])([가-힣]{1,3})(?=\s*(?:님|고객(?:님)?|귀하|보호자님))/g, (_match: string, first: string, rest: string) => `${first}${"○".repeat(rest.length)}`);

  const findings = [...counts.entries()].map(([kind, count]) => ({ kind, count })).sort((left, right) => left.kind.localeCompare(right.kind));
  return { redactedText, summary: { total: findings.reduce((sum, finding) => sum + finding.count, 0), findings } };
}

/** Store only non-identifying family roles, never a person's entered name. */
export function safeActorRole(value?: string): string | undefined {
  const role = value?.trim();
  if (!role) return undefined;
  return SAFE_ACTOR_ROLES.has(role) ? role : "가족 구성원";
}
