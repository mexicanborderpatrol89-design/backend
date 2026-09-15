import { createHash } from "node:crypto";

/// MD5 hash for hackathon-grade passwords. NOT secure for real use.
export function md5(input: string): string {
  return createHash("md5").update(input).digest("hex");
}