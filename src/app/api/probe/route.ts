import type { NextRequest } from "next/server";
import { scrapeProduct } from "@/lib/scrape";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/probe?key=<PROBE_SECRET>&url=<product url>&url=<another>
// Runs the real scraper from wherever the app is hosted, to check which stores
// are reachable from there.
export async function GET(request: NextRequest) {
  const secret = process.env.PROBE_SECRET;
  // Fail closed in production: this endpoint fetches arbitrary URLs.
  if (process.env.NODE_ENV === "production" && !secret) {
    return Response.json({ error: "PROBE_SECRET is not set" }, { status: 503 });
  }
  if (secret && request.nextUrl.searchParams.get("key") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const urls = request.nextUrl.searchParams.getAll("url").slice(0, 10);
  if (urls.length === 0) {
    return Response.json({ error: "Pass at least one ?url=" }, { status: 400 });
  }

  const results = await Promise.all(urls.map(scrapeProduct));
  return Response.json({ region: process.env.VERCEL_REGION ?? "local", results });
}
