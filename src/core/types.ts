export type NoticeType = "hospital" | "government" | "insurance_card_payment" | "delivery_or_smishing" | "apartment" | "other";
export type ItemStatus = "unchecked" | "i_will_check" | "asked_family" | "in_progress" | "done" | "on_hold" | "not_applicable";
export type Confidence = "confirmed" | "inferred";
export type CaseStatus = "needs_confirmation" | "ready" | "in_progress" | "blocked" | "completed";
export type ActionKind = "verify_source" | "complete_notice" | "clarify";
export type SourceTrust = "official" | "mismatch" | "unknown" | "no_link";

export interface PrivacyFinding { kind: string; count: number; }
export interface PrivacySummary { total: number; findings: PrivacyFinding[]; }
export interface SourceAssessment {
  trust: SourceTrust; claimedOrganization?: string; domains: string[]; explanation: string;
}
export interface CaseEvent { at: string; type: "created" | "status_changed" | "action_updated"; detail: string; }

export interface Fact { fieldKey: string; label: string; value: string; confidence: Confidence; quote?: string; }
export interface MissingField { fieldKey: string; label: string; whyItMatters: string; suggestedQuestion: string; }
export interface ActionItem { id: string; label: string; kind: ActionKind; priority: 1 | 2 | 3; dependsOn?: string[]; dueAt?: string; status: ItemStatus; actorName?: string; history: { at: string; status: ItemStatus; actorName?: string }[]; }
export interface RiskSignal { ruleId: string; label: string; severity: "low" | "medium" | "high"; evidence: string; saferNextStep: string; }
export interface NoticeCard {
  code: string; noticeType: NoticeType; title: string; facts: Fact[]; actionItems: ActionItem[];
  missingFields: MissingField[]; riskSignals: RiskSignal[];
  status: CaseStatus; version: number; privacySummary: PrivacySummary; sourceAssessment: SourceAssessment; events: CaseEvent[];
  reminderSuggestions: { atLabel: string; text: string }[]; nextCheckAt?: string;
  createdAt: string; lastAccessAt: string;
}
export interface ExtractedInput { field_key: string; value: string; quote?: string; }
