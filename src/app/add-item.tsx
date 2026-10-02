"use client";

import { useState, useTransition } from "react";
import { addItem, previewItem } from "./actions";
import { formatPrice } from "@/lib/format";
import type { ScrapeFailureReason, ScrapeMethod, ScrapeResult } from "@/lib/scrape";

const FAILURE_LABELS: Record<ScrapeFailureReason, string> = {
  invalid_url: "That is not a valid URL",
  timeout: "The store did not respond in time",
  blocked: "The store blocked the request",
  http_error: "The store returned an error",
  no_price: "No price found on the page",
};

const METHOD_LABELS: Record<ScrapeMethod, string> = {
  shopify: "Shopify product data",
  gap: "Gap product data",
  "json-ld": "structured data on the page",
  meta: "page meta tags",
};

const inputClass =
  "rounded-md border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700";
const primaryButtonClass =
  "rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50";

export function AddItem() {
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState("");
  const [preview, setPreview] = useState<ScrapeResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function check(event: React.FormEvent) {
    event.preventDefault();
    setSaveError(null);
    startTransition(async () => {
      setPreview(await previewItem(url));
    });
  }

  function save() {
    setSaveError(null);
    startTransition(async () => {
      const result = await addItem(url, target === "" ? null : Number(target));
      if (result.ok) {
        setUrl("");
        setTarget("");
        setPreview(null);
      } else {
        setSaveError(result.message);
        if (result.scrape) setPreview(result.scrape);
      }
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <form onSubmit={check} className="flex flex-wrap gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            setPreview(null);
          }}
          placeholder="Paste a product URL"
          required
          className={`${inputClass} min-w-0 flex-1 basis-64`}
        />
        <button type="submit" disabled={pending} className={primaryButtonClass}>
          {pending && !preview ? "Checking…" : "Check price"}
        </button>
      </form>

      {preview && !preview.ok && (
        <div className="rounded-md border border-red-300 p-4 text-sm dark:border-red-900">
          <p className="font-medium text-red-700 dark:text-red-400">
            Can&apos;t track this URL: {FAILURE_LABELS[preview.reason]}
          </p>
          <p className="mt-1 text-neutral-600 dark:text-neutral-400">
            {preview.detail}
            {preview.httpStatus ? ` (HTTP ${preview.httpStatus})` : ""}
          </p>
        </div>
      )}

      {preview?.ok && (
        <div className="flex flex-wrap gap-4 rounded-md border border-neutral-300 p-4 dark:border-neutral-700">
          {preview.image && (
            // eslint-disable-next-line @next/next/no-img-element -- images come from arbitrary store domains
            <img src={preview.image} alt="" className="h-28 w-28 rounded object-cover" />
          )}
          <div className="flex min-w-0 flex-1 basis-64 flex-col gap-2 text-sm">
            <p className="font-medium">{preview.title ?? "Untitled product"}</p>
            <p className="text-neutral-600 dark:text-neutral-400">
              {preview.store}
              {preview.variant ? ` · ${preview.variant}` : ""}
              {preview.inStock === false ? " · out of stock" : ""}
            </p>
            <p className="text-lg font-semibold">
              {formatPrice(preview.price, preview.currency)}
              {preview.regularPrice !== null && (
                <span className="ml-2 text-sm font-normal text-neutral-500 line-through">
                  {formatPrice(preview.regularPrice, preview.currency)}
                </span>
              )}
            </p>
            {preview.promoText.length > 0 && (
              <div className="text-neutral-600 dark:text-neutral-400">
                <p>Promotions mentioned on the page (may not apply to this item):</p>
                <ul className="list-disc pl-5">
                  {preview.promoText.map((promo) => (
                    <li key={promo}>{promo}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-neutral-500">
              Read from {METHOD_LABELS[preview.method]}. If the price looks wrong, don&apos;t add it.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min="0"
                step="0.01"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Target price (optional)"
                className={`${inputClass} w-52`}
              />
              <button type="button" onClick={save} disabled={pending} className={primaryButtonClass}>
                {pending ? "Adding…" : "Track this item"}
              </button>
            </div>
            {saveError && <p className="text-red-700 dark:text-red-400">{saveError}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
