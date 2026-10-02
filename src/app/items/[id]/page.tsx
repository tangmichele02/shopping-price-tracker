import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { items, priceChecks } from "@/db/schema";
import { formatPrice } from "@/lib/format";
import { DeleteButton } from "@/app/delete-button";
import { CheckNowButton } from "./check-now-button";
import { PriceChart } from "./price-chart";

export const dynamic = "force-dynamic";

const checkedAtFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/New_York",
});

export default async function ItemPage({ params }: PageProps<"/items/[id]">) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const db = getDb();
  const [item] = await db.select().from(items).where(eq(items.id, id));
  if (!item) notFound();
  const checks = await db
    .select()
    .from(priceChecks)
    .where(eq(priceChecks.itemId, id))
    .orderBy(desc(priceChecks.checkedAt));

  const points = checks
    .filter((check) => check.ok && check.price !== null)
    .map((check) => ({
      time: check.checkedAt.getTime(),
      price: check.price!,
      regularPrice: check.regularPrice,
    }))
    .reverse();
  const latest = checks[0];
  const lowest = points.length > 0 ? Math.min(...points.map((p) => p.price)) : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <Link href="/" className="text-sm text-neutral-500 hover:underline">
        ← All items
      </Link>

      <header className="flex gap-4">
        {item.image && (
          // eslint-disable-next-line @next/next/no-img-element -- images come from arbitrary store domains
          <img src={item.image} alt="" className="h-24 w-24 rounded object-cover" />
        )}
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-lg font-semibold">{item.title ?? item.url}</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {item.store}
            {item.variant ? ` · ${item.variant}` : ""}
            {latest?.inStock === false ? " · out of stock" : ""}
          </p>
          <a href={item.url} target="_blank" rel="noreferrer" className="text-sm underline">
            Open in store
          </a>
        </div>
      </header>

      {latest && !latest.ok && (
        <p className="rounded-md border border-red-300 p-3 text-sm text-red-700 dark:border-red-900 dark:text-red-400">
          The latest check failed: {latest.failureDetail}
        </p>
      )}

      <dl className="flex flex-wrap gap-x-10 gap-y-3 text-sm">
        <div>
          <dt className="text-neutral-500">Current</dt>
          <dd className="text-lg font-semibold">
            {points.length > 0 ? formatPrice(points[points.length - 1].price, item.currency) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">Lowest seen</dt>
          <dd className="text-lg font-semibold">
            {lowest !== null ? formatPrice(lowest, item.currency) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-neutral-500">When added</dt>
          <dd className="text-lg font-semibold">{formatPrice(item.baselinePrice, item.currency)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Target</dt>
          <dd className="text-lg font-semibold">
            {item.targetPrice !== null ? formatPrice(item.targetPrice, item.currency) : "—"}
          </dd>
        </div>
      </dl>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">Price history</h2>
        <PriceChart points={points} targetPrice={item.targetPrice} currency={item.currency} />
      </section>

      <div className="flex items-center gap-4">
        <CheckNowButton id={item.id} />
        <DeleteButton id={item.id} redirectTo="/" />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">All checks</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm tabular-nums">
            <thead className="text-neutral-500">
              <tr>
                <th className="py-1 pr-4 font-normal">Checked (ET)</th>
                <th className="py-1 pr-4 font-normal">Price</th>
                <th className="py-1 pr-4 font-normal">Was</th>
                <th className="py-1 pr-4 font-normal">Stock</th>
                <th className="py-1 font-normal">Promotions on page</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((check) => (
                <tr key={check.id} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                  <td className="py-1.5 pr-4 whitespace-nowrap">{checkedAtFormat.format(check.checkedAt)}</td>
                  {check.ok && check.price !== null ? (
                    <>
                      <td className="py-1.5 pr-4">{formatPrice(check.price, item.currency)}</td>
                      <td className="py-1.5 pr-4">
                        {check.regularPrice !== null ? formatPrice(check.regularPrice, item.currency) : "—"}
                      </td>
                      <td className="py-1.5 pr-4">
                        {check.inStock === null ? "—" : check.inStock ? "In stock" : "Out"}
                      </td>
                      <td className="py-1.5">{check.promoText?.join("; ") || "—"}</td>
                    </>
                  ) : (
                    <td colSpan={4} className="py-1.5 text-red-700 dark:text-red-400">
                      Failed: {check.failureDetail}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
