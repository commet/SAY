import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildServer } from "./server.js";
import { store } from "./core/store.js";

await store.load();
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.json({ ok: true, name: "say-family-notice", version: "0.2.0" }));
app.post("/mcp", async (req, res) => {
  try {
    if (!isInitializeRequest(req.body) && !req.body?.method) { res.status(400).json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid MCP request" }, id: null }); return; }
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => { void transport.close(); void server.close(); });
    await server.connect(transport); await transport.handleRequest(req, res, req.body);
  } catch { if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "MCP request could not be processed" }, id: req.body?.id ?? null }); }
});
app.get("/mcp", (_req, res) => res.status(405).set("Allow", "POST").send());
app.delete("/mcp", (_req, res) => res.status(405).set("Allow", "POST").send());
app.use((_req, res) => res.status(404).json({ error: "Not found" }));
const port = Number(process.env.PORT ?? 8080); const host = process.env.HOST ?? "0.0.0.0";
app.listen(port, host, () => console.log(`say-mcp listening on ${host}:${port}`));
