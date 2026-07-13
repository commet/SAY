import type { NoticeType } from "./types.js";

const words: Record<Exclude<NoticeType, "other">, RegExp[]> = {
  hospital: [/검진/g, /병원/g, /내시경/g, /금식/g, /진료/g, /채혈/g, /내원/g],
  government: [/구청/g, /주민센터/g, /행정복지센터/g, /복지/g, /지원금/g, /신청/g, /필요서류/g],
  insurance_card_payment: [/보험료/g, /카드/g, /납부/g, /자동이체/g, /연체/g, /미납/g, /결제/g],
  delivery_or_smishing: [/택배/g, /배송/g, /운송장/g, /통관/g, /반송/g, /주소지/g],
  apartment: [/아파트/g, /관리사무소/g, /관리비/g, /입주자/g],
};

export function classifyNotice(rawText: string, guess?: NoticeType): NoticeType {
  const scores = Object.entries(words).map(([type, patterns]) => ({
    type: type as Exclude<NoticeType, "other">,
    score: patterns.reduce((n, p) => n + (rawText.match(p)?.length ?? 0), 0),
  })).sort((a, b) => b.score - a.score);
  if (!scores[0] || scores[0].score < 1) return guess ?? "other";
  if (guess && guess !== "other") {
    const guessed = scores.find((x) => x.type === guess)?.score ?? 0;
    if (scores[0].score - guessed <= 1) return guess;
  }
  return scores[0].type;
}

export const titles: Record<NoticeType, string> = {
  hospital: "병원·건강검진 안내", government: "관공서·복지 안내",
  insurance_card_payment: "보험·카드·납부 안내", delivery_or_smishing: "택배·배송 문자",
  apartment: "아파트·관리사무소 안내", other: "생활 안내",
};
