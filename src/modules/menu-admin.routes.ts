import { t } from "elysia";
import { requireManager } from "../auth";
import { db } from "../db";
import { ApiError, createRouter } from "../errors";
import { dateKey } from "../lib/dates";
import { mealRowDto } from "./menu.routes";
import { MealCategory } from "../generated/prisma/client";

/// Accepts only a YYYY-MM-DD date and normalises it to UTC midnight —
/// the same civil-day key the read routes use as SchoolDay.mealDate.
function parseDateParam(raw: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/// Manager write side of the menu. A day is a list, so one PUT replaces it.
export const menuAdminRoutes = createRouter()
  .put(
    "/menu/:date",
    async ({ headers, params, body }) => {
      await requireManager(headers);
      const target = parseDateParam(params.date);
      if (!target) {
        throw new ApiError(
          400,
          "VALIDATION",
          "Neplatný dátum — použite RRRR-MM-DD",
        );
      }
      const key = dateKey(target);

      const existingRows = await db.mealOnDay.findMany({
        where: { mealDate: target },
        include: { meal: true },
      });
      const existingByModId = new Map(
        existingRows.map((r) => [r.id, r]),
      );

      const parsed = body.meals.map((m) => ({
        mealOnDayId: m.mealOnDayId || null,
        old: m.mealOnDayId ? existingByModId.get(m.mealOnDayId) ?? null : null,
        name: m.name.trim(),
        desc: m.desc.trim(),
        category: m.category,
        allergens: m.allergens,
        capacity: m.capacity,
      }));

      // A mealOnDayId we do not recognise is a stale client, not new input.
      for (const r of parsed) {
        if (r.mealOnDayId && !r.old) {
          throw new ApiError(
            400,
            "VALIDATION",
            "Niektoré mealOnDayId už neexistuje. Obnovte menu a skúste znova.",
          );
        }
      }

      // Dropping a row that still has orders would orphan real pupils.
      const keptIds = new Set(
        parsed.filter((r) => r.old).map((r) => r.mealOnDayId!),
      );
      const removed = existingRows.filter((r) => !keptIds.has(r.id));
      const blocked = removed.find((r) => r.orderCount > 0);
      if (blocked) {
        throw new ApiError(
          409,
          "CONFLICT",
          `„${blocked.meal.name}“ má ${blocked.orderCount} objednávok — nemožno ho vyradiť z menu`,
        );
      }

      // A surviving row's capacity cannot drop below what is already ordered.
      for (const r of parsed) {
        if (r.old && r.capacity < r.old.orderCount) {
          throw new ApiError(
            409,
            "CONFLICT",
            `Kapacita „${r.name}“ nesmie byť nižšia ako jej ${r.old.orderCount} objednávok`,
          );
        }
      }

      const survivors = parsed.filter((r) => r.old);
      const fresh = parsed.filter((r) => !r.old);
      const deadIds = removed.map((r) => r.id);

      const after = await db.$transaction(
        async (tx) => {
          await tx.schoolDay.upsert({
            where: { mealDate: target },
            update: {},
            create: { mealDate: target },
          });

          // Park survivors at negative slots so the renumber cannot collide
          // with the unique (mealDate, slot).
          await Promise.all(
            survivors.map(async (r, i) => {
              const old = r.old!;
              await tx.meal.update({
                where: { id: old.mealId },
                data: {
                  name: r.name,
                  desc: r.desc,
                  category: r.category,
                  allergens: r.allergens,
                  icon: old.meal.icon,
                  tint: old.meal.tint,
                },
              });
              await tx.mealOnDay.update({
                where: { id: old.id },
                data: { slot: -1000 - i, capacity: r.capacity },
              });
            }),
          );

          // Removed rows carry no orders (guarded above) — safe to drop.
          if (deadIds.length) {
            await tx.mealOnDay.deleteMany({ where: { id: { in: deadIds } } });
          }

          // Final slots for survivors.
          await Promise.all(
            survivors.map(async (r, i) =>
              tx.mealOnDay.update({
                where: { id: r.mealOnDayId! },
                data: { slot: i + 1 },
              }),
            ),
          );

          // Brand-new rows.
          for (let j = 0; j < fresh.length; j++) {
            const r = fresh[j];
            const meal = await tx.meal.create({
              data: {
                name: r.name,
                desc: r.desc,
                category: r.category,
                allergens: r.allergens,
                icon: "",
                tint: "",
              },
            });
            await tx.mealOnDay.create({
              data: {
                mealDate: target,
                mealId: meal.id,
                slot: survivors.length + 1 + j,
                capacity: r.capacity,
                orderCount: 0,
              },
            });
          }

          return tx.mealOnDay.findMany({
            where: { mealDate: target },
            include: { meal: true },
            orderBy: { slot: "asc" },
          });
        },
        { timeout: 30_000 },
      );

      return {
        date: key,
        meals: after.map((m) =>
          mealRowDto({
            ...m.meal,
            mealOnDayId: m.id,
            slot: m.slot,
            capacity: m.capacity,
            orderCount: m.orderCount,
          }),
        ),
      };
    },
    {
      params: t.Object({ date: t.String() }),
      body: t.Object({
        meals: t.Array(
          t.Object({
            mealOnDayId: t.Optional(t.String()),
            name: t.String({ minLength: 1 }),
            desc: t.String(),
            category: t.Enum(MealCategory),
            allergens: t.Array(t.String()),
            capacity: t.Integer({ minimum: 0 }),
          }),
        ),
      }),
    },
  )
  .patch(
    "/school-days/:date",
    async ({ headers, params, body }) => {
      await requireManager(headers);
      const target = parseDateParam(params.date);
      if (!target) {
        throw new ApiError(
          400,
          "VALIDATION",
          "Neplatný dátum — použite RRRR-MM-DD",
        );
      }
      const row = await db.schoolDay.upsert({
        where: { mealDate: target },
        update: { isServing: body.isServing },
        create: { mealDate: target, isServing: body.isServing },
      });
      return { date: dateKey(row.mealDate), isServing: row.isServing };
    },
    {
      params: t.Object({ date: t.String() }),
      body: t.Object({ isServing: t.Boolean() }),
    },
  );