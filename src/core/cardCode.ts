import { createHash } from "node:crypto";
import { normalize } from "./evidenceGate.js";
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function cardCode(rawText: string, salt = ""): string {
  const bytes = createHash("sha256").update(normalize(rawText) + salt).digest();
  return `SAY-${Array.from(bytes.subarray(0, 6), (b) => alphabet[b % alphabet.length]).join("")}`;
}
export function normalizeCode(value: string): string {
  const cleaned = value.trim().toUpperCase().replace(/\s/g, "");
  return cleaned.startsWith("SAY-") ? cleaned : `SAY-${cleaned.replace(/^SAY/, "")}`;
}
