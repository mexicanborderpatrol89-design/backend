import { t } from "elysia";
import { db } from "../db";
import { signToken } from "../auth";
import { ApiError, createRouter } from "../errors";
import { hashPassword, verifyPassword } from "../lib/password";

/// The account shape /auth/login, /auth/claim and /me all return.
function accountDto(a: {
  id: string;
  name: string;
  username: string;
  role: string;
  classCode: string | null;
}) {
  return {
    id: a.id,
    name: a.name,
    username: a.username,
    role: a.role,
    classCode: a.classCode ?? null,
  };
}

/// Per-IP sliding window for the unauthenticated /auth/status probe,
/// so it cannot be used to brute-force usernames at scale.
const hitsByIp = new Map<string, number[]>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60_000;

function isRateLimited(ip: string, now: number): boolean {
  const recent = (hitsByIp.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hitsByIp.set(ip, recent);
    return true;
  }
  recent.push(now);
  hitsByIp.set(ip, recent);
  return false;
}

export const authRoutes = createRouter()
  .post(
    "/auth/login",
    async ({ body, set }) => {
      const account = await db.account.findUnique({
        where: { username: body.username },
      });
      if (
        !account ||
        !account.passwordHash ||
        !(await verifyPassword(body.password, account.passwordHash))
      ) {
        set.status = 401;
        return {
          error: "BAD_CREDENTIALS",
          message: "Nesprávne prihlasovacie údaje",
        };
      }
      if (!account.active) {
        set.status = 403;
        return { error: "INACTIVE", message: "Účet je deaktivovaný" };
      }
      return {
        token: await signToken(account.id),
        account: accountDto(account),
      };
    },
    {
      body: t.Object({
        username: t.String(),
        password: t.String(),
      }),
    },
  )
  .get(
    "/auth/status",
    async ({ query, request, set }) => {
      const ip =
        request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
      if (isRateLimited(ip, Date.now())) {
        set.status = 429;
        return {
          error: "RATE_LIMITED",
          message: "Príliš veľa pokusov, skúste to o chvíľu",
        };
      }
      // needsPassword is true only for an existing, active account with no
      // password. Unknown usernames answer false, so the endpoint cannot
      // be used to discover who has an account.
      const username = String(query.username ?? "").trim().toLowerCase();
      const account = await db.account.findUnique({
        where: { username },
        select: { active: true, passwordHash: true },
      });
      return {
        needsPassword: !!account && account.active && account.passwordHash === null,
      };
    },
    { query: t.Object({ username: t.String({ minLength: 1 }) }) },
  )
  .post(
    "/auth/claim",
    async ({ body, set }) => {
      const username = String(body.username ?? "").trim().toLowerCase();
      const account = await db.account.findUnique({ where: { username } });
      const now = new Date();

      if (!account || !account.active) {
        // Indistinguishable from a wrong code: same reply as a bad login.
        set.status = 401;
        return {
          error: "BAD_CREDENTIALS",
          message: "Nesprávne prihlasovacie údaje",
        };
      }
      if (account.passwordHash) {
        set.status = 409;
        return {
          error: "ALREADY_SET",
          message: "Tento účet už má heslo",
        };
      }
      const codeOk =
        body.claimCode.trim().toUpperCase() === account.claimCode &&
        account.claimCodeExpires !== null &&
        account.claimCodeExpires.getTime() > now.getTime();
      if (!codeOk) {
        set.status = 401;
        return {
          error: "BAD_CREDENTIALS",
          message: "Nesprávne prihlasovacie údaje",
        };
      }
      if (body.password.length < 4) {
        throw new ApiError(400, "VALIDATION", "Heslo musí mať aspoň 4 znaky");
      }

      await db.account.update({
        where: { id: account.id },
        data: {
          passwordHash: await hashPassword(body.password),
          claimCode: null,
          claimCodeExpires: null,
        },
      });

      return {
        token: await signToken(account.id),
        account: accountDto(account),
      };
    },
    {
      body: t.Object({
        username: t.String(),
        claimCode: t.String(),
        password: t.String(),
      }),
    },
  );