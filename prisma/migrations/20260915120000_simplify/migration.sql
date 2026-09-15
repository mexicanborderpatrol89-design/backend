-- Simplify for the hackathon build: drop ledger, order history, chat,
-- announcement read-receipts and the weekly template. Raw balance on Account.

-- Drop tables in dependency order.
DROP TABLE "Message";
DROP TABLE "Thread";
DROP TABLE "AnnouncementRead";
DROP TABLE "OrderEvent";
DROP TABLE "LedgerEntry";
DROP TABLE "WeeklyTemplate";

-- LedgerKind enum is now unused.
DROP TYPE "LedgerKind";

-- Add the raw integer balance to each account.
ALTER TABLE "Account" ADD COLUMN "balanceCents" INTEGER NOT NULL DEFAULT 0;

-- SchoolDay no longer needs per-day deadline overrides (deadline is always
-- the day before at 14:00) or the freeze flag (no background job sets it).
ALTER TABLE "SchoolDay" DROP COLUMN "orderDeadline";
ALTER TABLE "SchoolDay" DROP COLUMN "closedAt";