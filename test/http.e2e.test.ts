import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";

describe("Streamable HTTP boundary", () => {
  let server: Server | undefined;
  afterEach(async () => { if (server) await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve())); });

  async function start(): Promise<string> {
    server = createApp().listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const port = (server.address() as AddressInfo).port;
    return `http://127.0.0.1:${port}`;
  }

  const initialize = (protocolVersion: string) => ({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion, capabilities: {}, clientInfo: { name: "say-http-e2e", version: "1.0.0" } },
  });

  it.each(["2025-03-26", "2025-11-25"])("initializes protocol %s over JSON HTTP", async (protocolVersion) => {
    const origin = await start();
    const response = await fetch(`${origin}/mcp`, {
      method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify(initialize(protocolVersion)),
    });
    expect(response.status).toBe(200);
    const body = await response.json() as { result: { protocolVersion: string; serverInfo: { name: string; version: string } } };
    expect(body.result.protocolVersion).toBe(protocolVersion);
    expect(body.result.serverInfo).toEqual({ name: "SAY", version: "1.0.0" });
    expect(response.headers.get("ratelimit-limit")).toBe("60");
  });

  it("returns a sanitized JSON-RPC parse error for malformed JSON", async () => {
    const origin = await start();
    const response = await fetch(`${origin}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ jsonrpc: "2.0", error: { code: -32700, message: "Invalid JSON request" }, id: null });
  });
});
