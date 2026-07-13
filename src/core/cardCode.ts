import { randomBytes } from "node:crypto";
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function cardCode(): string {
  const compact = Array.from(randomBytes(16), (byte) => alphabet[byte % alphabet.length]).join("");
  return `SAY-${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8, 12)}-${compact.slice(12)}`;
}
export function normalizeCode(value: string): string {
  const cleaned = value.trim().toUpperCase().replace(/\s/g, "");
  return cleaned.startsWith("SAY-") ? cleaned : `SAY-${cleaned.replace(/^SAY/, "")}`;
}
