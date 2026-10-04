/** Shared form styling for auth, watchlist and alert screens (theme tokens only). */
export const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface";

export const INPUT = `w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-foreground placeholder:text-muted/60 aria-[invalid=true]:border-danger ${FOCUS}`;

export const LABEL = "mb-1 block text-xs font-medium text-muted";

export const BTN_PRIMARY = `inline-flex items-center justify-center rounded-md bg-accent px-3 py-2 text-sm font-semibold text-background hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`;

export const BTN_SECONDARY = `inline-flex items-center justify-center rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`;

export const BTN_DANGER = `inline-flex items-center justify-center rounded-md border border-danger/40 px-3 py-1.5 text-sm text-danger hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`;

export const FIELD_ERROR = "mt-1 text-xs text-danger";
