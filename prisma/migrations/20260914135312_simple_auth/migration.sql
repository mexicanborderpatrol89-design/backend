-- Replace Supabase-OAuth account fields with simple username + password.

-- Drop the Supabase auth link.
ALTER TABLE "Account" DROP COLUMN "authId";

-- Add the new login fields (nullable first so the existing rows survive).
ALTER TABLE "Account" ADD COLUMN "username" TEXT;
ALTER TABLE "Account" ADD COLUMN "passwordHash" TEXT;

-- Backfill username from the old email local-part, then enforce invariants.
UPDATE "Account" SET "username" = split_part(email, '@', 1);

ALTER TABLE "Account" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");

-- Email is gone — usernames and passwords only.
ALTER TABLE "Account" DROP COLUMN "email";