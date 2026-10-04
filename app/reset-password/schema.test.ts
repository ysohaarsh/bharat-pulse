import { describe, expect, it } from "vitest";
import { resetErrorMessage } from "../auth/errors";
import { resetFieldErrors, resetPasswordSchema, SESSION_EXPIRED_MESSAGE, updatePasswordErrorMessage } from "./schema";

function errorsFor(input: { password: string; confirm: string }) {
  const r = resetPasswordSchema.safeParse(input);
  return r.success ? {} : resetFieldErrors(r.error);
}

describe("resetPasswordSchema", () => {
  it("accepts matching passwords of 8–72 characters", () => {
    expect(resetPasswordSchema.safeParse({ password: "hunter22", confirm: "hunter22" }).success).toBe(true);
    const max = "x".repeat(72);
    expect(resetPasswordSchema.safeParse({ password: max, confirm: max }).success).toBe(true);
  });

  it("rejects short and long passwords", () => {
    expect(errorsFor({ password: "short", confirm: "short" })).toEqual({ password: "Use at least 8 characters" });
    const long = "x".repeat(73);
    expect(errorsFor({ password: long, confirm: long })).toEqual({ password: "Use at most 72 characters" });
  });

  it("requires the confirmation to match", () => {
    expect(errorsFor({ password: "hunter22", confirm: "hunter23" })).toEqual({ confirm: "Passwords don't match" });
  });

  it("requires a confirmation", () => {
    expect(errorsFor({ password: "hunter22", confirm: "" }).confirm).toBe("Confirm your new password");
  });

  it("does not trim passwords", () => {
    expect(resetPasswordSchema.safeParse({ password: " hunter22 ", confirm: "hunter22" }).success).toBe(false);
  });
});

describe("updatePasswordErrorMessage", () => {
  it("maps known Supabase error codes to friendly text", () => {
    expect(updatePasswordErrorMessage({ status: 422, code: "same_password" })).toMatch(/different from your current/);
    expect(updatePasswordErrorMessage({ status: 422, code: "weak_password" })).toMatch(/too weak/);
    expect(updatePasswordErrorMessage({ status: 401, code: "reauthentication_needed" })).toBe(SESSION_EXPIRED_MESSAGE);
    expect(updatePasswordErrorMessage({ status: 403, code: "session_not_found" })).toBe(SESSION_EXPIRED_MESSAGE);
    expect(updatePasswordErrorMessage({ status: 429 })).toMatch(/Too many attempts/);
  });

  it("falls back to a generic message without leaking Supabase text", () => {
    expect(updatePasswordErrorMessage({ status: 500, code: "unexpected_failure" })).toBe(
      "We couldn't update your password. Please try again.",
    );
  });
});

describe("resetErrorMessage", () => {
  it("only renders known codes", () => {
    expect(resetErrorMessage("link_invalid")).toMatch(/reset link is invalid/);
    expect(resetErrorMessage("session_missing")).toMatch(/expired or was already used/);
    expect(resetErrorMessage("<script>")).toBeUndefined();
    expect(resetErrorMessage("toString")).toBeUndefined();
    expect(resetErrorMessage(undefined)).toBeUndefined();
  });
});
