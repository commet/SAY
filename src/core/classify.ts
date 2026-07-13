import type { ClassificationAssessment, NoticeType } from "./types.js";

interface ClassificationSignal {
  label: string;
  weight: number;
  pattern: RegExp;
}

type ClassifiedNoticeType = Exclude<NoticeType, "other">;

const signals: Record<ClassifiedNoticeType, ClassificationSignal[]> = {
  hospital: [
    { label: "건강검진", weight: 4, pattern: /건강\s*검진/ },
    { label: "병원·의료기관", weight: 3, pattern: /병원|의원|건강센터|검진센터/ },
    { label: "검사·진료", weight: 2, pattern: /검진|진료|검사|채혈/ },
    { label: "내시경", weight: 3, pattern: /내시경/ },
    { label: "금식·공복", weight: 3, pattern: /금식|공복/ },
    { label: "내원·접수", weight: 2, pattern: /내원|접수/ },
    { label: "복약 안내", weight: 2, pattern: /혈압약|당뇨약|복용.*약|약.*복용/ },
  ],
  government: [
    { label: "행정기관", weight: 4, pattern: /구청|시청|군청|주민센터|행정복지센터/ },
    { label: "복지·지원", weight: 3, pattern: /복지|지원금|지원\s*사업|수당/ },
    { label: "신청 대상", weight: 2, pattern: /신청\s*대상|지원\s*대상|자격\s*요건/ },
    { label: "행정 서류", weight: 3, pattern: /필요\s*서류|구비\s*서류|민원|증명서/ },
    { label: "행정 신청", weight: 1, pattern: /신청|접수|제출/ },
  ],
  insurance_card_payment: [
    { label: "보험료", weight: 4, pattern: /보험료|보험금|보험\s*계약/ },
    { label: "카드 대금", weight: 4, pattern: /카드\s*(?:대금|결제|이용|청구)|신용카드/ },
    { label: "자동 납부", weight: 3, pattern: /자동\s*이체|자동\s*납부|출금\s*예정/ },
    { label: "미납·연체", weight: 3, pattern: /미납|연체|체납/ },
    { label: "납부·결제", weight: 2, pattern: /납부|결제|청구|출금/ },
  ],
  delivery_or_smishing: [
    { label: "택배", weight: 4, pattern: /택배|택배사/ },
    { label: "배송", weight: 3, pattern: /배송|배달/ },
    { label: "운송장", weight: 4, pattern: /운송장|송장\s*번호/ },
    { label: "통관", weight: 3, pattern: /통관|관세/ },
    { label: "반송·보관", weight: 2, pattern: /반송|보관\s*중/ },
    { label: "배송지", weight: 2, pattern: /주소지|배송지/ },
  ],
  apartment: [
    { label: "관리사무소", weight: 4, pattern: /관리\s*사무소/ },
    { label: "공동주택", weight: 3, pattern: /아파트|공동\s*주택|입주자/ },
    { label: "관리비", weight: 4, pattern: /관리비|장기수선충당금|분담금/ },
    { label: "시설 영향", weight: 2, pattern: /단수|정전|승강기|엘리베이터|주차장/ },
    { label: "동·세대", weight: 1, pattern: /\d+동|세대|단지/ },
  ],
};

function countMatches(text: string, pattern: RegExp): number {
  const flags = [...new Set(`${pattern.flags.replace("g", "")}gu`)].join("");
  return [...text.matchAll(new RegExp(pattern.source, flags))].length;
}

export function classifyNoticeDetailed(rawText: string, guess?: NoticeType): ClassificationAssessment {
  const scored = (Object.entries(signals) as [ClassifiedNoticeType, ClassificationSignal[]][]).map(([type, definitions]) => {
    const matches = definitions.flatMap((signal) => {
      const count = Math.min(countMatches(rawText, signal.pattern), 2);
      return count ? [{ label: signal.label, points: signal.weight * count }] : [];
    });
    return {
      type,
      score: matches.reduce((total, match) => total + match.points, 0),
      matchedSignals: matches.map((match) => `${match.label}(+${match.points})`),
    };
  }).sort((left, right) => right.score - left.score || left.type.localeCompare(right.type));

  const top = scored[0];
  if (!top || top.score === 0) {
    const type = guess && guess !== "other" ? guess : "other";
    return {
      type,
      confidence: "low",
      score: 0,
      margin: 0,
      matchedSignals: guess && guess !== "other" ? ["사용자 분류 힌트(근거 신호 없음)"] : [],
      alternatives: scored.slice(0, 3).map(({ type: alternativeType, score }) => ({ type: alternativeType, score })),
    };
  }

  const guessed = guess && guess !== "other" ? scored.find((item) => item.type === guess) : undefined;
  const selected = guessed && guessed.score > 0 && top.score - guessed.score <= 1 ? guessed : top;
  const runnerUp = scored.filter((item) => item.type !== selected.type)[0];
  const margin = Math.max(0, selected.score - (runnerUp?.score ?? 0));
  const confidence = selected.score >= 6 && margin >= 3 ? "high" : selected.score >= 3 && margin >= 1 ? "medium" : "low";

  return {
    type: selected.type,
    confidence,
    score: selected.score,
    margin,
    matchedSignals: selected.matchedSignals,
    alternatives: scored.filter((item) => item.type !== selected.type).slice(0, 3).map(({ type, score }) => ({ type, score })),
  };
}

export function classifyNotice(rawText: string, guess?: NoticeType): NoticeType {
  return classifyNoticeDetailed(rawText, guess).type;
}

export const titles: Record<NoticeType, string> = {
  hospital: "병원·건강검진 안내", government: "관공서·복지 안내",
  insurance_card_payment: "보험·카드·납부 안내", delivery_or_smishing: "택배·배송 문자",
  apartment: "아파트·관리사무소 안내", other: "생활 안내",
};
