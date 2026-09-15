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

/** Ordering deadline: the day before the meal at the configured hour (14:00).
 *  You order "tomorrow's" lunch by 14:00 today. */
export function defaultDeadline(mealDay: Date): Date {
  const prev = new Date(mealDay);
  prev.setUTCDate(prev.getUTCDate() - 1);
  prev.setUTCHours(config.defaultDeadlineHour, 0, 0, 0);
  return prev;
}

/** Opening of the ordering window: the same civil day as the *deadline* at
 *  08:00. Ordering for day D runs from (D−1) 08:00 to (D−1) 14:00. */
export function windowOpen(deadline: Date): Date {
  const d = new Date(deadline);
  d.setUTCHours(config.windowOpenHour, 0, 0, 0);
  return d;
}

/** Seconds until `deadline` from `now` (0 if already past). */
export function secondsUntil(now: Date, deadline: Date): number {
  return Math.max(0, Math.floor((deadline.getTime() - now.getTime()) / 1000));
}

/** True once the ordering window is open but not yet closed. */
export function isOrderingOpen(now: Date, deadline: Date): boolean {
  return now >= windowOpen(deadline) && now < deadline;
}