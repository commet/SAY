import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildCard } from "../src/core/cardBuilder.js";
import { CardStore, isNoticeCard } from "../src/core/store.js";
import { hospital } from "./fixtures.js";

describe("validated, serialized case persistence", () => {
  it("queues rapid writes and reloads every valid unexpired card", async () => {
    const directory = await mkdtemp(join(tmpdir(), "say-cases-"));
    const file = join(directory, "cards.json");
    try {
      const writer = new CardStore(file);
      const now = new Date();
      const cards = Array.from({ length: 5 }, (_, index) => buildCard({ raw_text: `${hospital}\n참조 ${index}` }, new Date(now.getTime() + index)));
      for (const card of cards) writer.put(card);
      await writer.flush();
      expect(JSON.parse(await readFile(file, "utf8"))).toHaveLength(5);

      const reader = new CardStore(file);
      await reader.load();
      expect(reader.all().map((card) => card.code).sort()).toEqual(cards.map((card) => card.code).sort());
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects malformed persisted objects and invalid cards", async () => {
    const directory = await mkdtemp(join(tmpdir(), "say-invalid-cases-"));
    const file = join(directory, "cards.json");
    try {
      await writeFile(file, JSON.stringify([{ code: "SAY-AAAA-BBBB-CCCC-DDDD", rawText: hospital }]), "utf8");
      const store = new CardStore(file);
      await store.load();
      expect(store.all()).toHaveLength(0);
      expect(isNoticeCard({ code: "SAY-AAAA-BBBB-CCCC-DDDD" })).toBe(false);
      const withQuote = structuredClone(buildCard({ raw_text: hospital }));
      (withQuote.facts[0] as { quote?: string }).quote = "원문이 저장되면 안 됩니다";
      expect(isNoticeCard(withQuote)).toBe(false);
      expect(() => store.put({ code: "SAY-AAAA-BBBB-CCCC-DDDD" } as never)).toThrow("Invalid notice card");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
