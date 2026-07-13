import { randomBytes } from "node:crypto";
import type { ClassificationAssessment, NoticeType, PrivacySummary, RiskSignal, SourceAssessment } from "./types.js";

const TTL_MS = 10 * 60_000;
const MAX_INSPECTIONS = 200;
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export interface InspectionRecord {
  token: string;
  redactedText: string;
  noticeType: NoticeType;
  classification: ClassificationAssessment;
  senderHint?: string;
  privacySummary: PrivacySummary;
  sourceAssessment: SourceAssessment;
  riskSignals: RiskSignal[];
  createdAt: string;
  expiresAt: string;
}

class InspectionStore {
  private records = new Map<string, InspectionRecord>();

  create(input: Omit<InspectionRecord, "token" | "createdAt" | "expiresAt">, now = new Date()): InspectionRecord {
    this.purge(now.getTime());
    while (this.records.size >= MAX_INSPECTIONS) this.records.delete(this.records.keys().next().value as string);
    const token = `INSP-${Array.from(randomBytes(16), (byte) => alphabet[byte % alphabet.length]).join("")}`;
    const record = { ...input, token, createdAt: now.toISOString(), expiresAt: new Date(now.getTime() + TTL_MS).toISOString() };
    this.records.set(token, record);
    return record;
  }

  take(token: string, now = new Date()): InspectionRecord | undefined {
    this.purge(now.getTime());
    const normalized = token.trim().toUpperCase();
    const record = this.records.get(normalized);
    if (record) this.records.delete(normalized);
    return record;
  }

  private purge(now: number): void {
    for (const [token, record] of this.records) if (Date.parse(record.expiresAt) <= now) this.records.delete(token);
  }
}

export const inspectionStore = new InspectionStore();
