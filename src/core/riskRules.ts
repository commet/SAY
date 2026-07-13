import type { RiskSignal, SourceAssessment } from "./types.js";

const official: { name: string; mention: RegExp; domains: string[] }[] = [
  { name: "CJ대한통운", mention: /CJ대한통운|씨제이대한통운/i, domains: ["cjlogistics.com"] },
  { name: "한진택배", mention: /한진택배|한진/i, domains: ["hanjin.com"] },
  { name: "우체국", mention: /우체국|우체국택배/i, domains: ["epost.go.kr"] },
  { name: "국세청", mention: /국세청|홈택스/i, domains: ["hometax.go.kr", "nts.go.kr"] },
  { name: "국민건강보험공단", mention: /건강보험공단|국민건강보험/i, domains: ["nhis.or.kr"] },
];
const shortOrRisky = new Set(["bit.ly", "t.ly", "url.kr", "han.gl", "vo.la", "me2.do"]);
const riskyTld = /\.(xyz|top|shop|club|click|live)$/i;
const urls = (text: string) => text.match(/https?:\/\/[^\s<>]+/g) ?? [];
const host = (url: string) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } };
const matchText = (text: string, re: RegExp) => text.match(re)?.[0];
const signal = (ruleId: string, label: string, severity: RiskSignal["severity"], evidence: string, saferNextStep: string): RiskSignal => ({ ruleId, label, severity, evidence, saferNextStep });

export function assessSource(rawText: string, senderHint = ""): SourceAssessment {
  const all = `${senderHint}\n${rawText}`;
  const domains = [...new Set(urls(rawText).map(host).filter(Boolean))];
  const claimed = official.find((org) => org.mention.test(all));
  if (!domains.length) return { trust: "no_link", claimedOrganization: claimed?.name, domains, explanation: "평가할 링크가 없습니다. 발신자 진위는 공식 앱이나 대표번호로 별도 확인해야 합니다." };
  if (!claimed) return { trust: "unknown", domains, explanation: "링크는 있으나 비교할 수 있는 기관 주장을 찾지 못했습니다." };
  const mismatched = domains.filter((domain) => !claimed.domains.some((known) => domain === known || domain.endsWith(`.${known}`)));
  if (mismatched.length) return { trust: "mismatch", claimedOrganization: claimed.name, domains, explanation: `${claimed.name}을 언급하지만 등록된 공식 도메인과 다른 링크가 있습니다.` };
  return { trust: "official", claimedOrganization: claimed.name, domains, explanation: "기관명과 알려진 공식 도메인이 일치합니다. 이것만으로 메시지 전체의 진위를 보장하지는 않습니다." };
}

export function detectRiskSignals(rawText: string, senderHint = ""): RiskSignal[] {
  const found: RiskSignal[] = [];
  const all = `${senderHint}\n${rawText}`;
  for (const url of urls(rawText)) {
    const domain = host(url);
    const impersonated = official.find((org) => org.mention.test(rawText) && !org.domains.some((d) => domain === d || domain.endsWith(`.${d}`)));
    if (impersonated) {
      found.push(signal("R2", `기관명(${impersonated.name})과 다른 주소의 링크`, "high", domain, "링크를 누르지 말고 공식 앱이나 공식 고객센터에서 직접 확인하세요."));
    } else if (shortOrRisky.has(domain) || riskyTld.test(domain)) {
      found.push(signal("R1", "단축 또는 비공식 주소의 링크", riskyTld.test(domain) ? "high" : "medium", domain, "문자 링크 대신 공식 앱이나 공식 홈페이지를 직접 열어 확인하세요."));
    }
  }
  const rules: [string, string, RiskSignal["severity"], RegExp, string][] = [
    ["R3", "긴급 압박 표현", "medium", /긴급|즉시|오늘까지|금일내|마감임박|법적조치|벌금|과태료|검찰|압류/, "서두르지 말고 공식 채널에서 사실을 먼저 확인하세요."],
    ["R4", "개인정보 또는 인증정보 요구", "high", /주민등록번호|계좌번호|비밀번호|인증번호.{0,10}(입력|알려|전달)|카드번호/, "민감정보를 입력하거나 전달하지 말고 공식 고객센터에 확인하세요."],
    ["R5", "결제 또는 통관 비용 요구", "high", /통관.{0,10}(비용|수수료)|관세.{0,10}결제|재배송.{0,10}결제/, "결제하지 말고 공식 배송 조회나 고객센터에서 확인하세요."],
    ["R6", "앱 설치 유도", "high", /앱.{0,10}(설치|다운로드)|\.apk/i, "앱을 설치하지 말고 공식 앱스토어와 기관 홈페이지를 확인하세요."],
    ["R7", "국제발신 표시", "low", /국제발신|해외발신/, "발신 표시만으로 단정하지 말고 공식 채널에서 확인하세요."],
  ];
  for (const [id, label, severity, re, next] of rules) {
    const evidence = matchText(all, re);
    if (evidence) found.push(signal(id, label, severity, evidence, next));
  }
  return found;
}
