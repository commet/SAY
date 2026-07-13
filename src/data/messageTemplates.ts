import type { NoticeCard } from "../core/types.js";
import { HOST_HINT } from "../render/renderText.js";

export type Audience = "parent" | "child" | "family_room";
export type Style = "short" | "plain" | "question";
const asks: Record<Audience, Record<Style, string>> = {
  parent: { short: "내용을 확인해 주세요.", plain: "확인되지 않은 부분을 공식 문의처에 한번 물어봐 주세요.", question: "아직 확인할 부분을 같이 봐주실 수 있을까요?" },
  child: { short: "시간 될 때 봐줘.", plain: "확인이 필요한 부분이 있어서 문자 내용을 한번 봐줘.", question: "시간 될 때 이 문자 한번 봐줄래?" },
  family_room: { short: "확인 가능한 사람이 알려 주세요.", plain: "확인이 필요한 항목을 맡을 수 있는 사람이 답해 주세요.", question: "이 중 확인 가능한 항목이 있으면 알려줄래요?" },
};
export function makeMessage(card: NoticeCard, audience: Audience, style: Style): string {
  const missing = card.missingFields.map((x) => x.label).join(", ") || "남은 할 일";
  const facts = card.facts.filter((x) => x.confidence === "confirmed").slice(0, 3);
  return `${card.title} 문자가 왔는데, ${missing} 확인이 필요해 보여요.\n${asks[audience][style]}\n\n첨부 요약\n- ${card.title}\n${facts.map((x) => `- ${x.label}: ${x.value}`).join("\n")}\n- 확인 필요: ${missing}\n- 케이스 코드: ${card.code}\n\n이 코드는 케이스를 여는 비밀 열쇠예요. 믿을 수 있는 가족에게만 공유해 주세요.\n\n${HOST_HINT}`;
}
