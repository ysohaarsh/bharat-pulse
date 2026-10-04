"use client";

import { useActionState, useId } from "react";
import { updatePassword } from "@/app/reset-password/actions";
import type { ResetField, ResetPasswordState } from "@/app/reset-password/schema";
import { BTN_PRIMARY, FIELD_ERROR, INPUT, LABEL } from "./styles";

const EMPTY: ResetPasswordState = {};

function PasswordField({
  id,
  name,
  label,
  error,
  hint,
}: {
  id: string;
  name: ResetField;
  label: string;
  error?: string;
  hint?: string;
}) {
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={INPUT}
      />
      {error ? (
        <p id={`${id}-error`} className={FIELD_ERROR}>
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function ResetPasswordForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(updatePassword, EMPTY);
  const idPrefix = useId();

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="next" value={next} />
      <PasswordField
        id={`${idPrefix}-password`}
        name="password"
        label="New password"
        error={state.fieldErrors?.password}
        hint="8–72 characters."
      />
      <PasswordField
        id={`${idPrefix}-confirm`}
        name="confirm"
        label="Confirm new password"
        error={state.fieldErrors?.confirm}
      />
      <div aria-live="polite">
        {state.error && (
          <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
            {state.error}
          </p>
        )}
      </div>
      <button type="submit" disabled={pending} className={BTN_PRIMARY}>
        {pending ? "Updating…" : "Update password"}
      </button>
    </form>
  );
}
