import type { ActionItem, CaseStatus, NoticeCard } from "./types.js";

const terminal = new Set(["done", "not_applicable"]);

export function deriveCaseStatus(card: NoticeCard): CaseStatus {
  if (card.actionItems.length > 0 && card.actionItems.every((item) => terminal.has(item.status))) return "completed";
  const verification = card.actionItems.find((item) => item.kind === "verify_source");
  if (verification && !terminal.has(verification.status)) return "needs_confirmation";
  const open = card.actionItems.filter((item) => !terminal.has(item.status));
  if (open.length && open.every((item) => item.status === "on_hold")) return "blocked";
  if (card.actionItems.some((item) => item.status !== "unchecked")) return "in_progress";
  return "ready";
}

function dependenciesMet(item: ActionItem, card: NoticeCard): boolean {
  return (item.dependsOn ?? []).every((id) => {
    const dependency = card.actionItems.find((candidate) => candidate.id === id);
    return dependency ? terminal.has(dependency.status) : false;
  });
}

export function nextBestAction(card: NoticeCard): string {
  const status = deriveCaseStatus(card);
  if (status === "completed") return JSON.stringify({ case_code: card.code, version: card.version, status, next_action: null, reason: "모든 행동이 완료되었어요. 필요한 기록을 확인한 뒤 delete_case로 즉시 삭제할 수 있습니다." }, null, 2);
  const candidates = card.actionItems
    .filter((item) => !terminal.has(item.status) && dependenciesMet(item, card))
    .sort((a, b) => a.priority - b.priority || (Date.parse(a.dueAt ?? "9999-12-31") - Date.parse(b.dueAt ?? "9999-12-31")));
  const item = candidates[0];
  if (!item) return JSON.stringify({ case_code: card.code, version: card.version, status: "blocked", next_action: null, reason: "선행 확인이 완료되지 않아 진행할 수 있는 행동이 없습니다." }, null, 2);
  const guardrail = item.kind === "verify_source" ? "문자 속 링크·전화번호를 사용하지 말고 공식 앱, 기관 홈페이지를 직접 열거나 대표번호로 확인하세요." : undefined;
  return JSON.stringify({
    case_code: card.code, version: card.version, status,
    next_action: { id: item.id, label: item.label, kind: item.kind, priority: item.priority, due_at: item.dueAt, current_status: item.status },
    reason: item.kind === "verify_source" ? "고위험 신호 또는 기관-도메인 불일치가 있어 다른 행동보다 출처 확인이 먼저입니다." : item.dueAt ? "기한이 있는 실행 가능한 행동 중 우선순위가 가장 높습니다." : "현재 실행 가능한 행동 중 우선순위가 가장 높습니다.",
    guardrail,
  }, null, 2);
}
