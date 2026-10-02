"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteItem } from "./actions";

// `redirectTo` is for pages that stop existing once the item is deleted.
export function DeleteButton({ id, redirectTo }: { id: number; redirectTo?: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="self-start text-sm text-neutral-500 hover:underline"
      >
        Remove
      </button>
    );
  }
  return (
    <span className="flex gap-3 self-start text-sm">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await deleteItem(id);
            if (redirectTo) router.push(redirectTo);
          })
        }
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
