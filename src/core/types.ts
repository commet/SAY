export type NoticeType = "hospital" | "government" | "insurance_card_payment" | "delivery_or_smishing" | "apartment" | "other";
export type ItemStatus = "unchecked" | "i_will_check" | "asked_family" | "in_progress" | "done" | "on_hold" | "not_applicable";
export type Confidence = "confirmed" | "inferred";
export type CaseStatus = "needs_confirmation" | "ready" | "in_progress" | "blocked" | "completed";
export type ActionKind = "verify_source" | "complete_notice" | "clarify";
export type SourceTrust = "official" | "mismatch" | "unknown" | "no_link";
export type CaseOutcome = "resolved" | "partially_resolved" | "abandoned" | "unsafe_to_continue";
export type ClassificationQuality = "correct" | "incorrect" | "unsure";
export type ExtractionQuality = "complete" | "missing_information" | "incorrect_information" | "unsure";
export type RiskQuality = "appropriate" | "false_alarm" | "missed_risk" | "unsure";
export type WorkflowFriction = "none" | "too_many_steps" | "unclear_next_action" | "coordination_difficulty" | "privacy_concern";
export type ClassificationConfidence = "high" | "medium" | "low";

export interface PrivacyFinding { kind: string; count: number; }
export interface PrivacySummary { total: number; findings: PrivacyFinding[]; }
export interface SourceAssessment {
  trust: SourceTrust; claimedOrganization?: string; domains: string[]; explanation: string;
}
export interface ClassificationAssessment {
  type: NoticeType;
  confidence: ClassificationConfidence;
  score: number;
  margin: number;
  matchedSignals: string[];
  alternatives: { type: NoticeType; score: number }[];
  confirmedByUser?: boolean;
}
export interface CaseEvent { at: string; type: "created" | "status_changed" | "action_updated" | "outcome_recorded"; detail: string; }
export interface OutcomeFeedback {
  outcome: CaseOutcome;
  classificationQuality: ClassificationQuality;
  correctedNoticeType?: NoticeType;
  extractionQuality: ExtractionQuality;
  riskQuality: RiskQuality;
  friction: WorkflowFriction;
  recordedAt: string;
}
export interface FeedbackBucket {
  total: number;
  outcomes: Record<CaseOutcome, number>;
  classification: Record<ClassificationQuality, number>;
  extraction: Record<ExtractionQuality, number>;
  risk: Record<RiskQuality, number>;
  friction: Record<WorkflowFriction, number>;
  corrections: Record<string, number>;
}
export interface FeedbackSummary {
  schemaVersion: 1;
  total: number;
  updatedDay?: string;
  overall: FeedbackBucket;
  byNoticeType: Partial<Record<NoticeType, FeedbackBucket>>;
}

export interface Fact { fieldKey: string; label: string; value: string; confidence: Confidence; quote?: string; }
export interface MissingField { fieldKey: string; label: string; whyItMatters: string; suggestedQuestion: string; }
export interface ActionItem { id: string; fieldKey?: string; label: string; kind: ActionKind; priority: 1 | 2 | 3; dependsOn?: string[]; dueAt?: string; status: ItemStatus; actorName?: string; resultNote?: string; history: { at: string; status: ItemStatus; actorName?: string }[]; }
export interface RiskSignal { ruleId: string; label: string; severity: "low" | "medium" | "high"; evidence: string; saferNextStep: string; }
export interface NoticeCard {
  code: string; noticeType: NoticeType; title: string; facts: Fact[]; actionItems: ActionItem[];
  missingFields: MissingField[]; riskSignals: RiskSignal[];
  status: CaseStatus; version: number; privacySummary: PrivacySummary; sourceAssessment: SourceAssessment;
  classification: ClassificationAssessment; events: CaseEvent[];
  outcomeFeedback?: OutcomeFeedback;
  reminderSuggestions: { fieldKey?: string; atLabel: string; text: string }[]; nextCheckAt?: string;
  createdAt: string; expiresAt: string; lastAccessAt: string;
}
