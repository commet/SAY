import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { NoticeCard } from "./types.js";

const requestedHours = Number(process.env.CARD_TTL_HOURS ?? 24);
const TTL_MS = Math.min(Math.max(Number.isFinite(requestedHours) ? requestedHours : 24, 1), 24) * 3600_000;
export class CardStore {
  private cards = new Map<string, NoticeCard>();
  private loaded = false;
  constructor(private readonly file = process.env.CARD_STORE_PATH) {}
  async load(): Promise<void> {
    if (this.loaded) return; this.loaded = true;
    if (!this.file) return;
    try { const data = JSON.parse(await readFile(this.file, "utf8")) as NoticeCard[]; for (const card of data) this.cards.set(card.code, card); } catch { /* optional persistence */ }
    this.purge();
  }
  get(code: string): NoticeCard | undefined { this.purge(); return this.cards.get(code); }
  put(card: NoticeCard): void { this.cards.set(card.code, card); this.persist(); }
  touch(card: NoticeCard, now = new Date()): void { card.lastAccessAt = now.toISOString(); this.put(card); }
  all(): NoticeCard[] { this.purge(); return [...this.cards.values()]; }
  private purge(now = Date.now()): void { for (const [code, card] of this.cards) if (now - Date.parse(card.lastAccessAt) > TTL_MS) this.cards.delete(code); }
  private persist(): void {
    if (!this.file) return;
    const file = this.file;
    const tmp = `${file}.tmp`;
    void (async () => { try { await mkdir(dirname(file), { recursive: true }); await writeFile(tmp, JSON.stringify(this.all()), "utf8"); await rename(tmp, file); } catch { /* in-memory fallback */ } })();
  }
}
export const store = new CardStore();
