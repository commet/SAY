import type { EvaluationResult } from "./evaluation.js";
import type { FeedbackBucket, FeedbackSummary, NoticeType } from "./types.js";

export const MIN_FEEDBACK_SUPPORT = 5;

export interface ImprovementCandidate {
  id: string;
  priority: "critical" | "high" | "medium";
  source: "evaluation" | "runtime_feedback";
  scope: string;
  evidence: Record<string, number | string>;
  proposedExperiment: string;
  requiredGuardrails: string[];
}

const ratio = (count: number, total: number) => total ? Math.round((count / total) * 1000) / 1000 : 0;
const commonGuardrails = [
  "원문 대신 개인정보가 없는 합성 회귀 사례를 먼저 추가한다.",
  "한 번에 하나의 최소 규칙만 변경한다.",
  "privacy, workflow, MCP/HTTP 전체 테스트와 평가 게이트를 모두 통과해야 한다.",
  "사람의 코드 리뷰와 배포 승인을 거친다.",
];

function feedbackCandidates(noticeType: NoticeType, bucket: FeedbackBucket): ImprovementCandidate[] {
  if (bucket.total < MIN_FEEDBACK_SUPPORT) return [];
  const candidates: ImprovementCandidate[] = [];
  const classificationFailures = bucket.classification.incorrect;
  if (classificationFailures >= MIN_FEEDBACK_SUPPORT && ratio(classificationFailures, bucket.total) >= 0.2) {
    const topCorrection = Object.entries(bucket.corrections).sort((a, b) => b[1] - a[1])[0];
    candidates.push({
      id: `classifier:${noticeType}`, priority: ratio(classificationFailures, bucket.total) >= 0.4 ? "high" : "medium",
      source: "runtime_feedback", scope: noticeType,
      evidence: { samples: bucket.total, incorrect: classificationFailures, failure_rate: ratio(classificationFailures, bucket.total), top_correction: topCorrection?.[0] ?? "unknown", top_correction_count: topCorrection?.[1] ?? 0 },
      proposedExperiment: `${noticeType}와 자주 혼동되는 범주의 경계 키워드 합성 사례를 추가하고 분류 점수 규칙 하나를 비교 실험한다.`,
      requiredGuardrails: commonGuardrails,
    });
  }
  const extractionFailures = bucket.extraction.missing_information + bucket.extraction.incorrect_information;
  if (extractionFailures >= MIN_FEEDBACK_SUPPORT && ratio(extractionFailures, bucket.total) >= 0.2) {
    candidates.push({
      id: `extraction:${noticeType}`, priority: ratio(extractionFailures, bucket.total) >= 0.4 ? "high" : "medium",
      source: "runtime_feedback", scope: noticeType,
      evidence: { samples: bucket.total, failures: extractionFailures, failure_rate: ratio(extractionFailures, bucket.total) },
      proposedExperiment: `${noticeType} 체크리스트에서 반복 누락되는 필드의 표현 변형을 합성 평가셋으로 재현한 뒤 추출 규칙을 보강한다.`,
      requiredGuardrails: commonGuardrails,
    });
  }
  const riskFailures = bucket.risk.false_alarm + bucket.risk.missed_risk;
  if (riskFailures >= MIN_FEEDBACK_SUPPORT && ratio(riskFailures, bucket.total) >= 0.15) {
    candidates.push({
      id: `risk:${noticeType}`, priority: bucket.risk.missed_risk >= MIN_FEEDBACK_SUPPORT ? "high" : "medium",
      source: "runtime_feedback", scope: noticeType,
      evidence: { samples: bucket.total, false_alarms: bucket.risk.false_alarm, missed_risks: bucket.risk.missed_risk, failure_rate: ratio(riskFailures, bucket.total) },
      proposedExperiment: `${noticeType} 위험 규칙의 오탐·미탐 대조 사례를 같은 수로 추가하고 안전 우선 임계값을 재평가한다.`,
      requiredGuardrails: commonGuardrails,
    });
  }
  const frictionCount = bucket.total - bucket.friction.none;
  if (frictionCount >= MIN_FEEDBACK_SUPPORT && ratio(frictionCount, bucket.total) >= 0.25) {
    const topFriction = Object.entries(bucket.friction).filter(([key]) => key !== "none").sort((a, b) => b[1] - a[1])[0];
    candidates.push({
      id: `workflow:${noticeType}`, priority: topFriction?.[0] === "privacy_concern" ? "high" : "medium",
      source: "runtime_feedback", scope: noticeType,
      evidence: { samples: bucket.total, friction_reports: frictionCount, friction_rate: ratio(frictionCount, bucket.total), top_friction: topFriction?.[0] ?? "unknown", top_friction_count: topFriction?.[1] ?? 0 },
      proposedExperiment: `${noticeType}의 가장 큰 마찰 지점을 한 단계 줄인 대화 시나리오를 만들고 안전 불변식 유지 여부를 비교한다.`,
      requiredGuardrails: commonGuardrails,
    });
  }
  const unresolved = bucket.outcomes.abandoned + bucket.outcomes.unsafe_to_continue;
  if (unresolved >= MIN_FEEDBACK_SUPPORT && ratio(unresolved, bucket.total) >= 0.2) {
    candidates.push({
      id: `outcome:${noticeType}`, priority: bucket.outcomes.unsafe_to_continue >= MIN_FEEDBACK_SUPPORT ? "high" : "medium",
      source: "runtime_feedback", scope: noticeType,
      evidence: { samples: bucket.total, abandoned: bucket.outcomes.abandoned, unsafe_to_continue: bucket.outcomes.unsafe_to_continue, unresolved_rate: ratio(unresolved, bucket.total) },
      proposedExperiment: `${noticeType} 미완료 케이스의 다음 행동·중단 조건을 합성 여정으로 재현하고 종료율 변화를 평가한다.`,
      requiredGuardrails: commonGuardrails,
    });
  }
  return candidates;
}

