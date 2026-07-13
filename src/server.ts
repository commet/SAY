import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { createCase, deleteCase, familyMessage, getCard, getNextAction, inspectNotice, listOpen, recordOutcome, scamSignals, updateStatus } from "./tools/handlers.js";
import type { ItemStatus, NoticeType } from "./core/types.js";
import { SERVICE_VERSION } from "./version.js";

const outputSchema = { ok: z.boolean(), message: z.string(), data: z.record(z.unknown()).optional(), error_code: z.string().optional() };
const text = (value: string) => {
  let data: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch { /* human-readable tool output */ }
  return { content: [{ type: "text" as const, text: value }], structuredContent: { ok: true, message: value, ...(data ? { data } : {}) } };
};
const failure = (_error: unknown) => {
  const message = "입력 내용을 처리하지 못했어요. 원문, 검사 토큰 또는 케이스 코드를 확인해 다시 시도해 주세요.";
  return { content: [{ type: "text" as const, text: message }], structuredContent: { ok: false, message, error_code: "PROCESSING_ERROR" }, isError: true };
};
const wrap = <T extends Record<string, unknown>>(fn: (args: T) => string) => async (args: T) => { try { return text(fn(args)); } catch (error) { return failure(error); } };
const annotations = (title: string, options: { readOnly: boolean; destructive?: boolean; idempotent: boolean }) => ({
  title, readOnlyHint: options.readOnly, destructiveHint: options.destructive ?? false, openWorldHint: false, idempotentHint: options.idempotent,
});

