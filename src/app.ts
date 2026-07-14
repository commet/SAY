import express, { type ErrorRequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { buildServer } from "./server.js";
import { SERVICE_VERSION } from "./version.js";
import { CARD_TTL_HOURS } from "./core/retention.js";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const MAX_TRACKED_CLIENTS = 10_000;

function trustedProxyHops(value = process.env.TRUST_PROXY_HOPS): number | false {
  const hops = Number(value);
  return Number.isSafeInteger(hops) && hops >= 1 && hops <= 3 ? hops : false;
}

export function createApp(): express.Express {
  const app = express();
  const startedAt = Date.now();
  const metrics = { mcpRequests: 0, rejectedRequests: 0, rateLimitedRequests: 0 };
  app.disable("x-powered-by");
  // Do not accept client-controlled X-Forwarded-For headers unless deployment explicitly opts in.
  app.set("trust proxy", trustedProxyHops());
  app.use((_req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "X-Request-Id": randomUUID(),
    });
    next();
  });

  const requestWindows = new Map<string, { startedAt: number; count: number }>();
  app.use("/mcp", (req, res, next) => {
    metrics.mcpRequests += 1;
    res.on("finish", () => { if (res.statusCode >= 400) metrics.rejectedRequests += 1; });
    const now = Date.now(); const key = req.ip ?? "unknown"; const current = requestWindows.get(key);
    if (!current && requestWindows.size >= MAX_TRACKED_CLIENTS) {
      for (const [ip, value] of requestWindows) if (now - value.startedAt >= RATE_LIMIT_WINDOW_MS) requestWindows.delete(ip);
      while (requestWindows.size >= MAX_TRACKED_CLIENTS) requestWindows.delete(requestWindows.keys().next().value as string);
    }
    const window = !current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS ? { startedAt: now, count: 0 } : current;
    window.count += 1; requestWindows.set(key, window);
    const resetSeconds = Math.max(1, Math.ceil((window.startedAt + RATE_LIMIT_WINDOW_MS - now) / 1000));
    res.set("RateLimit-Limit", String(RATE_LIMIT_MAX_REQUESTS)); res.set("RateLimit-Remaining", String(Math.max(0, RATE_LIMIT_MAX_REQUESTS - window.count))); res.set("RateLimit-Reset", String(resetSeconds));
    if (window.count > RATE_LIMIT_MAX_REQUESTS) {
      metrics.rateLimitedRequests += 1;
      res.set("Retry-After", String(resetSeconds));
      res.status(429).json({ jsonrpc: "2.0", error: { code: -32001, message: "Too many requests; retry after one minute" }, id: req.body?.id ?? null });
      return;
    }
    next();
  });
  // Apply the request limit before parsing so malformed and oversized bodies cannot bypass it.
  app.use(express.json({ limit: "64kb", strict: true }));

  app.get("/health", (_req, res) => res.json({
    ok: true,
    name: "say-family-notice",
    version: SERVICE_VERSION,
    uptime_seconds: Math.floor((Date.now() - startedAt) / 1000),
    privacy: { raw_notice_logging: false, maximum_case_retention_hours: CARD_TTL_HOURS },
    persistence: { cases: Boolean(process.env.CARD_STORE_PATH), anonymous_feedback: Boolean(process.env.IMPROVEMENT_STORE_PATH) },
    metrics: { ...metrics },
  }));
  app.post("/mcp", async (req, res) => {
    try {
      if (!req.is("application/json")) {
        res.status(415).json({ jsonrpc: "2.0", error: { code: -32600, message: "Content-Type must be application/json" }, id: null });
        return;
      }
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

  const errorHandler: ErrorRequestHandler = (error, req, res, _next) => {
    const status = typeof error === "object" && error !== null && "status" in error && error.status === 413 ? 413 : 400;
    const message = status === 413 ? "JSON request exceeds the 64kb limit" : "Invalid JSON request";
    res.status(status).json({ jsonrpc: "2.0", error: { code: status === 413 ? -32002 : -32700, message }, id: req.body?.id ?? null });
  };
  app.use(errorHandler);
  app.use((_req, res) => res.status(404).json({ error: "Not found" }));
  return app;
}
