/// Fact sheet for one school day.
///
/// THERE IS NO ORDERING DEADLINE. A day is orderable whenever the canteen is
/// cooking — no hour, no cut-off, nothing anybody can miss, on any date past
/// or future. That is the school's rule and it is the whole of it.
///
/// `deadline` and `secondsUntil` are kept as null rather than dropped, so the
/// response shape does not change under any client that still reads them. They
/// are not computed and they decide nothing.
///
/// This is not the only gate on placing an order: assertCanOrder() still
/// refuses a sold-out meal, POST /orders still refuses a second lunch on the
/// same day, and an account still needs credit. "Always open" is not "always
/// orderable" — but nothing here is about time.
export function dayFacts(
  day: { isServing: boolean } | null | undefined,
  _mealDate: Date,
  _now: Date,
) {
  const isServing = day?.isServing ?? true;
  return {
    deadline: null,
    secondsUntil: null,
    open: isServing,
    holiday: !isServing,
  };
}
