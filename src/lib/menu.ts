import {
  dateKey,
  defaultDeadline,
  isOrderingOpen,
  secondsUntil,
  toLocalDay,
} from "./dates";

/// Deadline fact sheet for one school day, given a reference `now`.
/// Single place both /menu/today|week and order mutations derive from.
export function dayFacts(
  day: { isServing: boolean } | null | undefined,
  mealDate: Date,
  now: Date,
) {
  const isServing = day?.isServing ?? true;
  const deadline = defaultDeadline(mealDate);
  return {
    deadline,
    secondsUntil: secondsUntil(now, deadline),
    open: isServing && isOrderingOpen(now, deadline),
    holiday: !isServing,
  };
}

/// The key of the nearest day, from today forward, whose ordering window is
/// currently open — `null` when nothing in the horizon is orderable.
/// The deadline for day D sits on D−1, so the calendar day is nearly always
/// past its own window; this is what the student home should show instead.
export function orderableDay(
  now: Date,
  isServing: (key: string) => boolean,
  horizonDays = 14,
): string | null {
  const start = toLocalDay(now);
  for (let i = 0; i < horizonDays; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const key = dateKey(d);
    if (dayFacts({ isServing: isServing(key) }, d, now).open) return key;
  }
  return null;
}