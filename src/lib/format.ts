export function formatPrice(amount: number, currency: string | null): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency ?? "USD",
    }).format(amount);
  } catch {
    // Unknown currency code from the store.
    return `${amount.toFixed(2)} ${currency ?? ""}`.trim();
  }
}
