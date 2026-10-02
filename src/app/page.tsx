import { desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { getDb } from "@/db";
import { items, priceChecks } from "@/db/schema";
import { alertThreshold } from "@/lib/alerts";
import { formatPrice } from "@/lib/format";
import { AddItem } from "./add-item";
import { DeleteButton } from "./delete-button";

export const dynamic = "force-dynamic";

async function loadItems() {
  const db = getDb();
  // Latest check per item.
  const latest = db
    .selectDistinctOn([priceChecks.itemId])
    .from(priceChecks)
    .orderBy(priceChecks.itemId, desc(priceChecks.checkedAt))
    .as("latest");
  return db
    .select({
      item: items,
      check: {
        ok: latest.ok,
        price: latest.price,
        regularPrice: latest.regularPrice,
        inStock: latest.inStock,
        failureDetail: latest.failureDetail,
        promoText: latest.promoText,
      },
    })
    .from(items)
    .leftJoin(latest, eq(latest.itemId, items.id))
    .orderBy(sql`${items.createdAt} desc`);
}

type Row = Awaited<ReturnType<typeof loadItems>>[number];

// -1: latest check failed, 0: at or below the alert price,
// 1: marked down or a promo is on the page, 2: nothing to report.
function saleRank({ item, check }: Row): number {
  if (!check?.ok || check.price === null) return -1;
  if (check.price <= alertThreshold(item)) return 0;
  if (check.regularPrice !== null || (check.promoText?.length ?? 0) > 0) return 1;
  return 2;
}

const badgeClass = "rounded-full px-2 py-0.5 text-xs font-medium";

export default async function Home() {
  const loaded = await loadItems();
  // Stable sort: failing items, then likely deals; newest first within each group.
  const rows = loaded
    .map((row) => ({ ...row, rank: saleRank(row) }))
    .sort((a, b) => a.rank - b.rank);

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 p-6">
      <h1 className="text-xl font-semibold">Price tracker</h1>
      <AddItem />

      <section className="flex flex-col gap-3">
        <h2 className="font-medium">Tracking {rows.length} {rows.length === 1 ? "item" : "items"}</h2>
        {rows.length === 0 && (
          <p className="text-sm text-neutral-500">Nothing yet. Paste a product URL above.</p>
        )}
        {rows.map(({ item, check, rank }) => (
          <article
            key={item.id}
            className="flex gap-4 rounded-md border border-neutral-300 p-4 dark:border-neutral-700"
          >
            {item.image && (
              // eslint-disable-next-line @next/next/no-img-element -- images come from arbitrary store domains
              <img src={item.image} alt="" className="h-20 w-20 rounded object-cover" />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1 text-sm">
              <Link href={`/items/${item.id}`} className="truncate font-medium hover:underline">
                {item.title ?? item.url}
              </Link>
              <p className="text-neutral-600 dark:text-neutral-400">
                {item.store}
                {item.variant ? ` · ${item.variant}` : ""}
                {check?.inStock === false ? " · out of stock" : ""}
              </p>
              {check?.ok && check.price !== null ? (
                <p className="text-base font-semibold">
                  {formatPrice(check.price, item.currency)}
                  {check.regularPrice !== null && (
                    <span className="ml-2 text-sm font-normal text-neutral-500 line-through">
                      {formatPrice(check.regularPrice, item.currency)}
                    </span>
                  )}
                </p>
              ) : (
                <p className="font-medium text-red-700 dark:text-red-400">
                  Couldn&apos;t check: {check?.failureDetail ?? "no checks recorded"}
                </p>
              )}
              {rank >= 0 && rank < 2 && (
                <p className="flex flex-wrap items-center gap-2">
                  {rank === 0 && (
                    <span className={`${badgeClass} bg-green-700 text-white`}>At your alert price</span>
                  )}
                  {check?.regularPrice != null && (
                    <span className={`${badgeClass} bg-neutral-200 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100`}>
                      Marked down
                    </span>
                  )}
                  {check?.promoText?.[0] && (
                    <span className="text-neutral-600 dark:text-neutral-400">
                      Possible promo: {check.promoText[0]}
                      {check.promoText.length > 1 ? ` (+${check.promoText.length - 1} more)` : ""}
                    </span>
                  )}
                </p>
              )}
              <p className="text-neutral-500">
                {item.targetPrice !== null
                  ? `Target ${formatPrice(item.targetPrice, item.currency)}`
                  : `Added at ${formatPrice(item.baselinePrice, item.currency)}, alert at ${formatPrice(alertThreshold(item), item.currency)}`}
              </p>
              <DeleteButton id={item.id} />
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
