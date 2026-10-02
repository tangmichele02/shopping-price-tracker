import type { Item, PriceCheck } from "@/db/schema";

// With no target set, alert at 20% below the price when the item was added.
const DEFAULT_DROP = 0.2;
export const FAILURES_BEFORE_ALERT = 2;

export function alertThreshold(item: Pick<Item, "targetPrice" | "baselinePrice">): number {
  return item.targetPrice ?? item.baselinePrice * (1 - DEFAULT_DROP);
}

type PriorCheck = Pick<PriceCheck, "ok" | "price" | "promoText">;

// Alert when the price reaches the threshold, and again each time it drops further.
// `previous` is the most recent successful check before this one.
export function shouldAlertPriceDrop(
  item: Pick<Item, "targetPrice" | "baselinePrice">,
  price: number,
  previous: PriorCheck | undefined,
): boolean {
  const threshold = alertThreshold(item);
  if (price > threshold) return false;
  if (!previous || previous.price === null) return true;
  return previous.price > threshold || price < previous.price;
}

// Alert on exactly the Nth consecutive failure, not on every failure after it.
// `recent` is newest first and does not include the check that just failed.
export function shouldAlertFailure(recent: PriorCheck[]): boolean {
  const priorFailures = recent.findIndex((check) => check.ok);
  const streak = (priorFailures === -1 ? recent.length : priorFailures) + 1;
  return streak === FAILURES_BEFORE_ALERT;
}

// Dates and whitespace change daily in promo copy; ignore them when comparing.
export function normalisePromo(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(ends?|through|thru|until)\b[^.]*\.?/g, "")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

// Promo snippets on the page now that were not there at the previous successful check.
export function newPromos(current: string[], previous: PriorCheck | undefined): string[] {
  const seen = new Set((previous?.promoText ?? []).map(normalisePromo));
  return current.filter((promo) => !seen.has(normalisePromo(promo)));
}
