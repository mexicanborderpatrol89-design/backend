import { config } from "../config";

/// Server-side single source of truth for the lunch price, in integer cents.
/// Matches src/shared/lib/pricing.ts (LUNCH_PRICE = 5.5) exactly.
export const LUNCH_PRICE_CENTS = config.lunchPriceCents;

/** Slovak display format: 5,50 € — mirrors the frontend `eur()` helper. */
export function eur(cents: number): string {
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(cents) / 100;
  return `${sign}${abs.toFixed(2).replace(".", ",")} €`;
}

/** How many lunches a balance still covers. */
export function lunchesLeft(balanceCents: number): number {
  return Math.max(0, Math.floor(balanceCents / LUNCH_PRICE_CENTS));
}