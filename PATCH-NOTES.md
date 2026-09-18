# Patch notes — 24/7 ordering, push tokens, and the cancelled-dish 500

Everything in this patch, why it is here, and how it was verified. Written
against **`782b562`** ("Orders: one lunch per pupil per day").

Three changes:

| | what | urgency |
|---|---|---|
| **10** | The ordering deadline is deleted — no cut-off, no setting | the school's decision |
| **11** | `POST /push/register` / `/push/unregister` + a `DeviceToken` table | the iOS switch currently posts into a 404 |
| **12** | A dish cancelled earlier the same day could never be ordered again — answered `500` | **live bug, reported from the app** |

---

## Applying it

```bash
bunx prisma generate
bunx prisma migrate deploy
bun run src/index.ts
```

`migrate deploy`, not `migrate dev` — both migration files are already written,
and `dev` would try to author a third.

**No environment variable needs changing.** `DEFAULT_DEADLINE_HOUR` no longer
exists in the code, so whatever is sitting in the deployed `.env` is simply
ignored. You may as well delete the line.

---

## 10 — There is no ordering deadline. At all.

Not 08:00, not midnight, not a setting. The deadline is **deleted**, not
switched off:

- `atSchoolHour`, `defaultDeadline`, `secondsUntil` and `isOrderingOpen` are
  gone from `src/lib/dates.ts`.
- `DEFAULT_DEADLINE_HOUR` is gone from `src/config.ts` and `.env.example`, so it
  cannot be set in an environment and quietly bring a cut-off back.
- `dayFacts()` in `src/lib/menu.ts` is now one line of logic:

```ts
open: isServing,
```

A day is orderable whenever the canteen is cooking — any hour, any date, past
or future.

`day.deadline` and `day.secondsUntil` are kept in the response as `null` rather
than removed, so no client breaks on a missing key. They are not computed and
they decide nothing.

### Two things this exposed

Once `open` means only "is cooking", two branches that used to read as
"deadline passed" changed meaning, and both were wrong:

1. **`assertCanOrder` had an unreachable branch.** `if (!facts.open)` after
   `if (facts.holiday)` can no longer fire. Removed.

2. **Cancelling was refused on a holiday.** The cancel path checked
   `!facts.open` and answered *"Uzávierka objednávok uplynula"*. That now means
   one thing only: the manager declared a holiday — and it trapped a pupil
   holding a lunch they had already paid for, on a day nobody is cooking, under
   a message about a deadline that no longer exists. **Cancelling is now always
   allowed up to the moment the lunch is served** (`SERVED` is still refused
   separately), so a holiday is exactly when a refund is easiest to get.

### What still refuses an order

None of these is a clock:

| refusal | when |
|---|---|
| `V tento deň sa nevarí` | the canteen is not cooking that day |
| `Toto jedlo je vypredané` | that dish hit its portion limit |
| `Na obed nemáte dosť kreditu` | balance under 5,50 € |
| `Účet je deaktivovaný` | the account is switched off |
| `Na tento deň už obed objednaný máte` | change the existing lunch instead of adding a second |

### The consequence, on the record

With no deadline a pupil can order a lunch for a day the kitchen has already
cooked and served — including days long past — and is charged 5,50 € for a
portion that was never made. This was raised twice and the school chose it
anyway. Putting a cut-off back is now a code change, deliberately: there is no
environment variable that does it by accident.

---

## 11 — Push device tokens

The iOS app has a working notification switch that called two routes which did
not exist. `js/push.js` treats a failed registration as a non-event — *"a failed
registration is not a UI error"* — so the switch turned on, the phone asked for
permission, iOS issued a token, and it was posted into a 404. Nothing was ever
delivered and nobody was told.

```
POST /push/register    { token, platform?, environment? }  -> 200 { ok: true }
POST /push/unregister  { token }                           -> 200 { ok: true }
```

Both require a signed-in account; the pupil is the authenticated one, not a body
field.

| case | result |
|---|---|
| no auth | `401 UNAUTHORIZED` |
| same token registered twice | one row, updated — **upsert, not insert** |
| two devices, one pupil | two rows |
| same token, different pupil | ownership moves, still one row |
| empty token | `400 VALIDATION` |
| token over 512 chars | `400 VALIDATION` |
| unregister someone else's token | `200`, row untouched |
| unregister twice | `200`, idempotent |
| account deleted | tokens cascade away |

Register upserts because the client sends it on **every launch**, not once when
the switch is flipped — iOS reissues tokens on reinstall and restore. Unregister
is scoped to the caller so one pupil cannot silence another's phone by guessing
a token.

**Nothing here sends a notification.** The phone already does deadline reminders
as *local* notifications from the server's own deadline, so APNs is only needed
for what it cannot predict — the menu changed, a day became a holiday, credit
arrived. Collecting tokens now means that can be switched on later without
waiting for every pupil to reopen the app.

If you would rather not hold Apple credentials (`.p8`, key id, team id) on the
server at all, these two routes are still worth having: they stop the client
posting into a void, and the switch becomes honest.

---

## 12 — The cancelled-dish 500 (the urgent one)

Reported from the app on 2026-09-18 — *"nejde vyprážaný bravčový rezeň a pár
ďalších možností"* — and reproduced against the live API:

| action | before |
|---|---|
| `PATCH /orders/:id` to a dish **never ordered today** | `200` |
| `PATCH /orders/:id` to a dish **cancelled earlier today** | **`500 INTERNAL`** |
| `POST /orders` for a dish **cancelled earlier today** | **`500 INTERNAL`** |

