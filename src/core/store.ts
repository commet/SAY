import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { CARD_TTL_MS } from "./retention.js";
import type { NoticeCard } from "./types.js";

const MAX_CARDS = 500;
const iso = z.string().datetime();
const noticeType = z.enum(["hospital", "government", "insurance_card_payment", "delivery_or_smishing", "apartment", "other"]);
const itemStatus = z.enum(["unchecked", "i_will_check", "asked_family", "in_progress", "done", "on_hold", "not_applicable"]);
const privacySummary = z.object({
  total: z.number().int().nonnegative(),
  findings: z.array(z.object({ kind: z.string().min(1).max(64), count: z.number().int().positive() }).strict()).max(30),
}).strict().refine((summary) => summary.findings.reduce((sum, finding) => sum + finding.count, 0) === summary.total);
const classification = z.object({
  type: noticeType,
  confidence: z.enum(["high", "medium", "low"]),
  score: z.number().int().nonnegative(),
  margin: z.number().int().nonnegative(),
  matchedSignals: z.array(z.string().max(100)).max(20),
  alternatives: z.array(z.object({ type: noticeType, score: z.number().int().nonnegative() }).strict()).max(5),
}).strict();
const actionItem = z.object({
  id: z.string().min(1).max(20), label: z.string().min(1).max(240), kind: z.enum(["verify_source", "complete_notice", "clarify"]),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]), dependsOn: z.array(z.string().min(1).max(20)).max(5).optional(),
  dueAt: iso.optional(), status: itemStatus, actorName: z.string().max(20).optional(),
  history: z.array(z.object({ at: iso, status: itemStatus, actorName: z.string().max(20).optional() }).strict()).min(1).max(20),
}).strict();
const feedback = z.object({
  outcome: z.enum(["resolved", "partially_resolved", "abandoned", "unsafe_to_continue"]),
  classificationQuality: z.enum(["correct", "incorrect", "unsure"]), correctedNoticeType: noticeType.optional(),
  extractionQuality: z.enum(["complete", "missing_information", "incorrect_information", "unsure"]),
  riskQuality: z.enum(["appropriate", "false_alarm", "missed_risk", "unsure"]),
  friction: z.enum(["none", "too_many_steps", "unclear_next_action", "coordination_difficulty", "privacy_concern"]),
  recordedAt: iso,
}).strict();
const noticeCardSchema = z.object({
  code: z.string().regex(/^SAY-(?:[A-Z2-9]{4}-){3}[A-Z2-9]{4}$/), noticeType, title: z.string().min(1).max(100),
  facts: z.array(z.object({ fieldKey: z.string().min(1).max(80), label: z.string().min(1).max(100), value: z.string().min(1).max(160), confidence: z.enum(["confirmed", "inferred"]) }).strict()).max(50),
  actionItems: z.array(actionItem).max(50),
  missingFields: z.array(z.object({ fieldKey: z.string().min(1).max(80), label: z.string().min(1).max(100), whyItMatters: z.string().min(1).max(300), suggestedQuestion: z.string().min(1).max(300) }).strict()).max(50),
  riskSignals: z.array(z.object({ ruleId: z.string().min(1).max(20), label: z.string().min(1).max(160), severity: z.enum(["low", "medium", "high"]), evidence: z.string().max(500), saferNextStep: z.string().min(1).max(500) }).strict()).max(12),
  status: z.enum(["needs_confirmation", "ready", "in_progress", "blocked", "completed"]), version: z.number().int().positive(),
  privacySummary,
  sourceAssessment: z.object({ trust: z.enum(["official", "mismatch", "unknown", "no_link"]), claimedOrganization: z.string().max(100).optional(), domains: z.array(z.string().max(253)).max(12), explanation: z.string().min(1).max(500) }).strict(),
  classification,
  events: z.array(z.object({ at: iso, type: z.enum(["created", "status_changed", "action_updated", "outcome_recorded"]), detail: z.string().max(240) }).strict()).min(1).max(50),
  outcomeFeedback: feedback.optional(),
  reminderSuggestions: z.array(z.object({ atLabel: z.string().min(1).max(160), text: z.string().min(1).max(240) }).strict()).max(3),
  nextCheckAt: iso.optional(), createdAt: iso, expiresAt: iso, lastAccessAt: iso,
}).strict();

export function isNoticeCard(value: unknown): value is NoticeCard {
  const parsed = noticeCardSchema.safeParse(value);
  if (!parsed.success) return false;
  const card = parsed.data;
  const retention = Date.parse(card.expiresAt) - Date.parse(card.createdAt);
  if (retention <= 0 || retention > CARD_TTL_MS) return false;
  return card.classification.type === card.noticeType;
}

export class CardStore {
  private cards = new Map<string, NoticeCard>();
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly file = process.env.CARD_STORE_PATH) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.file) return;
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as unknown;
      if (Array.isArray(parsed)) {
        for (const card of parsed.filter(isNoticeCard).slice(-MAX_CARDS)) this.cards.set(card.code, card);
      }
    } catch { /* optional persistence */ }
    this.purge();
  }

  get(code: string): NoticeCard | undefined {
    this.purge();
    return this.cards.get(code);
  }

  put(card: NoticeCard): void {
    if (!isNoticeCard(card)) throw new Error("Invalid notice card");
    while (!this.cards.has(card.code) && this.cards.size >= MAX_CARDS) this.cards.delete(this.cards.keys().next().value as string);
    this.cards.set(card.code, card);
    this.persist();
  }

  delete(code: string): boolean {
    const deleted = this.cards.delete(code);
    if (deleted) this.persist();
    return deleted;
  }

  touch(card: NoticeCard, now = new Date()): void {
    card.lastAccessAt = now.toISOString();
    this.put(card);
  }

  all(): NoticeCard[] {
    this.purge();
    return [...this.cards.values()];
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }

  private purge(now = Date.now()): void {
    let changed = false;
    for (const [code, card] of this.cards) {
      if (Date.parse(card.expiresAt) <= now) {
        this.cards.delete(code);
        changed = true;
      }
    }
    if (changed) this.persist();
  }

  private persist(): void {
    if (!this.file) return;
    const file = this.file;
    const payload = JSON.stringify([...this.cards.values()]);
    this.writeQueue = this.writeQueue.then(async () => {
      const tmp = `${file}.tmp`;
      try {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(tmp, payload, "utf8");
        await rename(tmp, file);
      } catch { /* continue with in-memory fallback */ }
    });
  }
}

export const store = new CardStore();
