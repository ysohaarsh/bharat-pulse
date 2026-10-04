import { describe, expect, it } from "vitest";
import { forgotPasswordSchema, isRateLimited, resetPasswordPath } from "./schema";

describe("forgotPasswordSchema", () => {
  it("trims and lower-cases a valid email", () => {
    expect(forgotPasswordSchema.parse({ email: "  Ana@Example.COM " })).toEqual({ email: "ana@example.com" });
  });

  it("rejects invalid emails with a friendly message", () => {
    for (const email of ["", "   ", "not-an-email", "a@", "@b.com"]) {
      const r = forgotPasswordSchema.safeParse({ email });
      expect(r.success, email).toBe(false);
      expect(r.error?.issues[0]?.message).toBe("Enter a valid email address");
    }
  });
});

describe("isRateLimited", () => {
  it("detects Supabase rate limiting by status or code", () => {
    expect(isRateLimited({ status: 429 })).toBe(true);
    expect(isRateLimited({ status: 400, code: "over_email_send_rate_limit" })).toBe(true);
    expect(isRateLimited({ code: "over_request_rate_limit" })).toBe(true);
  });

  it("treats everything else as not rate limited", () => {
    expect(isRateLimited(null)).toBe(false);
    expect(isRateLimited(undefined)).toBe(false);
    expect(isRateLimited({ status: 400, code: "validation_failed" })).toBe(false);
    expect(isRateLimited({ status: 500 })).toBe(false);
  });
});

describe("resetPasswordPath", () => {
  it("omits next for the home page and encodes it otherwise", () => {
    expect(resetPasswordPath("/")).toBe("/reset-password");
    expect(resetPasswordPath("/watchlists?edit=3")).toBe("/reset-password?next=%2Fwatchlists%3Fedit%3D3");
  });
});
