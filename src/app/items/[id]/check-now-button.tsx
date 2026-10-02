"use client";

import { useTransition } from "react";
import { checkNow } from "@/app/actions";

export function CheckNowButton({ id }: { id: number }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => checkNow(id))}
      className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm disabled:opacity-50 dark:border-neutral-700"
    >
      {pending ? "Checking…" : "Check now"}
    </button>
  );
}
