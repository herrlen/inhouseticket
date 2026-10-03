import "server-only";
import { createHash, randomBytes } from "node:crypto";

/** Random URL-safe token (256 bit). Only its hash is stored. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
