import { randomBytes } from "node:crypto";
const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function cardCode(): string {
  const compact = Array.from(randomBytes(12), (byte) => alphabet[byte & 31]).join("");
  return `SAY-${compact.slice(0, 4)}-${compact.slice(4, 8)}-${compact.slice(8)}`;
}
export function normalizeCode(value: string): string {
  const cleaned = value.trim().toUpperCase().replace(/\s/g, "");
  return cleaned.startsWith("SAY-") ? cleaned : `SAY-${cleaned.replace(/^SAY/, "")}`;
}
