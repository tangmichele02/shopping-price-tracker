export type ScrapeMethod = "shopify" | "gap" | "json-ld" | "meta";

export type ScrapeFailureReason =
  | "invalid_url"
  | "timeout"
  | "blocked"
  | "http_error"
  | "no_price";

export type ScrapeResult =
  | {
      ok: true;
      method: ScrapeMethod;
      url: string;
      store: string;
      title: string | null;
      image: string | null;
      variant: string | null;
      currency: string | null;
      price: number;
      // Original price when the store exposes one and it is higher than `price`.
      regularPrice: number | null;
      inStock: boolean | null;
      // Raw "% off" snippets found on the page. Not tied to this item.
      promoText: string[];
    }
  | {
      ok: false;
      url: string;
      reason: ScrapeFailureReason;
      detail: string;
      httpStatus?: number;
    };

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const TIMEOUT_MS = 15_000;

const CHALLENGE_MARKERS = [
  "<title>Just a moment...",
  "<title>Access Denied",
  "px-captcha",
  "cf-chl-",
];

type Fetched = { status: number; body: string };

async function fetchText(url: string, accept: string): Promise<Fetched> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: accept,
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return { status: res.status, body: await res.text() };
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const n = Number(value.replace(/[^0-9.]/g, ""));
  return value.trim() !== "" && Number.isFinite(n) ? n : null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&ndash;/g, "–")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function metaContent(html: string, property: string): string | null {
  const tag = html.match(
    new RegExp(`<meta[^>]*(?:property|name)=["']${property}["'][^>]*>`, "i"),
  )?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content) : null;
}

function pageTitle(html: string): string | null {
  const og = metaContent(html, "og:title");
  if (og) return og;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? decodeEntities(title) : null;
}

