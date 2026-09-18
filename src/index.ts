import { Elysia } from "elysia";
import { cors } from "@elysia/cors";
import { config } from "./config";
import { meRoutes } from "./modules/me.routes";
import { authRoutes } from "./modules/auth.routes";
import { menuRoutes } from "./modules/menu.routes";
import { ordersRoutes } from "./modules/orders.routes";
import { announcementsRoutes } from "./modules/announcements.routes";
import { studentsRoutes } from "./modules/students.routes";
import { menuAdminRoutes } from "./modules/menu-admin.routes";
import { pushRoutes } from "./modules/push.routes";

const startedAt = new Map<Request, number>();

const app = new Elysia()
  .use(
    cors({
      origin: config.corsOrigins.includes("*")
        ? true
        : config.corsOrigins,
    }),
  )
  .onRequest(({ request }) => {
    startedAt.set(request, performance.now());
  })
  .onAfterHandle(({ request, set }) => {
    const ms = Math.round(performance.now() - (startedAt.get(request) ?? 0));
    startedAt.delete(request);
    console.log(
      `[${new Date().toISOString()}] ${request.method} ${new URL(request.url).pathname} -> ${set.status} (${ms}ms)`,
    );
  })
  .onError(({ request, set, error }) => {
    const ms = Math.round(performance.now() - (startedAt.get(request) ?? 0));
    startedAt.delete(request);
    console.error(
      `[${new Date().toISOString()}] ${request.method} ${new URL(request.url).pathname} -> ${set.status ?? 500} (${ms}ms) ${(error as Error | undefined)?.message ?? error}`,
    );
  })
  .use(authRoutes)
  .use(meRoutes)
  .use(menuRoutes)
  .use(ordersRoutes)
  .use(announcementsRoutes)
  .use(studentsRoutes)
  .use(menuAdminRoutes)
  .use(pushRoutes)
  .get("/health", () => ({ ok: true }))
  .get("/", () => ({
    name: "skyro-obedy-api",
    version: "0.1.0",
    endpoints: [
      "GET /health",
      "POST /auth/login",
      "GET /auth/status | POST /auth/claim",
      "GET /me",
      "GET /menu/today | /menu/week",
      "POST/PATCH/DELETE /orders",
      "GET /orders",
      "GET /announcements | POST /announcements",
      "POST /push/register | POST /push/unregister",
      "(manager)",
      "GET/PATCH /students",
      "POST /students",
      "POST /students/:id/topup",
      "POST /students/:id/password",
      "POST /orders/:id/serve",
      "GET /orders?format=csv",
      "PUT /menu/:date",
      "PATCH /school-days/:date",
    ],
  }));

if (config.port !== 0) {
  app.listen(config.port, () => {
    console.log(
      `Skyro Obedy API listening on http://${config.hostname}:${config.port}`,
    );
  });
}

export { app };