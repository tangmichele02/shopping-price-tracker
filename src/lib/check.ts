import { getDb } from "@/db";
import { items, priceChecks, type Item } from "@/db/schema";
import { scrapeProduct } from "@/lib/scrape";

const SAME_STORE_DELAY_MS = 1500;

// Scrapes one item and records the outcome, success or failure, as a price check.
export async function checkItem(item: Pick<Item, "id" | "url">): Promise<boolean> {
  const scrape = await scrapeProduct(item.url);
  await getDb()
    .insert(priceChecks)
    .values(
      scrape.ok
        ? {
            itemId: item.id,
            ok: true,
            method: scrape.method,
            price: scrape.price,
            regularPrice: scrape.regularPrice,
            inStock: scrape.inStock,
            promoText: scrape.promoText,
          }
        : {
            itemId: item.id,
            ok: false,
            failureReason: scrape.reason,
            failureDetail: scrape.detail,
          },
    );
  return scrape.ok;
}

export async function checkAllItems(): Promise<{ checked: number; failed: number }> {
  const all = await getDb().select({ id: items.id, url: items.url, store: items.store }).from(items);

  const byStore = new Map<string, typeof all>();
  for (const item of all) {
    byStore.set(item.store, [...(byStore.get(item.store) ?? []), item]);
  }

  // Stores run in parallel; requests to the same store are spaced out.
  let failed = 0;
  await Promise.all(
    [...byStore.values()].map(async (storeItems) => {
      for (const [index, item] of storeItems.entries()) {
        if (index > 0) await new Promise((resolve) => setTimeout(resolve, SAME_STORE_DELAY_MS));
        try {
          if (!(await checkItem(item))) failed++;
        } catch (err) {
          // A database error for one item should not stop the rest.
          console.error(`Check failed for item ${item.id}`, err);
          failed++;
        }
      }
    }),
  );
  return { checked: all.length, failed };
}
