import { buildCard, type AnalyzeArgs } from "../core/cardBuilder.js";
import { normalizeCode } from "../core/cardCode.js";
import { inspectNotice, type InspectArgs } from "../core/inspectNotice.js";
import { inspectionStore } from "../core/inspectionStore.js";
import { feedbackStore } from "../core/feedbackStore.js";
import { makeImprovementEvent } from "../core/feedbackEvent.js";
import { detectRiskSignals } from "../core/riskRules.js";
import { safeActorRole, sanitizeNoticeText } from "../core/privacy.js";
import { store } from "../core/store.js";
import type { CaseOutcome, ClassificationQuality, ExtractionQuality, ItemStatus, NoticeType, OutcomeFeedback, RiskQuality, WorkflowFriction } from "../core/types.js";
import { deriveCaseStatus, nextBestAction } from "../core/workflow.js";
import { makeMessage, type Audience, type Style } from "../data/messageTemplates.js";
import { HOST_HINT, missingCard, renderCard, renderRisks } from "../render/renderText.js";

export function analyzeNotice(args: AnalyzeArgs, now = new Date()): string {
  const card = buildCard(args, now);
  const existing = store.get(card.code);
  if (existing) { store.touch(existing, now); return renderCard(existing, now); }
  if (card.noticeType === "other" && card.facts.length === 0) return `안내문으로 보이지 않아요. 문자 전체나 캡처의 모든 글자를 보내주시면 케이스로 만들어 드려요.\n\n${HOST_HINT}`;
  store.put(card); return renderCard(card, now);
}
export { inspectNotice };
export type { InspectArgs };

export function createCase(inspectionToken: string, consent: boolean, now = new Date()): string {
  if (!consent) return `저장 동의가 확인되지 않아 케이스를 만들지 않았어요. 먼저 inspect_notice의 마스킹 결과를 사용자에게 보여주세요.\n\n${HOST_HINT}`;
  const inspection = inspectionStore.take(inspectionToken, now);
  if (!inspection) return `검사 토큰이 없거나 10분이 지나 만료됐어요. 원문으로 inspect_notice를 다시 실행해 주세요.\n\n${HOST_HINT}`;
  const card = buildCard({ raw_text: inspection.redactedText, notice_type_guess: inspection.noticeType, sender_hint: inspection.senderHint, privacy_summary: inspection.privacySummary, source_assessment: inspection.sourceAssessment }, now);
  store.put(card);
  return renderCard(card, now);
}
export function scamSignals(rawText: string, senderHint?: string): string { return renderRisks(detectRiskSignals(sanitizeNoticeText(rawText), senderHint ? sanitizeNoticeText(senderHint) : undefined)); }
export function getCard(code: string, now = new Date()): string { const normalized = normalizeCode(code); const card = store.get(normalized); return card ? renderCard(card, now) : missingCard(normalized); }
export function getNextAction(code: string): string { const normalized = normalizeCode(code); const card = store.get(normalized); return card ? nextBestAction(card) : missingCard(normalized); }
export function updateStatus(code: string, itemLabel: string | undefined, itemId: string | undefined, status: ItemStatus, actorName?: string, expectedVersion?: number, now = new Date()): string {
  const normalized = normalizeCode(code); const card = store.get(normalized); if (!card) return missingCard(normalized);
  if (!itemLabel && !itemId) return `바꿀 항목의 이름(item_label)이나 항목 ID(item_id)가 필요해요.\n\n${HOST_HINT}`;
  const matches = card.actionItems.filter((x) => itemId ? x.id.toLowerCase() === itemId.toLowerCase() : x.label.includes(itemLabel!));
  if (matches.length !== 1) return `다음 중 어느 항목인가요? 항목 이름을 조금 더 구체적으로 알려 주세요.\n${card.actionItems.map((x) => `- ${x.label}`).join("\n")}\n\n${HOST_HINT}`;
  const item = matches[0];
  const role = safeActorRole(actorName); const last = item.history.at(-1);
  // Replaying an already-applied target state is safe even when its original
  // expected_version is now stale. This keeps the advertised mutation idempotent.
  if (last?.status === status && last.actorName === role) return renderCard(card, now);
  if (expectedVersion !== undefined && expectedVersion !== card.version) return `다른 가족이 먼저 케이스를 수정했어요. 현재 버전은 ${card.version}입니다. get_case로 다시 확인한 뒤 업데이트해 주세요.\n\n${HOST_HINT}`;
  const unmet = (item.dependsOn ?? []).filter((dependencyId) => !["done", "not_applicable"].includes(card.actionItems.find((candidate) => candidate.id === dependencyId)?.status ?? "unchecked"));
  if (unmet.length && !["unchecked", "on_hold", "not_applicable"].includes(status)) return `선행 확인(${unmet.join(", ")})이 끝나기 전에는 이 항목을 진행할 수 없어요. 먼저 get_next_action을 확인해 주세요.\n\n${HOST_HINT}`;
  const previousCaseStatus = card.status; item.status = status; item.actorName = role;
  item.history.push({ at: now.toISOString(), status, actorName: role });
  card.version += 1;
  card.events.push({ at: now.toISOString(), type: "action_updated", detail: `${item.id}:${status}` });
  card.status = deriveCaseStatus(card);
  if (card.status !== previousCaseStatus) card.events.push({ at: now.toISOString(), type: "status_changed", detail: `${previousCaseStatus}->${card.status}` });
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
  if (missing.length) blocks.push(`찾지 못한 케이스: ${missing.join(", ")} (만료되었거나 코드 오타일 수 있어요)`);
  return `${blocks.join("\n\n")}\n\n${HOST_HINT}`;
}

