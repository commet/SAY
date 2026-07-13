import { createApp } from "./app.js";
import { feedbackStore } from "./core/feedbackStore.js";
import { store } from "./core/store.js";

await Promise.all([store.load(), feedbackStore.load()]);
const app = createApp();
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";
const httpServer = app.listen(port, host, () => console.log(`say-mcp listening on ${host}:${port}`));

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`say-mcp received ${signal}; flushing bounded stores`);
  let closed = false;
  const closePromise = new Promise<void>((resolve) => httpServer.close(() => { closed = true; resolve(); }));
  let timeout: NodeJS.Timeout | undefined;
  await Promise.race([closePromise, new Promise<void>((resolve) => { timeout = setTimeout(resolve, 10_000); })]);
  if (timeout) clearTimeout(timeout);
  if (!closed) httpServer.closeAllConnections();
  await Promise.all([store.flush(), feedbackStore.flush()]);
  process.exitCode = 0;
}

process.once("SIGTERM", () => { void shutdown("SIGTERM"); });
process.once("SIGINT", () => { void shutdown("SIGINT"); });
