const requestedHours = Number(process.env.CARD_TTL_HOURS ?? 24);
export const CARD_TTL_HOURS = Math.min(Math.max(Number.isFinite(requestedHours) ? requestedHours : 24, 1), 24);
export const CARD_TTL_MS = CARD_TTL_HOURS * 3600_000;

export function cardExpiresAt(now: Date): string {
  return new Date(now.getTime() + CARD_TTL_MS).toISOString();
}
