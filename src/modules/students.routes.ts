import { t } from "elysia";
import { requireManager } from "../auth";
import { db } from "../db";
import { ApiError, createRouter } from "../errors";

export const studentsRoutes = createRouter()
  .get(
    "/students",
    async ({ headers, query }) => {
      await requireManager(headers);
      const students = await db.account.findMany({
        where: {
          role: "STUDENT",
          ...(query.q
            ? {
                OR: [
                  { name: { contains: query.q, mode: "insensitive" } },
                  { username: { contains: query.q, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          username: true,
          classCode: true,
          active: true,
          balanceCents: true,
        },
      });
      return { count: students.length, students };
    },
    { query: t.Object({ q: t.Optional(t.String()) }) },
  )
  .patch(
    "/students/:id",
    async ({ headers, params, body }) => {
      await requireManager(headers);
      const student = await db.account.findFirst({
        where: { id: params.id, role: "STUDENT" },
      });
      if (!student) throw new ApiError(404, "NOT_FOUND", "Študent sa nenašiel");
      const updated = await db.account.update({
        where: { id: params.id },
        data: { active: body.active },
        select: { id: true, active: true, balanceCents: true },
      });
      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ active: t.Boolean() }),
    },
  )
  .post(
    "/students/:id/topup",
    async ({ headers, params, body }) => {
      await requireManager(headers);
      const student = await db.account.findFirst({
        where: { id: params.id, role: "STUDENT" },
      });
      if (!student) throw new ApiError(404, "NOT_FOUND", "Študent sa nenašiel");
      const updated = await db.account.update({
        where: { id: params.id },
        data: { balanceCents: { increment: body.amountCents } },
        select: { id: true, balanceCents: true },
      });
      return updated;
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ amountCents: t.Integer({ minimum: 1 }) }),
    },
  );