So the dishes that "did not work" were exactly the ones that pupil had already
tried and cancelled that day.

### Measured on production, 2026-09-18 09:53

One pupil, one day, nine dishes. Seven had been ordered and cancelled earlier
that day; two had not. `POST /orders` for each:

```
slot 1  Bryndzové halušky so slaninou     500 INTERNAL
slot 2  Vyprážaný bravčový rezeň          500 INTERNAL
slot 3  Kuracie prsia na grile            500 INTERNAL
slot 4  Šošovicová polievka a pirohy      (not attempted — no cancelled row)
slot 5  Zeleninové rizoto                 500 INTERNAL
slot 6  Segedínsky guláš s knedľou        500 INTERNAL
slot 7  Treska na masle                   (not attempted — no cancelled row)
slot 8  Cestoviny s bazalkovým pestom     500 INTERNAL
slot 9  Caesar šalát s kuracím mäsom      500 INTERNAL
```

**Seven of nine dishes unorderable**, and exactly the seven with a cancelled
row. The balance did not move, so nothing was charged — the insert never
happened.

Reproduced in PostgreSQL with the same seven-cancelled-rows state, running the
real migrations with and without this patch:

```
BEFORE the fix   2 orderable, 7 blocked   (slots 4 and 7 only)
AFTER the fix    9 orderable, 0 blocked
```

The cancelled rows are left in place in the "after" run — dropping the index is
enough, no data clean-up is needed.

**Real pupils are already affected, not just the test account:**

```
2026-09-16   Samuel Uličný (1 dish), Peter Kollár (1 dish)
2026-09-17   Samuel Uličný (2 dishes), Nina Bartošová (1 dish)
2026-09-18   Samuel Uličný (7 dishes)
```

Peter Kollár's blocked dish is the duplicate that **item 9's own cleanup
migration cancelled**. Fixing the double-charge planted this for him, which is
worth knowing: every cancellation anywhere adds one more permanently blocked
dish for that pupil on that day, and it accumulates.

**Why.** Cancelling keeps the row and only sets the status:

```ts
return tx.order.update({ where: { id: order.id }, data: { status: "CANCELLED" } });
```

but `Order` still carried `@@unique([studentId, mealOnDayId])` from before item
9. A cancelled row therefore kept that pair occupied for the rest of the day.
`order.create` in POST and the `mealOnDayId` update in PATCH both collided with
it, Prisma raised `P2002`, nothing caught it, and it reached the client as
`{"error":"INTERNAL","message":"Vnútorná chyba"}`.

That constraint made sense when it was the only thing stopping a second lunch.
Item 9 replaced that job with a day-level guard plus
`Order_one_live_order_per_student_day`, and the old one was left behind doing
harm.

**The fix is one line.**

```sql
DROP INDEX IF EXISTS "Order_studentId_mealOnDayId_key";
```

Nothing is created. `Order_one_live_order_per_student_day` — the partial unique
on `(studentId, mealDate) WHERE status NOT IN ('CANCELLED','AUTO_CANCELLED')` —
already enforces one live order per pupil per day and is untouched. Dropping an
index cannot fail on data, so there is no precondition.

A `P2002` is also mapped to `409 ALREADY_ORDERED` rather than a 500, so a
genuine race between two requests is answered in Slovak instead of as a crash.

---

## How this was verified

Not only reviewed — run.

| check | result |
|---|---|
| applies cleanly to a fresh clone of `782b562` | yes |
| `prisma validate` | valid |
| `tsc --noEmit` | 0 errors |
| **all 7 migrations against a real PostgreSQL 18** (PGlite) | all apply |
| the reported bug reproduced, then shown fixed | 17/17 assertions |
| server boots and serves the new routes | `200` / `401` as expected |

What the Postgres run proves:

```
re-order a dish cancelled earlier today       was 500 -> ok
change to a dish cancelled earlier today      was 500 -> ok
a second active order, same pupil, same day   still refused
many cancelled rows + one active              allowed
another day                                   unaffected
DeviceToken upserts on token / cascades       ok
```

The third line matters most: dropping the old index **does not reopen item 9**.

Running the migrations for real also caught a mistake in an earlier draft of
this patch — it created a second, byte-identical partial index, because it was
not obvious from the schema that item 9's migration had already made one. That
duplicate is gone.

---

## Two clean-ups this patch does not do

### Test accounts in production

Two accounts were created against the live database while verifying the
frontend. There is no delete endpoint, so they need a query:

```sql
-- check first
SELECT id, username, active, "balanceCents" FROM "Account"
WHERE username IN ('samuel.ulicny') OR username LIKE 'test.klaim.%';

-- orders reference accounts with ON DELETE RESTRICT, so clear those first
DELETE FROM "Order" WHERE "studentId" IN (
  SELECT id FROM "Account"
  WHERE username IN ('samuel.ulicny') OR username LIKE 'test.klaim.%');

DELETE FROM "Account"
WHERE username IN ('samuel.ulicny') OR username LIKE 'test.klaim.%';
```

`samuel.ulicny` currently holds 110,00 € of test credit. Deactivating instead of
deleting is fine too — it is already how `test.klaim.*` was left.

### The API keeps going down

Unrelated to this patch, but worth saying: the API returned `502` on every
route, including `/health`, three separate times on 2026-09-16, for minutes each
time. `server: cloudflare` with no origin headers — the tunnel was up and the
backend was not. Commit `db: fail fast on dead Supabase connections` suggests
this is known; "fail fast" makes the symptom sharper rather than rarer, so it
may be worth checking whether the process is being restarted or the pool is
being dropped.
