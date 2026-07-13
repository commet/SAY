export type NoticeType = "hospital" | "government" | "insurance_card_payment" | "delivery_or_smishing" | "apartment" | "other";
export type ItemStatus = "unchecked" | "i_will_check" | "asked_family" | "in_progress" | "done" | "on_hold" | "not_applicable";
export type Confidence = "confirmed" | "inferred";

export interface Fact { fieldKey: string; label: string; value: string; confidence: Confidence; quote?: string; }
export interface MissingField { fieldKey: string; label: string; whyItMatters: string; suggestedQuestion: string; }
export interface ActionItem { id: string; label: string; dueAt?: string; status: ItemStatus; actorName?: string; history: { at: string; status: ItemStatus; actorName?: string }[]; }
export interface RiskSignal { ruleId: string; label: string; severity: "low" | "medium" | "high"; evidence: string; saferNextStep: string; }
export interface NoticeCard {
  code: string; noticeType: NoticeType; title: string; facts: Fact[]; actionItems: ActionItem[];
  missingFields: MissingField[]; riskSignals: RiskSignal[];
  reminderSuggestions: { atLabel: string; text: string }[]; nextCheckAt?: string;
  createdAt: string; lastAccessAt: string;
}
export interface ExtractedInput { field_key: string; value: string; quote?: string; }
