import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { hospital } from "./fixtures.js";

describe("MCP protocol E2E", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => { while (cleanups.length) await cleanups.pop()?.(); });

  it("initializes, lists the guarded tool surface and completes inspect/create/outcome/delete", async () => {
    const server = buildServer();
    const client = new Client({ name: "say-e2e", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    cleanups.push(async () => { await client.close(); await server.close(); });

    expect(client.getServerVersion()).toEqual(expect.objectContaining({ name: "SAY", version: "2.1.0" }));
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "inspect_notice", "create_case", "check_scam_signals", "get_case", "get_next_action",
      "update_action", "make_family_message", "list_open_cases", "record_outcome", "delete_case",
    ]);
    expect(tools.tools.length).toBeGreaterThanOrEqual(3);
    expect(tools.tools.length).toBeLessThanOrEqual(10);
    for (const tool of tools.tools) {
      expect(tool.name).not.toMatch(/kakao/i);
      expect(tool.description).toContain("SAY(사이)");
      expect(tool.description!.length).toBeLessThanOrEqual(1024);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.outputSchema).toBeDefined();
      expect(tool.annotations).toEqual(expect.objectContaining({
        title: expect.any(String), readOnlyHint: expect.any(Boolean), destructiveHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean), idempotentHint: expect.any(Boolean),
      }));
    }
    const outcomeTool = tools.tools.find((tool) => tool.name === "record_outcome");
    const inspectTool = tools.tools.find((tool) => tool.name === "inspect_notice");
    const updateTool = tools.tools.find((tool) => tool.name === "update_action");
    expect(Object.keys((inspectTool?.inputSchema.properties ?? {}) as Record<string, unknown>)).toContain("confirmed_notice_type");
    expect(Object.keys((updateTool?.inputSchema.properties ?? {}) as Record<string, unknown>)).toContain("result_note");
    expect(Object.keys((outcomeTool?.inputSchema.properties ?? {}) as Record<string, unknown>)).not.toEqual(expect.arrayContaining(["raw_text", "comment", "note", "description"]));
    expect(tools.tools.find((tool) => tool.name === "delete_case")?.annotations?.destructiveHint).toBe(true);

    const inspected = await client.callTool({ name: "inspect_notice", arguments: { raw_text: hospital } });
    expect(inspected.structuredContent).toEqual(expect.objectContaining({ ok: true, message: expect.any(String), data: expect.any(Object) }));
    const inspectionText = "content" in inspected && inspected.content[0]?.type === "text" ? inspected.content[0].text : "";
    const inspection = JSON.parse(inspectionText);
    expect(inspection.inspection_token).toMatch(/^INSP-/);

    const created = await client.callTool({ name: "create_case", arguments: { inspection_token: inspection.inspection_token, consent: true } });
    const createdText = "content" in created && created.content[0]?.type === "text" ? created.content[0].text : "";
    const code = createdText.match(/SAY-(?:[A-Z2-9]{4}-){3}[A-Z2-9]{4}/)?.[0];
    expect(code).toBeTruthy();
    const previousLogging = process.env.IMPROVEMENT_EVENT_LOG;
    process.env.IMPROVEMENT_EVENT_LOG = "false";
    let outcome;
    try {
      outcome = await client.callTool({ name: "record_outcome", arguments: {
        case_code: code, outcome: "resolved", classification_quality: "correct", extraction_quality: "complete",
        risk_quality: "appropriate", friction: "none", expected_version: 1,
      } });
    } finally {
      if (previousLogging === undefined) delete process.env.IMPROVEMENT_EVENT_LOG;
      else process.env.IMPROVEMENT_EVENT_LOG = previousLogging;
    }
    const outcomeText = "content" in outcome && outcome.content[0]?.type === "text" ? outcome.content[0].text : "";
    expect(JSON.parse(outcomeText)).toEqual(expect.objectContaining({ recorded: true, duplicate_ignored: false }));
    expect(outcome.structuredContent).toEqual(expect.objectContaining({ ok: true, data: expect.objectContaining({ recorded: true }) }));
    await client.callTool({ name: "delete_case", arguments: { case_code: code } });
  });
});