function evaluationCandidates(evaluation: EvaluationResult): ImprovementCandidate[] {
  if (evaluation.passed) return [];
  const candidates: ImprovementCandidate[] = [];
  const classification = evaluation.failures.filter((failure) => failure.classification).length;
  const extraction = evaluation.failures.reduce((sum, failure) => sum + failure.missingFields.length + failure.forbiddenFieldsFound.length, 0);
  const risk = evaluation.failures.reduce((sum, failure) => sum + failure.missingRisks.length + failure.unexpectedRisks.length, 0);
  if (evaluation.metrics.piiLeaks || evaluation.metrics.retainedQuoteFields) {
    candidates.push({
      id: "regression:privacy", priority: "critical", source: "evaluation", scope: "all",
      evidence: { pii_leaks: evaluation.metrics.piiLeaks, quote_leaks: evaluation.metrics.retainedQuoteFields },
      proposedExperiment: "릴리스를 중단하고 최소 재현 사례에서 마스킹 또는 인용 제거 경계를 복구한다.", requiredGuardrails: commonGuardrails,
    });
  }
  if (classification) candidates.push({ id: "regression:classification", priority: "high", source: "evaluation", scope: "corpus", evidence: { failed_cases: classification }, proposedExperiment: "실패한 합성 사례의 분류 점수 차이를 분석하고 가장 작은 규칙 변경을 검증한다.", requiredGuardrails: commonGuardrails });
  if (extraction) candidates.push({ id: "regression:extraction", priority: "high", source: "evaluation", scope: "corpus", evidence: { extraction_failures: extraction }, proposedExperiment: "누락·과잉 필드별 표현을 재현하고 기존 범주에 대한 역회귀 없이 추출 규칙을 복구한다.", requiredGuardrails: commonGuardrails });
  if (risk) candidates.push({ id: "regression:risk", priority: "high", source: "evaluation", scope: "corpus", evidence: { risk_failures: risk }, proposedExperiment: "누락·오탐 위험 규칙의 정규식 경계를 최소 재현 사례에서 복구한다.", requiredGuardrails: commonGuardrails });
  return candidates;
}

export function buildImprovementReport(feedback: FeedbackSummary, evaluation: EvaluationResult) {
  const candidates = evaluationCandidates(evaluation);
  for (const [noticeType, bucket] of Object.entries(feedback.byNoticeType)) {
    candidates.push(...feedbackCandidates(noticeType as NoticeType, bucket));
  }
  const priorityOrder = { critical: 0, high: 1, medium: 2 } as const;
  candidates.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority] || a.id.localeCompare(b.id));
  return {
    schema_version: 1,
    mode: "bounded_human_approved_improvement",
    feedback_samples: feedback.total,
    minimum_feedback_support: MIN_FEEDBACK_SUPPORT,
    evaluation: { passed: evaluation.passed, ...evaluation.metrics, failure_cases: evaluation.failures.length },
    signal_status: feedback.total < MIN_FEEDBACK_SUPPORT ? "collecting_signal" : candidates.length ? "review_candidates" : "no_repeated_failure_signal",
    candidates,
    next_cycle: [
      "사람이 근거와 악성 피드백 가능성을 검토한다.",
      "원문이 아닌 개인정보 없는 합성 회귀 사례를 추가한다.",
      "최소 규칙 변경을 별도 커밋으로 구현한다.",
      "npm run quality를 통과한 경우에만 배포를 승인한다.",
    ],
    automatic_code_changes: false,
  };
}
