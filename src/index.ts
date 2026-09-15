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

const app = new Elysia()
  .use(
    cors({
      origin: config.corsOrigins.includes("*")
        ? true
        : config.corsOrigins,
    }),
  )
  .use(authRoutes)
  .use(meRoutes)
  .use(menuRoutes)
  .use(ordersRoutes)
  .use(announcementsRoutes)
  .use(studentsRoutes)
  .use(menuAdminRoutes)
  .get("/health", () => ({ ok: true }))
  .get("/", () => ({
    name: "skyro-obedy-api",
    version: "0.1.0",
    endpoints: [
      "GET /health",
      "POST /auth/login",
      "GET /me",
      "GET /menu/today | /menu/week",
      "POST/PATCH/DELETE /orders",
      "GET /orders",
      "GET /announcements | POST /announcements",
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