export interface RecordOutcomeArgs {
  outcome: CaseOutcome;
  classificationQuality: ClassificationQuality;
  correctedNoticeType?: NoticeType;
  extractionQuality: ExtractionQuality;
  riskQuality: RiskQuality;
  friction: WorkflowFriction;
}

function sameOutcome(left: OutcomeFeedback, right: RecordOutcomeArgs): boolean {
  return left.outcome === right.outcome
    && left.classificationQuality === right.classificationQuality
    && left.correctedNoticeType === right.correctedNoticeType
    && left.extractionQuality === right.extractionQuality
    && left.riskQuality === right.riskQuality
    && left.friction === right.friction;
}

export function recordOutcome(code: string, feedback: RecordOutcomeArgs, expectedVersion?: number, now = new Date()): string {
  const normalized = normalizeCode(code);
  const card = store.get(normalized);
  if (!card) return missingCard(normalized);
  if (feedback.classificationQuality === "incorrect" && !feedback.correctedNoticeType) {
    return `분류가 틀렸다면 corrected_notice_type을 함께 알려 주세요. 자유서술 원문은 받지 않아요.\n\n${HOST_HINT}`;
  }
  if (feedback.classificationQuality !== "incorrect" && feedback.correctedNoticeType) {
    return `corrected_notice_type은 classification_quality가 incorrect일 때만 사용할 수 있어요.\n\n${HOST_HINT}`;
  }
  if (feedback.classificationQuality === "incorrect" && feedback.correctedNoticeType === card.noticeType) {
    return `현재 분류와 수정 분류가 같아요. 분류가 맞았다면 classification_quality를 correct로 바꿔 주세요.\n\n${HOST_HINT}`;
  }
  if (card.outcomeFeedback && sameOutcome(card.outcomeFeedback, feedback)) {
    return JSON.stringify({ recorded: true, duplicate_ignored: true, case_version: card.version, privacy: "기존의 구조화된 결과 한 건만 유지했으며 추가 집계하지 않았습니다." }, null, 2);
  }
  if (card.outcomeFeedback) return `이 케이스에는 이미 결과 피드백이 기록됐어요. 중복·선택 편향을 막기 위해 덮어쓰지 않습니다.\n\n${HOST_HINT}`;
  if (expectedVersion !== undefined && expectedVersion !== card.version) {
    return `다른 가족이 먼저 케이스를 수정했어요. 현재 버전은 ${card.version}입니다. get_case로 다시 확인한 뒤 결과를 기록해 주세요.\n\n${HOST_HINT}`;
  }

  const recorded: OutcomeFeedback = { ...feedback, recordedAt: now.toISOString() };
  card.outcomeFeedback = recorded;
  card.version += 1;
  card.events.push({ at: now.toISOString(), type: "outcome_recorded", detail: feedback.outcome });
  store.touch(card, now);
  feedbackStore.record(card.noticeType, recorded, now);

  if (process.env.IMPROVEMENT_EVENT_LOG === "true") {
    console.info(`say_improvement_event ${JSON.stringify(makeImprovementEvent(card.noticeType, recorded))}`);
  }

  return JSON.stringify({
    recorded: true,
    duplicate_ignored: false,
    case_version: card.version,
    privacy: "원문·자유서술·케이스 코드 없이 선택 항목의 비식별 카운터만 개선 신호로 남습니다.",
    lifecycle: "비식별 집계는 케이스와 연결되지 않으므로 케이스 삭제 후에도 집계값으로 남습니다.",
  }, null, 2);
}

export function deleteCase(code: string): string {
  const normalized = normalizeCode(code);
  store.delete(normalized);
  return `${normalized} 케이스가 삭제됐어요. 존재 여부를 별도로 공개하지 않으며 같은 코드로 다시 조회할 수 없습니다. 이전에 자발적으로 record_outcome을 제출했다면 케이스와 연결되지 않는 비식별 집계 카운터는 남을 수 있어요.\n\n${HOST_HINT}`;
}
