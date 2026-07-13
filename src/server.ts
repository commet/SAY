import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { analyzeNotice, familyMessage, getCard, listOpen, scamSignals, updateStatus } from "./tools/handlers.js";
import type { ItemStatus, NoticeType } from "./core/types.js";

const text = (value: string) => ({ content: [{ type: "text" as const, text: value }] });
const failure = (error: unknown) => ({ content: [{ type: "text" as const, text: error instanceof Error && error.message.includes("needed") ? error.message : "입력 내용을 확인해 주세요. 필요한 원문이나 카드 코드를 다시 보내 주세요." }], isError: true });
const wrap = <T extends Record<string, unknown>>(fn: (args: T) => string) => async (args: T) => { try { return text(fn(args)); } catch (e) { return failure(e); } };
const annotations = (title: string, readOnlyHint: boolean) => ({ title, readOnlyHint, destructiveHint: false, openWorldHint: false, idempotentHint: true });

export function buildServer(): McpServer {
  const server = new McpServer({ name: "SAY", version: "0.2.0" });
  server.registerTool("analyze_notice", {
    description: "Turns a family notice (hospital/checkup, government/welfare, insurance/card/payment, delivery SMS) into a privacy-minimized action card with SAY(사이): confirmed facts, missing checks, action items, risk signals, and a random family-shareable card code. If the user sent an image, transcribe the needed text into raw_text but omit or mask identifiers where possible. The server also redacts sensitive identifiers and never stores the original text or quotes. Never add facts absent from the original.",
    inputSchema: { raw_text: z.string().min(10).max(8000).describe("Full original notice text; transcribe screenshots verbatim"), notice_type_guess: z.enum(["hospital", "government", "insurance_card_payment", "delivery_or_smishing", "apartment", "other"]).optional(), extracted: z.array(z.object({ field_key: z.string().max(50), value: z.string().max(500), quote: z.string().max(300).optional() })).max(30).optional(), sender_hint: z.string().max(100).optional() },
    annotations: annotations("Analyze family notice", false),
  }, wrap((args) => analyzeNotice(args as unknown as { raw_text: string; notice_type_guess?: NoticeType; extracted?: { field_key: string; value: string; quote?: string }[]; sender_hint?: string })));
  server.registerTool("check_scam_signals", {
    description: "Checks a text message for smishing/scam risk signals with SAY(사이): suspicious links, personal-information or payment requests, and urgency pressure. Returns signals and safer next steps, not a definitive verdict. Transcribe all image text verbatim first.",
    inputSchema: { raw_text: z.string().min(5).max(8000), sender_hint: z.string().max(100).optional() }, annotations: annotations("Check scam signals", true),
  }, wrap((args) => scamSignals(args.raw_text as string, args.sender_hint as string | undefined)));
  server.registerTool("get_card", {
    description: "Retrieves a privacy-minimized SAY(사이) action card by its unguessable bearer code (e.g. SAY-3F7K-Q2MN-8R4T). Share the code only with trusted family members. Cards are memory-only by default and expire within 24 hours or on server restart.",
    inputSchema: { card_code: z.string().min(6).max(20) }, annotations: annotations("Get action card", true),
  }, wrap((args) => getCard(args.card_code as string)));
  server.registerTool("update_item_status", {
    description: "Updates one action item on a SAY(사이) card by a partial item_label or item_id. Map user words: 내가 확인할게요 to i_will_check, 가족에게 물어보기 to asked_family, 알림만 받아두기 to on_hold, 완료로 표시 or 했어요 to done, 해당 없어요 to not_applicable. Pass actor_name so family can see who took it.",
    inputSchema: { card_code: z.string(), item_label: z.string().max(100).optional(), item_id: z.string().max(10).optional(), new_status: z.enum(["unchecked", "i_will_check", "asked_family", "in_progress", "done", "on_hold", "not_applicable"]), actor_name: z.string().max(20).optional().describe("Use a generic family role such as 엄마, 아빠, 보호자, or 가족; personal names are replaced with 가족 구성원") }, annotations: annotations("Update item status", false),
  }, wrap((args) => updateStatus(args.card_code as string, args.item_label as string | undefined, args.item_id as string | undefined, args.new_status as ItemStatus, args.actor_name as string | undefined)));
  server.registerTool("make_family_message", {
    description: "Builds a short, factual follow-up message with SAY(사이) from an existing card, for a parent, child, or family chat room. It states what the notice says, what is unconfirmed, and one clear ask without emotional impersonation.",
    inputSchema: { card_code: z.string(), audience: z.enum(["parent", "child", "family_room"]), style: z.enum(["short", "plain", "question"]) }, annotations: annotations("Make family message", true),
  }, wrap((args) => familyMessage(args.card_code as string, args.audience as "parent" | "child" | "family_room", args.style as "short" | "plain" | "question")));
  server.registerTool("list_open_items", {
    description: "Lists still-open action items and missing checks across one or more SAY(사이) cards by card code, so the family can see at a glance what has not been closed yet.",
    inputSchema: { card_codes: z.array(z.string()).min(1).max(10) }, annotations: annotations("List open items", true),
  }, wrap((args) => listOpen(args.card_codes as string[])));
  return server;
}
