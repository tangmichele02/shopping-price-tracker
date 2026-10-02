"use client";

import { useActionState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(login, null);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <form action={action} className="flex w-full max-w-xs flex-col gap-3">
        <h1 className="text-lg font-semibold">Price tracker</h1>
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoFocus
          required
          className="rounded-md border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-3 py-2 font-medium text-background disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </main>
  );
}
