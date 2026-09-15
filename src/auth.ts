import { jwtVerify, SignJWT } from "jose";
import { config } from "./config";
import { db } from "./db";
import { ApiError } from "./errors";
import type { Account } from "./generated/prisma/client";

export type AuthedAccount = Account;

export async function signToken(accountId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(accountId)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(config.authSecret));
}

export async function verifyToken(token: string): Promise<{ sub: string }> {
  const { payload } = await jwtVerify(
    token,
    new TextEncoder().encode(config.authSecret),
  );
  if (!payload.sub) throw new Error("missing sub");
  return { sub: payload.sub };
}

/// Resolves an authenticated Account from the request, or null when anonymous.
/// Each handler calls this inline — no middleware magic.
export async function resolveAccount(
  authHeader?: string,
): Promise<AuthedAccount | null> {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length).trim();
  if (!token) return null;
  const { sub } = await verifyToken(token);
  return db.account.findUnique({ where: { id: sub } });
}

/// Throws 401 when the request is anonymous.
export async function requireAccount(headers: {
  authorization?: string;
}): Promise<AuthedAccount> {
  const account = await resolveAccount(headers?.authorization);
  if (!account) throw new ApiError(401, "UNAUTHORIZED", "Prihláste sa");
  return account;
}

/// Throws 401/403 unless the request is from a manager.
export async function requireManager(headers: {
  authorization?: string;
}): Promise<AuthedAccount> {
  const account = await requireAccount(headers);
  if (account.role !== "MANAGER")
    throw new ApiError(403, "FORBIDDEN", "Neprístupné");
  return account;
}