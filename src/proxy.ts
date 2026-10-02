import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  if (await isValidSession(request.cookies.get(SESSION_COOKIE)?.value)) {
    return NextResponse.next();
  }
  const login = new URL("/login", request.url);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the login page, static assets, and /api/probe (which has its own key).
  matcher: ["/((?!login|api/probe|_next/static|_next/image|favicon.ico).*)"],
};