function extractPromoText(html: string): string[] {
  // Promo copy is often embedded in escaped JSON inside script tags.
  const text = html.replace(/\\u003c/g, "<").replace(/\\"/g, '"');
  const matches = text.match(/(?:extra |up to )?\d{1,2}% off[^<"\\]{0,80}/gi) ?? [];
  const seen = new Map<string, string>();
  for (const m of matches) {
    const cleaned = decodeEntities(m);
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) seen.set(key, cleaned);
  }
  // Drop snippets that are a prefix of a longer one.
  const all = [...seen.values()];
  return all
    .filter(
      (s) =>
        !all.some(
          (o) => o !== s && o.toLowerCase().startsWith(s.toLowerCase()),
        ),
    )
    .slice(0, 10);
}

type ShopifyVariant = {
  id: number;
  title: string;
  price: number;
  compare_at_price: number | null;
  available: boolean;
};

type ShopifyProduct = {
  title: string;
  featured_image: string | null;
  variants: ShopifyVariant[];
};

// Shopify storefronts serve product data at /products/<handle>.js, prices in cents.
async function tryShopify(
  url: URL,
  // Where the Shopify product lives, when it is not the page's own origin and handle.
  source?: { origin: string; handle: string },
): Promise<Omit<Extract<ScrapeResult, { ok: true }>, "promoText" | "url" | "store"> | null> {
  const origin = source?.origin ?? url.origin;
  const handle = source?.handle ?? url.pathname.match(/\/products\/([^/]+)/)?.[1];
  if (!handle) return null;

  let product: ShopifyProduct;
  try {
    const { status, body } = await fetchText(
      `${origin}/products/${handle}.js`,
      "application/json",
    );
    if (status !== 200) return null;
    product = JSON.parse(body);
  } catch {
    return null;
  }
  if (!Array.isArray(product.variants) || product.variants.length === 0) {
    return null;
  }

  const variantId = Number(url.searchParams.get("variant"));
  const variant =
    product.variants.find((v) => v.id === variantId) ?? product.variants[0];
  const price = variant.price / 100;
  const compareAt = variant.compare_at_price
    ? variant.compare_at_price / 100
    : null;
  const image = product.featured_image;

  return {
    ok: true,
    method: "shopify",
    title: product.title,
    image: image?.startsWith("//") ? `https:${image}` : image,
    variant: variantId ? variant.title : null,
    currency: null,
    price,
    regularPrice: compareAt && compareAt > price ? compareAt : null,
    // Without a chosen variant, in stock means any size is available.
    inStock: variantId
      ? variant.available
      : product.variants.some((v) => v.available),
  };
}

type HeadlessShopifyProduct = {
  productReferenceV2?: { store?: { slug?: { current?: string }; shop?: { domain?: string } } };
};

// Kotn runs a custom storefront over Shopify: each colour is its own Shopify
// product, listed in the page's __NEXT_DATA__ with its handle and shop domain.
function findHeadlessShopifySource(
  html: string,
  url: URL,
): { origin: string; handle: string } | null {
  const json = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  if (!json) return null;
  let products: HeadlessShopifyProduct[];
  try {
    products = JSON.parse(json)?.props?.pageProps?.product?.shopifyProducts;
  } catch {
    return null;
  }
  if (!Array.isArray(products)) return null;

  const stores = products
    .map((product) => product.productReferenceV2?.store)
    .filter((store) => store?.slug?.current && store.shop?.domain?.endsWith(".myshopify.com"));
  const colour = url.searchParams.get("colour") ?? url.searchParams.get("color");
  const chosen =
    (colour && stores.find((store) => store!.slug!.current!.endsWith(`-${colour}`))) || stores[0];
  if (!chosen) return null;
  return { origin: `https://${chosen.shop!.domain}`, handle: chosen.slug!.current! };
}

// Gap Inc. sites (Gap, Old Navy, Banana Republic, Athleta) embed per-size data
// for each colour: stock status, current price and regular price.
const GAP_SKU_PATTERN =
  /"online_legacy_customer_choice_number":"(\d+)"[\s\S]{0,700}?"inventory_status":\{"status":"(\w+)"[\s\S]{0,300}?"price":\{"currency":"(\w+)","effective_price":([\d.]+),"price_type":"\w+","price_details":\{"regular_price":([\d.]+)/g;

function tryGap(
  html: string,
  url: URL,
): { price: number; regularPrice: number | null; currency: string; inStock: boolean } | null {
  const skus = [...html.replace(/\\"/g, '"').matchAll(GAP_SKU_PATTERN)].map((m) => ({
    colour: m[1],
    inStock: m[2] !== "OUT_OF_STOCK",
    currency: m[3],
    price: Number(m[4]),
    regularPrice: Number(m[5]),
  }));
  if (skus.length === 0) return null;

  // The pid in the URL identifies the colour; the page also lists other colours.
  const pid = url.searchParams.get("pid");
  const forColour = skus.filter((sku) => sku.colour === pid);
  const chosen = forColour.length > 0 ? forColour : skus;

  const price = Math.min(...chosen.map((sku) => sku.price));
  const regularPrice = Math.max(...chosen.map((sku) => sku.regularPrice));
  return {
    price,
    regularPrice: regularPrice > price ? regularPrice : null,
    currency: chosen[0].currency,
    inStock: chosen.some((sku) => sku.inStock),
  };
}

type JsonLdNode = Record<string, unknown>;

function collectProducts(node: unknown, out: JsonLdNode[]): void {
  if (Array.isArray(node)) {
    for (const child of node) collectProducts(child, out);
  } else if (node && typeof node === "object") {
    const obj = node as JsonLdNode;
    if (obj["@type"] === "Product" || obj["@type"] === "ProductGroup") {
      out.push(obj);
    }
    for (const child of Object.values(obj)) collectProducts(child, out);
  }
}

function tryJsonLd(
  html: string,
): { price: number; currency: string | null; inStock: boolean | null; title: string | null; image: string | null } | null {
  const products: JsonLdNode[] = [];
  const blocks = html.matchAll(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const [, json] of blocks) {
    try {
      collectProducts(JSON.parse(json), products);
    } catch {
      // Malformed block; other blocks may still parse.
    }
  }

  const prices: number[] = [];
  let currency: string | null = null;
  let anyInStock = false;
  let sawAvailability = false;
  for (const product of products) {
    const offers = [product.offers].flat().filter(Boolean) as JsonLdNode[];
    for (const offer of offers) {
      const price = toNumber(offer.price ?? offer.lowPrice);
      if (price === null) continue;
      prices.push(price);
      if (typeof offer.priceCurrency === "string") currency = offer.priceCurrency;
      if (typeof offer.availability === "string") {
        sawAvailability = true;
        if (/InStock|LimitedAvailability|PreOrder/i.test(offer.availability)) {
          anyInStock = true;
        }
      }
    }
  }
  if (prices.length === 0) return null;

  const first = products[0];
  const image = [first.image].flat()[0];
  return {
    // Lowest offer, so a markdown on any variant is never missed.
    price: Math.min(...prices),
    currency,
    inStock: sawAvailability ? anyInStock : null,
    title: typeof first.name === "string" ? decodeEntities(first.name) : null,
    image: typeof image === "string" ? image : null,
  };
}

export async function scrapeProduct(rawUrl: string): Promise<ScrapeResult> {
  let url: URL;
  try {
    url = new URL(rawUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
  } catch {
    return { ok: false, url: rawUrl, reason: "invalid_url", detail: "Not a valid http(s) URL" };
  }
  const store = url.hostname.replace(/^www\./, "");

  try {
    const { status, body: html } = await fetchText(
      url.href,
      "text/html,application/xhtml+xml",
    );

    if (
      status === 403 ||
      status === 429 ||
      CHALLENGE_MARKERS.some((m) => html.includes(m))
    ) {
      return {
        ok: false,
        url: url.href,
        reason: "blocked",
        detail: "The store returned a bot-protection page",
        httpStatus: status,
      };
    }
    if (status >= 400) {
      return {
        ok: false,
        url: url.href,
        reason: "http_error",
        detail: `The store returned HTTP ${status}`,
        httpStatus: status,
      };
    }

    const promoText = extractPromoText(html);

    const headlessSource = findHeadlessShopifySource(html, url);
    const shopify = await tryShopify(url, headlessSource ?? undefined);
    if (shopify) {
      return {
        ...shopify,
        url: url.href,
        store,
        image: shopify.image ?? metaContent(html, "og:image"),
        currency: metaContent(html, "og:price:currency"),
        promoText,
      };
    }

    const jsonLd = tryJsonLd(html);

    const gap = tryGap(html, url);
    if (gap) {
      return {
        ok: true,
        method: "gap",
        url: url.href,
        store,
        title: jsonLd?.title ?? pageTitle(html),
        image: jsonLd?.image ?? metaContent(html, "og:image"),
        variant: null,
        ...gap,
        promoText,
      };
    }

    if (jsonLd) {
      return {
        ok: true,
        method: "json-ld",
        url: url.href,
        store,
        title: jsonLd.title ?? pageTitle(html),
        image: jsonLd.image ?? metaContent(html, "og:image"),
        variant: null,
        currency: jsonLd.currency,
        price: jsonLd.price,
        regularPrice: null,
        inStock: jsonLd.inStock,
        promoText,
      };
    }

    const metaPrice = toNumber(
      metaContent(html, "og:price:amount") ??
        metaContent(html, "product:price:amount"),
    );
    if (metaPrice !== null) {
      return {
        ok: true,
        method: "meta",
        url: url.href,
        store,
        title: pageTitle(html),
        image: metaContent(html, "og:image"),
        variant: null,
        currency:
          metaContent(html, "og:price:currency") ??
          metaContent(html, "product:price:currency"),
        price: metaPrice,
        regularPrice: null,
        inStock: null,
        promoText,
      };
    }

    return {
      ok: false,
      url: url.href,
      reason: "no_price",
      detail:
        "The page loaded but no price was found. The store may load prices with JavaScript.",
      httpStatus: status,
    };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      ok: false,
      url: url.href,
      reason: timedOut ? "timeout" : "http_error",
      detail: timedOut
        ? `No response within ${TIMEOUT_MS / 1000}s`
        : err instanceof Error
          ? err.message
          : String(err),
    };
  }
}
