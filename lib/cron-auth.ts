import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Checks `Authorization: Bearer $CRON_SECRET` in constant time.
 * Fails closed when the secret is unset or too short to be safe.
 */
export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 32) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(request.headers.get("authorization") ?? ""), digest(`Bearer ${secret}`));
}
