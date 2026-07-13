import { createApp } from "./app.js";
import { feedbackStore } from "./core/feedbackStore.js";
import { store } from "./core/store.js";

await Promise.all([store.load(), feedbackStore.load()]);
const app = createApp();
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";
app.listen(port, host, () => console.log(`say-mcp listening on ${host}:${port}`));
