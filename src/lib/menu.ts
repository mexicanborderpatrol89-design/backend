import { defaultDeadline, isOrderingOpen, secondsUntil } from "./dates";

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