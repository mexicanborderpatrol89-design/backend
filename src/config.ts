import "dotenv/config";

/// Central env access — everything the app needs, typed once.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  hostname: process.env.HOSTNAME ?? "0.0.0.0",

  databaseUrl: process.env.DATABASE_URL ?? "",

  /// Secret used to sign/verify login JWTs. Generate with: openssl rand -hex 32
  authSecret: process.env.AUTH_SECRET ?? "",

  // Comma-separated list of allowed CORS origins.
  corsOrigins: (process.env.CORS_ORIGINS ?? "*").split(",").map((s) => s.trim()),

  // NO ORDERING DEADLINE SETTING. Ordering is 24/7 and there is nothing to
  // configure: a day is orderable whenever the canteen is cooking. The old
  // DEFAULT_DEADLINE_HOUR is gone rather than defaulted, so it cannot be set
  // in an environment and quietly bring a cut-off back.

  // How long a generated claim code stays valid.
  claimCodeTtlDays: Number(process.env.CLAIM_CODE_TTL_DAYS ?? 7),

  // The one price, in cents. Single source of truth server-side.
  lunchPriceCents: Number(process.env.LUNCH_PRICE_CENTS ?? 550),
} as const;

export function requireDatabaseUrl() {
  if (!config.databaseUrl) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and point it at your Supabase Postgres.",
    );
  }
  return config.databaseUrl;
}