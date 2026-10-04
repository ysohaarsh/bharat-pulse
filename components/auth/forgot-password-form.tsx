"use client";

import { useActionState, useId } from "react";
import { requestPasswordReset } from "@/app/forgot-password/actions";
import type { ForgotPasswordState } from "@/app/forgot-password/schema";
import { BTN_PRIMARY, FIELD_ERROR, INPUT, LABEL } from "./styles";

const EMPTY: ForgotPasswordState = {};

export function ForgotPasswordForm({ next, initialError }: { next: string; initialError?: string }) {
  const [state, action, pending] = useActionState(requestPasswordReset, EMPTY);
  const id = `${useId()}-email`;
  const err = state.fieldErrors?.email;
  // The link error from the URL only matters until the user submits again.
  const error = state === EMPTY ? initialError : state.error;

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="next" value={next} />
      <div>
        <label htmlFor={id} className={LABEL}>
          Email
        </label>
        <input
          id={id}
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.email ?? ""}
          aria-invalid={err ? true : undefined}
          aria-describedby={err ? `${id}-error` : undefined}
          className={INPUT}
        />
        {err && (
          <p id={`${id}-error`} className={FIELD_ERROR}>
            {err}
          </p>
        )}
      </div>
      <div aria-live="polite">
        {error && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
            {error}
          </p>
        )}
        {state.message && (
          <p role="status" className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
            {state.message}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} className={BTN_PRIMARY}>
        {pending ? "Sending…" : state.message ? "Send again" : "Send reset link"}
      </button>
    </form>
  );
}
