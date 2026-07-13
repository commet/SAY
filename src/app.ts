import express, { type ErrorRequestHandler } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildServer } from "./server.js";
import { SERVICE_VERSION } from "./version.js";

export function createApp(): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "64kb", strict: true }));

  const requestWindows = new Map<string, { startedAt: number; count: number }>();
  app.use("/mcp", (req, res, next) => {
    const now = Date.now(); const key = req.ip ?? "unknown"; const current = requestWindows.get(key);
    const window = !current || now - current.startedAt >= 60_000 ? { startedAt: now, count: 0 } : current;
    window.count += 1; requestWindows.set(key, window);
    if (requestWindows.size > 10_000) for (const [ip, value] of requestWindows) if (now - value.startedAt >= 60_000) requestWindows.delete(ip);
    res.set("RateLimit-Limit", "60"); res.set("RateLimit-Remaining", String(Math.max(0, 60 - window.count)));
    if (window.count > 60) {
      res.status(429).json({ jsonrpc: "2.0", error: { code: -32001, message: "Too many requests; retry after one minute" }, id: req.body?.id ?? null });
      return;
    }
    next();
  });

  app.get("/health", (_req, res) => res.json({ ok: true, name: "say-family-notice", version: SERVICE_VERSION }));
  app.post("/mcp", async (req, res) => {
    try {
      if (!isInitializeRequest(req.body) && !req.body?.method) {
        res.status(400).json({ jsonrpc: "2.0", error: { code: -32600, message: "Invalid MCP request" }, id: null });
        return;
      }
      const server = buildServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on("close", () => { void transport.close(); void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch {
      if (!res.headersSent) res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "MCP request could not be processed" }, id: req.body?.id ?? null });
    }
  });
  app.get("/mcp", (_req, res) => res.status(405).set("Allow", "POST").send());
  app.delete("/mcp", (_req, res) => res.status(405).set("Allow", "POST").send());

  const errorHandler: ErrorRequestHandler = (_error, req, res, _next) => {
    res.status(400).json({ jsonrpc: "2.0", error: { code: -32700, message: "Invalid JSON request" }, id: req.body?.id ?? null });
  };
  app.use(errorHandler);
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  return app;
}
