"use client";

import { useFormStatus } from "react-dom";
import { deleteWatchlist } from "@/app/watchlists/actions";
import { BTN_DANGER } from "@/components/auth/styles";

function Submit({ name }: { name: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={`Delete watchlist ${name}`}
      className={BTN_DANGER}
      onClick={(e) => {
        if (!window.confirm(`Delete "${name}"? Its alerts will be removed too.`)) e.preventDefault();
      }}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}

export function DeleteWatchlistButton({ id, name }: { id: number; name: string }) {
  return (
    <form action={deleteWatchlist.bind(null, id)}>
      <Submit name={name} />
    </form>
  );
}
