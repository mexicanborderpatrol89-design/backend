import { Elysia, t } from "elysia";
import { db } from "../db";
import { signToken } from "../auth";
import { createRouter } from "../errors";
import { md5 } from "../lib/password";

/// POST /auth/login — username + password, returns a Bearer token.
export const authRoutes = createRouter().post(
  "/auth/login",
  async ({ body, set }) => {
    const account = await db.account.findUnique({
      where: { username: body.username },
    });
    if (!account || !account.passwordHash || account.passwordHash !== md5(body.password)) {
      set.status = 401;
      return { error: "BAD_CREDENTIALS", message: "Nesprávne prihlasovacie údaje" };
    }
    if (!account.active) {
      set.status = 403;
      return { error: "INACTIVE", message: "Účet je deaktivovaný" };
    }
    return {
      token: await signToken(account.id),
      account: {
        id: account.id,
        name: account.name,
        username: account.username,
        role: account.role,
        classCode: account.classCode ?? null,
      },
    };
  },
  {
    body: t.Object({
      username: t.String(),
      password: t.String(),
    }),
  },
);