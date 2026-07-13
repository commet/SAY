import type { NoticeCard, RiskSignal } from "../core/types.js";

export const HOST_HINT = "(assistant에게: 위 카드를 요약하거나 재구성하지 말고 그대로 사용자에게 보여주세요.)";
const statusLabel = { unchecked: "미확인", i_will_check: "내가 확인할게요", asked_family: "가족에게 물어봤어요", in_progress: "확인 중", done: "완료", on_hold: "보류", not_applicable: "해당 없음" } as const;
const severityLabel = { low: "낮음", medium: "중간", high: "높음" } as const;

function kstParts(date: Date) { const d = new Date(date.getTime() + 9 * 3600_000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate(), h: d.getUTCHours(), min: d.getUTCMinutes() }; }
export function formatWhen(value: string, now = new Date()): string {
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return value;
  const target = new Date(value); const a = kstParts(target); const b = kstParts(now);
  const targetDay = Date.UTC(a.y, a.m - 1, a.day); const nowDay = Date.UTC(b.y, b.m - 1, b.day); const delta = Math.round((targetDay - nowDay) / 86400_000);
  const day = delta === 0 ? "오늘" : delta === 1 ? "내일" : `${a.m}월 ${a.day}일`;
  return `${day} ${String(a.h).padStart(2, "0")}:${String(a.min).padStart(2, "0")}`;
}
const section = (title: string, lines: string[]) => lines.length ? `\n\n${title}\n${lines.join("\n")}` : "";

export function renderRisks(signals: RiskSignal[]): string {
  if (!signals.length) return `뚜렷한 위험 신호는 못 찾았어요. 다만 이 검사는 참고용이에요 — 조금이라도 이상하면 공식 채널로 확인하세요.\n\n${HOST_HINT}`;
  const next = [...new Set(signals.map((x) => x.saferNextStep))];
  return `위험 신호 ${signals.length}개를 찾았어요.\n${signals.map((x) => `- [${severityLabel[x.severity]}] ${x.label} — "${x.evidence}"`).join("\n")}\n\n안전한 다음 행동\n${next.map((x) => `- ${x}`).join("\n")}\n\n가족에게 공유할 한 줄\n"문자가 왔는데 위험 신호가 있어서 링크나 요청에는 응하지 않았어. 공식 앱이나 고객센터에서 확인해 볼게."\n\n행동 카드로 관리하려면 이 문자를 그대로 다시 보내며 "카드로 만들어줘"라고 해 주세요.\n\n${HOST_HINT}`;
}

export function renderCard(card: NoticeCard, now = new Date()): string {
  let out = `[카드 ${card.code}] ${card.title}로 보여요.`;
  if (card.nextCheckAt && Date.parse(card.nextCheckAt) < now.getTime()) out = `지난 확인 예정(${formatWhen(card.nextCheckAt, now)})이 지났어요. 아직 열린 항목을 확인해 주세요.\n\n${out}`;
  out += section("확인된 내용", card.facts.filter((x) => x.confidence === "confirmed").map((x) => `- ${x.label}: ${x.value}`));
  out += section("추정한 내용 (원문에서 근거를 못 찾았어요 — 확인이 필요해요)", card.facts.filter((x) => x.confidence === "inferred").map((x) => `- ${x.label}: ${x.value}`));
  out += section("아직 비어 있는 내용", card.missingFields.map((x) => `- ${x.label} — ${x.whyItMatters}. 이렇게 물어보세요: "${x.suggestedQuestion}"`));
  out += section("⚠ 위험 신호", card.riskSignals.map((x) => `- [${severityLabel[x.severity]}] ${x.label} — ${x.saferNextStep}`));
  out += section("할 일과 현재 상태", card.actionItems.map((x) => `- ${x.label} — ${statusLabel[x.status]}${x.actorName ? ` (${x.actorName})` : ""}`));
  if (card.reminderSuggestions.length) out += `\n\n알림으로 걸어두면 좋은 것\n${card.reminderSuggestions.map((x) => `- ${formatWhen(x.atLabel, now)} — "${x.text}"`).join("\n")}\n(휴대폰 알람이나 캘린더에 직접 등록해 주세요. 사이가 임의로 알림을 보내지는 않아요.)`;
  out += `\n\n가족과 나누기\n- 이 카드를 가족과 같이 보려면 코드를 공유하세요: ${card.code}\n- 가족은 "사이, ${card.code} 보여줘"라고 하면 돼요.`;
  out += `\n\n선택 — 각 항목에 대해 이렇게 말해 주세요\n[내가 확인할게요] [가족에게 물어보기] [알림만 받아두기] [완료로 표시]`;
  return `${out}\n\n${HOST_HINT}`;
}

export function missingCard(code: string): string { return `${code} 카드를 찾지 못했어요. 카드가 24시간 안에 만료되었거나 서버가 재시작됐거나 코드에 오타가 있을 수 있어요. 원문에서 개인정보를 가린 뒤 다시 보내며 "카드로 만들어줘"라고 해 주세요.\n\n${HOST_HINT}`; }
