import { config } from "../config";

/// Local school timezone. Slovakia is UTC+1 / UTC+2 (CET/CEST).
const SCHOOL_TZ = "Europe/Bratislava";

/** Normalize a date to local midnight (a valid SchoolDay.mealDate key). */
export function toLocalDay(d: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SCHOOL_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const iso = `${get("year")}-${get("month")}-${get("day")}T00:00:00.000Z`;
  // Store the civil date as UTC midnight so it is a stable, sortable key.
  return new Date(iso);
}

export function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `d`. */
export function mondayOf(d: Date): Date {
  const day = toLocalDay(d);
  const dow = (day.getUTCDay() + 6) % 7; // 0 = Monday
  const mon = new Date(day);
  mon.setUTCDate(mon.getUTCDate() - dow);
  return mon;
}

/** The five school days (Mon–Fri) of `d`'s week, in order. */
export function schoolWeek(d: Date): Date[] {
  const mon = mondayOf(d);
  return Array.from({ length: 5 }, (_, i) => {
    const x = new Date(mon);
    x.setUTCDate(mon.getUTCDate() + i);
    return x;
  });
}

/** UTC offset of SCHOOL_TZ, in minutes, at the instant `at`. */
function offsetMinutes(at: Date): number {
  const name =
    new Intl.DateTimeFormat("en-US", {
      timeZone: SCHOOL_TZ,
      timeZoneName: "longOffset",
    })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/* THE ORDERING DEADLINE USED TO LIVE HERE. It is gone.
 *
 * atSchoolHour / defaultDeadline / secondsUntil / isOrderingOpen were removed
 * when the school chose 24/7 ordering: a day is orderable whenever the canteen
 * is cooking, so there is no hour to compute and nothing to compare a clock
 * against. See dayFacts() in lib/menu.ts, which is now one line.
 *
 * If a cut-off is ever wanted again, this is the file it belongs in — but it
 * would be a new decision, not a switch someone forgot to flip. */
