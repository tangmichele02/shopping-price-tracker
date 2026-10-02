"use client";

import { useState, useTransition } from "react";
import { deleteItem } from "./actions";

export function DeleteButton({ id }: { id: number }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm text-neutral-500 hover:underline"
      >
        Remove
      </button>
    );
  }
  return (
    <span className="flex gap-3 text-sm">
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => deleteItem(id))}
        className="text-red-700 hover:underline dark:text-red-400"
      >
        {pending ? "Removing…" : "Remove and delete history"}
      </button>
      <button type="button" onClick={() => setConfirming(false)} className="text-neutral-500 hover:underline">
        Keep
      </button>
    </span>
  );
}
