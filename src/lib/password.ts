/// Password hashing with Bun's argon2id — salted, memory-hard, intentionally
/// slow. Safe for real student data in a school deployment.
export function hashPassword(plain: string): Promise<string> {
  return Bun.password.hash(plain);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return Bun.password.verify(plain, hash);
}