export function buildServer(): McpServer {
  const server = new McpServer({ name: "SAY", version: SERVICE_VERSION });

  server.registerTool("inspect_notice", {
    description: "SAY(사이) mandatory privacy gate before case creation. Redacts identifiers on the server, classifies the notice with confidence, assesses claimed-organization/link trust, extracts facts, and identifies missing fields and risks. It returns a 10-minute token only for an actionable notice and stores only that redacted inspection. Show the preview and risks and obtain explicit consent before create_case.",
    inputSchema: { raw_text: z.string().min(5).max(8000).describe("Notice text. The server redacts it before any retention."), notice_type_guess: z.enum(["hospital", "government", "insurance_card_payment", "delivery_or_smishing", "apartment", "other"]).optional(), sender_hint: z.string().max(100).optional() },
    outputSchema,
    annotations: annotations("Inspect and redact notice", { readOnly: false, idempotent: false }),
  }, wrap((args) => inspectNotice(args as unknown as { raw_text: string; notice_type_guess?: NoticeType; sender_hint?: string })));

  server.registerTool("create_case", {
    description: "SAY(사이) creates a short-lived family action case from a valid inspect_notice token. Call only after the user has seen the redacted preview and explicitly agreed to temporary case storage. The token is single-use, expires in 10 minutes, and no original text or source quote is stored.",
    inputSchema: { inspection_token: z.string().min(10).max(40), consent: z.boolean().describe("True only after explicit user consent to create a memory-only case for up to 24 hours") },
    outputSchema,
    annotations: annotations("Create consented action case", { readOnly: false, idempotent: false }),
  }, wrap((args) => createCase(args.inspection_token as string, args.consent as boolean)));

  server.registerTool("check_scam_signals", {
    description: "SAY(사이) performs a standalone, privacy-redacted check for suspicious links, claimed-organization/domain mismatch, personal-information or payment requests, urgency pressure and installation prompts. It gives conservative safer next steps and never declares a message genuine.",
    inputSchema: { raw_text: z.string().min(5).max(8000), sender_hint: z.string().max(100).optional() },
    outputSchema,
    annotations: annotations("Check scam signals", { readOnly: true, idempotent: true }),
  }, wrap((args) => scamSignals(args.raw_text as string, args.sender_hint as string | undefined)));

  server.registerTool("get_case", {
    description: "SAY(사이) retrieves a privacy-minimized case by its random bearer code, including case status and version. The code is a secret and must be shared only with trusted family members.",
    inputSchema: { case_code: z.string().min(10).max(24) },
    outputSchema,
    annotations: annotations("Get action case", { readOnly: true, idempotent: true }),
  }, wrap((args) => getCard(args.case_code as string)));

  server.registerTool("get_next_action", {
    description: "SAY(사이) computes exactly one safest next action from source risk, dependencies, priorities and deadlines. High-risk cases always require official-channel verification before dependent actions.",
    inputSchema: { case_code: z.string().min(10).max(24) },
    outputSchema,
    annotations: annotations("Get safest next action", { readOnly: true, idempotent: true }),
  }, wrap((args) => getNextAction(args.case_code as string)));

  server.registerTool("update_action", {
    description: "SAY(사이) claims, holds, completes or dismisses one action. Use expected_version from get_case/get_next_action to prevent overwriting a family member's newer change. Personal names are replaced with generic family roles.",
    inputSchema: {
      case_code: z.string().min(10).max(24), action_id: z.string().max(20).optional(), action_label: z.string().max(120).optional(),
      new_status: z.enum(["unchecked", "i_will_check", "asked_family", "in_progress", "done", "on_hold", "not_applicable"]),
      actor_role: z.string().max(20).optional().describe("Generic role such as 엄마, 아빠, 보호자 or 가족"), expected_version: z.number().int().positive().optional(),
    },
    outputSchema,
    annotations: annotations("Update case action", { readOnly: false, idempotent: true }),
  }, wrap((args) => updateStatus(args.case_code as string, args.action_label as string | undefined, args.action_id as string | undefined, args.new_status as ItemStatus, args.actor_role as string | undefined, args.expected_version as number | undefined)));

  server.registerTool("make_family_message", {
    description: "SAY(사이) builds a short privacy-minimized follow-up message from an existing case for a parent, child or family chat room. It distinguishes confirmed facts from missing checks and includes the bearer-code warning.",
    inputSchema: { case_code: z.string().min(10).max(24), audience: z.enum(["parent", "child", "family_room"]), style: z.enum(["short", "plain", "question"]) },
    outputSchema,
    annotations: annotations("Make family message", { readOnly: true, idempotent: true }),
  }, wrap((args) => familyMessage(args.case_code as string, args.audience as "parent" | "child" | "family_room", args.style as "short" | "plain" | "question")));

  server.registerTool("list_open_cases", {
    description: "SAY(사이) lists still-open actions across explicitly supplied bearer codes. There is intentionally no account-wide enumeration API.",
    inputSchema: { case_codes: z.array(z.string().min(10).max(24)).min(1).max(10) },
    outputSchema,
    annotations: annotations("List supplied open cases", { readOnly: true, idempotent: true }),
  }, wrap((args) => listOpen(args.case_codes as string[])));

  server.registerTool("record_outcome", {
    description: "SAY(사이) records one voluntary, structured outcome for a live case so repeated product failures can become privacy-safe improvement signals. Call only after the user explicitly volunteers the ratings. It accepts no free text, raw notice or person data. Only unlinkable category counters and an optional sanitized operator event remain after case deletion; the server never changes its own code from feedback.",
    inputSchema: {
      case_code: z.string().min(10).max(24),
      outcome: z.enum(["resolved", "partially_resolved", "abandoned", "unsafe_to_continue"]),
      classification_quality: z.enum(["correct", "incorrect", "unsure"]),
      corrected_notice_type: z.enum(["hospital", "government", "insurance_card_payment", "delivery_or_smishing", "apartment", "other"]).optional(),
      extraction_quality: z.enum(["complete", "missing_information", "incorrect_information", "unsure"]),
      risk_quality: z.enum(["appropriate", "false_alarm", "missed_risk", "unsure"]),
      friction: z.enum(["none", "too_many_steps", "unclear_next_action", "coordination_difficulty", "privacy_concern"]),
      expected_version: z.number().int().positive().optional(),
    },
    outputSchema,
    annotations: annotations("Record privacy-safe outcome", { readOnly: false, idempotent: true }),
  }, wrap((args) => recordOutcome(args.case_code as string, {
    outcome: args.outcome as "resolved" | "partially_resolved" | "abandoned" | "unsafe_to_continue",
    classificationQuality: args.classification_quality as "correct" | "incorrect" | "unsure",
    correctedNoticeType: args.corrected_notice_type as NoticeType | undefined,
    extractionQuality: args.extraction_quality as "complete" | "missing_information" | "incorrect_information" | "unsure",
    riskQuality: args.risk_quality as "appropriate" | "false_alarm" | "missed_risk" | "unsure",
    friction: args.friction as "none" | "too_many_steps" | "unclear_next_action" | "coordination_difficulty" | "privacy_concern",
  }, args.expected_version as number | undefined)));

  server.registerTool("delete_case", {
    description: "SAY(사이) immediately deletes a short-lived case. Use when the user asks to remove it or after the family has finished. If the user previously volunteered record_outcome, its unlinkable aggregate category counter cannot be singled out and may remain; no case code, raw text or free text is retained in that aggregate.",
    inputSchema: { case_code: z.string().min(10).max(24) },
    outputSchema,
    annotations: annotations("Delete action case", { readOnly: false, destructive: true, idempotent: true }),
  }, wrap((args) => deleteCase(args.case_code as string)));

  return server;
}
