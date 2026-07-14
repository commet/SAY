import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { buildServer } from "../src/server.js";

interface EvalCase { text: string; }
const corpus = JSON.parse(readFileSync(new URL("./notices.json", import.meta.url), "utf8")) as EvalCase[];
const server = buildServer();
const client = new Client({ name: "say-performance-gate", version: "1.0.0" });
const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
await server.connect(serverTransport);
await client.connect(clientTransport);

async function call(index: number): Promise<number> {
  const started = performance.now();
  const result = await client.callTool({ name: "inspect_notice", arguments: { raw_text: corpus[index % corpus.length].text } });
  if (result.isError) throw new Error("Representative inspect_notice call failed");
  return performance.now() - started;
}

try {
  for (let index = 0; index < 20; index += 1) await call(index);
  const samples: number[] = [];
  for (let index = 0; index < 200; index += 1) samples.push(await call(index));
  const sorted = [...samples].sort((left, right) => left - right);
  const average = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const p99 = sorted[Math.ceil(sorted.length * 0.99) - 1];
  const metrics = {
    path: "MCP SDK validation + inspect_notice handler (in-memory transport)",
    samples: samples.length,
    average_ms: Number(average.toFixed(3)),
    p99_ms: Number(p99.toFixed(3)),
    maximum_ms: Number(sorted.at(-1)!.toFixed(3)),
    release_limits_ms: { average: 100, p99: 3000 },
    passed: average <= 100 && p99 <= 3000,
  };
  console.log(JSON.stringify(metrics, null, 2));
  if (!metrics.passed) process.exitCode = 1;
} finally {
  await client.close();
  await server.close();
}
