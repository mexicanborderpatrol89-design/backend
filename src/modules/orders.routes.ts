import { t } from "elysia";
import { requireAccount, requireManager } from "../auth";
import { db } from "../db";
import { ApiError, createRouter } from "../errors";
import { dateKey, toLocalDay } from "../lib/dates";
import { dayFacts } from "../lib/menu";
import { LUNCH_PRICE_CENTS } from "../lib/pricing";
import { categoryLabel, STATUS_CHIP } from "../lib/format";

const mealSelect = {
  id: true,
  name: true,
  desc: true,
  category: true,
  tint: true,
  allergens: true,
  icon: true,
} as const;

/// Throws unless a meal may still be ordered right now.
function assertCanOrder(
  mealOnDay: {
    mealDate: Date;
    capacity: number;
    orderCount: number;
    day: { isServing: boolean };
  },
  now: Date,
): void {
  const facts = dayFacts(mealOnDay.day, mealOnDay.mealDate, now);
  // Not cooking is the only thing that closes a day now — there is no
  // deadline, so there is no second, time-based reason to be closed.
  if (facts.holiday) throw new ApiError(409, "DEADLINE", "V tento deň sa nevarí");
  if (mealOnDay.capacity > 0 && mealOnDay.orderCount >= mealOnDay.capacity)
    throw new ApiError(409, "SOLD_OUT", "Toto jedlo je vypredané");
}

/// Postgres said two rows would collide. The only unique left on Order is the
/// partial index "Order_one_live_order_per_student_day", so this can mean
/// exactly one thing: two requests raced and the other one won. It is a 409,
/// not a 500 — the pupil has a lunch, which is what they were asking for.
///
/// Before the partial index existed this path fired constantly, because a
/// cancelled row kept (studentId, mealOnDayId) occupied for the rest of the
/// day and every re-order of that dish hit it. That is fixed in the schema;
/// this is here so a genuine race is still answered in Slovak.
function asOrderConflict(err: unknown): never {
  const code = (err as { code?: string })?.code;
  if (code === "P2002") {
    throw new ApiError(
      409,
      "ALREADY_ORDERED",
      "Na tento deň už obed objednaný máte. Zmeňte ho namiesto objednávania ďalšieho.",
    );
  }
  throw err;
}

