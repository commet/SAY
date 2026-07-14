import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { SERVICE_VERSION } from "../src/version.js";
import { readFileSync } from "node:fs";

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

  it("reports the shared service version from health", async () => {
    const origin = await start();
    expect(createApp().get("trust proxy")).toBe(false);
    const response = await fetch(`${origin}/health`);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      ok: true, name: "say-family-notice", version: "2.1.0",
      privacy: { raw_notice_logging: false, maximum_case_retention_hours: 24 },
      metrics: { mcpRequests: 0, rejectedRequests: 0, rateLimitedRequests: 0 },
    }));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-request-id")).toMatch(/^[0-9a-f-]{36}$/);
    const packageVersion = (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
    expect(packageVersion).toBe(SERVICE_VERSION);
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
    expect(body.result.serverInfo).toEqual({ name: "SAY", version: "2.1.0" });
    expect(response.headers.get("ratelimit-limit")).toBe("60");
    expect(response.headers.get("ratelimit-reset")).toBeTruthy();
  });

  it("calls a representative tool through the stateless HTTP transport within the p99 limit", async () => {
    const origin = await start();
    const started = performance.now();
    const response = await fetch(`${origin}/mcp`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-03-26" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 2, method: "tools/call",
        params: { name: "check_scam_signals", arguments: { raw_text: "택배 주소 확인 http://parcel.xyz/change" } },
      }),
    });
    const elapsed = performance.now() - started;
    expect(response.status).toBe(200);
    const body = await response.json() as { result: { structuredContent: { ok: boolean; message: string } } };
    expect(body.result.structuredContent).toEqual(expect.objectContaining({ ok: true, message: expect.stringContaining("위험 신호") }));
    expect(elapsed).toBeLessThan(3000);
  });

  it("returns a sanitized JSON-RPC parse error for malformed JSON", async () => {
    const origin = await start();
    const response = await fetch(`${origin}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ jsonrpc: "2.0", error: { code: -32700, message: "Invalid JSON request" }, id: null });
    expect(response.headers.get("ratelimit-limit")).toBe("60");
  });

  it("rejects unsupported content types and oversized bodies", async () => {
    const origin = await start();
    const unsupported = await fetch(`${origin}/mcp`, { method: "POST", body: "plain text" });
    expect(unsupported.status).toBe(415);
    const oversized = await fetch(`${origin}/mcp`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ value: "x".repeat(70_000) }) });
    expect(oversized.status).toBe(413);
  });

  it("returns retry guidance after the privacy-safe IP request limit", async () => {
    const origin = await start();
    let response: Response | undefined;
    for (let index = 0; index < 61; index += 1) response = await fetch(`${origin}/mcp`);
    expect(response?.status).toBe(429);
    expect(response?.headers.get("retry-after")).toBeTruthy();
    await expect(response?.json()).resolves.toEqual(expect.objectContaining({ error: expect.objectContaining({ code: -32001 }) }));
  });
});
