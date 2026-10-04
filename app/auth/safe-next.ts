const BASE = "http://pulse.invalid";

/**
 * Sanitize a post-auth redirect target. Only same-origin relative paths are allowed:
 * must start with "/" but not "//", and contain no backslashes or control/whitespace
 * characters (browsers normalize "/\evil.com" and "/\t/evil.com" to "//evil.com").
 */
export function safeNext(next: unknown, fallback = "/"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (/[\\\s\u0000-\u001f\u007f]/.test(next)) return fallback;
  try {
    const url = new URL(next, BASE);
    if (url.origin !== BASE) return fallback;
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
