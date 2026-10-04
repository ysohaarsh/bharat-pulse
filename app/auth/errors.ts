/**
 * Fixed sign-in error codes for `/login?error=<code>`. The login page only renders these
 * messages, so a crafted link can't put arbitrary text on the real site.
 */
export const LOGIN_ERRORS = {
  link_invalid: "That sign-in link is invalid or has expired. Request a new one below.",
  link_incomplete: "That sign-in link is incomplete. Request a new one below.",
  unavailable: "Sign-in is unavailable right now. Please try again shortly.",
} as const;
export type LoginErrorCode = keyof typeof LOGIN_ERRORS;

export function loginErrorMessage(code: string | undefined): string | undefined {
  return code && Object.hasOwn(LOGIN_ERRORS, code) ? LOGIN_ERRORS[code as LoginErrorCode] : undefined;
}

/**
 * Fixed password-reset error codes for `/forgot-password?error=<code>`: a recovery link that
 * failed in /auth/confirm, or /reset-password opened without a session. Same rule as above.
 */
export const RESET_ERRORS = {
  link_invalid: "That reset link is invalid or has expired. Enter your email to get a new one.",
  link_incomplete: "That reset link is incomplete. Enter your email to get a new one.",
  unavailable: "Password reset is unavailable right now. Please try again shortly.",
  session_missing: "Your reset link has expired or was already used. Enter your email to get a new one.",
} as const;
export type ResetErrorCode = keyof typeof RESET_ERRORS;

export function resetErrorMessage(code: string | undefined): string | undefined {
  return code && Object.hasOwn(RESET_ERRORS, code) ? RESET_ERRORS[code as ResetErrorCode] : undefined;
}
