"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { sendMagicLink, signIn, signUp } from "@/app/login/actions";
import type { AuthFormState } from "@/app/login/schema";
import { BTN_PRIMARY, BTN_SECONDARY, FIELD_ERROR, FOCUS, INPUT, LABEL } from "./styles";

type Mode = "signin" | "signup";

const EMPTY: AuthFormState = {};

function Status({ state }: { state: AuthFormState }) {
  return (
    <div aria-live="polite">
      {state.error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-md border border-accent/40 bg-accent/10 px-3 py-2 text-sm">
          {state.message}
        </p>
      )}
    </div>
  );
}

function EmailField({ state, idPrefix }: { state: AuthFormState; idPrefix: string }) {
  const id = `${idPrefix}-email`;
  const err = state.fieldErrors?.email;
  return (
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
  );
}

function PasswordForm({ mode, next }: { mode: Mode; next: string }) {
  const [state, action, pending] = useActionState(mode === "signin" ? signIn : signUp, EMPTY);
  const idPrefix = useId();
  const pwId = `${idPrefix}-password`;
  const pwErr = state.fieldErrors?.password;

  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="next" value={next} />
      <EmailField state={state} idPrefix={idPrefix} />
      <div>
        <label htmlFor={pwId} className={LABEL}>
          Password
        </label>
        <input
          id={pwId}
          name="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          minLength={mode === "signup" ? 8 : undefined}
          aria-invalid={pwErr ? true : undefined}
          aria-describedby={pwErr ? `${pwId}-error` : mode === "signup" ? `${pwId}-hint` : undefined}
          className={INPUT}
        />
        {pwErr ? (
          <p id={`${pwId}-error`} className={FIELD_ERROR}>
            {pwErr}
          </p>
        ) : (
          mode === "signup" && (
            <p id={`${pwId}-hint`} className="mt-1 text-xs text-muted">
              At least 8 characters.
            </p>
          )
        )}
        {mode === "signin" && (
          <p className="mt-1.5 text-right text-xs">
            <Link
              href={next === "/" ? "/forgot-password" : `/forgot-password?next=${encodeURIComponent(next)}`}
              className={`text-accent hover:underline ${FOCUS}`}
            >
              Forgot password?
            </Link>
          </p>
        )}
      </div>
      <Status state={state} />
      <button type="submit" disabled={pending} className={BTN_PRIMARY}>
        {pending ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>
    </form>
  );
}

function MagicLinkForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(sendMagicLink, EMPTY);
  const idPrefix = useId();
  return (
    <form action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="next" value={next} />
      <EmailField state={state} idPrefix={idPrefix} />
      <Status state={state} />
      <button type="submit" disabled={pending} className={BTN_SECONDARY}>
        {pending ? "Sending…" : "Send magic link"}
      </button>
    </form>
  );
}

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const [mode, setMode] = useState<Mode>("signin");
  const [magicOpen, setMagicOpen] = useState(false);
  const baseId = useId();
  const tabs: { id: Mode; label: string }[] = [
    { id: "signin", label: "Sign in" },
    { id: "signup", label: "Create account" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {initialError && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm">
          {initialError}
        </p>
      )}

      <div
        role="tablist"
        aria-label="Account"
        className="grid grid-cols-2 overflow-hidden rounded-md border border-border"
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            const nextMode: Mode = mode === "signin" ? "signup" : "signin";
            setMode(nextMode);
            document.getElementById(`${baseId}-tab-${nextMode}`)?.focus();
          }
        }}
      >
        {tabs.map((t) => {
          const selected = mode === t.id;
          return (
            <button
              key={t.id}
              id={`${baseId}-tab-${t.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setMode(t.id)}
              className={`px-3 py-2 text-sm ${FOCUS} ${
                selected ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div id={`${baseId}-panel`} role="tabpanel" aria-labelledby={`${baseId}-tab-${mode}`}>
        {/* key resets action state when switching tabs */}
        <PasswordForm key={mode} mode={mode} next={next} />
      </div>

      <div className="border-t border-border pt-4">
        <button
          type="button"
          aria-expanded={magicOpen}
          aria-controls={`${baseId}-magic`}
          onClick={() => setMagicOpen((o) => !o)}
          className={`text-sm text-accent hover:underline ${FOCUS}`}
        >
          Email me a magic link instead
        </button>
        {magicOpen && (
          <div id={`${baseId}-magic`} className="mt-3">
            <p className="mb-3 text-xs text-muted">
              We&apos;ll email you a one-time sign-in link. New emails get an account automatically.
            </p>
            <MagicLinkForm next={next} />
          </div>
        )}
      </div>
    </div>
  );
}
