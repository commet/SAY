import type { Confidence } from "./types.js";

export function normalize(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

export function evidenceGate(rawText: string, value: string, quote?: string): Confidence {
  if (!quote) return "inferred";
  const source = normalize(rawText);
  const evidence = normalize(quote);
  if (source.includes(evidence)) return "confirmed";
  if (evidence.length > 20 && source.includes(evidence.slice(0, 10)) && source.includes(evidence.slice(-10))) return "confirmed";
  return value ? "inferred" : "inferred";
}
