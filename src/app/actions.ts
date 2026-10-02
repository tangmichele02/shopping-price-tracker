"use server";

import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { items, priceChecks } from "@/db/schema";
import { SESSION_COOKIE, isValidSession } from "@/lib/auth";
import { checkItem } from "@/lib/check";
import { scrapeProduct, type ScrapeResult } from "@/lib/scrape";

async function requireSession() {
  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await isValidSession(cookie))) throw new Error("Not signed in");
}

export async function previewItem(url: string): Promise<ScrapeResult> {
  await requireSession();
  return scrapeProduct(url.trim());
}

export type AddItemResult =
  | { ok: true }
  | { ok: false; message: string; scrape?: ScrapeResult };

export async function addItem(
  url: string,
  targetPrice: number | null,
): Promise<AddItemResult> {
  await requireSession();
  if (targetPrice !== null && !(Number.isFinite(targetPrice) && targetPrice > 0)) {
    return { ok: false, message: "Target price must be a positive number" };
  }

  // Scrape again on the server so the first stored price never comes from the browser.
  const scrape = await scrapeProduct(url.trim());
  if (!scrape.ok) {
    return { ok: false, message: "The price could not be read, so the item was not added", scrape };
  }

  const db = getDb();
  const [item] = await db
    .insert(items)
    .values({
      url: scrape.url,
      store: scrape.store,
      title: scrape.title,
      image: scrape.image,
      variant: scrape.variant,
      currency: scrape.currency,
      baselinePrice: scrape.regularPrice ?? scrape.price,
      targetPrice,
    })
    .onConflictDoNothing({ target: items.url })
    .returning({ id: items.id });
  if (!item) {
    return { ok: false, message: "You are already tracking this URL" };
  }

  await db.insert(priceChecks).values({
    itemId: item.id,
    ok: true,
    method: scrape.method,
    price: scrape.price,
    regularPrice: scrape.regularPrice,
    inStock: scrape.inStock,
    promoText: scrape.promoText,
  });

  revalidatePath("/");
  return { ok: true };
}

export async function deleteItem(id: number): Promise<void> {
  await requireSession();
  await getDb().delete(items).where(eq(items.id, id));
  revalidatePath("/");
}

export async function checkNow(id: number): Promise<void> {
  await requireSession();
  const [item] = await getDb()
    .select({ id: items.id, url: items.url })
    .from(items)
    .where(eq(items.id, id));
  if (!item) return;
  await checkItem(item);
  revalidatePath("/");
  revalidatePath(`/items/${id}`);
}
