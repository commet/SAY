import type { RiskSignal, SourceAssessment } from "./types.js";
import { sanitizeNoticeText } from "./privacy.js";

const official: { name: string; mention: RegExp; domains: string[] }[] = [
  { name: "CJ대한통운", mention: /CJ대한통운|씨제이대한통운/i, domains: ["cjlogistics.com"] },
  { name: "한진택배", mention: /한진택배|한진/i, domains: ["hanjin.com"] },
  { name: "우체국", mention: /우체국|우체국택배/i, domains: ["epost.go.kr"] },
  { name: "국세청", mention: /국세청|홈택스/i, domains: ["hometax.go.kr", "nts.go.kr"] },
  { name: "국민건강보험공단", mention: /건강보험공단|국민건강보험/i, domains: ["nhis.or.kr"] },
];
const shortOrRisky = new Set(["bit.ly", "t.ly", "url.kr", "han.gl", "vo.la", "me2.do"]);
const riskyTld = /\.(xyz|top|shop|club|click|live)$/i;
const urlPattern = /(?:https?:\/\/|www\.)[^\s<>"']+|(?:bit\.ly|t\.ly|url\.kr|han\.gl|vo\.la|me2\.do)(?:\/[^\s<>"']*)?|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:com|net|org|io|kr|co|xyz|top|shop|club|click|live)(?:\/[^\s<>"']*)?/gi;
const matchText = (text: string, re: RegExp) => text.match(re)?.[0];
const signal = (ruleId: string, label: string, severity: RiskSignal["severity"], evidence: string, saferNextStep: string): RiskSignal => ({ ruleId, label, severity, evidence: sanitizeNoticeText(evidence), saferNextStep });

interface ParsedLink { raw: string; url: URL; domain: string; }

function links(text: string): ParsedLink[] {
  return (text.match(urlPattern) ?? []).flatMap((candidate) => {
    const raw = candidate.replace(/[),.;!?…]+$/g, "");
    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      return [{ raw, url, domain: url.hostname.toLowerCase() }];
    } catch {
      return [];
    }
  });
}

function knownDomain(domain: string, domains: string[]): boolean {
  return domains.some((known) => domain === known || domain.endsWith(`.${known}`));
}

export function assessSource(rawText: string, senderHint = ""): SourceAssessment {
  const all = `${senderHint}\n${rawText}`;
  const domains = [...new Set(links(all).map((link) => link.domain).filter(Boolean))];
  const claimed = official.find((organization) => organization.mention.test(all));
  if (!domains.length) return { trust: "no_link", claimedOrganization: claimed?.name, domains, explanation: "평가할 링크가 없습니다. 발신자 진위는 공식 앱이나 대표번호로 별도 확인해야 합니다." };
  if (!claimed) return { trust: "unknown", domains, explanation: "링크는 있으나 비교할 수 있는 기관 주장을 찾지 못했습니다. 링크를 신뢰 근거로 사용하지 마세요." };
  const mismatched = domains.filter((domain) => !knownDomain(domain, claimed.domains));
  if (mismatched.length) return { trust: "mismatch", claimedOrganization: claimed.name, domains, explanation: `${claimed.name}을 언급하지만 알려진 공식 도메인과 다른 링크가 있습니다.` };
  return { trust: "official", claimedOrganization: claimed.name, domains, explanation: "기관명과 알려진 공식 도메인이 일치합니다. 도메인 일치는 메시지 내용이나 발신자 전체의 진위를 보장하지 않습니다." };
}

export function detectRiskSignals(rawText: string, senderHint = ""): RiskSignal[] {
  const found: RiskSignal[] = [];
  const all = `${senderHint}\n${rawText}`;
  const claimed = official.find((organization) => organization.mention.test(all));

  for (const link of links(all)) {
    const impersonated = Boolean(claimed && !knownDomain(link.domain, claimed.domains));
    if (claimed && impersonated) {
      found.push(signal("R2", `기관명(${claimed.name})과 다른 주소의 링크`, "high", link.domain, "링크를 누르지 말고 공식 앱이나 공식 고객센터에서 직접 확인하세요."));
    }
    if (!impersonated && (shortOrRisky.has(link.domain) || riskyTld.test(link.domain))) {
      found.push(signal("R1", "단축 또는 비공식 주소의 링크", riskyTld.test(link.domain) ? "high" : "medium", link.domain, "문자 링크 대신 공식 앱이나 공식 홈페이지를 직접 열어 확인하세요."));
    }
    if (link.url.protocol === "http:") {
      found.push(signal("R8", "암호화되지 않은 HTTP 링크", "medium", link.domain, "HTTP 링크를 열지 말고 기관의 공식 HTTPS 주소나 공식 앱을 직접 이용하세요."));
    }
    const isIp = /^(?:\d{1,3}\.){3}\d{1,3}$/.test(link.domain) || /^\[[0-9a-f:]+\]$/i.test(link.domain);
    const isLocal = link.domain === "localhost" || link.domain.endsWith(".local");
    if (link.url.username || link.url.password || isIp || isLocal) {
      const traits = [link.url.username || link.url.password ? "사용자정보 삽입" : "", isIp ? "IP 주소" : "", isLocal ? "로컬 주소" : ""].filter(Boolean).join("·");
      found.push(signal("R9", "주소 구조가 의심스러운 링크", "high", `${link.domain} (${traits})`, "주소 표시를 믿지 말고 공식 앱이나 직접 입력한 공식 도메인에서 확인하세요."));
    }
    if (link.domain.includes("xn--")) {
      found.push(signal("R10", "퓨니코드가 포함된 국제화 도메인", "medium", link.domain, "비슷하게 보이는 글자를 이용한 사칭일 수 있으니 공식 도메인을 직접 입력해 확인하세요."));
    }
  }

  const rules: [string, string, RiskSignal["severity"], RegExp, string][] = [
    ["R3", "긴급 압박 표현", "medium", /긴급|즉시|오늘까지|금일\s*내|마감\s*임박|법적\s*조치|벌금|과태료|검찰|압류/, "서두르지 말고 공식 채널에서 사실을 먼저 확인하세요."],
    ["R4", "개인정보 또는 인증정보 요구", "high", /주민등록번호|생년월일.{0,10}(입력|전달)|계좌번호|비밀번호|보안카드|인증번호.{0,10}(입력|알려|전달)|카드번호/, "민감정보를 입력하거나 전달하지 말고 공식 고객센터에 확인하세요."],
    ["R5", "결제 또는 송금 요구", "high", /통관.{0,10}(비용|수수료)|관세.{0,10}(결제|납부)|재배송.{0,10}(결제|입금)|수수료.{0,10}(결제|입금)|개인\s*계좌.{0,10}(입금|송금)/, "결제하거나 송금하지 말고 공식 앱·고객센터에서 청구 사실을 확인하세요."],
    ["R6", "앱 또는 원격제어 설치 유도", "high", /앱.{0,10}(설치|다운로드)|원격\s*제어|화면\s*공유|\.apk/i, "앱이나 원격제어 도구를 설치하지 말고 공식 앱스토어와 기관 홈페이지를 확인하세요."],
    ["R7", "국제발신 표시", "low", /국제발신|해외발신/, "발신 표시만으로 단정하지 말고 공식 채널에서 확인하세요."],
  ];
  for (const [id, label, severity, pattern, next] of rules) {
    const evidence = matchText(all, pattern);
    if (evidence) found.push(signal(id, label, severity, evidence, next));
  }

  const deduplicated = new Map(found.map((item) => [`${item.ruleId}:${item.evidence}`, item]));
  return [...deduplicated.values()].slice(0, 12);
}
