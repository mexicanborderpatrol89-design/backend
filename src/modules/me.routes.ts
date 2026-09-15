import { requireAccount } from "../auth";
import { createRouter } from "../errors";

/// GET /me — profile + raw balance for the signed-in account.
export const meRoutes = createRouter().get("/me", async ({ headers }) => {
  const me = await requireAccount(headers);
  return {
    id: me.id,
    name: me.name,
    username: me.username,
    role: me.role,
    classCode: me.classCode ?? null,
    active: me.active,
    balanceCents: me.balanceCents,
  };
});