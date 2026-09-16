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

/** `civilDay` (stored as UTC midnight by toLocalDay) at `hour` school-local
 *  time, as a real instant. Slovakia shifts clocks at 02:00–03:00 local, so
 *  an 08:00 deadline is never in an ambiguous or skipped hour. */
export function atSchoolHour(civilDay: Date, hour: number): Date {
  const naive = new Date(civilDay);
  naive.setUTCHours(hour, 0, 0, 0);
  return new Date(naive.getTime() - offsetMinutes(naive) * 60_000);
}

/** Ordering deadline: 08:00 on the meal day itself, in school time.
 *  A pupil ordering Thursday's lunch has until Thursday 08:00. */
export function defaultDeadline(mealDay: Date): Date {
  return atSchoolHour(mealDay, config.defaultDeadlineHour);
}

/** Seconds until `deadline` from `now` (0 if already past). */
export function secondsUntil(now: Date, deadline: Date): number {
  return Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / 1000));
}

/** The window has no lower bound: a day is orderable from the moment its menu
 *  exists until the deadline passes. */
export function isOrderingOpen(now: Date, deadline: Date): boolean {
  return now < deadline;
}