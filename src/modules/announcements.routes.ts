import { t } from "elysia";
import { requireAccount, requireManager } from "../auth";
import { db } from "../db";
import { createRouter } from "../errors";
import { smartTimeLabels } from "../lib/format";

/// Announcements are just a list — no read tracking. Student reads,
/// manager posts.
export const announcementsRoutes = createRouter()
  .get("/announcements", async ({ headers }) => {
    const me = await requireAccount(headers);
    const now = new Date();
    const posts = await db.announcement.findMany({
      include: { author: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return {
      announcements: posts.map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body,
        important: p.important,
        author: p.author.name,
        createdAt: p.createdAt.toISOString(),
        meta: smartTimeLabels(now, p.createdAt),
      })),
    };
  })
  .post(
    "/announcements",
    async ({ headers, body, set }) => {
      const manager = await requireManager(headers);
      const post = await db.announcement.create({
        data: {
          title: body.title,
          body: body.body,
          important: body.important ?? false,
          authorId: manager.id,
        },
      });
      set.status = 201;
      return { id: post.id };
    },
    {
      body: t.Object({
        title: t.String(),
        body: t.String(),
        important: t.Optional(t.Boolean()),
      }),
    },
  );