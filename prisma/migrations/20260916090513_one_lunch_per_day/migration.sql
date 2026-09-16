-- Item 9: one live lunch per pupil per day.
-- Add mealDate (denormalised from MealOnDay), backfill it, clean up the
-- duplicates already present in live data (cancel the later ones, release
-- their seats, refund the second charge), then enforce the rule in the DB
-- with a partial unique index.

-- 1) add nullable, backfill from the join, the column can be required after
ALTER TABLE "Order" ADD COLUMN "mealDate" TIMESTAMP(3);

UPDATE "Order" o
SET "mealDate" = m."mealDate"
FROM "MealOnDay" m
WHERE m.id = o."mealOnDayId";

-- 2) keep the earliest live order per (student, day); cancel the rest.
--    A real (not temp) table keeps the ids across Prisma's statement
--    batching; the whole migration still runs in one transaction, so a
--    failure rolls this table and its updates back together.
CREATE TABLE "_duplicate_extra_orders" (id TEXT PRIMARY KEY);

INSERT INTO "_duplicate_extra_orders" (id)
SELECT id
FROM (
  SELECT id,
         row_number() OVER (
           PARTITION BY "studentId", "mealDate"
           ORDER BY "createdAt" ASC, id ASC
         ) AS rn
  FROM "Order"
  WHERE "status" NOT IN ('CANCELLED', 'AUTO_CANCELLED')
    AND "mealDate" IS NOT NULL
) q
WHERE q.rn > 1;

UPDATE "Order" o
SET "status" = 'CANCELLED'
FROM "_duplicate_extra_orders" d
WHERE o.id = d.id;

-- release the seats those extras held
UPDATE "MealOnDay" m
SET "orderCount" = "orderCount" - 1
FROM "Order" o
JOIN "_duplicate_extra_orders" d ON d.id = o.id
WHERE o."mealOnDayId" = m.id;

-- refund the second charge (one lunch per day; 550 = LUNCH_PRICE_CENTS)
UPDATE "Account" a
SET "balanceCents" = "balanceCents" + 550
FROM "Order" o
JOIN "_duplicate_extra_orders" d ON d.id = o.id
WHERE o."studentId" = a.id;

DROP TABLE "_duplicate_extra_orders";

-- 3) the column is populated everywhere, now it can be required
ALTER TABLE "Order" ALTER COLUMN "mealDate" SET NOT NULL;

-- 4) enforce the rule at the database: one live order per (student, day).
--    Cancelling drops the row out of the partial index, freeing the day.
CREATE UNIQUE INDEX "Order_one_live_order_per_student_day"
ON "Order"("studentId", "mealDate")
WHERE "status" NOT IN ('CANCELLED', 'AUTO_CANCELLED');

-- plain index for the day-scoped findFirst in POST /orders
CREATE INDEX "Order_studentId_mealDate_idx" ON "Order"("studentId", "mealDate");