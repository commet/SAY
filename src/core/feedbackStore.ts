import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { FeedbackBucket, FeedbackSummary, NoticeType, OutcomeFeedback } from "./types.js";

const noticeTypes = new Set<NoticeType>(["hospital", "government", "insurance_card_payment", "delivery_or_smishing", "apartment", "other"]);

export function emptyFeedbackBucket(): FeedbackBucket {
  return {
    total: 0,
    outcomes: { resolved: 0, partially_resolved: 0, abandoned: 0, unsafe_to_continue: 0 },
    classification: { correct: 0, incorrect: 0, unsure: 0 },
    extraction: { complete: 0, missing_information: 0, incorrect_information: 0, unsure: 0 },
    risk: { appropriate: 0, false_alarm: 0, missed_risk: 0, unsure: 0 },
    friction: { none: 0, too_many_steps: 0, unclear_next_action: 0, coordination_difficulty: 0, privacy_concern: 0 },
    corrections: {},
  };
}

export function emptyFeedbackSummary(): FeedbackSummary {
  return { schemaVersion: 1, total: 0, overall: emptyFeedbackBucket(), byNoticeType: {} };
}

function increment(bucket: FeedbackBucket, feedback: OutcomeFeedback, originalType: NoticeType): void {
  bucket.total += 1;
  bucket.outcomes[feedback.outcome] += 1;
  bucket.classification[feedback.classificationQuality] += 1;
  bucket.extraction[feedback.extractionQuality] += 1;
  bucket.risk[feedback.riskQuality] += 1;
  bucket.friction[feedback.friction] += 1;
  if (feedback.classificationQuality === "incorrect" && feedback.correctedNoticeType) {
    const correction = `${originalType}->${feedback.correctedNoticeType}`;
    bucket.corrections[correction] = (bucket.corrections[correction] ?? 0) + 1;
  }
}

function hasNumericKeys(value: unknown, keys: string[]): boolean {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return keys.every((key) => typeof record[key] === "number" && Number.isInteger(record[key]) && (record[key] as number) >= 0);
}

function isFeedbackBucket(value: unknown): value is FeedbackBucket {
  if (!value || typeof value !== "object") return false;
  const bucket = value as Partial<FeedbackBucket>;
  const total = bucket.total;
  const validCounters = typeof total === "number" && Number.isInteger(total) && total >= 0
    && hasNumericKeys(bucket.outcomes, ["resolved", "partially_resolved", "abandoned", "unsafe_to_continue"])
    && hasNumericKeys(bucket.classification, ["correct", "incorrect", "unsure"])
    && hasNumericKeys(bucket.extraction, ["complete", "missing_information", "incorrect_information", "unsure"])
    && hasNumericKeys(bucket.risk, ["appropriate", "false_alarm", "missed_risk", "unsure"])
    && hasNumericKeys(bucket.friction, ["none", "too_many_steps", "unclear_next_action", "coordination_difficulty", "privacy_concern"])
    && Boolean(bucket.corrections) && typeof bucket.corrections === "object"
    && Object.values(bucket.corrections).every((count) => typeof count === "number" && Number.isInteger(count) && count >= 0);
  if (!validCounters) return false;
  const sumsToTotal = (record: Record<string, number>) => Object.values(record).reduce((sum, count) => sum + count, 0) === total;
  const correctionEntries = Object.entries(bucket.corrections!);
  const validCorrections = correctionEntries.every(([pair]) => {
    const [from, to, extra] = pair.split("->");
    return extra === undefined && noticeTypes.has(from as NoticeType) && noticeTypes.has(to as NoticeType) && from !== to;
  }) && correctionEntries.reduce((sum, [, count]) => sum + count, 0) <= bucket.classification!.incorrect;
  return validCorrections && sumsToTotal(bucket.outcomes!) && sumsToTotal(bucket.classification!) && sumsToTotal(bucket.extraction!)
    && sumsToTotal(bucket.risk!) && sumsToTotal(bucket.friction!);
}

export function parseFeedbackSummary(value: unknown): FeedbackSummary | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Partial<FeedbackSummary>;
  if (candidate.schemaVersion !== 1 || typeof candidate.total !== "number" || !Number.isInteger(candidate.total) || candidate.total < 0 || !isFeedbackBucket(candidate.overall) || !candidate.byNoticeType || typeof candidate.byNoticeType !== "object") return undefined;
  if (candidate.updatedDay !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(candidate.updatedDay)) return undefined;
  if (!Object.keys(candidate.byNoticeType).every((key) => noticeTypes.has(key as NoticeType))) return undefined;
  if (!Object.values(candidate.byNoticeType).every(isFeedbackBucket)) return undefined;
  for (const [noticeType, bucket] of Object.entries(candidate.byNoticeType)) {
    if (Object.keys(bucket!.corrections).some((pair) => !pair.startsWith(`${noticeType}->`))) return undefined;
  }
  if (candidate.total !== candidate.overall.total || Object.values(candidate.byNoticeType).reduce((sum, bucket) => sum + (bucket?.total ?? 0), 0) !== candidate.total) return undefined;
  return candidate as FeedbackSummary;
}

export class FeedbackStore {
  private summary = emptyFeedbackSummary();
  private loaded = false;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(private readonly file = process.env.IMPROVEMENT_STORE_PATH) {}

  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.file) return;
    try {
      const parsed = JSON.parse(await readFile(this.file, "utf8")) as unknown;
      const validated = parseFeedbackSummary(parsed);
      if (validated) this.summary = validated;
    } catch { /* optional aggregate persistence */ }
  }

  record(noticeType: NoticeType, feedback: OutcomeFeedback, now = new Date()): FeedbackSummary {
    increment(this.summary.overall, feedback, noticeType);
    const bucket = this.summary.byNoticeType[noticeType] ?? emptyFeedbackBucket();
    increment(bucket, feedback, noticeType);
    this.summary.byNoticeType[noticeType] = bucket;
    this.summary.total = this.summary.overall.total;
    this.summary.updatedDay = now.toISOString().slice(0, 10);
    this.persist();
    return this.snapshot();
  }

  snapshot(): FeedbackSummary {
    return structuredClone(this.summary);
  }

  async flush(): Promise<void> {
    await this.writeQueue;
  }

  private persist(): void {
    if (!this.file) return;
    const file = this.file;
    const payload = JSON.stringify(this.summary, null, 2);
    this.writeQueue = this.writeQueue.then(async () => {
      const tmp = `${file}.tmp`;
      try {
        await mkdir(dirname(file), { recursive: true });
        await writeFile(tmp, payload, "utf8");
        await rename(tmp, file);
      } catch { /* continue with in-memory aggregate */ }
    });
  }
}

export const feedbackStore = new FeedbackStore();
