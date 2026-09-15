import { t } from "elysia";
import { requireAccount } from "../auth";
import { db } from "../db";
import { createRouter } from "../errors";
import { dateKey, schoolWeek, toLocalDay } from "../lib/dates";
import { dayFacts } from "../lib/menu";
import { categoryLabel, dateLabel, dayNameLabel, dayShort } from "../lib/format";

function mealDto(m: {
  id: string;
  name: string;
  desc: string;
  category: import("../generated/prisma/client").MealCategory;
  tint: string;
  allergens: string[];
  icon: string;
}) {
  return {
    id: m.id,
    name: m.name,
    desc: m.desc,
    category: categoryLabel(m.category),
    tint: m.tint,
    allergens: m.allergens,
    icon: m.icon,
  };
}

function dayWrap(d: Date, day: { isServing: boolean } | null, now: Date) {
  const key = dateKey(d);
  const facts = dayFacts(day, d, now);
  return {
    key,
    label: dayNameLabel(d),
    isServing: day ? day.isServing : true,
    open: facts.open,
    deadline: facts.deadline.toISOString(),
  };
}

/// GET /menu/today — today's MealOnDay list + my order.
export const menuRoutes = createRouter()
  .get(
    "/menu/today",
    async ({ headers, query }) => {
      const me = await requireAccount(headers);
      const now = new Date();
      const today = query.date
        ? new Date(`${query.date}T00:00:00Z`)
        : toLocalDay(now);

      const [day, mealOnDay, orders] = await Promise.all([
        db.schoolDay.findUnique({ where: { mealDate: today } }),
        db.mealOnDay.findMany({
          where: { mealDate: today },
          include: { meal: true },
          orderBy: { slot: "asc" },
        }),
        db.order.findMany({
          where: { studentId: me.id, mealOnDay: { mealDate: today } },
          include: { mealOnDay: true },
        }),
      ]);

      const wrapper = dayWrap(today, day, now);
      const meals = mealOnDay.map((m) => ({
        mealOnDayId: m.id,
        slot: m.slot,
        ...mealDto(m.meal),
        capacity: m.capacity,
        orderCount: m.orderCount,
        orderedByMe: orders.some((o) => o.mealOnDayId === m.id),
      }));

      const mine = orders[0];
      const meal = mine?.mealOnDayId
        ? mealOnDay.find((m) => m.id === mine.mealOnDayId)?.meal
        : null;

      return {
        day: wrapper,
        meals,
        myOrder: mine
          ? {
              mealOnDayId: mine.mealOnDayId,
              slot: mine.mealOnDay.slot,
              meal: meal ? mealDto(meal) : null,
              status: mine.status,
            }
          : null,
        balanceCents: me.balanceCents,
      };
    },
    {
      query: t.Object({ date: t.Optional(t.String()) }),
    },
  )
  .get(
    "/menu/week",
    async ({ headers, query }) => {
      const me = await requireAccount(headers);
      const now = new Date();
      const base = query.monday ? new Date(`${query.monday}T00:00:00Z`) : now;
      const week = schoolWeek(base);

      const [days, mealOnDays, orders] = await Promise.all([
        db.schoolDay.findMany({ where: { mealDate: { in: week } } }),
        db.mealOnDay.findMany({
          where: { mealDate: { in: week } },
          include: { meal: true },
          orderBy: [{ mealDate: "asc" }, { slot: "asc" }],
        }),
        db.order.findMany({
          where: { studentId: me.id, mealOnDay: { mealDate: { in: week } } },
          include: { mealOnDay: true },
        }),
      ]);

      const dayByKey = new Map(days.map((d) => [dateKey(d.mealDate), d]));

      return {
        monday: dateKey(week[0]),
        days: week.map((d) => {
          const key = dateKey(d);
          const day = dayByKey.get(key) ?? null;
          const wrapper = dayWrap(d, day, now);
          const rows = mealOnDays.filter((m) => dateKey(m.mealDate) === key);
          const order = orders.find(
            (o) => dateKey(o.mealOnDay.mealDate) === key,
          );
          return {
            ...wrapper,
            weekday: dayShort(key),
            dateNumber: d.getUTCDate(),
            shortLabel: dateLabel(key),
            meals: rows.map((m) => ({
              mealOnDayId: m.id,
              slot: m.slot,
              ...mealDto(m.meal),
              capacity: m.capacity,
              orderCount: m.orderCount,
            })),
            myOrder: order
              ? {
                  mealOnDayId: order.mealOnDayId,
                  slot: order.mealOnDay.slot,
                  meal: rows.find((m) => m.id === order.mealOnDayId)?.meal
                    ? mealDto(rows.find((m) => m.id === order.mealOnDayId)!.meal)
                    : null,
                  status: order.status,
                }
              : null,
          };
        }),
      };
    },
    {
      query: t.Object({ monday: t.Optional(t.String()) }),
    },
  );