import { t } from "elysia";
import { requireManager } from "../auth";
import { db } from "../db";
import { ApiError, createRouter } from "../errors";
import { hashPassword } from "../lib/password";

export const studentsRoutes = createRouter()
  .post(
    "/students",
    async ({ headers, body, set }) => {
      await requireManager(headers);
      const name = String(body.name ?? "").trim();
      const username = String(body.username ?? "").trim().toLowerCase();
      const password = String(body.password ?? "");
      if (!name || !username) {
        throw new ApiError(
          400,
          "VALIDATION",
          "Meno a používateľské meno sú povinné",
        );
      }
      if (password.length < 4) {
        throw new ApiError(
          400,
          "VALIDATION",
          "Heslo musí mať aspoň 4 znaky",
        );
      }
      const taken = await db.account.findUnique({ where: { username } });
      if (taken) {
        throw new ApiError(
          409,
          "VALIDATION",
          `Používateľské meno ${username} je už obsadené`,
        );
      }
      const student = await db.account.create({
        data: {
          role: "STUDENT",
          name,
          username,
          classCode: body.classCode?.trim() || null,
          active: true,
          balanceCents: 0,
          passwordHash: await hashPassword(password),
        },
        select: {
          id: true,
          name: true,
          username: true,
          classCode: true,
          active: true,
          balanceCents: true,
        },
      });
      set.status = 201;
      return student;
    },
    {
      body: t.Object({
        name: t.String(),
        username: t.String(),
        classCode: t.Optional(t.String()),
        password: t.String(),
      }),
    },
  )
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
  )
  .post(
    "/students/:id/password",
    async ({ headers, params, body }) => {
      await requireManager(headers);
      const student = await db.account.findFirst({
        where: { id: params.id, role: "STUDENT" },
      });
      if (!student) throw new ApiError(404, "NOT_FOUND", "Študent sa nenašiel");
      if (String(body.password).length < 4) {
        throw new ApiError(
          400,
          "VALIDATION",
          "Heslo musí mať aspoň 4 znaky",
        );
      }
      await db.account.update({
        where: { id: params.id },
        data: { passwordHash: await hashPassword(body.password) },
      });
      return { id: student.id };
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({ password: t.String() }),
    },
  );