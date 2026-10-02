import type { NextRequest } from "next/server";
import { checkAllItems } from "@/lib/check";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Called daily by Vercel Cron (see vercel.json), which sends CRON_SECRET as a bearer token.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return Response.json(await checkAllItems());
}
