import { Elysia } from "elysia";

/// Signed error responses so routes can fail with a code + Slovak message
/// without leaking stack traces.
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/// Creates a new route-scoped Elysia instance with `.onError()` applied.
/// Every module that defines routes should use `createRouter()` instead of
/// `new Elysia()` so thrown `ApiError`s return structured JSON.
export function createRouter() {
  return new Elysia<"/">().onError(({ code, error, set }) => {
    if (error instanceof ApiError) {
      set.status = error.status;
      return { error: error.code, message: error.message };
    }
    if (code === "VALIDATION") {
      set.status = 400;
      return { error: "VALIDATION", message: error.message };
    }
    if (code === "PARSE") {
      set.status = 400;
      return { error: "PARSE", message: "Zlá požiadavka" };
    }
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "NOT_FOUND", message: "Nenašlo sa" };
    }
    console.error("[error]", error);
    set.status = 500;
    return { error: "INTERNAL", message: "Vnútorná chyba" };
  });
}