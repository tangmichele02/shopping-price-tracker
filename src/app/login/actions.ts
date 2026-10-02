"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, isCorrectPassword, sessionToken } from "@/lib/auth";

export async function login(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const password = String(formData.get("password") ?? "");
  if (!(await isCorrectPassword(password))) {
    return "Wrong password";
  }
  (await cookies()).set(SESSION_COOKIE, await sessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/");
}
