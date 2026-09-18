import { t } from "elysia";
import { db } from "../db";
import { requireAccount } from "../auth";
import { ApiError, createRouter } from "../errors";

/// Device tokens for the iOS app's notification switch.
///
/// The app (a WKWebView shell around the student site) asks iOS for a token
/// when the switch is turned on and posts it here. Until these routes existed
/// it posted into a 404 — and the client treats a failed registration as a
/// non-event, so the switch turned on, the phone asked for permission, and
/// nothing was ever delivered. Nobody was told.
///
/// REGISTER IS SENT ON EVERY LAUNCH, not once when the switch is flipped:
/// iOS reissues the token on reinstall, on a restore, and occasionally on its
/// own. So this upserts on the token rather than inserting, or one phone
/// accumulates dead rows.
///
/// `environment` decides which APNs host a push has to go to. A sandbox token
/// from a development build and a production token from TestFlight are not
/// interchangeable: sending to the wrong host is accepted and then silently
/// never arrives, which is the worst failure mode available. It is stored so
/// the sender can pick correctly.
///
/// NOTE ON SCOPE. Nothing here sends a notification. The phone already handles
/// the common case without a server at all — PushManager.swift schedules local
/// notifications from the server's own deadline — so APNs is only needed for
/// what the phone cannot predict (the menu changed, a day became a holiday,
/// credit was topped up). Collecting tokens now means that can be switched on
/// later without waiting for every pupil to reopen the app.
export const pushRoutes = createRouter()
  .post(
    "/push/register",
    async ({ headers, body }) => {
      const me = await requireAccount(headers);

      const token = String(body.token ?? "").trim();
      if (!token) {
        throw new ApiError(400, "VALIDATION", "Chýba token zariadenia");
      }
      // An APNs token is 64 hex characters today, but Apple has changed the
      // length before and says not to hard-code it. Bound it loosely so a
      // malformed body cannot write an unbounded string, and no tighter.
      if (token.length > 512) {
        throw new ApiError(400, "VALIDATION", "Token zariadenia je príliš dlhý");
      }

      const environment =
        body.environment === "sandbox" ? "sandbox" : "production";

      // Upsert on the token, not on (account, token): the same phone can be
      // handed to a sibling, and the row must follow the account that last
      // registered it rather than delivering that pupil's lunch reminders to
      // the previous one.
      await db.deviceToken.upsert({
        where: { token },
        update: {
          studentId: me.id,
          platform: "ios",
          environment,
        },
        create: {
          token,
          studentId: me.id,
          platform: "ios",
          environment,
        },
      });

      return { ok: true };
    },
    {
      body: t.Object({
        token: t.String(),
        platform: t.Optional(t.String()),
        environment: t.Optional(t.String()),
      }),
    },
  )
  .post(
    "/push/unregister",
    async ({ headers, body }) => {
      const me = await requireAccount(headers);
      const token = String(body.token ?? "").trim();

      // deleteMany, not delete: a token that is not there is the expected
      // result of switching off twice, or of switching off after a reinstall,
      // and none of those is an error worth showing anyone.
      //
      // Scoped to the signed-in account so one pupil cannot unregister
      // another's device by guessing a token.
      await db.deviceToken.deleteMany({
        where: { token, studentId: me.id },
      });

      return { ok: true };
    },
    {
      body: t.Object({
        token: t.String(),
      }),
    },
  );
