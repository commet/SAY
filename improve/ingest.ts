import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { eventToFeedback, parseImprovementEvent } from "../src/core/feedbackEvent.js";
import { emptyFeedbackSummary, FeedbackStore } from "../src/core/feedbackStore.js";

const [inputArg, outputArg] = process.argv.slice(2);
if (!inputArg || !outputArg) throw new Error("Usage: npm run improve:ingest -- events.log data/improvement-summary.json");
const input = resolve(inputArg);
const output = resolve(outputArg);
const marker = "say_improvement_event ";
const lines = readFileSync(input, "utf8").split(/\r?\n/);
const aggregate = new FeedbackStore(output);
let accepted = 0;
let rejected = 0;
for (const line of lines) {
  const markerAt = line.indexOf(marker);
  if (markerAt < 0) continue;
  try {
    const event = parseImprovementEvent(JSON.parse(line.slice(markerAt + marker.length)) as unknown);
    if (!event) { rejected += 1; continue; }
    aggregate.record(event.notice_type, eventToFeedback(event));
    accepted += 1;
  } catch { rejected += 1; }
}
if (accepted === 0) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(emptyFeedbackSummary(), null, 2), "utf8");
} else {
  await aggregate.flush();
}
console.log(JSON.stringify({ input, output, accepted_events: accepted, rejected_events: rejected, contains_raw_text: false, contains_case_codes: false }, null, 2));
if (rejected > 0) process.exitCode = 1;
