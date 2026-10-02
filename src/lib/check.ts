import { and, desc, eq, gt, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { alerts, items, priceChecks, type Item } from "@/db/schema";
import {
  alertThreshold,
  newPromos,
  normalisePromo,
  shouldAlertFailure,
  shouldAlertPriceDrop,
} from "@/lib/alerts";
import { formatPrice } from "@/lib/format";
import { sendPush, type Push } from "@/lib/notify";
import { scrapeProduct, type ScrapeResult } from "@/lib/scrape";

const SAME_STORE_DELAY_MS = 1500;
const RECENT_CHECKS = 5;
const PROMO_REPEAT_DAYS = 14;

// Scrapes one item and records the outcome, success or failure, as a price check.
export async function checkItem(item: Pick<Item, "id" | "url">): Promise<ScrapeResult> {
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
  return scrape;
}

async function pushAndRecord(
  push: Push,
  alert: { itemId: number | null; store: string; kind: "price_drop" | "promo" | "failure"; dedupeKeys?: string[] },
): Promise<void> {
  const delivered = await sendPush(push);
  const message = `${push.title}\n${push.message}`;
  await getDb()
    .insert(alerts)
    .values(
      (alert.dedupeKeys ?? [null]).map((dedupeKey) => ({
        itemId: alert.itemId,
        store: alert.store,
        kind: alert.kind,
        dedupeKey,
        message,
        delivered,
      })),
    );
}

// Checks one item and sends any price-drop or failure push. Returns promo text
// that was not on the page at the previous successful check.
async function checkAndAlert(item: Item): Promise<{ ok: boolean; newPromos: string[] }> {
  const recent = await getDb()
    .select({ ok: priceChecks.ok, price: priceChecks.price, promoText: priceChecks.promoText })
    .from(priceChecks)
    .where(eq(priceChecks.itemId, item.id))
    .orderBy(desc(priceChecks.checkedAt))
    .limit(RECENT_CHECKS);

  const scrape = await checkItem(item);
  const name = item.title ?? item.url;

  if (!scrape.ok) {
    if (shouldAlertFailure(recent)) {
      await pushAndRecord(
        {
          title: `Can't check: ${name}`,
          message: `${scrape.detail}. This item is not being tracked until it works again.`,
          path: `/items/${item.id}`,
        },
        { itemId: item.id, store: item.store, kind: "failure" },
      );
    }
    return { ok: false, newPromos: [] };
  }

  const previous = recent.find((check) => check.ok);
  if (shouldAlertPriceDrop(item, scrape.price, previous)) {
    const was = scrape.regularPrice ?? item.baselinePrice;
    await pushAndRecord(
      {
        title: `Price drop: ${name}`,
        message:
          `${formatPrice(scrape.price, item.currency)} at ${item.store}, was ${formatPrice(was, item.currency)}. ` +
          `Your alert price is ${formatPrice(alertThreshold(item), item.currency)}.` +
          (scrape.inStock === false ? " Currently out of stock." : ""),
        path: `/items/${item.id}`,
        urgent: true,
      },
      { itemId: item.id, store: item.store, kind: "price_drop" },
    );
  }
  return { ok: true, newPromos: newPromos(scrape.promoText, previous) };
}

// One push per store for promo text that has not been announced recently.
async function alertStorePromos(store: string, promos: string[], itemNames: string[]): Promise<void> {
  const byKey = new Map(promos.map((promo) => [normalisePromo(promo), promo]));
  byKey.delete("");
  if (byKey.size === 0) return;

  const since = new Date(Date.now() - PROMO_REPEAT_DAYS * 24 * 60 * 60 * 1000);
  const announced = await getDb()
    .select({ dedupeKey: alerts.dedupeKey })
    .from(alerts)
    .where(
      and(
        eq(alerts.store, store),
        eq(alerts.kind, "promo"),
        gt(alerts.sentAt, since),
        inArray(alerts.dedupeKey, [...byKey.keys()]),
      ),
    );
  for (const { dedupeKey } of announced) byKey.delete(dedupeKey ?? "");
  if (byKey.size === 0) return;

  const shown = itemNames.slice(0, 5).join(", ");
  const more = itemNames.length > 5 ? ` and ${itemNames.length - 5} more` : "";
  await pushAndRecord(
    {
      title: `New promotion at ${store}`,
      message: `${[...byKey.values()].join(" · ")}\nMay apply to: ${shown}${more}`,
      path: "/",
    },
    { itemId: null, store, kind: "promo", dedupeKeys: [...byKey.keys()] },
  );
}

export async function checkAllItems(): Promise<{ checked: number; failed: number }> {
  const all = await getDb().select().from(items);

  const byStore = new Map<string, Item[]>();
  for (const item of all) {
    byStore.set(item.store, [...(byStore.get(item.store) ?? []), item]);
  }

  // Stores run in parallel; requests to the same store are spaced out.
  let failed = 0;
  await Promise.all(
    [...byStore.entries()].map(async ([store, storeItems]) => {
      const promos: string[] = [];
      for (const [index, item] of storeItems.entries()) {
        if (index > 0) await new Promise((resolve) => setTimeout(resolve, SAME_STORE_DELAY_MS));
        try {
          const result = await checkAndAlert(item);
          if (!result.ok) failed++;
          promos.push(...result.newPromos);
        } catch (err) {
          // A database error for one item should not stop the rest.
          console.error(`Check failed for item ${item.id}`, err);
          failed++;
        }
      }
      try {
        await alertStorePromos(store, promos, storeItems.map((item) => item.title ?? item.url));
      } catch (err) {
        console.error(`Promo alert failed for ${store}`, err);
      }
    }),
  );
  return { checked: all.length, failed };
}