export const ordersRoutes = createRouter()
  .post(
    "/orders",
    async ({ headers, body, set }) => {
      const me = await requireAccount(headers);
      const now = new Date();

      const result = await db.$transaction(async (tx) => {
        const mealOnDay = await tx.mealOnDay.findUnique({
          where: { id: body.mealOnDayId },
          include: { day: true },
        });
        if (!mealOnDay) throw new ApiError(404, "NOT_FOUND", "Jedlo sa nenašlo");
        assertCanOrder(mealOnDay, now);

        const existing = await tx.order.findFirst({
          where: {
            studentId: me.id,
            mealDate: mealOnDay.mealDate,
            status: { notIn: ["CANCELLED", "AUTO_CANCELLED"] },
          },
        });
        // Same dish again -> idempotent re-confirm, charged once.
        if (existing?.mealOnDayId === mealOnDay.id) return existing;
        // A different dish on the same day is a change, not a second lunch.
        // Changing goes through PATCH /orders/:id, which moves the seat
        // without moving money.
        if (existing) {
          throw new ApiError(
            409,
            "ALREADY_ORDERED",
            "Na tento deň už obed objednaný máte. Zmeňte ho namiesto objednávania ďalšieho.",
          );
        }

        const account = await tx.account.findUnique({ where: { id: me.id } });
        if (!account) throw new ApiError(401, "UNAUTHORIZED", "Prihláste sa");
        if (account.balanceCents < LUNCH_PRICE_CENTS)
          throw new ApiError(
            402,
            "INSUFFICIENT_FUNDS",
            `Na obed nemáte dosť kreditu. Chýba ${((LUNCH_PRICE_CENTS - account.balanceCents) / 100)
              .toFixed(2)
              .replace(".", ",")} € — požiadajte vedúcu jedálne o dobitie.`,
          );
        if (!account.active)
          throw new ApiError(403, "FORBIDDEN", "Účet je deaktivovaný");

        await tx.account.update({
          where: { id: me.id },
          data: { balanceCents: { decrement: LUNCH_PRICE_CENTS } },
        });
        await tx.mealOnDay.update({
          where: { id: mealOnDay.id },
          data: { orderCount: { increment: 1 } },
        });
        return tx.order.create({
          data: {
            studentId: me.id,
            mealOnDayId: mealOnDay.id,
            mealDate: mealOnDay.mealDate,
            status: "ORDERED",
          },
        });
      }).catch(asOrderConflict);

      set.status = 201;
      return { id: result.id, status: result.status };
    },
    { body: t.Object({ mealOnDayId: t.String() }) },
  )
  .patch(
    "/orders/:id",
    async ({ headers, params, body }) => {
      const me = await requireAccount(headers);
      const now = new Date();

      const result = await db.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: params.id },
          include: { mealOnDay: true },
        });
        if (!order || order.studentId !== me.id)
          throw new ApiError(404, "NOT_FOUND", "Objednávka sa nenašla");
        if (order.status === "SERVED" || order.status === "CANCELLED")
          throw new ApiError(409, "DEADLINE", "Objednávku už nemožno zmeniť");

        const target = await tx.mealOnDay.findUnique({
          where: { id: body.mealOnDayId },
          include: { day: true },
        });
        if (!target) throw new ApiError(404, "NOT_FOUND", "Jedlo sa nenašlo");
        if (target.mealDate.getTime() !== order.mealOnDay.mealDate.getTime())
          throw new ApiError(400, "BAD_REQUEST", "Zmenu je možné vykonať len na ten istý deň");
        assertCanOrder(target, now);
        if (target.id === order.mealOnDayId) return order;

        await tx.mealOnDay.update({
          where: { id: order.mealOnDayId },
          data: { orderCount: { decrement: 1 } },
        });
        await tx.mealOnDay.update({
          where: { id: target.id },
          data: { orderCount: { increment: 1 } },
        });
        return tx.order.update({
          where: { id: order.id },
          data: { mealOnDayId: target.id },
        });
      }).catch(asOrderConflict);

      return { id: result.id, status: result.status };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ mealOnDayId: t.String() }),
    },
  )
  .delete(
    "/orders/:id",
    async ({ headers, params }) => {
      const me = await requireAccount(headers);
      const now = new Date();

      const result = await db.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: params.id },
          include: { mealOnDay: { include: { day: true } } },
        });
        if (!order || order.studentId !== me.id)
          throw new ApiError(404, "NOT_FOUND", "Objednávka sa nenašla");
        if (order.status === "CANCELLED") return order;
        if (order.status === "SERVED")
          throw new ApiError(409, "SERVED", "Obed bol vydaný, nemožno zrušiť");

        // CANCELLING IS ALWAYS ALLOWED up to the moment the lunch is served,
        // and SERVED is already refused above. There is no deadline to miss.
        //
        // This used to also refuse when the day was not open, which now means
        // one thing only: the manager has declared a holiday. Refusing then
        // trapped a pupil holding a lunch they had paid for, on a day nobody
        // is cooking, under the message "the deadline has passed". A holiday
        // is exactly when a refund should be easiest to get.

        await tx.mealOnDay.update({
          where: { id: order.mealOnDayId },
          data: { orderCount: { decrement: 1 } },
        });
        await tx.account.update({
          where: { id: me.id },
          data: { balanceCents: { increment: LUNCH_PRICE_CENTS } },
        });
        return tx.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED" },
        });
      });

      return { id: result.id, status: result.status };
    },
    { params: t.Object({ id: t.String() }) },
  )
  .get(
    "/orders",
    async ({ headers, query }) => {
      const account = await requireAccount(headers);
      const now = new Date();

      if (account.role === "MANAGER") {
        const date = query.date ? new Date(`${query.date}T00:00:00Z`) : toLocalDay(now);
        const orders = await db.order.findMany({
          where: {
            mealOnDay: { mealDate: date },
            ...(query.status ? { status: query.status } : {}),
          },
          include: {
            student: { select: { name: true, classCode: true } },
            mealOnDay: { include: { meal: { select: { name: true } } } },
          },
          orderBy: [{ mealOnDay: { slot: "asc" } }, { student: { name: "asc" } }],
        });

        if (query.format === "csv") {
          const csv = [
            "Meno;Trieda;Obed;Jedlo;Stav",
            ...orders.map(
              (o) =>
                `${o.student.name};${o.student.classCode ?? ""};${o.mealOnDay.slot};"${o.mealOnDay.meal.name.replaceAll('"', '""')}";${STATUS_CHIP[o.status].l}`,
            ),
          ].join("\n");
          return new Response(csv, {
            headers: {
              "content-type": "text/csv; charset=utf-8",
              "content-disposition": "attachment; filename=vydaj.csv",
            },
          });
        }

        return {
          date: dateKey(date),
          count: orders.length,
          orders: orders.map((o) => ({
            id: o.id,
            student: o.student.name,
            classCode: o.student.classCode ?? null,
            slot: o.mealOnDay.slot,
            meal: o.mealOnDay.meal.name,
            status: o.status,
            chip: STATUS_CHIP[o.status],
          })),
        };
      }

      const orders = await db.order.findMany({
        where: { studentId: account.id, status: { not: "CANCELLED" } },
        include: {
          mealOnDay: {
            include: { meal: { select: { ...mealSelect, name: true, category: true } } },
          },
        },
        orderBy: { mealOnDay: { mealDate: "desc" } },
      });

      return {
        count: orders.length,
        orders: orders.map((o) => ({
          id: o.id,
          mealOnDayId: o.mealOnDayId,
          date: dateKey(o.mealOnDay.mealDate),
          slot: o.mealOnDay.slot,
          meal: {
            id: o.mealOnDay.meal.id,
            name: o.mealOnDay.meal.name,
            category: categoryLabel(o.mealOnDay.meal.category),
          },
          status: o.status,
          chip: STATUS_CHIP[o.status],
        })),
      };
    },
    {
      query: t.Object({
        date: t.Optional(t.String()),
        status: t.Optional(
          t.Enum({
            ORDERED: "ORDERED",
            CHANGED: "CHANGED",
            CANCELLED: "CANCELLED",
            SERVED: "SERVED",
            AUTO_CANCELLED: "AUTO_CANCELLED",
          }),
        ),
        format: t.Optional(t.Enum({ csv: "csv" })),
      }),
    },
  )
  .post(
    "/orders/:id/serve",
    async ({ headers, params }) => {
      await requireManager(headers);
      const result = await db.$transaction(async (tx) => {
        const order = await tx.order.findUnique({ where: { id: params.id } });
        if (!order) throw new ApiError(404, "NOT_FOUND", "Objednávka sa nenašla");
        if (order.status === "SERVED") return order;
        if (order.status === "CANCELLED")
          throw new ApiError(409, "CANCELLED", "Objednávka je zrušená");
        return tx.order.update({
          where: { id: order.id },
          data: { status: "SERVED" },
        });
      });
      return { id: result.id, status: result.status };
    },
    { params: t.Object({ id: t.String() }) },
  );