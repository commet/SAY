import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { buildServer } from "../src/server.js";
import { hospital } from "./fixtures.js";

describe("MCP protocol E2E", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => { while (cleanups.length) await cleanups.pop()?.(); });

  it("initializes, lists the guarded tool surface and completes inspect/create", async () => {
    const server = buildServer();
    const client = new Client({ name: "say-e2e", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    cleanups.push(async () => { await client.close(); await server.close(); });

    expect(client.getServerVersion()).toEqual(expect.objectContaining({ name: "SAY", version: "1.0.0" }));
    const tools = await client.listTools();
    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "inspect_notice", "create_case", "check_scam_signals", "get_case", "get_next_action",
      "update_action", "make_family_message", "list_open_cases", "delete_case",
    ]);
    expect(tools.tools.length).toBeGreaterThanOrEqual(3);
    expect(tools.tools.length).toBeLessThanOrEqual(10);
    for (const tool of tools.tools) {
      expect(tool.name).not.toMatch(/kakao/i);
      expect(tool.description).toContain("SAY(사이)");
      expect(tool.description!.length).toBeLessThanOrEqual(1024);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.annotations).toEqual(expect.objectContaining({
        title: expect.any(String), readOnlyHint: expect.any(Boolean), destructiveHint: expect.any(Boolean),
        openWorldHint: expect.any(Boolean), idempotentHint: expect.any(Boolean),
      }));
    }
    expect(tools.tools.find((tool) => tool.name === "delete_case")?.annotations?.destructiveHint).toBe(true);

    const inspected = await client.callTool({ name: "inspect_notice", arguments: { raw_text: hospital } });
    const inspectionText = "content" in inspected && inspected.content[0]?.type === "text" ? inspected.content[0].text : "";
    const inspection = JSON.parse(inspectionText);
    expect(inspection.inspection_token).toMatch(/^INSP-/);

    const created = await client.callTool({ name: "create_case", arguments: { inspection_token: inspection.inspection_token, consent: true } });
    const createdText = "content" in created && created.content[0]?.type === "text" ? created.content[0].text : "";
    expect(createdText).toMatch(/SAY-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}/);
  });
});
