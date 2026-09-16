import { config } from "../config";

/// No 0/O or 1/I/L — a code written on a paper slip survives being misread.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Single-use claim code a manager writes on a slip for a pupil. */
export function generateClaimCode(length = 8): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function claimExpiry(
  now = new Date(),
  ttlDays = config.claimCodeTtlDays,
): Date {
  return new Date(now.getTime() + ttlDays * 86_400_000);
}