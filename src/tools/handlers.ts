import { buildCard, type AnalyzeArgs } from "../core/cardBuilder.js";
import { normalizeCode } from "../core/cardCode.js";
import { detectRiskSignals } from "../core/riskRules.js";
import { store } from "../core/store.js";
import type { ItemStatus } from "../core/types.js";
import { makeMessage, type Audience, type Style } from "../data/messageTemplates.js";
import { HOST_HINT, missingCard, renderCard, renderRisks } from "../render/renderText.js";

export function analyzeNotice(args: AnalyzeArgs, now = new Date()): string {
  const card = buildCard(args, now);
  const existing = store.get(card.code);
  if (existing) { store.touch(existing, now); return renderCard(existing, now); }
  if (card.noticeType === "other" && card.facts.length === 0) return `안내문으로 보이지 않아요. 문자 전체나 캡처의 모든 글자를 보내주시면 카드로 만들어 드려요.\n\n${HOST_HINT}`;
  store.put(card); return renderCard(card, now);
}
export function scamSignals(rawText: string, senderHint?: string): string { return renderRisks(detectRiskSignals(rawText, senderHint)); }
export function getCard(code: string, now = new Date()): string { const normalized = normalizeCode(code); const card = store.get(normalized); if (!card) return missingCard(normalized); store.touch(card, now); return renderCard(card, now); }
export function updateStatus(code: string, itemLabel: string | undefined, itemId: string | undefined, status: ItemStatus, actorName?: string, now = new Date()): string {
  const normalized = normalizeCode(code); const card = store.get(normalized); if (!card) return missingCard(normalized);
  if (!itemLabel && !itemId) return `바꿀 항목의 이름(item_label)이나 항목 ID(item_id)가 필요해요.\n\n${HOST_HINT}`;
  const matches = card.actionItems.filter((x) => itemId ? x.id.toLowerCase() === itemId.toLowerCase() : x.label.includes(itemLabel!));
  if (matches.length !== 1) return `다음 중 어느 항목인가요? 항목 이름을 조금 더 구체적으로 알려 주세요.\n${card.actionItems.map((x) => `- ${x.label}`).join("\n")}\n\n${HOST_HINT}`;
  const item = matches[0]; item.status = status; item.actorName = actorName?.trim() || undefined;
  const last = item.history.at(-1); if (last?.status !== status || last.actorName !== item.actorName) item.history.push({ at: now.toISOString(), status, actorName: item.actorName });
  store.touch(card, now); return renderCard(card, now);
}
export function familyMessage(code: string, audience: Audience, style: Style): string { const normalized = normalizeCode(code); const card = store.get(normalized); return card ? makeMessage(card, audience, style) : missingCard(normalized); }
export function listOpen(codes: string[]): string {
  const missing: string[] = []; const blocks: string[] = [];
  for (const raw of codes) { const code = normalizeCode(raw); const card = store.get(code); if (!card) { missing.push(code); continue; }
    const open = card.actionItems.filter((x) => !["done", "not_applicable"].includes(x.status));
    blocks.push(`[${code}] ${card.title}\n${open.length ? open.map((x) => `- ${x.label}`).join("\n") : "- 열린 할 일이 없어요."}`);
  }
  if (!blocks.length) return missingCard(missing[0] ?? "요청한");
  if (missing.length) blocks.push(`찾지 못한 카드: ${missing.join(", ")} (만료되었거나 코드 오타일 수 있어요)`);
  return `${blocks.join("\n\n")}\n\n${HOST_HINT}`;
}
